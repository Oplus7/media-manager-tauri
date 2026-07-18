use image::GenericImageView;
use log::{error, info};
use regex::Regex;
use rusqlite::{Connection, Result as SqliteResult};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Manager};
use thiserror::Error;
use walkdir::WalkDir;

static NATURAL_SORT_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(\d+)").unwrap());

#[derive(Error, Debug)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),
    #[error("Serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("Custom error: {0}")]
    Custom(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub save_data_dir: Mutex<PathBuf>,
    pub needs_backup: AtomicBool,
}

fn mark_backup_needed(state: &AppState) {
    state.needs_backup.store(true, Ordering::Relaxed);
}

fn perform_backup_if_needed(state: &AppState) {
    if state.needs_backup.load(Ordering::Relaxed) {
        if let Ok(db) = state.db.lock() {
            if let Ok(save_dir) = state.save_data_dir.lock() {
                if backup_database(&db, &save_dir).is_ok() {
                    state.needs_backup.store(false, Ordering::Relaxed);
                }
            }
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MediaItem {
    pub id: String,
    pub name: String,
    pub media_type: String,
    pub is_series: bool,
    pub path: String,
    pub cover_path: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub notes: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<Tag>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: i64,
    pub name: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagWithCount {
    pub id: i64,
    pub name: String,
    pub count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ImportCandidate {
    pub path: String,
    pub name: String,
    pub media_type: String,
    pub is_series: bool,
    pub cover_path: Option<String>,
    pub author: Option<String>,
    pub description: Option<String>,
    pub files: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryQuery {
    pub category: String,
    pub sub_filter: Option<String>,
    pub search: Option<String>,
    pub tag_ids: Option<Vec<i64>>,
    pub tag_mode: String,
    pub page: i64,
    pub page_size: i64,
    pub sort_by: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct LibraryResult {
    pub items: Vec<MediaItem>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct TagSimilarityResult {
    pub existing_tag: String,
    pub similarity: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Series {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub author: Option<String>,
    pub cover_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub items: Option<Vec<MediaItem>>,
    pub tags: Option<Vec<Tag>>,
}

fn get_save_data_dir_path(app: &AppHandle) -> PathBuf {
    if let Some(exe_path) = std::env::current_exe().ok() {
        let exe_dir = exe_path.parent().unwrap_or(std::path::Path::new("."));
        return exe_dir.join("SaveData");
    }
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
}

fn init_database(db_path: &Path) -> SqliteResult<Connection> {
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA synchronous=NORMAL;")?;
    conn.execute_batch("PRAGMA cache_size=-32000;")?;
    conn.execute_batch("PRAGMA temp_store=MEMORY;")?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            media_type TEXT NOT NULL,
            is_series INTEGER NOT NULL DEFAULT 0,
            path TEXT NOT NULL,
            cover_path TEXT,
author TEXT,
            description TEXT,
            notes TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS item_tags (
            item_id TEXT NOT NULL,
            tag_id INTEGER NOT NULL,
            PRIMARY KEY (item_id, tag_id)
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS series (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            description TEXT,
            author TEXT,
            cover_path TEXT,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS series_items (
            series_id TEXT NOT NULL,
            item_id TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (series_id, item_id)
        );

        CREATE INDEX IF NOT EXISTS idx_items_media_type ON items(media_type);
        CREATE INDEX IF NOT EXISTS idx_items_is_series ON items(is_series);
        CREATE INDEX IF NOT EXISTS idx_items_name ON items(name);
        CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
        CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
        CREATE INDEX IF NOT EXISTS idx_series_items_series_id ON series_items(series_id);
        CREATE INDEX IF NOT EXISTS idx_series_items_item_id ON series_items(item_id);
        CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at);
        CREATE INDEX IF NOT EXISTS idx_items_updated_at ON items(updated_at);
        CREATE INDEX IF NOT EXISTS idx_items_path ON items(path);
        CREATE INDEX IF NOT EXISTS idx_series_updated_at ON series(updated_at);
        ",
    )?;

    Ok(conn)
}

fn detect_media_type(path: &Path) -> (String, bool) {
    let metadata = match fs::metadata(path) {
        Ok(m) => m,
        Err(_) => return ("unknown".to_string(), false),
    };

    if metadata.is_dir() {
        return detect_directory_media_type(path);
    }

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_lowercase())
        .unwrap_or_default();

    let audio_exts = ["mp3", "wav", "flac", "aac", "ogg"];
    let video_exts = ["mp4", "mkv", "avi", "mov", "wmv"];

    if audio_exts.contains(&ext.as_str()) {
        return ("audio".to_string(), false);
    }
    if video_exts.contains(&ext.as_str()) {
        return ("video".to_string(), false);
    }

    ("unknown".to_string(), false)
}

fn detect_directory_media_type(dir_path: &Path) -> (String, bool) {
    let image_exts = ["jpg", "jpeg", "png", "webp", "bmp"];
    let audio_exts = ["mp3", "wav", "flac", "aac", "ogg"];
    let video_exts = ["mp4", "mkv", "avi", "mov", "wmv"];

    let mut image_count = 0i64;
    let mut audio_count = 0i64;
    let mut video_count = 0i64;
    let mut total = 0i64;

    for entry in WalkDir::new(dir_path)
        .max_depth(3)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(ext) = entry.path().extension().and_then(|e| e.to_str()) {
                let ext_lower = ext.to_lowercase();
                total += 1;
                if image_exts.contains(&ext_lower.as_str()) {
                    image_count += 1;
                } else if audio_exts.contains(&ext_lower.as_str()) {
                    audio_count += 1;
                } else if video_exts.contains(&ext_lower.as_str()) {
                    video_count += 1;
                }
            }
        }
    }

    if total == 0 {
        return ("unknown".to_string(), false);
    }

    let img_ratio = image_count as f64 / total as f64;
    let audio_ratio = audio_count as f64 / total as f64;
    let video_ratio = video_count as f64 / total as f64;

    if video_count >= 1 && video_ratio >= 0.5 {
        return ("video".to_string(), true);
    }
    if audio_ratio >= 0.6 {
        return ("audio".to_string(), true);
    }
    if img_ratio >= 0.6 && video_count == 0 {
        return ("comic".to_string(), true);
    }
    if img_ratio >= audio_ratio && img_ratio >= video_ratio {
        return ("comic".to_string(), true);
    }
    if audio_ratio >= video_ratio {
        return ("audio".to_string(), true);
    }

    ("video".to_string(), true)
}

fn collect_files(dir_path: &Path) -> Vec<String> {
    let media_exts = [
        "jpg", "jpeg", "png", "webp", "bmp", "mp3", "wav", "flac", "aac", "ogg", "mp4", "mkv", "avi",
        "mov", "wmv",
    ];

    let mut files: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if media_exts.contains(&ext.to_lowercase().as_str()) {
                        files.push(path.clone());
                    }
                }
            }
        }
    }

    files.sort_by(|a, b| natural_sort_path(a, b));
    files.into_iter().map(|p| p.to_string_lossy().to_string()).collect()
}

fn natural_sort_path(a: &PathBuf, b: &PathBuf) -> std::cmp::Ordering {
    let re = &*NATURAL_SORT_RE;
    let name_a = a.file_stem().and_then(|n| n.to_str()).unwrap_or("");
    let name_b = b.file_stem().and_then(|n| n.to_str()).unwrap_or("");

    let parts_a: Vec<&str> = re.split(name_a).collect();
    let parts_b: Vec<&str> = re.split(name_b).collect();

    let nums_a: Vec<i64> = re
        .captures_iter(name_a)
        .filter_map(|c| c.get(1).and_then(|m| m.as_str().parse().ok()))
        .collect();

    let nums_b: Vec<i64> = re
        .captures_iter(name_b)
        .filter_map(|c| c.get(1).and_then(|m| m.as_str().parse().ok()))
        .collect();

    for i in 0..std::cmp::max(parts_a.len(), parts_b.len()) {
        let pa = parts_a.get(i).unwrap_or(&"");
        let pb = parts_b.get(i).unwrap_or(&"");
        let cmp = pa.cmp(pb);
        if cmp != std::cmp::Ordering::Equal {
            return cmp;
        }

        if i < nums_a.len() && i < nums_b.len() {
            let num_cmp = nums_a[i].cmp(&nums_b[i]);
            if num_cmp != std::cmp::Ordering::Equal {
                return num_cmp;
            }
        } else if i < nums_a.len() {
            return std::cmp::Ordering::Greater;
        } else if i < nums_b.len() {
            return std::cmp::Ordering::Less;
        }
    }

    std::cmp::Ordering::Equal
}

fn extract_first_image(dir_path: &Path) -> Option<String> {
    let image_exts = ["jpg", "jpeg", "png", "webp", "bmp"];

    let mut images: Vec<PathBuf> = Vec::new();

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if image_exts.contains(&ext.to_lowercase().as_str()) {
                        images.push(path);
                    }
                }
            }
        }
    }

    images.sort();
    images.first().map(|p| p.to_string_lossy().to_string())
}

