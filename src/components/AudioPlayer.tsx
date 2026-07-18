import { useState, useEffect, useRef } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listDirectoryFiles, getSetting, setSetting } from '../api';
import type { MediaItem } from '../types';
import '../styles/player.css';

const VOLUME_KEY = 'audio_volume';

interface AudioPlayerProps {
  item: MediaItem | null;
  onClose: () => void;
}

interface AudioTrack {
  name: string;
  path: string;
  src: string;
}

interface LyricLine {
  time: number;
  text: string;
}

export default function AudioPlayer({ item, onClose }: AudioPlayerProps) {
  const [tracks, setTracks] = useState<AudioTrack[]>([]);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [coverSrc, setCoverSrc] = useState<string | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);
  const [currentLyric, setCurrentLyric] = useState<string | null>(null);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  const parseLRC = (content: string): LyricLine[] => {
    const lines = content.split('\n');
    const result: LyricLine[] = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;

    for (const line of lines) {
      const match = line.match(timeRegex);
      if (match) {
        const minutes = parseInt(match[1], 10);
        const seconds = parseInt(match[2], 10);
        const ms = parseInt(match[3].padEnd(3, '0'), 10);
        const time = minutes * 60 + seconds + ms / 1000;
        const text = line.replace(timeRegex, '').trim();
        if (text) {
          result.push({ time, text });
        }
      }
    }
    return result.sort((a, b) => a.time - b.time);
  };

  const loadLyrics = async (audioPath: string) => {
    try {
      const lrcPath = audioPath.replace(/\.[^.]+$/, '.lrc');
      const response = await fetch(convertFileSrc(lrcPath));
      if (response.ok) {
        const content = await response.text();
        setLyrics(parseLRC(content));
      } else {
        setLyrics([]);
        setCurrentLyric(null);
      }
    } catch {
      setLyrics([]);
      setCurrentLyric(null);
    }
  };

  const updateCurrentLyric = () => {
    if (lyrics.length === 0) return;
    const time = audioRef.current?.currentTime || 0;
    let lyric: string | null = null;
    for (let i = lyrics.length - 1; i >= 0; i--) {
      if (time >= lyrics[i].time) {
        lyric = lyrics[i].text;
        break;
      }
    }
    setCurrentLyric(lyric);
  };

  const loadTracks = async () => {
    if (!item) return;
    try {
      let files: string[] = [];
      if (item.is_series) {
        files = await listDirectoryFiles(item.path);
      } else {
        files = [item.path];
      }

      const audioExts = ['mp3', 'wav', 'flac', 'aac', 'ogg', 'm4a'];
      const audioFiles = files
        .filter((f) => {
          const ext = f.split('.').pop()?.toLowerCase() || '';
          return audioExts.includes(ext);
        })
        .map((path) => ({
          name: path.split(/[/\\]/).pop() || path,
          path,
          src: convertFileSrc(path),
        }));

      setTracks(audioFiles);

      if (item.cover_path) {
        setCoverSrc(convertFileSrc(item.cover_path));
      }

      if (audioFiles.length > 0) {
        loadLyrics(audioFiles[0].path);
      }
    } catch (err) {
      console.error('Failed to load tracks:', err);
    }
  };

  const saveVolume = async (vol: number) => {
    try {
      await setSetting(VOLUME_KEY, vol.toString());
    } catch (err) {
      console.error('Failed to save volume:', err);
    }
  };

  useEffect(() => {
    if (item) {
      loadTracks();
    }
    return () => {
      setTracks([]);
      setPlaying(false);
    };
  }, [item]);

  const handleCanPlay = () => {
    if (playing && audioRef.current) {
      audioRef.current.play().catch(err => console.error('Play failed:', err));
    }
  };

  useEffect(() => {
    const loadVolume = async () => {
      try {
        const saved = await getSetting(VOLUME_KEY);
        if (saved) {
          const vol = parseInt(saved, 10);
          setVolume(vol);
          if (audioRef.current) {
            audioRef.current.volume = vol / 100;
          }
        }
      } catch (err) {
        console.error('Failed to load volume:', err);
      }
    };
    loadVolume();
  }, []);

  useEffect(() => {
    if (tracks.length > 0 && currentTrack < tracks.length) {
      loadLyrics(tracks[currentTrack].path);
    }
  }, [currentTrack, tracks]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (playing) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(err => console.error('Play failed:', err));
      }
      setPlaying(!playing);
    }
  };

  const playTrack = (index: number) => {
    setCurrentTrack(index);
    setPlaying(true);
  };

  const playNext = () => {
    if (currentTrack < tracks.length - 1) {
      playTrack(currentTrack + 1);
    }
  };

  const playPrev = () => {
    if (currentTrack > 0) {
      playTrack(currentTrack - 1);
    }
  };

  const lastUiUpdateRef = useRef(0);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const now = performance.now();
      if (now - lastUiUpdateRef.current >= 250) {
        lastUiUpdateRef.current = now;
        setCurrentTime(audioRef.current.currentTime);
        updateCurrentLyric();
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (audioRef.current) {
      audioRef.current.volume = vol / 100;
    }
    saveVolume(vol);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.min(audioRef.current.currentTime + 5, duration);
        }
      } else if (e.key === 'ArrowLeft') {
        if (audioRef.current) {
          audioRef.current.currentTime = Math.max(audioRef.current.currentTime - 5, 0);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, duration]);

  if (!item) return null;

  return (
    <div className="player-overlay">
      {/* 标题栏 */}
      <div className="player-header">
        <h2>{item.name}</h2>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      {/* 主内容区 */}
      <div className="player-main">
        {/* 左侧内容 */}
        <div className="player-content">
          {/* 专辑封面 */}
          <div className="album-art">
            {coverSrc ? (
              <img src={coverSrc} alt={item.name} />
            ) : (
              <div className="placeholder">🎵</div>
            )}
          </div>

          {/* 曲目信息 */}
          <div className="track-info">
            <h3>{tracks[currentTrack]?.name || '无曲目'}</h3>
            <p>{item.name}</p>
          </div>

          {/* 进度条 */}
          <div className="progress-bar">
            <span className="time">{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 0}
              value={currentTime}
              onChange={handleSeek}
            />
            <span className="time">{formatTime(duration)}</span>
          </div>

          {/* 播放控制 */}
          <div className="controls">
            <button onClick={playPrev} disabled={currentTrack === 0} title="上一曲">
              ⏮
            </button>
            <button className="play-btn" onClick={togglePlay} title={playing ? '暂停' : '播放'}>
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={playNext} disabled={currentTrack === tracks.length - 1} title="下一曲">
              ⏭
            </button>
          </div>

          {/* 音量控制 */}
          <div className="volume-control">
            <span>🔊</span>
            <input
              type="range"
              min="0"
              max="100"
              value={volume}
              onChange={handleVolumeChange}
            />
            <span style={{ fontSize: '12px', color: 'var(--text-muted)', minWidth: '40px' }}>
              {volume}%
            </span>
          </div>

          {/* 字幕区域 */}
          <div className="subtitle-area">
            <div className="subtitle-text">
              {currentLyric ? (
                <span className="subtitle-lyric">{currentLyric}</span>
              ) : (
                <span className="subtitle-placeholder">本文件暂无字幕</span>
              )}
            </div>
          </div>
        </div>

        {/* 播放列表 */}
        {tracks.length > 1 && (
          <div className={`playlist-sidebar ${showPlaylist ? 'expanded' : ''}`}>
            <button
              className="playlist-toggle"
              onClick={() => setShowPlaylist(!showPlaylist)}
              title={showPlaylist ? '收起' : '展开'}
            >
              {showPlaylist ? '›' : '‹'}
            </button>
            {showPlaylist && (
              <div className="playlist-content">
                <div className="playlist-header">
                  <h4>播放列表 ({tracks.length})</h4>
                </div>
                <div className="track-list">
                  {tracks.map((track, idx) => (
                    <div
                      key={idx}
                      className={`track-item ${idx === currentTrack ? 'active' : ''}`}
                      onClick={() => playTrack(idx)}
                    >
                      <span className="track-number">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="track-name">{track.name}</span>
                      {idx === currentTrack && playing && (
                        <span className="playing-indicator">▶</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={tracks[currentTrack]?.src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={playNext}
        onCanPlay={handleCanPlay}
      />
    </div>
  );
}
