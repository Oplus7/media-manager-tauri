// Tauri commands module
// Separate commands from lib.rs to avoid #[tauri::command] macro redefinition (E0255)

use crate::{detect_media_type, extract_description, extract_first_image, collect_files, find_ffmpeg, 
    generate_video_thumbnail, extract_audio_cover, resize_image, str_similarity, mark_backup_needed,
    natural_sort_path, init_database,
    AppError, AppState, ImportCandidate, LibraryQuery, LibraryResult, MediaItem, Series, Tag, TagWithCount, TagSimilarityResult};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use chrono::Utc;
use image::GenericImageView;
use log::error;
use rusqlite::params;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

#[tauri::command]
pub fn import_paths(paths: Vec<String>, state: State<AppState>) -> Result<Vec<ImportCandidate>, AppError> {
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    let mut candidates = Vec::new();

    for path_str in paths {
        let path = PathBuf::from(&path_str);
        if !path.exists() {
            continue;
        }

        let (media_type, is_series) = detect_media_type(&path);
        if media_type == "unknown" {
            continue;
        }

        let name = if path.is_dir() {
            path.file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string()
        } else {
            path.file_stem()
                .and_then(|n| n.to_str())
                .unwrap_or("Unknown")
                .to_string()
        };

        let is_dir = path.is_dir();
        let mut cover_path = None;
        let description = if is_dir && media_type == "comic" {
            extract_description(&path)
        } else {
            None
        };

        if is_dir {
            if media_type == "comic" || media_type == "audio" {
                cover_path = extract_first_image(&path);
            } else if media_type == "video" {
                if find_ffmpeg().is_some() {
                    let thumbs_dir = save_dir.join("thumbnails");
                    fs::create_dir_all(&thumbs_dir).ok();

                    let files = collect_files(&path);
                    let video_file = files.iter().find(|f| {
                        let ext = Path::new(f)
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        ["mp4", "mkv", "avi", "mov", "wmv"].contains(&ext.as_str())
                    });

                    if let Some(video_file) = video_file {
                        let thumb_path = thumbs_dir.join(format!("{}_thumb.jpg", Uuid::new_v4()));
                        if generate_video_thumbnail(video_file, thumb_path.to_str().unwrap()).is_ok() {
                            cover_path = Some(thumb_path.to_string_lossy().to_string());
                        }
                    }
                }
            }
        } else {
            let ext = path
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("")
                .to_lowercase();

            if find_ffmpeg().is_some() {
                let thumbs_dir = save_dir.join("thumbnails");
                fs::create_dir_all(&thumbs_dir).ok();

                if ["mp3", "wav", "flac", "aac", "ogg"].contains(&ext.as_str()) {
                    let thumb_path = thumbs_dir.join(format!("{}_cover.jpg", Uuid::new_v4()));
                    if extract_audio_cover(&path_str, thumb_path.to_str().unwrap()).is_ok() {
                        cover_path = Some(thumb_path.to_string_lossy().to_string());
                    }
                } else if ["mp4", "mkv", "avi", "mov", "wmv"].contains(&ext.as_str()) {
                    let thumb_path = thumbs_dir.join(format!("{}_thumb.jpg", Uuid::new_v4()));
                    if generate_video_thumbnail(&path_str, thumb_path.to_str().unwrap()).is_ok() {
                        cover_path = Some(thumb_path.to_string_lossy().to_string());
                    }
                }
            }
        }

        let files = if is_dir {
            collect_files(&path)
        } else {
            vec![path_str.clone()]
        };

        candidates.push(ImportCandidate {
            path: path_str,
            name,
            media_type,
            is_series,
            cover_path,
            author: None,
            description,
            files,
        });
    }

    Ok(candidates)
}