fn extract_description(dir_path: &Path) -> Option<String> {
    let desc_exts = ["md", "txt"];

    if let Ok(entries) = fs::read_dir(dir_path) {
        for entry in entries.filter_map(|e| e.ok()) {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                    if desc_exts.contains(&ext.to_lowercase().as_str()) {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let trimmed = content.trim();
                            if !trimmed.is_empty() {
                                return Some(trimmed.chars().take(500).collect());
                            }
                        }
                    }
                }
            }
        }
    }
    None
}

static FFMPEG_PATH: LazyLock<Option<String>> = LazyLock::new(|| {
    if let Ok(exe_path) = std::env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            let relative_paths = [
                exe_dir.join("tools").join("ffmpeg").join("bin").join("ffmpeg.exe"),
                exe_dir.join("tools").join("ffmpeg").join("ffmpeg.exe"),
                exe_dir.join("ffmpeg").join("bin").join("ffmpeg.exe"),
                exe_dir.join("ffmpeg").join("ffmpeg.exe"),
            ];
            for p in &relative_paths {
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }

    {
        let manifest_dir = env!("CARGO_MANIFEST_DIR");
        let project_root = std::path::Path::new(manifest_dir).parent();
        if let Some(root) = project_root {
            let dev_paths = [
                root.join("tools").join("ffmpeg").join("ffmpeg.exe"),
                root.join("tools").join("ffmpeg").join("bin").join("ffmpeg.exe"),
            ];
            for p in &dev_paths {
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }

    if std::process::Command::new("ffmpeg")
        .arg("-version")
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .is_ok()
    {
        return Some("ffmpeg".to_string());
    }
    None
});

fn find_ffmpeg() -> Option<String> {
    FFMPEG_PATH.clone()
}

fn is_frame_mostly_black(image_path: &str, threshold: f64) -> bool {
    match image::open(image_path) {
        Ok(img) => {
            let thumb = img.thumbnail(100, 100);
            let (width, height) = thumb.dimensions();
            let total_pixels = (width as u64) * (height as u64);
            let mut dark_pixels: u64 = 0;
            for pixel in thumb.pixels() {
                let r = pixel.2[0] as u32;
                let g = pixel.2[1] as u32;
                let b = pixel.2[2] as u32;
                let brightness = (r + g + b) / 3;
                if brightness < 30 {
                    dark_pixels += 1;
                }
            }
            let dark_ratio = dark_pixels as f64 / total_pixels as f64;
            dark_ratio > threshold
        }
        Err(_) => false,
    }
}

fn extract_frame_at(ffmpeg: &str, video_path: &str, output_path: &str, seek_pos: f64) -> Result<(), AppError> {
    let output = std::process::Command::new(ffmpeg)
        .args([
            "-ss", &format!("{:.2}", seek_pos),
            "-i", video_path,
            "-frames:v", "1",
            "-q:v", "2",
            "-y", output_path,
        ])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to execute ffmpeg: {}", e)))?;

    if !output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        let stderr_out = String::from_utf8_lossy(&output.stderr);
        error!("FFmpeg failed with stderr: {}, stdout: {}", stderr_out, stdout);
        return Err(AppError::Custom(format!("FFmpeg failed: {} {}", stderr_out.trim(), stdout.trim())));
    }
    Ok(())
}

fn generate_video_thumbnail(video_path: &str, output_path: &str) -> Result<(), AppError> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| AppError::Custom("FFmpeg not found".to_string()))?;

    let duration_output = std::process::Command::new(&ffmpeg)
        .args(["-i", video_path])
        .output()
        .map_err(|e| AppError::Custom(format!("Failed to probe video: {}", e)))?;

    let stderr = String::from_utf8_lossy(&duration_output.stderr);

    let duration_sec = if let Some(dur_match) = stderr.find("Duration:") {
        let dur_str = &stderr[dur_match..];
        if let Some(comma_idx) = dur_str.find(',') {
            let time_part = &dur_str[8..comma_idx].trim();
            let parts: Vec<&str> = time_part.split(':').collect();
            if parts.len() == 3 {
                let hours: f64 = parts[0].parse().unwrap_or(0.0);
                let minutes: f64 = parts[1].parse().unwrap_or(0.0);
                let seconds: f64 = parts[2].parse().unwrap_or(0.0);
                hours * 3600.0 + minutes * 60.0 + seconds
            } else {
                10.0
            }
        } else {
            10.0
        }
    } else {
        10.0
    };

    let seek_candidates: Vec<f64> = if duration_sec <= 3.0 {
        vec![(duration_sec * 0.5).max(0.5)]
    } else if duration_sec <= 10.0 {
        vec![3.0, duration_sec * 0.5]
    } else {
        vec![(duration_sec * 0.1).max(3.0).min(30.0), duration_sec * 0.25, duration_sec * 0.5]
    };

    let mut last_error = None;
    for seek_pos in &seek_candidates {
        let clamped = seek_pos.min((duration_sec - 0.5).max(0.1));
        if let Err(e) = extract_frame_at(&ffmpeg, video_path, output_path, clamped) {
            last_error = Some(e);
            continue;
        }
        if !is_frame_mostly_black(output_path, 0.85) {
            return Ok(());
        }
    }

    if std::path::Path::new(output_path).exists() {
        Ok(())
    } else {
        Err(last_error.unwrap_or_else(|| AppError::Custom("Failed to generate thumbnail".to_string())))
    }
}

