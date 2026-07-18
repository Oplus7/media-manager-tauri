import { useState, useEffect, useRef, useCallback } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { listDirectoryFiles, getSetting, setSetting } from '../api';
import type { MediaItem } from '../types';
import '../styles/player.css';

interface VideoPlayerProps {
  item: MediaItem | null;
  onClose: () => void;
}

const VOLUME_KEY = 'video_volume';

export default function VideoPlayer({ item, onClose }: VideoPlayerProps) {
  const [videos, setVideos] = useState<{ name: string; src: string }[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(100);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [showControls, setShowControls] = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTimeUpdateRef = useRef(0);

  useEffect(() => {
    if (item) {
      loadVideos();
    }
    return () => {
      setVideos([]);
    };
  }, [item]);

  useEffect(() => {
    const loadVolume = async () => {
      try {
        const saved = await getSetting(VOLUME_KEY);
        if (saved) {
          const vol = parseInt(saved, 10);
          if (!isNaN(vol) && vol >= 0 && vol <= 100) {
            setVolume(vol);
            if (videoRef.current) {
              videoRef.current.volume = vol / 100;
            }
          }
        }
      } catch {
        // ignore
      }
    };
    loadVolume();
  }, []);

  const saveVolume = useCallback(async (vol: number) => {
    try {
      await setSetting(VOLUME_KEY, vol.toString());
    } catch {
      // ignore
    }
  }, []);

  const loadVideos = async () => {
    if (!item) return;
    try {
      let files: string[] = [];
      if (item.is_series) {
        files = await listDirectoryFiles(item.path);
      } else {
        files = [item.path];
      }

      const videoExts = ['mp4', 'mkv', 'avi', 'mov', 'wmv', 'webm'];
      const videoFiles = files
        .filter((f) => {
          const ext = f.split('.').pop()?.toLowerCase() || '';
          return videoExts.includes(ext);
        })
        .map((path) => ({
          name: path.split(/[/\\]/).pop() || path,
          src: convertFileSrc(path),
        }));

      setVideos(videoFiles);
    } catch (err) {
      console.error('Failed to load videos:', err);
    }
  };

  const togglePlay = () => {
    if (videoRef.current) {
      if (playing) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setPlaying(!playing);
    }
  };

  const playNext = () => {
    if (currentIndex < videos.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleMouseMove = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      if (!playing) return;
      setShowControls(false);
    }, 3000);
  };

  const handleDoubleClick = () => {
    if (videoRef.current) {
      if (document.fullscreenElement) {
        document.exitFullscreen();
      } else {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol / 100;
    }
    saveVolume(vol);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const now = performance.now();
      if (now - lastTimeUpdateRef.current >= 250) {
        lastTimeUpdateRef.current = now;
        setCurrentTime(videoRef.current.currentTime);
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.volume = volume / 100;
    }
  };

  const formatTime = (seconds: number) => {
    if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        if (videoRef.current) {
          videoRef.current.currentTime = Math.min(videoRef.current.currentTime + 10, videoRef.current.duration);
        }
      } else if (e.key === 'ArrowLeft') {
        if (videoRef.current) {
          videoRef.current.currentTime = Math.max(videoRef.current.currentTime - 10, 0);
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const newVol = Math.min(100, volume + 5);
        setVolume(newVol);
        if (videoRef.current) videoRef.current.volume = newVol / 100;
        saveVolume(newVol);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        const newVol = Math.max(0, volume - 5);
        setVolume(newVol);
        if (videoRef.current) videoRef.current.volume = newVol / 100;
        saveVolume(newVol);
      } else if (e.key === 'f' || e.key === 'F') {
        handleDoubleClick();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, playing, volume, saveVolume]);

  if (!item) return null;

  return (
    <div className="player-overlay video-player-overlay">
      <div className="player-header">
        <h2>{item.name}</h2>
        <button className="btn-close" onClick={onClose}>×</button>
      </div>

      <div className="video-container" onMouseMove={handleMouseMove} onDoubleClick={handleDoubleClick}>
        {videos[currentIndex] ? (
          <video
            ref={videoRef}
            src={videos[currentIndex].src}
            autoPlay
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onEnded={playNext}
            onTimeUpdate={handleTimeUpdate}
            onLoadedMetadata={handleLoadedMetadata}
            onClick={togglePlay}
          />
        ) : (
          <div className="empty-state">
            <div className="empty-state-icon">🎬</div>
            <p>没有找到视频</p>
          </div>
        )}

        {showControls && videos[currentIndex] && (
          <div className="video-custom-controls" onClick={(e) => e.stopPropagation()}>
            <div className="video-progress-bar">
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={handleSeek}
                className="video-seek"
              />
            </div>
            <div className="video-controls-row">
              <div className="video-controls-left">
                <button className="video-ctrl-btn" onClick={togglePlay}>
                  {playing ? '⏸' : '▶'}
                </button>
                <span className="video-time">{formatTime(currentTime)} / {formatTime(duration)}</span>
              </div>
              <div className="video-controls-right">
                <div className="volume-control">
                  <span className="volume-icon">{volume === 0 ? '🔇' : volume < 50 ? '🔉' : '🔊'}</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={volume}
                    onChange={handleVolumeChange}
                  />
                  <span className="volume-value">{volume}%</span>
                </div>
                <button className="video-ctrl-btn" onClick={handleDoubleClick}>⛶</button>
              </div>
            </div>
          </div>
        )}
      </div>

      {videos.length > 1 && (
        <div className="player-footer">
          <div className="video-list">
            <h4>选集 ({videos.length})</h4>
            <div className="video-items">
              {videos.map((_video, idx) => (
                <div
                  key={idx}
                  className={`video-item ${idx === currentIndex ? 'active' : ''}`}
                  onClick={() => setCurrentIndex(idx)}
                >
                  {idx + 1}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