#[tauri::command]
pub fn confirm_import(
    candidate: ImportCandidate,
    tag_names: Vec<String>,
    state: State<AppState>,
) -> Result<MediaItem, AppError> {
    let db = state.db.lock().unwrap();
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    let mut cover = candidate.cover_path.clone();
    if let Some(ref cover_path) = cover {
        if Path::new(cover_path).exists() {
            let covers_dir = save_dir.join("covers");
            fs::create_dir_all(&covers_dir)?;

            let ext = Path::new(cover_path)
                .extension()
                .and_then(|e| e.to_str())
                .unwrap_or("jpg")
                .to_lowercase();
            let new_name = format!("{}.{}", id, ext);
            let new_path = covers_dir.join(&new_name);

            if let Err(e) = resize_image(cover_path, new_path.to_str().unwrap(), 800, 800) {
                error!("Failed to resize cover: {}", e);
                fs::copy(cover_path, &new_path).ok();
            }
            cover = Some(new_path.to_string_lossy().to_string());
        }
    }

    let tx = db.unchecked_transaction()?;

    tx.execute(
        "INSERT INTO items (id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
        params![
            id,
            candidate.name,
            candidate.media_type,
            candidate.is_series as i32,
            candidate.path,
            cover,
            candidate.author,
            candidate.description,
            None::<String>,
            now,
            now
        ],
    )?;

    for tag_name in tag_names {
        let normalized = tag_name.trim().to_lowercase();
        if normalized.is_empty() {
            continue;
        }

        let tag_id: i64 = tx
            .query_row(
                "SELECT id FROM tags WHERE name = ?",
                params![normalized],
                |row| row.get(0),
            )
            .unwrap_or_else(|_| {
                tx.execute("INSERT INTO tags (name) VALUES (?)", params![normalized])
                    .ok();
                tx.last_insert_rowid()
            });

        tx.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
            params![id, tag_id],
        )
        .ok();
    }

    tx.commit()?;

    mark_backup_needed(&state);

    Ok(MediaItem {
        id,
        name: candidate.name,
        media_type: candidate.media_type,
        is_series: candidate.is_series,
        path: candidate.path,
        cover_path: cover,
        author: candidate.author,
        description: candidate.description,
        notes: None,
        created_at: now.clone(),
        updated_at: now,
        tags: None,
    })
}

#[tauri::command]
pub fn query_library(query: LibraryQuery, state: State<AppState>) -> Result<LibraryResult, AppError> {
    let db = state.db.lock().unwrap();

    let mut where_clauses: Vec<String> = Vec::new();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if query.category != "all" {
        where_clauses.push("media_type = ?".to_string());
        params_vec.push(Box::new(query.category.clone()));
    }

    if query.sub_filter.as_deref() == Some("series") {
        where_clauses.push("is_series = 1".to_string());
    } else if query.sub_filter.as_deref() == Some("single") {
        where_clauses.push("is_series = 0".to_string());
    }

    if let Some(ref search) = query.search {
        if !search.trim().is_empty() {
            where_clauses.push("(name LIKE ? OR author LIKE ? OR description LIKE ?)".to_string());
            let pattern = format!("%{}%", search.trim());
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern.clone()));
            params_vec.push(Box::new(pattern));
        }
    }

    if let Some(ref tag_ids) = query.tag_ids {
        if !tag_ids.is_empty() {
            if query.tag_mode == "and" {
                let placeholders = tag_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                where_clauses.push(format!(
                    "id IN (SELECT item_id FROM item_tags WHERE tag_id IN ({}) GROUP BY item_id HAVING COUNT(DISTINCT tag_id) = {})",
                    placeholders,
                    tag_ids.len()
                ));
                for id in tag_ids {
                    params_vec.push(Box::new(*id));
                }
            } else {
                let placeholders = tag_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                where_clauses.push(format!(
                    "id IN (SELECT item_id FROM item_tags WHERE tag_id IN ({}))",
                    placeholders
                ));
                for id in tag_ids {
                    params_vec.push(Box::new(*id));
                }
            }
        }
    }

    let where_sql = if where_clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", where_clauses.join(" AND "))
    };

    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let total: i64 = db
        .query_row(&format!("SELECT COUNT(*) FROM items {}", where_sql), params_refs.as_slice(), |row| row.get(0))
        .unwrap_or(0);

    let order_by = match query.sort_by.as_deref() {
        Some("import_desc") => "created_at DESC",
        Some("import_asc") => "created_at ASC",
        Some("name_asc") => "name ASC",
        Some("name_desc") => "name DESC",
        _ => "updated_at DESC",
    };

    let offset = (query.page - 1) * query.page_size;
    params_vec.push(Box::new(query.page_size));
    params_vec.push(Box::new(offset));
    let params_refs: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();

    let sql = format!(
        "SELECT id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at
         FROM items {} ORDER BY {} LIMIT ? OFFSET ?",
        where_sql, order_by
    );
    let mut stmt = db.prepare(&sql)?;

    let items_result = stmt.query(params_refs.as_slice());

    let mut items = Vec::new();
    let mut item_ids = Vec::new();
    if let Ok(mut rows) = items_result {
        while let Some(row) = rows.next()? {
            let item_id: String = row.get(0)?;
            item_ids.push(item_id.clone());
            items.push(MediaItem {
                id: item_id,
                name: row.get(1)?,
                media_type: row.get(2)?,
                is_series: row.get::<_, i32>(3)? == 1,
                path: row.get(4)?,
                cover_path: row.get(5)?,
                author: row.get(6)?,
                description: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags: Some(Vec::new()),
            });
        }
    }

    if !item_ids.is_empty() {
        let placeholders: String = item_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let tag_sql = format!(
            "SELECT it.item_id, t.id, t.name FROM tags t INNER JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id IN ({})",
            placeholders
        );
        let mut tag_stmt = db.prepare(&tag_sql)?;
        let id_refs: Vec<&dyn rusqlite::ToSql> = item_ids.iter().map(|id| id as &dyn rusqlite::ToSql).collect();
        let tag_rows = tag_stmt.query_map(id_refs.as_slice(), |row| {
            Ok((
                row.get::<_, String>(0)?,
                Tag {
                    id: row.get(1)?,
                    name: row.get(2)?,
                },
            ))
        })?;

        let mut tag_map: std::collections::HashMap<String, Vec<Tag>> = std::collections::HashMap::new();
        for tag_row in tag_rows.filter_map(|r| r.ok()) {
            tag_map.entry(tag_row.0).or_default().push(tag_row.1);
        }

        for item in &mut items {
            if let Some(tags) = tag_map.remove(&item.id) {
                item.tags = Some(tags);
            }
        }
    }

    Ok(LibraryResult {
        items,
        total,
        page: query.page,
        page_size: query.page_size,
    })
}