fn extract_audio_cover(audio_path: &str, output_path: &str) -> Result<(), AppError> {
    let ffmpeg = find_ffmpeg().ok_or_else(|| AppError::Custom("FFmpeg not found".to_string()))?;

    let output = std::process::Command::new(&ffmpeg)
        .args(["-i", audio_path, "-an", "-vcodec", "copy", "-y", output_path])
        .output()
        .map_err(|e| AppError::Custom(e.to_string()))?;

    if !output.status.success() {
        return Err(AppError::Custom("FFmpeg failed".to_string()));
    }
    Ok(())
}

fn resize_image(input_path: &str, output_path: &str, max_width: u32, max_height: u32) -> Result<(), AppError> {
    let img = image::open(input_path)?;
    let (width, height) = img.dimensions();

    let ratio = (max_width as f64 / width as f64).min(max_height as f64 / height as f64);
    let new_width = (width as f64 * ratio) as u32;
    let new_height = (height as f64 * ratio) as u32;

    let resized = img.resize(new_width, new_height, image::imageops::FilterType::Triangle);
    resized.save(output_path)?;
    Ok(())
}

fn str_similarity(a: &str, b: &str) -> f64 {
    if a.is_empty() && b.is_empty() {
        return 1.0;
    }
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }

    let chars_a: Vec<char> = a.chars().collect();
    let chars_b: Vec<char> = b.chars().collect();
    let len_a = chars_a.len();
    let len_b = chars_b.len();
    let max_len = len_a.max(len_b);
    if max_len == 0 {
        return 1.0;
    }

    let mut matrix = vec![vec![0usize; len_b + 1]; len_a + 1];

    for i in 0..=len_a {
        matrix[i][0] = i;
    }
    for j in 0..=len_b {
        matrix[0][j] = j;
    }

    for i in 1..=len_a {
        for j in 1..=len_b {
            let cost = if chars_a[i - 1] == chars_b[j - 1] {
                0
            } else {
                1
            };
            matrix[i][j] = (matrix[i - 1][j] + 1)
                .min(matrix[i][j - 1] + 1)
                .min(matrix[i - 1][j - 1] + cost);
        }
    }

    1.0 - (matrix[len_a][len_b] as f64 / max_len as f64)
}

fn backup_database(conn: &Connection, save_dir: &Path) -> Result<(), AppError> {
    let backup_path = save_dir.join("data.db.backup");
    conn.backup(rusqlite::DatabaseName::Main, &backup_path, None)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;
    use std::fs;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY, name TEXT NOT NULL, media_type TEXT NOT NULL,
                is_series INTEGER NOT NULL DEFAULT 0, path TEXT NOT NULL,
                cover_path TEXT, author TEXT, description TEXT, notes TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE
            );
            CREATE TABLE IF NOT EXISTS item_tags (
                item_id TEXT NOT NULL, tag_id INTEGER NOT NULL,
                PRIMARY KEY (item_id, tag_id)
            );
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY, value TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS series (
                id TEXT PRIMARY KEY, name TEXT NOT NULL,
                description TEXT, author TEXT, cover_path TEXT,
                created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS series_items (
                series_id TEXT NOT NULL, item_id TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (series_id, item_id)
            );
            "
        ).unwrap();
        conn
    }

    #[test]
    fn test_str_similarity_identical() {
        assert_eq!(str_similarity("hello", "hello"), 1.0);
    }

    #[test]
    fn test_str_similarity_empty() {
        assert_eq!(str_similarity("", ""), 1.0);
        assert_eq!(str_similarity("hello", ""), 0.0);
        assert_eq!(str_similarity("", "hello"), 0.0);
    }

    #[test]
    fn test_str_similarity_different() {
        let sim = str_similarity("kitten", "sitting");
        assert!(sim > 0.5 && sim < 1.0);
    }

    #[test]
    fn test_str_similarity_similar_tags() {
        let sim = str_similarity("action", "action-rpg");
        assert!(sim >= 0.5, "similarity was {sim}");
    }

    #[test]
    fn test_detect_media_type_audio_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("test.mp3");
        fs::write(&file_path, "").unwrap();
        let (media_type, is_series) = detect_media_type(&file_path);
        assert_eq!(media_type, "audio");
        assert!(!is_series);
    }

    #[test]
    fn test_detect_media_type_video_file() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("movie.mp4");
        fs::write(&file_path, "").unwrap();
        let (media_type, is_series) = detect_media_type(&file_path);
        assert_eq!(media_type, "video");
        assert!(!is_series);
    }

    #[test]
    fn test_detect_media_type_unknown() {
        let dir = tempfile::tempdir().unwrap();
        let file_path = dir.path().join("document.pdf");
        fs::write(&file_path, "").unwrap();
        let (media_type, is_series) = detect_media_type(&file_path);
        assert_eq!(media_type, "unknown");
        assert!(!is_series);
    }

    #[test]
    fn test_natural_sort_path() {
        let a = PathBuf::from("page1.jpg");
        let b = PathBuf::from("page10.jpg");
        assert_eq!(natural_sort_path(&a, &b), std::cmp::Ordering::Less);
    }

    #[test]
    fn test_natural_sort_path_same_prefix() {
        let a = PathBuf::from("chapter2_page3.png");
        let b = PathBuf::from("chapter2_page12.png");
        assert_eq!(natural_sort_path(&a, &b), std::cmp::Ordering::Less);
    }

    #[test]
    fn test_init_database_creates_tables() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = init_database(&db_path).unwrap();

        let table_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(table_count >= 6);

        let index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(index_count >= 5);
    }

    #[test]
    fn test_backup_database() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("test.db");
        let conn = init_database(&db_path).unwrap();

        conn.execute(
            "INSERT INTO items (id, name, media_type, is_series, path, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)",
            params!["test-id", "Test", "video", "/test/path", "2024-01-01", "2024-01-01"],
        ).unwrap();

        backup_database(&conn, dir.path()).unwrap();

        let backup_path = dir.path().join("data.db.backup");
        assert!(backup_path.exists());

        let backup_conn = Connection::open(&backup_path).unwrap();
        let count: i64 = backup_conn
            .query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_database_transaction_rollback() {
        let conn = setup_test_db();

        conn.execute(
            "INSERT INTO items (id, name, media_type, is_series, path, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)",
            params!["id1", "Item1", "video", "/path1", "2024-01-01", "2024-01-01"],
        ).unwrap();

        let tx = conn.unchecked_transaction().unwrap();
        tx.execute(
            "INSERT INTO items (id, name, media_type, is_series, path, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)",
            params!["id2", "Item2", "audio", "/path2", "2024-01-01", "2024-01-01"],
        ).unwrap();
        drop(tx);

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn test_database_transaction_commit() {
        let conn = setup_test_db();

        let tx = conn.unchecked_transaction().unwrap();
        tx.execute(
            "INSERT INTO items (id, name, media_type, is_series, path, created_at, updated_at) VALUES (?1, ?2, ?3, 0, ?4, ?5, ?6)",
            params!["id1", "Item1", "video", "/path1", "2024-01-01", "2024-01-01"],
        ).unwrap();
        tx.execute(
            "INSERT INTO tags (name) VALUES (?1)",
            params!["action"],
        ).unwrap();
        tx.commit().unwrap();

        let item_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))
            .unwrap();
        assert_eq!(item_count, 1);

        let tag_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM tags", [], |row| row.get(0))
            .unwrap();
        assert_eq!(tag_count, 1);
    }
}