#[tauri::command]
pub fn get_item_detail(id: String, state: State<AppState>) -> Result<Option<MediaItem>, AppError> {
    let db = state.db.lock().unwrap();

    let result = db.query_row(
        "SELECT id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at
         FROM items WHERE id = ?",
        params![id],
        |row| {
            Ok(MediaItem {
                id: row.get(0)?,
                name: row.get(1)?,
                media_type: row.get(2)?,
                is_series: row.get::<_, i32>(3)? == 1,
                path: row.get(4)?,
                cover_path: row.get(5)?,
                author: row.get(6)?,
                description: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags: None,
            })
        },
    );

    match result {
        Ok(item) => Ok(Some(item)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn update_item(item: MediaItem, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let now = Utc::now().to_rfc3339();

    db.execute(
        "UPDATE items SET name=?, author=?, description=?, notes=?, cover_path=?, media_type=?, updated_at=? WHERE id=?",
        params![
            item.name,
            item.author,
            item.description,
            item.notes,
            item.cover_path,
            item.media_type,
            now,
            item.id
        ],
    )?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn delete_item(id: String, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();
    let save_dir = state.save_data_dir.lock().unwrap().clone();

    if let Ok(cover_path) = db.query_row::<Option<String>, _, _>(
        "SELECT cover_path FROM items WHERE id = ?",
        params![id],
        |row| row.get(0),
    ) {
        if let Some(cover_path) = cover_path {
            let covers_dir = save_dir.join("covers");
            let thumbs_dir = save_dir.join("thumbnails");
            let normalized = PathBuf::from(&cover_path);

            if normalized.starts_with(&covers_dir) || normalized.starts_with(&thumbs_dir) {
                fs::remove_file(&normalized).ok();
            }
        }
    }

    let tx = db.unchecked_transaction()?;
    tx.execute("DELETE FROM item_tags WHERE item_id = ?", params![id])?;
    tx.execute("DELETE FROM items WHERE id = ?", params![id])?;
    tx.commit()?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn get_item_tags(item_id: String, state: State<AppState>) -> Result<Vec<Tag>, AppError> {
    let db = state.db.lock().unwrap();

    let mut stmt = db.prepare(
        "SELECT t.id, t.name FROM tags t JOIN item_tags it ON t.id = it.tag_id WHERE it.item_id = ?",
    )?;

    let tags = stmt
        .query_map(params![item_id], |row| Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
        }))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn add_tag_to_item(item_id: String, tag_name: String, state: State<AppState>) -> Result<Tag, AppError> {
    let db = state.db.lock().unwrap();
    let normalized = tag_name.trim().to_lowercase();

    if normalized.is_empty() {
        return Err(AppError::Custom("Tag name cannot be empty".to_string()));
    }

    let tx = db.unchecked_transaction()?;

    let tag = tx
        .query_row("SELECT id, name FROM tags WHERE name = ?", params![normalized], |row| {
            Ok(Tag {
                id: row.get(0)?,
                name: row.get(1)?,
            })
        })
        .unwrap_or_else(|_| {
            tx.execute("INSERT INTO tags (name) VALUES (?)", params![normalized])
                .ok();
            let id = tx.last_insert_rowid();
            Tag {
                id,
                name: normalized.clone(),
            }
        });

    tx.execute(
        "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
        params![item_id, tag.id],
    )?;

    tx.commit()?;

    mark_backup_needed(&state);
    Ok(tag)
}

#[tauri::command]
pub fn remove_tag_from_item(item_id: String, tag_id: i64, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    db.execute(
        "DELETE FROM item_tags WHERE item_id = ? AND tag_id = ?",
        params![item_id, tag_id],
    )?;

    let remaining: i64 = db.query_row(
        "SELECT COUNT(*) FROM item_tags WHERE tag_id = ?",
        params![tag_id],
        |row| row.get(0),
    )?;

    if remaining == 0 {
        db.execute("DELETE FROM tags WHERE id = ?", params![tag_id])?;
    }

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn get_all_tags(state: State<AppState>) -> Result<Vec<Tag>, AppError> {
    let db = state.db.lock().unwrap();

    let mut stmt = db.prepare("SELECT id, name FROM tags ORDER BY name")?;
    let tags = stmt
        .query_map([], |row| Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
        }))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn get_tags_with_counts(state: State<AppState>) -> Result<Vec<TagWithCount>, AppError> {
    let db = state.db.lock().unwrap();

    let mut stmt = db.prepare(
        "SELECT t.id, t.name, COUNT(it.item_id) as count FROM tags t LEFT JOIN item_tags it ON t.id = it.tag_id GROUP BY t.id, t.name ORDER BY count DESC, t.name ASC"
    )?;
    let tags = stmt
        .query_map([], |row| Ok(TagWithCount {
            id: row.get(0)?,
            name: row.get(1)?,
            count: row.get(2)?,
        }))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn search_tags(query: String, state: State<AppState>) -> Result<Vec<Tag>, AppError> {
    let db = state.db.lock().unwrap();
    let pattern = format!("%{}%", query.trim().to_lowercase());

    let mut stmt = db.prepare("SELECT id, name FROM tags WHERE name LIKE ? ORDER BY name LIMIT 20")?;
    let tags = stmt
        .query_map(params![pattern], |row| Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
        }))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

#[tauri::command]
pub fn check_similar_tags(name: String, state: State<AppState>) -> Result<Vec<TagSimilarityResult>, AppError> {
    let db = state.db.lock().unwrap();
    let normalized = name.trim().to_lowercase();

    let mut stmt = db.prepare("SELECT id, name FROM tags")?;
    let all_tags: Vec<(i64, String)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?
        .filter_map(|r| r.ok())
        .collect();

    let mut results = Vec::new();
    for (_, tag_name) in all_tags {
        let similarity = str_similarity(&normalized, &tag_name);
        if similarity >= 0.8 && normalized != tag_name {
            results.push(TagSimilarityResult {
                existing_tag: tag_name,
                similarity,
            });
        }
    }

    results.sort_by(|a, b| b.similarity.partial_cmp(&a.similarity).unwrap());
    Ok(results)
}

#[tauri::command]
pub fn get_setting(key: String, state: State<AppState>) -> Result<Option<String>, AppError> {
    let db = state.db.lock().unwrap();

    let result = db.query_row(
        "SELECT value FROM settings WHERE key = ?",
        params![key],
        |row| row.get(0),
    );

    match result {
        Ok(value) => Ok(Some(value)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(AppError::Database(e)),
    }
}

#[tauri::command]
pub fn set_setting(key: String, value: String, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    db.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
        params![key, value],
    )?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn read_image_as_base64(image_path: String) -> Result<String, AppError> {
    let data = fs::read(&image_path)?;
    let ext = Path::new(&image_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("jpg")
        .to_lowercase();

    let mime = match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    };

    Ok(format!("data:{};base64,{}", mime, BASE64.encode(&data)))
}

#[tauri::command]
pub fn read_image_as_base64_resized(
    image_path: String,
    max_width: u32,
    max_height: u32,
    _state: State<AppState>,
) -> Result<String, AppError> {
    let img = image::open(&image_path)?;
    let (width, height) = img.dimensions();
    let ratio = (max_width as f64 / width as f64).min(max_height as f64 / height as f64);
    if ratio < 1.0 {
        let new_width = (width as f64 * ratio) as u32;
        let new_height = (height as f64 * ratio) as u32;
        let resized = img.resize(new_width, new_height, image::imageops::FilterType::Triangle);
        let mut buf = Vec::new();
        resized.write_to(&mut std::io::Cursor::new(&mut buf), image::ImageFormat::Jpeg)?;
        Ok(format!("data:image/jpeg;base64,{}", BASE64.encode(&buf)))
    } else {
        let data = fs::read(&image_path)?;
        let ext = Path::new(&image_path)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("jpg")
            .to_lowercase();
        let mime = match ext.as_str() {
            "png" => "image/png",
            "webp" => "image/webp",
            _ => "image/jpeg",
        };
        Ok(format!("data:{};base64,{}", mime, BASE64.encode(&data)))
    }
}

#[tauri::command]
pub fn list_directory_files(dir_path: String) -> Result<Vec<String>, AppError> {
    let path = PathBuf::from(&dir_path);
    let mut files = Vec::new();

    for entry in WalkDir::new(&path)
        .max_depth(10)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            files.push(entry.path().to_string_lossy().to_string());
        }
    }

    files.sort_by(|a, b| natural_sort_path(&PathBuf::from(a), &PathBuf::from(b)));
    Ok(files)
}

#[tauri::command]
pub fn check_save_data_writable(state: State<AppState>) -> Result<bool, AppError> {
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    let test_file = save_dir.join(".write_test");

    match fs::write(&test_file, "test") {
        Ok(_) => {
            fs::remove_file(&test_file).ok();
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub fn get_save_data_dir(state: State<AppState>) -> Result<String, AppError> {
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    Ok(save_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub fn select_save_data_dir(dir_path: String, state: State<AppState>) -> Result<String, AppError> {
    let path = PathBuf::from(&dir_path);
    fs::create_dir_all(&path)?;

    let test_file = path.join(".write_test.tmp");
    fs::write(&test_file, "test")?;
    fs::remove_file(&test_file)?;

    let thumbs_dir = path.join("thumbnails");
    let covers_dir = path.join("covers");
    let logs_dir = path.join("logs");

    fs::create_dir_all(&thumbs_dir)?;
    fs::create_dir_all(&covers_dir)?;
    fs::create_dir_all(&logs_dir)?;

    let db_path = path.join("data.db");
    let new_db = init_database(&db_path)?;

    {
        let mut db_lock = state.db.lock().unwrap();
        *db_lock = new_db;
    }

    {
        let mut save_dir = state.save_data_dir.lock().unwrap();
        *save_dir = path.clone();
    }

    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn show_open_dialog(
    _title: Option<String>,
    _directory: Option<bool>,
    _multiple: Option<bool>,
) -> Result<Option<Vec<String>>, AppError> {
    Ok(None)
}

#[tauri::command]
pub fn export_library_to_file(state: State<AppState>, file_path: String) -> Result<String, AppError> {
    let json_data = {
        let state_ref = &state;
        let db = state_ref.db.lock().unwrap();
        let save_dir = state_ref.save_data_dir.lock().unwrap().clone();
        let save_dir_str = save_dir.to_string_lossy().to_string();

        let items: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at FROM items")?;
            let rows = stmt.query_map([], |row| {
                let path: String = row.get(4)?;
                let cover_path: Option<String> = row.get(5)?;
                let rel_path = if path.starts_with(&save_dir_str) {
                    path.strip_prefix(&save_dir_str).unwrap_or(&path).to_string()
                } else { path };
                let rel_cover = cover_path.map(|cp| {
                    if cp.starts_with(&save_dir_str) { cp.strip_prefix(&save_dir_str).unwrap_or(&cp).to_string() } else { cp }
                });
                Ok(serde_json::json!({
                    "id": row.get::<_, String>(0)?, "name": row.get::<_, String>(1)?,
                    "media_type": row.get::<_, String>(2)?, "is_series": row.get::<_, i32>(3)? == 1,
                    "path": rel_path, "cover_path": rel_cover,
                    "author": row.get::<_, Option<String>>(6)?, "description": row.get::<_, Option<String>>(7)?,
                    "notes": row.get::<_, Option<String>>(8)?, "created_at": row.get::<_, String>(9)?,
                    "updated_at": row.get::<_, String>(10)?,
                }))
            })?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let tags: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT id, name FROM tags")?;
            let rows = stmt.query_map([], |row| Ok(serde_json::json!({"id": row.get::<_, i64>(0)?, "name": row.get::<_, String>(1)?})))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let item_tags: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT item_id, tag_id FROM item_tags")?;
            let rows = stmt.query_map([], |row| Ok(serde_json::json!({"item_id": row.get::<_, String>(0)?, "tag_id": row.get::<_, i64>(1)?})))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let series: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT id, name, description, author, created_at FROM series")?;
            let rows = stmt.query_map([], |row| Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?, "name": row.get::<_, String>(1)?,
                "description": row.get::<_, Option<String>>(2)?, "author": row.get::<_, Option<String>>(3)?,
                "created_at": row.get::<_, String>(4)?,
            })))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let series_items: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT series_id, item_id, sort_order FROM series_items")?;
            let rows = stmt.query_map([], |row| Ok(serde_json::json!({
                "series_id": row.get::<_, String>(0)?, "item_id": row.get::<_, String>(1)?,
                "sort_order": row.get::<_, i32>(2)?,
            })))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        let settings: Vec<serde_json::Value> = {
            let mut stmt = db.prepare("SELECT key, value FROM settings")?;
            let rows = stmt.query_map([], |row| Ok(serde_json::json!({"key": row.get::<_, String>(0)?, "value": row.get::<_, String>(1)?})))?;
            rows.filter_map(|r| r.ok()).collect()
        };
        serde_json::json!({"version": "1.2", "exportedAt": Utc::now().to_rfc3339(),
            "saveDataDir": save_dir_str, "items": items, "tags": tags, "itemTags": item_tags,
            "series": series, "seriesItems": series_items, "settings": settings})
    };
    let json_str = serde_json::to_string_pretty(&json_data)?;
    fs::write(&file_path, &json_str)?;
    Ok(format!("导出成功，共 {} 字节", json_str.len()))
}

#[tauri::command]
pub fn import_library_from_file(file_path: String, state: State<AppState>) -> Result<String, AppError> {
    let json_data = fs::read_to_string(&file_path)
        .map_err(|e| AppError::Custom(format!("无法读取文件: {}", e)))?;
    import_library(json_data, state)
}

#[tauri::command]
pub fn import_library(json_data: String, state: State<AppState>) -> Result<String, AppError> {
    let data: serde_json::Value = serde_json::from_str(&json_data)
        .map_err(|e| AppError::Custom(format!("Invalid JSON: {}", e)))?;

    let db = state.db.lock().unwrap();
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    let save_dir_str = save_dir.to_string_lossy().to_string();

    let tx = db.unchecked_transaction()?;

    let mut imported_items = 0u32;
    let mut imported_tags = 0u32;
    let mut imported_series = 0u32;

    if let Some(tags) = data.get("tags").and_then(|t| t.as_array()) {
        for tag in tags {
            let name = tag["name"].as_str().unwrap_or("");
            if name.is_empty() { continue; }
            let existing: Option<i64> = tx.query_row(
                "SELECT id FROM tags WHERE name = ?", params![name], |row| row.get(0)
            ).ok();
            if existing.is_none() {
                tx.execute("INSERT INTO tags (name) VALUES (?)", params![name])?;
                imported_tags += 1;
            }
        }
    }

    if let Some(items) = data.get("items").and_then(|i| i.as_array()) {
        for item in items {
            let id = item["id"].as_str().unwrap_or("");
            let name = item["name"].as_str().unwrap_or("");
            let media_type = item["media_type"].as_str().unwrap_or("comic");
            let is_series = item["is_series"].as_bool().unwrap_or(false);
            let mut path = item["path"].as_str().unwrap_or("").to_string();
            let cover_path_val = item["cover_path"].as_str();
            let author = item["author"].as_str();
            let description = item["description"].as_str();
            let notes = item["notes"].as_str();
            let created_at = item["created_at"].as_str().unwrap_or("");
            let updated_at = item["updated_at"].as_str().unwrap_or("");

            if !path.is_empty() && !std::path::Path::new(&path).is_absolute() {
                path = format!("{}{}", save_dir_str, path);
            }
            let cover_path = cover_path_val.map(|cp| {
                if !cp.is_empty() && !std::path::Path::new(cp).is_absolute() {
                    format!("{}{}", save_dir_str, cp)
                } else {
                    cp.to_string()
                }
            });

            let existing: Option<String> = tx.query_row(
                "SELECT id FROM items WHERE id = ?", params![id], |row| row.get(0)
            ).ok();
            if existing.is_some() { continue; }

            tx.execute(
                "INSERT OR IGNORE INTO items (id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                params![id, name, media_type, is_series, path, cover_path, author, description, notes, created_at, updated_at],
            )?;
            imported_items += 1;
        }
    }

    if let Some(item_tags) = data.get("itemTags").and_then(|t| t.as_array()) {
        for it in item_tags {
            let item_id = it["item_id"].as_str().unwrap_or("");
            let tag_id = it["tag_id"].as_i64().unwrap_or(0);
            if item_id.is_empty() || tag_id == 0 { continue; }
            tx.execute(
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id) VALUES (?, ?)",
                params![item_id, tag_id],
            )?;
        }
    }

    if let Some(series) = data.get("series").and_then(|s| s.as_array()) {
        for s in series {
            let id = s["id"].as_str().unwrap_or("");
            let name = s["name"].as_str().unwrap_or("");
            let description = s["description"].as_str();
            let author = s["author"].as_str();
            let created_at = s["created_at"].as_str().unwrap_or("");

            let existing: Option<String> = tx.query_row(
                "SELECT id FROM series WHERE id = ?", params![id], |row| row.get(0)
            ).ok();
            if existing.is_some() { continue; }

            tx.execute(
                "INSERT OR IGNORE INTO series (id, name, description, author, created_at) VALUES (?, ?, ?, ?, ?)",
                params![id, name, description, author, created_at],
            )?;
            imported_series += 1;
        }
    }

    if let Some(series_items) = data.get("seriesItems").and_then(|s| s.as_array()) {
        for si in series_items {
            let series_id = si["series_id"].as_str().unwrap_or("");
            let item_id = si["item_id"].as_str().unwrap_or("");
            let sort_order = si["sort_order"].as_i64().unwrap_or(0) as i32;
            if series_id.is_empty() || item_id.is_empty() { continue; }
            tx.execute(
                "INSERT OR IGNORE INTO series_items (series_id, item_id, sort_order) VALUES (?, ?, ?)",
                params![series_id, item_id, sort_order],
            )?;
        }
    }

    if let Some(settings) = data.get("settings").and_then(|s| s.as_array()) {
        for s in settings {
            let key = s["key"].as_str().unwrap_or("");
            let value = s["value"].as_str().unwrap_or("");
            if key.is_empty() { continue; }
            tx.execute(
                "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
                params![key, value],
            )?;
        }
    }

    tx.commit()?;

    mark_backup_needed(&state);
    Ok(format!("导入完成：{} 个作品，{} 个标签，{} 个系列", imported_items, imported_tags, imported_series))
}

#[tauri::command]
pub fn extract_video_thumbnail(video_path: String, state: State<AppState>) -> Result<Option<String>, AppError> {
    let save_dir = state.save_data_dir.lock().unwrap().clone();
    let thumbs_dir = save_dir.join("thumbnails");
    fs::create_dir_all(&thumbs_dir)?;

    let thumb_path = thumbs_dir.join(format!("{}_thumb.jpg", Uuid::new_v4()));

    match generate_video_thumbnail(&video_path, thumb_path.to_str().unwrap()) {
        Ok(_) => Ok(Some(thumb_path.to_string_lossy().to_string())),
        Err(e) => {
            error!("Video thumbnail error: {}", e);
            Err(AppError::Custom(format!("生成视频缩略图失败: {}", e)))
        }
    }
}

#[tauri::command]
pub fn create_series(
    name: String,
    description: Option<String>,
    author: Option<String>,
    state: State<AppState>,
) -> Result<Series, AppError> {
    let db = state.db.lock().unwrap();
    let now = Utc::now().to_rfc3339();
    let id = Uuid::new_v4().to_string();

    db.execute(
        "INSERT INTO series (id, name, description, author, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        params![id, name, description, author, now, now],
    )?;

    mark_backup_needed(&state);

    Ok(Series {
        id,
        name,
        description,
        author,
        cover_path: None,
        created_at: now.clone(),
        updated_at: now,
        items: None,
        tags: None,
    })
}

#[tauri::command]
pub fn get_series_list(state: State<AppState>) -> Result<Vec<Series>, AppError> {
    let db = state.db.lock().unwrap();

    let mut stmt = db.prepare("SELECT id, name, description, author, cover_path, created_at, updated_at FROM series ORDER BY updated_at DESC")?;
    let series_list = stmt
        .query_map([], |row| {
            Ok(Series {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                author: row.get(3)?,
                cover_path: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                items: None,
                tags: None,
            })
        })?
        .filter_map(|r| r.ok())
        .collect();

    Ok(series_list)
}

#[tauri::command]
pub fn add_item_to_series(series_id: String, item_id: String, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    let tx = db.unchecked_transaction()?;

    let max_order: i64 = tx
        .query_row(
            "SELECT MAX(sort_order) FROM series_items WHERE series_id = ?",
            params![series_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let result = tx.execute(
        "INSERT INTO series_items (series_id, item_id, sort_order) VALUES (?, ?, ?)",
        params![series_id, item_id, max_order + 1],
    );

    if result.is_err() {
        return Err(AppError::Custom("Item already in series".to_string()));
    }

    tx.execute(
        "UPDATE series SET updated_at = ? WHERE id = ?",
        params![Utc::now().to_rfc3339(), series_id],
    )?;

    tx.commit()?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn remove_item_from_series(series_id: String, item_id: String, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    let tx = db.unchecked_transaction()?;

    tx.execute(
        "DELETE FROM series_items WHERE series_id = ? AND item_id = ?",
        params![series_id, item_id],
    )?;

    tx.execute(
        "UPDATE series SET updated_at = ? WHERE id = ?",
        params![Utc::now().to_rfc3339(), series_id],
    )?;

    tx.commit()?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn delete_series(series_id: String, state: State<AppState>) -> Result<(), AppError> {
    let db = state.db.lock().unwrap();

    let tx = db.unchecked_transaction()?;
    tx.execute("DELETE FROM series_items WHERE series_id = ?", params![series_id])?;
    tx.execute("DELETE FROM series WHERE id = ?", params![series_id])?;
    tx.commit()?;

    mark_backup_needed(&state);
    Ok(())
}

#[tauri::command]
pub fn get_available_items_for_series(
    series_id: Option<String>,
    media_type: String,
    state: State<AppState>,
) -> Result<Vec<MediaItem>, AppError> {
    let db = state.db.lock().unwrap();

    let items = if let Some(ref sid) = series_id {
        let mut stmt = db.prepare(
            "SELECT i.id, i.name, i.media_type, i.is_series, i.path, i.cover_path, i.author, i.description, i.notes, i.created_at, i.updated_at
             FROM items i
             WHERE i.media_type = ?
             AND i.id NOT IN (SELECT item_id FROM series_items WHERE series_id = ?)
             ORDER BY i.updated_at DESC
             LIMIT 50",
        )?;
        let mapped = stmt.query_map(params![media_type, sid], |row| {
            Ok(MediaItem {
                id: row.get(0)?,
                name: row.get(1)?,
                media_type: row.get(2)?,
                is_series: row.get::<_, i32>(3)? == 1,
                path: row.get(4)?,
                cover_path: row.get(5)?,
                author: row.get(6)?,
                description: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags: None,
            })
        })?;
        mapped.filter_map(|r| r.ok()).collect()
    } else {
        let mut stmt = db.prepare(
            "SELECT i.id, i.name, i.media_type, i.is_series, i.path, i.cover_path, i.author, i.description, i.notes, i.created_at, i.updated_at
             FROM items i
             WHERE i.media_type = ?
             AND i.id NOT IN (SELECT item_id FROM series_items)
             ORDER BY i.updated_at DESC
             LIMIT 50",
        )?;
        let mapped = stmt.query_map(params![media_type], |row| {
            Ok(MediaItem {
                id: row.get(0)?,
                name: row.get(1)?,
                media_type: row.get(2)?,
                is_series: row.get::<_, i32>(3)? == 1,
                path: row.get(4)?,
                cover_path: row.get(5)?,
                author: row.get(6)?,
                description: row.get(7)?,
                notes: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
                tags: None,
            })
        })?;
        mapped.filter_map(|r| r.ok()).collect()
    };

    Ok(items)
}

#[tauri::command]
pub fn get_series_detail(series_id: String, state: State<AppState>) -> Result<Option<Series>, AppError> {
    let db = state.db.lock().unwrap();

    let mut result = db
        .query_row(
            "SELECT id, name, description, author, cover_path, created_at, updated_at FROM series WHERE id = ?",
            params![series_id],
            |row| {
                Ok(Series {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    author: row.get(3)?,
                    cover_path: row.get(4)?,
                    created_at: row.get(5)?,
                    updated_at: row.get(6)?,
                    items: None,
                    tags: None,
                })
            },
        )
        .ok();

    if let Some(ref mut s) = result {
        let mut items_stmt = db.prepare(
            "SELECT i.id, i.name, i.media_type, i.is_series, i.path, i.cover_path, i.author, i.description, i.notes, i.created_at, i.updated_at
             FROM items i
             JOIN series_items si ON i.id = si.item_id
             WHERE si.series_id = ?
             ORDER BY si.sort_order ASC",
        )?;

        s.items = Some(
            items_stmt
                .query_map(params![series_id], |row| {
                    Ok(MediaItem {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        media_type: row.get(2)?,
                        is_series: row.get::<_, i32>(3)? == 1,
                        path: row.get(4)?,
                        cover_path: row.get(5)?,
                        author: row.get(6)?,
                        description: row.get(7)?,
                        notes: row.get(8)?,
                        created_at: row.get(9)?,
                        updated_at: row.get(10)?,
                        tags: None,
                    })
                })?
                .filter_map(|r| r.ok())
                .collect(),
        );
    }

    Ok(result)
}