mod commands;
pub use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
.setup(|app| {
            info!("=== Media Manager Starting ===");

            let save_dir = get_save_data_dir_path(&app.handle());
            info!("Save data dir: {:?}", save_dir);

            std::fs::create_dir_all(&save_dir).ok();

            let db_path = save_dir.join("data.db");
            let db = match init_database(&db_path) {
                Ok(conn) => conn,
                Err(e) => {
                    error!("Failed to initialize database: {}", e);
                    panic!("Database initialization failed: {}", e);
                }
            };

            let state = AppState {
                db: Mutex::new(db),
                save_data_dir: Mutex::new(save_dir),
                needs_backup: AtomicBool::new(false),
            };

            app.manage(state);

            let app_handle = app.handle().clone();
            std::thread::spawn(move || {
                loop {
                    std::thread::sleep(Duration::from_secs(30));
                    let state = app_handle.state::<AppState>();
                    perform_backup_if_needed(&state);
                }
            });

            info!("Database initialized successfully");
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state = window.state::<AppState>();
                perform_backup_if_needed(&state);
            }
        })
        .invoke_handler(tauri::generate_handler![
            import_paths,
            confirm_import,
            query_library,
            get_item_detail,
            update_item,
            delete_item,
            get_item_tags,
            add_tag_to_item,
            remove_tag_from_item,
            get_all_tags,
            get_tags_with_counts,
            search_tags,
            check_similar_tags,
            get_setting,
            set_setting,
            read_image_as_base64,
            read_image_as_base64_resized,
            list_directory_files,
            check_save_data_writable,
            get_save_data_dir,
            select_save_data_dir,
            show_open_dialog,
            export_library_to_file,
            import_library,
            import_library_from_file,
            extract_video_thumbnail,
            create_series,
            get_series_list,
            get_series_detail,
            add_item_to_series,
            remove_item_from_series,
            delete_series,
            get_available_items_for_series,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
