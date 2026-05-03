import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, RotateCcw, RotateCw, Trash2,
  MousePointer2, Circle, Pen,
  MoveUpRight, Hexagon, GitCommitVertical, Settings2,
  ChevronLeft, Undo2, Redo2,
  X, AlertTriangle, Minus, Layers, Eye, EyeOff,
  CornerUpRight, Volume2, VolumeX, User, Flashlight, ZoomIn,
  Activity,
  Tags, FolderPlus, Folder, ListPlus, Plus, Save, Edit2, Check,
  GripVertical, PlayCircle, StopCircle, Pencil, Trash, PlusCircle,
  SkipBack, SkipForward, ZoomOut, Snowflake, Clock, Timer, Code, Zap, MessageSquare,
  Download, Upload, Type
} from 'lucide-react';
import EventPlaybar from './EventPlaybar';
import {
  ToolType, Point, Rect, Particle, Shape, FreezeFrame,
  ColorPreset, MaskSettings, MaskLayerCache, TimelineMarker,
  Tag, TagEvent, Playlist, ProjectData, Project
} from '@/src/types';
import { INITIAL_COLORS, DEFAULT_TAGS } from '@/src/constants';
import {
  formatTime, getDistance, getVideoLayout, createParticles, clamp
} from '@/src/utils/general';
import {
  fadeColor, adjustBrightness, shiftColor, rgbToHsl
} from '@/src/utils/colors';
import {
  drawArrowHead, drawDashedLine, drawLabel, getShimmerGradient,
  drawFreehandArrow, drawProArrow, draw3DRing, drawSpotlight,
  drawTangentLine, drawCurvedArrow, drawLens, drawText,
  drawSelectionHandles, drawSelectionBox, drawTiltedLine, drawTiltedPolygon
} from '@/src/utils/drawing';

const Workspace = ({ 
    videoUrl, 
    project, 
    onUpdateProject,
    onClose 
}: { 
    videoUrl: string, 
    project: Project, 
    onUpdateProject: (data: ProjectData) => void,
    onClose: () => void 
}) => {
  // State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0); // Default speed 1x
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(true);
  const [timelineZoom, setTimelineZoom] = useState(1);
  
  // Freeze Frame State
  const [freezeFrames, setFreezeFrames] = useState<FreezeFrame[]>(project.data.freezeFrames);
  const triggeredFreezeFrames = useRef<Set<string>>(new Set());
  const [activeFreezeFrameId, setActiveFreezeFrameId] = useState<string | null>(null); 
  const [countdownValue, setCountdownValue] = useState(0); 
  const countdownInterval = useRef<number | null>(null);

  // Drawing State
  const [tool, setTool] = useState<ToolType>(null);
  const [colors, setColors] = useState<ColorPreset[]>(INITIAL_COLORS);
  const [activeColorId, setActiveColorId] = useState<number>(6); 
  const [strokeWidth, setStrokeWidth] = useState(4);
  const [shapes, setShapes] = useState<Shape[]>(project.data.shapes);
  const [redoStack, setRedoStack] = useState<Shape[][]>([]);
  
  // Interaction State
  const [isDrawing, setIsDrawing] = useState(false);
  const [activePoints, setActivePoints] = useState<Point[]>([]); 
  const [currentDragStart, setCurrentDragStart] = useState<Point | null>(null); 
  const mousePosRef = useRef<Point | null>(null); 

  // Arrow Settings
  const [arrowSettings, setArrowSettings] = useState({
      isDashed: false,
      isFreehand: false
  });

  // Player Dragger State
  const [playerMoveState, setPlayerMoveState] = useState<'idle' | 'selecting' | 'moving'>('idle');
  const [playerSelectionRect, setPlayerSelectionRect] = useState<Rect | null>(null); 
  const [capturedSprite, setCapturedSprite] = useState<{ sprite: ImageBitmap, patch: ImageBitmap, box: Rect } | null>(null);
  
  // Spotlight State
  const [spotlightSettings, setSpotlightSettings] = useState({
    size: 45, intensity: 0.75, rotation: 0.45 
  });

  // Lens State
  const [lensSettings, setLensSettings] = useState({ size: 75, zoom: 2.0 });
  const [ringSettings, setRingSettings] = useState({ tilt: 65, isFilled: false, size: 60 });

  // Text State
  const [textSettings, setTextSettings] = useState({
    text: 'TEXT',
    fontSize: 32,
    fontFamily: 'Arial',
    rotation: 0,
    tilt: 0
  });
  const [textInputActive, setTextInputActive] = useState(false);

  // Select State
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  const [draggedVertexIndex, setDraggedVertexIndex] = useState<number | null>(null);
  const [draggedCircleIndex, setDraggedCircleIndex] = useState<number | null>(null);

  // Tilt Settings (applies to multiple tools)
  const [generalTilt, setGeneralTilt] = useState(65);

  // Masking State
  const [maskSettings, setMaskSettings] = useState<MaskSettings>({ enabled: false, sensitivity: 40, showOverlay: true });
  const [maskCache, setMaskCache] = useState<MaskLayerCache>({ foreground: null, overlay: null, timestamp: -1 });
  const [isProcessingMask, setIsProcessingMask] = useState(false);

  // Markers State
  const [markers, setMarkers] = useState<TimelineMarker[]>(project.data.markers);
  const [markerModal, setMarkerModal] = useState<{ isOpen: boolean; x: number; y: number; mode: 'create' | 'edit'; markerId?: string; time?: number; tempLabel: string; tempColor: string; } | null>(null);

  // --- Tagging & Playlist State ---
  const [tags, setTags] = useState<Tag[]>(project.data.tags);
  const [tagEvents, setTagEvents] = useState<TagEvent[]>(project.data.tagEvents);
  const [isTaggingMode, setIsTaggingMode] = useState(false);
  const [activeRecording, setActiveRecording] = useState<{ tagId: string, startTime: number } | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>(project.data.playlists);
  const [activePlaylistId, setActivePlaylistId] = useState<string>('p1');
  const [filterTagId, setFilterTagId] = useState<string | null>(null);
  const [tagSettingsOpen, setTagSettingsOpen] = useState(false);
  const [selectedEventIds, setSelectedEventIds] = useState<Set<string>>(new Set());
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tempTag, setTempTag] = useState<Partial<Tag>>({});
  const [isAddingNewTag, setIsAddingNewTag] = useState(false);

  // Playlist Management State
  const [playlistModal, setPlaylistModal] = useState<{ isOpen: boolean; mode: 'create' | 'edit'; playlistId?: string; tempName: string } | null>(null);
  const [playlistDeleteId, setPlaylistDeleteId] = useState<string | null>(null);
  const [autoplay, setAutoplay] = useState<{ active: boolean; playlistId: string | null; eventIndex: number }>({ active: false, playlistId: null, eventIndex: -1 });
  const [draggingEventIndex, setDraggingEventIndex] = useState<number | null>(null);

  // Sidebar Resizing State
  const [sidebarWidth, setSidebarWidth] = useState(300);
  const [eventSectionHeight, setEventSectionHeight] = useState(40);
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);
  const [isResizingSection, setIsResizingSection] = useState(false);

  // Timeline Editing State
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, eventId: string } | null>(null);
  const [editEventModal, setEditEventModal] = useState<{ isOpen: boolean, eventId: string, startTime: number, endTime: number, notes: string } | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState<string | null>(null);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineContainerRef = useRef<HTMLDivElement>(null); 
  const offscreenCanvasRef = useRef<OffscreenCanvas | null>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // Computed
  const currentColor = colors.find(c => c.id === activeColorId)?.value || '#00eaff';

  // --- Data Sync ---
  // Debounced update to parent
  useEffect(() => {
    const timeout = setTimeout(() => {
        onUpdateProject({
            shapes, freezeFrames, tags, tagEvents, playlists, markers
        });
    }, 1000);
    return () => clearTimeout(timeout);
  }, [shapes, freezeFrames, tags, tagEvents, playlists, markers]);

  // --- Video Logic --- (Same as before)
  // ... (Video effects logic omitted for brevity as it is identical, but ensuring all useEffects are present in full output below)

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = volume;
      videoRef.current.muted = isMuted;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (isPlaying) {
      setShapes(prev => prev.filter(s => !!s.freezeFrameId));
      setRedoStack([]);
      setActivePoints([]);
      setIsDrawing(false);
      setCurrentDragStart(null);
      setPlayerMoveState('idle');
      setPlayerSelectionRect(null);
      setCapturedSprite(null);
    }
  }, [isPlaying]);

  // ... (Toggle Play, Mute, Zoom, Manual Seek, etc. same as before)
  const togglePlay = () => {
    if (countdownInterval.current) {
        clearInterval(countdownInterval.current);
        countdownInterval.current = null;
        setActiveFreezeFrameId(null);
        setCountdownValue(0);
        if (videoRef.current) videoRef.current.play();
        setIsPlaying(true);
        return;
    }
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        if (autoplay.active) {
            setAutoplay({ active: false, playlistId: null, eventIndex: -1 });
        }
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const toggleMute = () => {
    setIsMuted(!isMuted);
  };

  const handleZoomIn = () => {
      setTimelineZoom(prev => Math.min(10, prev + 1));
  };

  const handleZoomOut = () => {
      setTimelineZoom(prev => Math.max(1, prev - 1));
  };

  useEffect(() => {
      if (timelineContainerRef.current) {
          const container = timelineContainerRef.current;
          if (timelineZoom > 1) {
              const scrollWidth = container.scrollWidth;
              const clientWidth = container.clientWidth;
              const progress = currentTime / (duration || 1);
              const center = (progress * scrollWidth) - (clientWidth / 2);
              container.scrollLeft = center;
          } else {
              container.scrollLeft = 0;
          }
      }
  }, [currentTime, timelineZoom, duration]);

  const getFilteredEvents = () => {
      let events = [...tagEvents];
      if (filterTagId) {
          events = events.filter(e => e.tagId === filterTagId);
      }
      return events.sort((a, b) => a.startTime - b.startTime);
  };

  const handleManualSeek = (time: number) => {
      if (videoRef.current) {
          videoRef.current.currentTime = time;
          setCurrentTime(time);
          triggeredFreezeFrames.current.clear();
          if (countdownInterval.current) {
              clearInterval(countdownInterval.current);
              countdownInterval.current = null;
              setActiveFreezeFrameId(null);
              setCountdownValue(0);
              setIsPlaying(false);
          }
      }
  };

  const jumpPrevEvent = () => {
    const events = getFilteredEvents();
    if (!events.length || !videoRef.current) return;
    const now = videoRef.current.currentTime;
    const prev = [...events].reverse().find(e => e.startTime < now - 0.5);
    if (prev) {
        handleManualSeek(prev.startTime);
    } else if (now > 0.5) {
        handleManualSeek(0);
    }
  };

  const jumpNextEvent = () => {
      const events = getFilteredEvents();
      if (!events.length || !videoRef.current) return;
      const now = videoRef.current.currentTime;
      const next = events.find(e => e.startTime > now + 0.5);
      if (next) {
          handleManualSeek(next.startTime);
      }
  };

  const addFreezeFrame = () => {
      const current = videoRef.current?.currentTime || 0;
      const existing = freezeFrames.find(ff => Math.abs(ff.timestamp - current) < 0.5);
      if (!existing) {
          const newFF: FreezeFrame = {
              id: Date.now().toString(),
              timestamp: current,
              duration: 5
          };
          setFreezeFrames(prev => [...prev, newFF]);
      }
  };

  const deleteFreezeFrame = (id: string) => {
      setFreezeFrames(prev => prev.filter(ff => ff.id !== id));
      setShapes(prev => prev.filter(s => s.freezeFrameId !== id));
  };

  const updateFreezeFrameDuration = (id: string, duration: number) => {
      setFreezeFrames(prev => prev.map(ff => ff.id === id ? { ...ff, duration } : ff));
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      const time = videoRef.current.currentTime;
      setCurrentTime(time);

      if (isPlaying) {
          const ff = freezeFrames.find(f => Math.abs(f.timestamp - time) < 0.1); 
          if (ff && !triggeredFreezeFrames.current.has(ff.id)) {
              videoRef.current.pause();
              setIsPlaying(false);
              triggeredFreezeFrames.current.add(ff.id);
              setActiveFreezeFrameId(ff.id);
              let remaining = ff.duration;
              setCountdownValue(remaining);
              if (countdownInterval.current) clearInterval(countdownInterval.current);
              countdownInterval.current = window.setInterval(() => {
                  remaining -= 0.1;
                  setCountdownValue(remaining);
                  if (remaining <= 0) {
                      if (countdownInterval.current) clearInterval(countdownInterval.current);
                      countdownInterval.current = null;
                      if (videoRef.current) {
                          videoRef.current.play();
                          setIsPlaying(true);
                      }
                      setActiveFreezeFrameId(null);
                      setCountdownValue(0);
                  }
              }, 100);
          }
      }

      if (autoplay.active && autoplay.playlistId) {
          const playlist = playlists.find(p => p.id === autoplay.playlistId);
          if (playlist && playlist.events.length > autoplay.eventIndex) {
              const currentEvent = playlist.events[autoplay.eventIndex];
              if (time >= currentEvent.endTime) {
                  const nextIndex = autoplay.eventIndex + 1;
                  if (nextIndex < playlist.events.length) {
                      const nextEvent = playlist.events[nextIndex];
                      setAutoplay(prev => ({ ...prev, eventIndex: nextIndex }));
                      if (videoRef.current) {
                          videoRef.current.currentTime = nextEvent.startTime;
                          if (videoRef.current.paused) videoRef.current.play();
                      }
                  } else {
                      setAutoplay({ active: false, playlistId: null, eventIndex: -1 });
                      setIsPlaying(false);
                      videoRef.current.pause();
                  }
              }
          }
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
      videoRef.current.playbackRate = playbackRate;
      videoRef.current.muted = isMuted;
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    handleManualSeek(time);
    setMaskCache({ foreground: null, overlay: null, timestamp: -1 });
  };

  // ... (Playlist, Tagging, Marker, Drawing logic - same as before)
  const savePlaylist = () => {
      if (!playlistModal) return;
      if (playlistModal.mode === 'create') {
          const newId = Date.now().toString();
          setPlaylists(prev => [...prev, { id: newId, name: playlistModal.tempName || 'New Playlist', events: [] }]);
          setActivePlaylistId(newId);
      } else if (playlistModal.mode === 'edit' && playlistModal.playlistId) {
          setPlaylists(prev => prev.map(p => p.id === playlistModal.playlistId ? { ...p, name: playlistModal.tempName } : p));
      }
      setPlaylistModal(null);
  };

  const confirmDeletePlaylist = () => {
      if (playlistDeleteId) {
          setPlaylists(prev => prev.filter(p => p.id !== playlistDeleteId));
          if (activePlaylistId === playlistDeleteId) {
              setActivePlaylistId(playlists.find(p => p.id !== playlistDeleteId)?.id || '');
          }
          setPlaylistDeleteId(null);
      }
  };

  const removeEventFromPlaylist = (playlistId: string, eventIndex: number) => {
      setPlaylists(prev => prev.map(p => {
          if (p.id === playlistId) {
              const newEvents = [...p.events];
              newEvents.splice(eventIndex, 1);
              return { ...p, events: newEvents };
          }
          return p;
      }));
  };

  const reorderPlaylistEvents = (playlistId: string, fromIndex: number, toIndex: number) => {
      setPlaylists(prev => prev.map(p => {
          if (p.id === playlistId) {
              const newEvents = [...p.events];
              const [moved] = newEvents.splice(fromIndex, 1);
              newEvents.splice(toIndex, 0, moved);
              return { ...p, events: newEvents };
          }
          return p;
      }));
  };

  const startPlaylistAutoplay = (playlistId: string) => {
      const playlist = playlists.find(p => p.id === playlistId);
      if (playlist && playlist.events.length > 0) {
          const startEvent = playlist.events[0];
          setAutoplay({ active: true, playlistId, eventIndex: 0 });
          if (videoRef.current) {
              videoRef.current.currentTime = startEvent.startTime;
              videoRef.current.play();
              setIsPlaying(true);
          }
      }
  };

  const handleTagClick = (tagId: string) => {
      const tag = tags.find(t => t.id === tagId);
      if (!tag) return;

      if (isTaggingMode) {
          // Check if Quick Code (Lead/Lag) is enabled for this tag
          if (tag.leadLagEnabled) {
              // Single click creation
              const pre = tag.preTime ?? 10;
              const post = tag.postTime ?? 10;
              const start = Math.max(0, currentTime - pre);
              const end = Math.min(duration, currentTime + post);
              
              const newEvent: TagEvent = {
                  id: Date.now().toString(),
                  tagId: tagId,
                  startTime: start,
                  endTime: end,
                  notes: '' // Initialize empty notes
              };
              setTagEvents(prev => [...prev, newEvent]);
              return;
          }

          if (activeRecording) {
              if (activeRecording.tagId === tagId) {
                  const newEvent: TagEvent = {
                      id: Date.now().toString(),
                      tagId: tagId,
                      startTime: activeRecording.startTime,
                      endTime: currentTime
                  };
                  setTagEvents(prev => [...prev, newEvent]);
                  setActiveRecording(null);
              } else {
                  const newEvent: TagEvent = {
                      id: Date.now().toString(),
                      tagId: activeRecording.tagId,
                      startTime: activeRecording.startTime,
                      endTime: currentTime
                  };
                  setTagEvents(prev => [...prev, newEvent]);
                  setActiveRecording({ tagId, startTime: currentTime });
              }
          } else {
              setActiveRecording({ tagId, startTime: currentTime });
          }
      } else {
          setFilterTagId(current => current === tagId ? null : tagId);
      }
  };

  const cancelRecording = useCallback(() => {
      if (activeRecording) {
          setActiveRecording(null);
      }
  }, [activeRecording]);

  const addSelectedToPlaylist = () => {
    if (selectedEventIds.size === 0) return;
    setPlaylists(prev => prev.map(p => {
        if (p.id === activePlaylistId) {
            const newEvents = tagEvents.filter(e => selectedEventIds.has(e.id));
            return { ...p, events: [...p.events, ...newEvents] };
        }
        return p;
    }));
    const btn = document.getElementById('save-playlist-btn');
    if (btn) {
        btn.classList.add('bg-green-500');
        setTimeout(() => btn.classList.remove('bg-green-500'), 500);
    }
  };

  const handleEventContextMenu = (e: React.MouseEvent, eventId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const menuHeight = 80;
    const windowHeight = window.innerHeight;
    let y = e.clientY;
    if (y + menuHeight > windowHeight) {
        y = windowHeight - menuHeight - 10;
    }
    setContextMenu({ x: e.clientX, y: y, eventId });
  };

  const handleEditEvent = () => {
      if (!contextMenu) return;
      const evt = tagEvents.find(e => e.id === contextMenu.eventId);
      if (evt) {
          setEditEventModal({ 
              isOpen: true, 
              eventId: evt.id, 
              startTime: evt.startTime, 
              endTime: evt.endTime,
              notes: evt.notes || '' 
          });
      }
      setContextMenu(null);
  };

  const saveEditedEvent = () => {
      if (!editEventModal) return;
      setTagEvents(prev => prev.map(e => {
          if (e.id === editEventModal.eventId) {
              return {
                  ...e,
                  startTime: editEventModal.startTime,
                  endTime: editEventModal.endTime,
                  notes: editEventModal.notes
              };
          }
          return e;
      }));
      setEditEventModal(null);
  };

  const handleDeleteEventRequest = () => {
      if (contextMenu) {
        setDeleteConfirmation(contextMenu.eventId);
        setContextMenu(null);
      } else if (editEventModal) {
        setDeleteConfirmation(editEventModal.eventId);
        setEditEventModal(null);
      }
  };

  const confirmDeleteEvent = () => {
      if (deleteConfirmation) {
          setTagEvents(prev => prev.filter(e => e.id !== deleteConfirmation));
          setPlaylists(prev => prev.map(p => ({
              ...p,
              events: p.events.filter(e => e.id !== deleteConfirmation)
          })));
          setDeleteConfirmation(null);
      }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      const tag = tags.find(t => t.shortcut.toLowerCase() === e.key.toLowerCase());
      if (tag) {
          e.preventDefault();
          if (isTaggingMode) {
              handleTagClick(tag.id);
          } else {
              if (!isTaggingMode) {
                  setIsTaggingMode(true);
                  handleTagClick(tag.id);
              }
          }
          return;
      }
      if (isTaggingMode && e.key === 'Escape') {
          cancelRecording();
          setIsTaggingMode(false);
          return;
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (videoRef.current) handleManualSeek(Math.max(0, videoRef.current.currentTime - 5));
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (videoRef.current) handleManualSeek(Math.min(duration, videoRef.current.currentTime + 5));
          break;
        case 'KeyZ':
          if (isCtrlOrMeta) {
              e.preventDefault();
              if (e.shiftKey) {
                  redo();
              } else {
                  undo();
              }
          }
          break;
        case 'KeyY':
            if (isCtrlOrMeta) {
                e.preventDefault();
                redo();
            }
            break;
        case 'Delete':
        case 'Backspace':
            e.preventDefault();
            if (selectedEventIds.size > 0) {
                 if (shapes.length > 0) clearAll();
            } else {
                clearAll();
            }
            break;
        case 'KeyA':
            if (isCtrlOrMeta) {
                e.preventDefault();
                setSelectedEventIds(new Set(tagEvents.map(e => e.id)));
            }
            break;
        case 'KeyS':
            if (isCtrlOrMeta) {
                e.preventDefault();
                addSelectedToPlaylist();
            }
            break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, duration, shapes, redoStack, isTaggingMode, tags, activeRecording, currentTime, tagEvents, selectedEventIds, activePlaylistId, autoplay, contextMenu, editEventModal]); 

  // --- Timeline Markers & Canvas Handlers (Same as before)
  const handleTimelineContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    if (!timelineContainerRef.current || duration === 0) return;
    const container = timelineContainerRef.current;
    const scrollLeft = container.scrollLeft;
    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const totalClickX = scrollLeft + clickX;
    const totalWidth = container.scrollWidth;
    const percentage = Math.max(0, Math.min(1, totalClickX / totalWidth));
    const time = percentage * duration;
    setMarkerModal({ isOpen: true, x: e.clientX, y: e.clientY - 160, mode: 'create', time: time, tempLabel: '', tempColor: '#ef4444' });
  };

  const handleMarkerContextMenu = (e: React.MouseEvent, marker: TimelineMarker) => {
    e.preventDefault();
    e.stopPropagation(); 
    setMarkerModal({ isOpen: true, x: e.clientX, y: e.clientY - 160, mode: 'edit', markerId: marker.id, tempLabel: marker.label, tempColor: marker.color });
  };

  const saveMarker = () => {
    if (!markerModal) return;
    if (markerModal.mode === 'create' && markerModal.time !== undefined) {
        setMarkers(prev => [...prev, { id: Date.now().toString(), time: markerModal.time!, label: markerModal.tempLabel || 'Marker', color: markerModal.tempColor }]);
    } else if (markerModal.mode === 'edit' && markerModal.markerId) {
        setMarkers(prev => prev.map(m => m.id === markerModal.markerId ? { ...m, label: markerModal.tempLabel, color: markerModal.tempColor } : m));
    }
    setMarkerModal(null);
  };

  const deleteMarker = () => {
      if (markerModal?.markerId) {
          setMarkers(prev => prev.filter(m => m.id !== markerModal.markerId));
          setMarkerModal(null);
      }
  };

  const jumpToMarker = (time: number) => {
      handleManualSeek(time);
  };

  const handleEventClick = (e: React.MouseEvent, eventId: string, time: number) => {
    e.stopPropagation();
    handleManualSeek(time);
    if (e.ctrlKey || e.metaKey) {
        const newSet = new Set(selectedEventIds);
        if (newSet.has(eventId)) newSet.delete(eventId);
        else newSet.add(eventId);
        setSelectedEventIds(newSet);
    } else {
        if (selectedEventIds.size === 1 && selectedEventIds.has(eventId)) {
            setSelectedEventIds(new Set()); 
        } else {
            setSelectedEventIds(new Set([eventId]));
        }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
      if (tool === null && selectedEventIds.size > 0 && !isDrawing) {
          setSelectedEventIds(new Set());
      }
  };

  const handleEventUpdate = (start: number, end: number) => {
      if (selectedEventIds.size !== 1) return;
      const eventId = Array.from(selectedEventIds)[0];
      setTagEvents(prev => prev.map(e => {
          if (e.id === eventId) return { ...e, startTime: start, endTime: end };
          return e;
      }));
  };

  const handleSidebarResize = useCallback((e: MouseEvent) => {
    if (isResizingSidebar) {
        const newWidth = document.body.clientWidth - e.clientX;
        setSidebarWidth(Math.max(250, Math.min(600, newWidth)));
    }
  }, [isResizingSidebar]);

  const handleSectionResize = useCallback((e: MouseEvent) => {
      if (isResizingSection && sidebarRef.current) {
          const sidebarRect = sidebarRef.current.getBoundingClientRect();
          const relativeY = e.clientY - sidebarRect.top;
          const percentage = (relativeY / sidebarRect.height) * 100;
          setEventSectionHeight(Math.max(10, Math.min(90, percentage)));
      }
  }, [isResizingSection]);

  useEffect(() => {
    if (isResizingSidebar) {
        window.addEventListener('mousemove', handleSidebarResize);
        window.addEventListener('mouseup', () => setIsResizingSidebar(false));
    }
    if (isResizingSection) {
        window.addEventListener('mousemove', handleSectionResize);
        window.addEventListener('mouseup', () => setIsResizingSection(false));
    }
    return () => {
        window.removeEventListener('mousemove', handleSidebarResize);
        window.removeEventListener('mousemove', handleSectionResize);
    };
  }, [isResizingSidebar, isResizingSection, handleSidebarResize, handleSectionResize]);

  // ... (Masking, Capture Sprite, Drawing logic - same as before)
  const computeMaskingLayers = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !maskSettings.enabled || isPlaying) return;
    setIsProcessingMask(true);
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (width === 0 || height === 0) return;
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = new OffscreenCanvas(width, height);
    }
    const offCtx = offscreenCanvasRef.current.getContext('2d') as OffscreenCanvasRenderingContext2D;
    offscreenCanvasRef.current.width = width;
    offscreenCanvasRef.current.height = height;
    offCtx.drawImage(video, 0, 0, width, height);
    const frameData = offCtx.getImageData(0, 0, width, height);
    const data = frameData.data;
    const foregroundImageData = offCtx.createImageData(width, height);
    const fgData = foregroundImageData.data;
    const overlayImageData = offCtx.createImageData(width, height);
    const ovData = overlayImageData.data;
    const sensitivityThreshold = maskSettings.sensitivity; 
    const hMin = 75 - (sensitivityThreshold * 0.4); 
    const hMax = 155 + (sensitivityThreshold * 0.4); 
    const sMin = 0.15;
    const lMin = 0.15;
    const lMax = 0.85;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const [h, s, l] = rgbToHsl(r, g, b);
      const isGreen = (h >= hMin && h <= hMax) && (s >= sMin) && (l >= lMin && l <= lMax);
      if (isGreen) {
        fgData[i + 3] = 0; 
        ovData[i] = 239; 
        ovData[i + 1] = 68;
        ovData[i + 2] = 68; 
        ovData[i + 3] = 102;
      } else {
        fgData[i] = r;
        fgData[i + 1] = g;
        fgData[i + 2] = b;
        fgData[i + 3] = 255;
        ovData[i + 3] = 0;
      }
    }
    const fgBitmap = await createImageBitmap(foregroundImageData);
    const ovBitmap = await createImageBitmap(overlayImageData);
    setMaskCache({ foreground: fgBitmap, overlay: ovBitmap, timestamp: video.currentTime });
    setIsProcessingMask(false);
  }, [maskSettings, isPlaying]);

  useEffect(() => {
    if (!isPlaying && maskSettings.enabled) {
      const timeout = setTimeout(() => { computeMaskingLayers(); }, 50);
      return () => clearTimeout(timeout);
    } else if (!maskSettings.enabled && maskCache.foreground) {
      setMaskCache({ foreground: null, overlay: null, timestamp: -1 });
    }
  }, [isPlaying, maskSettings.enabled, maskSettings.sensitivity, currentTime]);

  const captureSprite = async (rect: Rect): Promise<{ sprite: ImageBitmap, patch: ImageBitmap, box: Rect } | null> => {
    const video = videoRef.current;
    if (!video) return null;
    const w = Math.ceil(rect.w);
    const h = Math.ceil(rect.h);
    if (w <= 0 || h <= 0) return null;
    let bgX = rect.x + w * 1.5;
    if (bgX + w > video.videoWidth) bgX = rect.x - w * 1.5;
    if (bgX < 0) bgX = 0;
    const bgY = rect.y;
    const cropCanvas = new OffscreenCanvas(w, h);
    const ctx = cropCanvas.getContext('2d');
    const bgCanvas = new OffscreenCanvas(w, h);
    const bgCtx = bgCanvas.getContext('2d');
    if (!ctx || !bgCtx) return null;
    if (maskSettings.enabled && maskCache.foreground) {
        ctx.drawImage(maskCache.foreground, rect.x, rect.y, w, h, 0, 0, w, h);
    } else {
        ctx.drawImage(video, rect.x, rect.y, w, h, 0, 0, w, h);
    }
    bgCtx.drawImage(video, bgX, bgY, w, h, 0, 0, w, h);
    return { sprite: await createImageBitmap(cropCanvas), patch: await createImageBitmap(bgCanvas), box: rect };
  };

  const getVideoSpacePoint = (e: React.MouseEvent | MouseEvent): Point => {
    if (!canvasRef.current || !videoRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const layout = getVideoLayout(canvasRef.current, videoRef.current);
    return { x: (x - layout.x) / layout.scale, y: (y - layout.y) / layout.scale };
  };

  const startDrawing = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    handleCanvasClick(e);
    if (tool === null) return;
    if (tool === 'masking') return;

    const currentVideoTime = videoRef.current?.currentTime || 0;
    const isFrameFrozen = freezeFrames.some(ff => Math.abs(ff.timestamp - currentVideoTime) < 0.1);

    if (!isFrameFrozen && tool !== 'select') {
      return;
    }

    if (isPlaying) togglePlay();
    if (videoRef.current && !videoRef.current.paused) {
       videoRef.current.pause();
       setIsPlaying(false);
    }

    const startPoint = getVideoSpacePoint(e);

    if (tool === 'select') {
      const canvas = canvasRef.current;
      if (!canvas || !videoRef.current) return;
      const layout = getVideoLayout(canvas, videoRef.current);
      const scale = layout.scale;
      const handleSize = 8 / scale;

      for (const shape of shapes) {
        if (shape.type === 'connected-circle' && shape.points.length > 0) {
          for (let i = 0; i < shape.points.length; i++) {
            const pt = shape.points[i];
            const dist = getDistance(startPoint, pt);
            if (dist < (pt.r || 40) + handleSize) {
              setSelectedShapeId(shape.id);
              setDraggedCircleIndex(i);
              setIsDrawing(true);
              return;
            }
          }
        }

        for (let i = 0; i < shape.points.length; i++) {
          const pt = shape.points[i];
          const dist = getDistance(startPoint, pt);
          if (dist < handleSize * 2) {
            setSelectedShapeId(shape.id);
            setDraggedVertexIndex(i);
            setIsDrawing(true);
            return;
          }
        }
      }

      setSelectedShapeId(null);
      setDraggedVertexIndex(null);
      setDraggedCircleIndex(null);
      return;
    }

    if (tool === 'text') {
      const activeFFId = freezeFrames.find(ff => Math.abs(ff.timestamp - currentVideoTime) < 0.1)?.id;
      const newShape: Shape = {
        id: Date.now().toString(),
        type: 'text',
        points: [startPoint],
        color: currentColor,
        strokeWidth: strokeWidth,
        timestamp: Date.now(),
        freezeFrameId: activeFFId,
        textConfig: {
          text: textSettings.text,
          fontSize: textSettings.fontSize,
          fontFamily: textSettings.fontFamily,
          rotation: textSettings.rotation
        },
        tilt: textSettings.tilt
      };
      addShape(newShape);
      return;
    }

    if (tool === 'player-move') {
        if (playerMoveState === 'idle') {
            setPlayerSelectionRect({ x: startPoint.x, y: startPoint.y, w: 0, h: 0 });
            setPlayerMoveState('selecting');
        } else if (playerMoveState === 'moving') {
            finishDrawing(e);
        }
        return;
    }

    if (tool === 'spotlight' || tool === 'lens') {
         setIsDrawing(true);
         return;
    }

    if (tool === 'connected-circle') {
        const activeFFId = freezeFrames.find(ff => Math.abs(ff.timestamp - currentVideoTime) < 0.1)?.id;

        if (activePoints.length >= 2) {
            const distToStart = getDistance(startPoint, activePoints[0]);
            if (distToStart < ringSettings.size) {
                const newShape: Shape = { id: Date.now().toString(), type: 'connected-circle', points: [...activePoints], color: currentColor, strokeWidth: strokeWidth, timestamp: Date.now(), ringConfig: { tilt: ringSettings.tilt }, isClosed: true, isFilled: ringSettings.isFilled, freezeFrameId: activeFFId };
                addShape(newShape);
                setActivePoints([]);
                return;
            }
        }

        const newCircle: Point = { x: startPoint.x, y: startPoint.y, r: ringSettings.size, timestamp: Date.now() };
        setActivePoints(prev => [...prev, newCircle]);
        return;
    } else if (tool === 'circle') {
        const activeFFId = freezeFrames.find(ff => Math.abs(ff.timestamp - currentVideoTime) < 0.1)?.id;
        const newShape: Shape = {
          id: Date.now().toString(),
          type: 'circle',
          points: [startPoint, { x: startPoint.x + ringSettings.size, y: startPoint.y }],
          color: currentColor,
          strokeWidth: strokeWidth,
          timestamp: Date.now(),
          freezeFrameId: activeFFId,
          ringConfig: { tilt: ringSettings.tilt, isFilled: ringSettings.isFilled }
        };
        addShape(newShape);
        return;
    } else if (tool === 'polygon') {
      setActivePoints(prev => [...prev, startPoint]);
    } else if (tool === 'pen') {
      setIsDrawing(true);
      setActivePoints([startPoint]);
    } else if (tool === 'arrow' && arrowSettings.isFreehand) {
        setIsDrawing(true);
        setActivePoints([startPoint]);
    } else {
      setIsDrawing(true);
      setActivePoints([startPoint]);
    }
  };

  const drawPreview = (e: React.MouseEvent) => {
    if (tool === 'masking') return;
    const currentPoint = getVideoSpacePoint(e);
    mousePosRef.current = currentPoint;

    if (tool === 'select' && isDrawing && selectedShapeId) {
      if (draggedVertexIndex !== null) {
        setShapes(prev => prev.map(shape => {
          if (shape.id === selectedShapeId) {
            const newPoints = [...shape.points];
            newPoints[draggedVertexIndex] = currentPoint;
            return { ...shape, points: newPoints };
          }
          return shape;
        }));
      } else if (draggedCircleIndex !== null) {
        setShapes(prev => prev.map(shape => {
          if (shape.id === selectedShapeId && shape.type === 'connected-circle') {
            const newPoints = [...shape.points];
            newPoints[draggedCircleIndex] = { ...currentPoint, r: newPoints[draggedCircleIndex].r, timestamp: newPoints[draggedCircleIndex].timestamp };
            return { ...shape, points: newPoints };
          }
          return shape;
        }));
      }
      return;
    }

    if (tool === 'player-move') {
        if (playerMoveState === 'selecting' && playerSelectionRect) {
            const w = currentPoint.x - playerSelectionRect.x;
            const h = currentPoint.y - playerSelectionRect.y;
        }
        return;
    }
    if (!isDrawing && tool === 'connected-circle') { return; }
    if (isDrawing && (tool === 'pen' || (tool === 'arrow' && arrowSettings.isFreehand))) {
        setActivePoints(prev => [...prev, currentPoint]);
        return;
    }
  };

  const finishDrawing = (e: React.MouseEvent) => {
    if (tool === null || tool === 'masking') return;
    const currentPoint = getVideoSpacePoint(e);
    const activeFFId = freezeFrames.find(ff => Math.abs(ff.timestamp - currentTime) < 0.1)?.id;

    if (tool === 'select') {
      setIsDrawing(false);
      setDraggedVertexIndex(null);
      setDraggedCircleIndex(null);
      return;
    }
    if (tool === 'player-move') {
        if (playerMoveState === 'selecting' && playerSelectionRect) {
            const w = currentPoint.x - playerSelectionRect.x;
            const h = currentPoint.y - playerSelectionRect.y;
            if (Math.abs(w) < 10 || Math.abs(h) < 10) {
                setPlayerMoveState('idle');
                setPlayerSelectionRect(null);
                return;
            }
            const finalRect: Rect = { x: w > 0 ? playerSelectionRect.x : currentPoint.x, y: h > 0 ? playerSelectionRect.y : currentPoint.y, w: Math.abs(w), h: Math.abs(h) };
            captureSprite(finalRect).then(result => {
                if (result) {
                    setCapturedSprite(result);
                    setPlayerMoveState('moving');
                } else {
                    setPlayerMoveState('idle');
                }
            });
            setPlayerSelectionRect(null);
        } else if (playerMoveState === 'moving' && capturedSprite) {
            const { box } = capturedSprite;
            const destCenter = currentPoint;
             const newShape: Shape = {
                id: Date.now().toString(), type: 'player-move', points: [ { x: box.x + box.w/2, y: box.y + box.h/2 }, destCenter ], box: box, color: currentColor, strokeWidth: strokeWidth, img: capturedSprite.sprite, bgImg: capturedSprite.patch, timestamp: Date.now(), freezeFrameId: activeFFId
             };
             addShape(newShape);
             setPlayerMoveState('idle');
             setCapturedSprite(null);
        }
        return;
    }
    if (tool === 'spotlight' && isDrawing) {
        setIsDrawing(false);
        const newShape: Shape = { id: Date.now().toString(), type: 'spotlight', points: [currentPoint], color: '#ffffff', strokeWidth: 1, timestamp: Date.now(), freezeFrameId: activeFFId, spotlightConfig: { size: spotlightSettings.size, intensity: spotlightSettings.intensity, rotation: spotlightSettings.rotation, particles: createParticles(30) } };
        addShape(newShape);
        return;
    }
    if (tool === 'lens' && isDrawing) {
        setIsDrawing(false);
        const newShape: Shape = { id: Date.now().toString(), type: 'lens', points: [currentPoint], color: '#ffffff', strokeWidth: 1, timestamp: Date.now(), freezeFrameId: activeFFId, lensConfig: { radius: lensSettings.size, zoom: lensSettings.zoom } };
        addShape(newShape);
        return;
    }
    if (tool === 'connected-circle') {
        return;
    }
    if (tool === 'polygon') return;
    if (isDrawing) {
      setIsDrawing(false);
      let pointsToSave = [activePoints[0], currentPoint];
      if (tool === 'pen' || (tool === 'arrow' && arrowSettings.isFreehand)) pointsToSave = [...activePoints, currentPoint];

      const tiltValue = (tool === 'line' || tool === 'arrow') ? generalTilt : undefined;

      const newShape: Shape = {
        id: Date.now().toString(),
        type: tool,
        points: pointsToSave,
        color: currentColor,
        strokeWidth: strokeWidth,
        isDashed: arrowSettings.isDashed,
        isFreehand: arrowSettings.isFreehand,
        timestamp: Date.now(),
        tilt: tiltValue,
        freezeFrameId: activeFFId
      };
      addShape(newShape);
      setActivePoints([]);
      setCurrentDragStart(null);
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const activeFFId = freezeFrames.find(ff => Math.abs(ff.timestamp - currentTime) < 0.1)?.id;
    if (tool === 'polygon' && activePoints.length > 2) {
        const newShape: Shape = { id: Date.now().toString(), type: tool, points: [...activePoints], color: currentColor, strokeWidth: strokeWidth, isClosed: true, timestamp: Date.now(), freezeFrameId: activeFFId };
        addShape(newShape);
        setActivePoints([]);
    }
    if (tool === 'connected-circle') {
        if (activePoints.length > 0) {
            const newShape: Shape = { id: Date.now().toString(), type: 'connected-circle', points: [...activePoints], color: currentColor, strokeWidth: strokeWidth, timestamp: 0, ringConfig: { tilt: ringSettings.tilt }, isClosed: false, freezeFrameId: activeFFId };
            addShape(newShape);
        }
        setActivePoints([]);
        setIsDrawing(false);
        setCurrentDragStart(null);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      if (activePoints.length > 0 || isDrawing || playerMoveState !== 'idle') {
          setActivePoints([]);
          setIsDrawing(false);
          setPlayerMoveState('idle');
          setPlayerSelectionRect(null);
          setCapturedSprite(null);
          setCurrentDragStart(null);
          renderCanvas(); 
      }
  };

  const addShape = (shape: Shape) => {
    const newShapes = [...shapes, shape];
    setShapes(newShapes);
    setRedoStack([]); 
  };

  const undo = () => {
    if (shapes.length === 0) return;
    const last = shapes[shapes.length - 1];
    setRedoStack([...redoStack, [last]]); 
    setShapes(shapes.slice(0, -1));
  };

  const redo = () => {
    if (redoStack.length === 0) return;
    const nextGroup = redoStack[redoStack.length - 1];
    const next = nextGroup[0]; 
    setShapes([...shapes, next]);
    setRedoStack(redoStack.slice(0, -1));
  };

  const clearAll = () => {
    if (selectedShapeId) {
      setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
      setSelectedShapeId(null);
      setDraggedVertexIndex(null);
      setDraggedCircleIndex(null);
    } else {
      setShapes([]);
      setRedoStack([]);
    }
    setActivePoints([]);
    setIsDrawing(false);
    setCurrentDragStart(null);
    setPlayerMoveState('idle');
    setPlayerSelectionRect(null);
    setCapturedSprite(null);
  };

  const confirmClose = () => {
      onClose();
  };

  const drawActiveChain = (ctx: CanvasRenderingContext2D, scale: number) => {
    if (tool !== 'connected-circle' || activePoints.length === 0) return;
    const now = Date.now();
    if (activePoints.length > 1) {
      for (let i = 0; i < activePoints.length - 1; i++) {
        const c1 = activePoints[i];
        const c2 = activePoints[i + 1];
        const startTime = c2.timestamp || 0;
        const pulseAge = Math.max(0, now - startTime);
        drawTangentLine(ctx, c1, c2, c1.r || ringSettings.size, c2.r || ringSettings.size, currentColor, strokeWidth / scale, 1, pulseAge);
      }
    }
    activePoints.forEach(p => {
      draw3DRing(ctx, p.x, p.y, p.r || ringSettings.size, currentColor, ringSettings.tilt, strokeWidth / scale, p.timestamp || now);
    });
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !videoRef.current) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const video = videoRef.current;
    const layout = getVideoLayout(canvas, video);
    const { x, y, w, h, scale } = layout;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const currentVideoTime = video ? video.currentTime : 0;
    const isMaskSynced = maskCache.timestamp !== -1 && Math.abs(maskCache.timestamp - currentVideoTime) < 0.15;
    
    if (maskSettings.enabled && !isPlaying && maskSettings.showOverlay && maskCache.overlay && isMaskSynced) {
        ctx.drawImage(maskCache.overlay, x, y, w, h);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    const activeFF = freezeFrames.find(ff => Math.abs(ff.timestamp - currentTime) < 0.1);
    shapes.forEach(shape => {
        let shouldRender = false;
        if (!shape.freezeFrameId) shouldRender = true; 
        else if (activeFF && activeFF.id === shape.freezeFrameId && !isPlaying) shouldRender = true;
        else if (activeFreezeFrameId === shape.freezeFrameId) shouldRender = true;
        if (shouldRender) {
            if (shape.type === 'player-move' || shape.type === 'lens') return; 
            if (shape.type === 'curved-arrow') drawShapeOnCanvas(shape, scale, 'shadow');
            else drawShapeOnCanvas(shape, scale);
        }
    });
    const currentPoint = mousePosRef.current;
    if (currentPoint) {
        const now = Date.now();
        if (tool === 'connected-circle') {
             drawActiveChain(ctx, scale);
             if (activePoints.length > 0) {
                 const last = activePoints[activePoints.length - 1];
                 const lastRadius = last.r || ringSettings.size;
                 drawTangentLine(ctx, last, currentPoint, lastRadius, ringSettings.size, currentColor, strokeWidth / scale, 1, 0);
                 draw3DRing(ctx, currentPoint.x, currentPoint.y, ringSettings.size, currentColor, ringSettings.tilt, strokeWidth / scale, now, true);
                 const distToStart = getDistance(currentPoint, activePoints[0]);
                 if (activePoints.length >= 2 && distToStart < ringSettings.size) drawLabel(ctx, currentPoint, "Click to Close Loop", scale);
                 else drawLabel(ctx, currentPoint, "Click to add", scale);
             } else {
                 draw3DRing(ctx, currentPoint.x, currentPoint.y, ringSettings.size, currentColor, ringSettings.tilt, strokeWidth / scale, now, true);
                 drawLabel(ctx, currentPoint, "Click to add first circle", scale);
             }
        }
        if (tool === 'circle') {
             draw3DRing(ctx, currentPoint.x, currentPoint.y, ringSettings.size, currentColor, ringSettings.tilt, strokeWidth / scale, now, true);
             drawLabel(ctx, currentPoint, "Click to add", scale);
        }
        if (tool === 'text') {
             drawText(ctx, currentPoint.x, currentPoint.y, textSettings.text, textSettings.fontSize, textSettings.fontFamily, textSettings.rotation, textSettings.tilt, currentColor, true);
             drawLabel(ctx, { x: currentPoint.x, y: currentPoint.y + textSettings.fontSize }, "Click to place text", scale);
        }
        if (tool === 'select') {
             const selectedShape = shapes.find(s => s.id === selectedShapeId);
             if (selectedShape) {
                 drawSelectionBox(ctx, selectedShape.points, scale);
                 drawSelectionHandles(ctx, selectedShape.points, scale);
             }
        }
        if (isDrawing && tool !== 'polygon' && tool !== 'connected-circle' && tool !== 'pen' && tool !== 'circle' && tool !== 'player-move' && tool !== 'spotlight' && tool !== 'lens' && activePoints.length > 0) {
             const startPoint = activePoints[0];
             if (tool === 'curved-arrow') {
                  drawCurvedArrow(ctx, startPoint, currentPoint, currentColor, strokeWidth / scale, arrowSettings.isDashed, 0, 'full');
                  drawDashedLine(ctx, startPoint, currentPoint, 'rgba(255,255,255,0.2)', strokeWidth / scale);
             } else if (tool === 'arrow') {
                  if (arrowSettings.isFreehand) drawFreehandArrow(ctx, [...activePoints, currentPoint], currentColor, strokeWidth / scale, arrowSettings.isDashed, now, true);
                  else drawProArrow(ctx, startPoint, currentPoint, currentColor, strokeWidth / scale, arrowSettings.isDashed, 0, true);
             } else {
                 drawShapeOnCanvas({ id: 'preview', type: tool, points: [startPoint, currentPoint], color: currentColor, strokeWidth: strokeWidth, timestamp: 0 }, scale);
             }
             const dist = getDistance(startPoint, currentPoint);
             drawLabel(ctx, currentPoint, `L: ${Math.round(dist)}`, scale);
        }
        if (isDrawing && (tool === 'pen' || (tool === 'arrow' && arrowSettings.isFreehand)) && activePoints.length > 0) {
             if (tool === 'arrow') drawFreehandArrow(ctx, [...activePoints, currentPoint], currentColor, strokeWidth / scale, arrowSettings.isDashed, now, true);
             else drawShapeOnCanvas({ id: 'active_pen', type: 'pen', points: activePoints, color: currentColor, strokeWidth: strokeWidth, timestamp: 0 }, scale);
        }
        if (tool === 'polygon' && activePoints.length > 0) {
             drawShapeOnCanvas({ id: 'active_poly_preview', type: 'polygon', points: activePoints, color: currentColor, strokeWidth: strokeWidth, isClosed: false, timestamp: 0 }, scale);
             const lastPoint = activePoints[activePoints.length - 1];
             ctx.beginPath();
             ctx.strokeStyle = currentColor;
             ctx.lineWidth = strokeWidth / scale;
             ctx.setLineDash([5 / scale, 5 / scale]);
             ctx.moveTo(lastPoint.x, lastPoint.y);
             ctx.lineTo(currentPoint.x, currentPoint.y);
             ctx.stroke();
             ctx.setLineDash([]);
             ctx.beginPath(); ctx.fillStyle = currentColor; ctx.arc(currentPoint.x, currentPoint.y, 4 / scale, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / scale; ctx.stroke();
             const dist = getDistance(lastPoint, currentPoint);
             drawLabel(ctx, currentPoint, `${Math.round(dist)}`, scale);
        }
        if (tool === 'player-move') {
            if (playerMoveState === 'idle') drawLabel(ctx, currentPoint, "Drag to select player", scale);
            else if (playerMoveState === 'selecting' && playerSelectionRect) {
                const w = currentPoint.x - playerSelectionRect.x;
                const h = currentPoint.y - playerSelectionRect.y;
                ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / scale; ctx.setLineDash([5 / scale, 5 / scale]); ctx.strokeRect(playerSelectionRect.x, playerSelectionRect.y, w, h); ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'; ctx.fillRect(playerSelectionRect.x, playerSelectionRect.y, w, h); ctx.restore();
                drawLabel(ctx, currentPoint, `Selecting: ${Math.abs(Math.round(w))}x${Math.abs(Math.round(h))}`, scale);
            } else if (playerMoveState === 'moving' && capturedSprite) {
                const { patch, sprite, box } = capturedSprite;
                ctx.drawImage(patch, box.x, box.y, box.w, box.h);
                const originX = box.x + box.w / 2;
                const originY = box.y + box.h / 2;
                ctx.beginPath(); ctx.strokeStyle = currentColor; ctx.lineWidth = strokeWidth / scale; ctx.moveTo(originX, originY); ctx.lineTo(currentPoint.x, currentPoint.y); ctx.stroke();
                drawArrowHead(ctx, {x: originX, y: originY}, currentPoint, (strokeWidth * 4) / scale);
                const destX = currentPoint.x - box.w / 2;
                const destY = currentPoint.y - box.h / 2;
                ctx.save(); ctx.globalAlpha = 0.9; ctx.shadowColor = 'black'; ctx.shadowBlur = 10 / scale; ctx.drawImage(sprite, destX, destY, box.w, box.h); ctx.restore();
                drawLabel(ctx, currentPoint, "Click to place", scale);
            }
        }
        if (tool === 'spotlight') {
             drawSpotlight(ctx, currentPoint.x, currentPoint.y, spotlightSettings.size, spotlightSettings.intensity, spotlightSettings.rotation, [], now, true);
             drawLabel(ctx, currentPoint, "Click to add spotlight", scale);
        }
        if (tool === 'lens') {
             drawLens(ctx, currentPoint, lensSettings.size, lensSettings.zoom, video, scale, true);
             drawLabel(ctx, currentPoint, `Click to add lens (${lensSettings.zoom}x)`, scale);
        }
    }
    ctx.restore();
    if (maskSettings.enabled && !isPlaying && maskCache.foreground && isMaskSynced) {
        ctx.drawImage(maskCache.foreground, x, y, w, h);
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    shapes.forEach(shape => {
        let shouldRender = false;
        if (!shape.freezeFrameId) shouldRender = true; 
        else if (activeFF && activeFF.id === shape.freezeFrameId && !isPlaying) shouldRender = true;
        else if (activeFreezeFrameId === shape.freezeFrameId) shouldRender = true;
        if (shouldRender) {
            if (shape.type === 'curved-arrow') drawShapeOnCanvas(shape, scale, 'body');
            if (shape.type === 'player-move') drawShapeOnCanvas(shape, scale);
            if (shape.type === 'lens' && video) {
                if (shape.lensConfig && shape.points[0]) drawLens(ctx, shape.points[0], shape.lensConfig.radius, shape.lensConfig.zoom, video, scale);
            }
        }
    });
    ctx.restore();
  }, [shapes, isDrawing, activePoints, tool, currentColor, strokeWidth, maskSettings, maskCache, isPlaying, playerMoveState, ringSettings, arrowSettings, spotlightSettings, lensSettings, freezeFrames, activeFreezeFrameId, textSettings, selectedShapeId, generalTilt]);

  useEffect(() => {
    let animationFrameId: number;
    const animate = () => {
        renderCanvas();
        animationFrameId = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderCanvas]);

  const drawShapeOnCanvas = (shape: Shape, scale: number, renderMode: 'full' | 'shadow' | 'body' = 'full') => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.save(); 
    if (shape.timestamp > 0 && !shape.freezeFrameId && shape.type !== 'curved-arrow' && shape.type !== 'player-move' && shape.type !== 'spotlight' && shape.type !== 'lens' && shape.type !== 'arrow') {
        const age = Date.now() - shape.timestamp;
        const fadeDuration = 300; 
        if (age < fadeDuration) ctx.globalAlpha = Math.min(1, age / fadeDuration);
        else ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = shape.color; ctx.lineWidth = shape.strokeWidth / scale; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.fillStyle = shape.color;
    const { points, type } = shape;
    if (points.length < 1) { ctx.restore(); return; }
    const p1 = points[0];
    const p2 = points[points.length - 1];
    ctx.beginPath();
    switch (type) {
        case 'pen': if (points.length < 2) { ctx.beginPath(); ctx.arc(points[0].x, points[0].y, (shape.strokeWidth / scale) / 2, 0, Math.PI * 2); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (let i = 1; i < points.length - 2; i++) { const xc = (points[i].x + points[i + 1].x) / 2; const yc = (points[i].y + points[i + 1].y) / 2; ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc); } if (points.length > 2) ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, points[points.length - 1].x, points[points.length - 1].y); else ctx.lineTo(points[1].x, points[1].y); ctx.stroke(); } break;
        case 'line': if (shape.tilt !== undefined) { ctx.restore(); drawTiltedLine(ctx, p1, p2, shape.color, shape.strokeWidth / scale, shape.tilt, shape.isDashed || false); ctx.save(); } else { ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke(); } break;
        case 'arrow': if (shape.isFreehand) drawFreehandArrow(ctx, points, shape.color, shape.strokeWidth / scale, shape.isDashed || false, shape.timestamp, false); else drawProArrow(ctx, p1, p2, shape.color, shape.strokeWidth / scale, shape.isDashed || false, shape.timestamp); break;
        case 'curved-arrow': drawCurvedArrow(ctx, p1, p2, shape.color, shape.strokeWidth / scale, shape.isDashed || false, shape.timestamp, renderMode); break;
        case 'circle': const radius = getDistance(p1, p2); draw3DRing(ctx, p1.x, p1.y, radius, shape.color, shape.ringConfig?.tilt ?? 65, shape.strokeWidth / scale, shape.timestamp); break;
        case 'polygon': if (points.length < 1) break; ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); if (shape.isClosed) { ctx.closePath(); ctx.save(); ctx.globalAlpha = ctx.globalAlpha * 0.2; ctx.fillStyle = shape.color; ctx.fill(); ctx.restore(); } ctx.stroke(); break;
        case 'connected-circle': const now = Date.now(); if (shape.isClosed && shape.isFilled && points.length > 2) { ctx.save(); ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); points.slice(1).forEach(p => ctx.lineTo(p.x, p.y)); ctx.closePath(); ctx.fillStyle = fadeColor(shape.color, 0.2); ctx.fill(); ctx.restore(); } if (points.length > 1) { for (let i = 0; i < points.length - 1; i++) { const c1 = points[i]; const c2 = points[i + 1]; const startTime = c2.timestamp || shape.timestamp || 0; const pulseAge = Math.max(0, now - startTime); drawTangentLine(ctx, c1, c2, c1.r || ringSettings.size, c2.r || ringSettings.size, shape.color, shape.strokeWidth / scale, 1, pulseAge); } if (shape.isClosed) { const last = points[points.length - 1]; const first = points[0]; const startTime = shape.timestamp || 0; const pulseAge = Math.max(0, now - startTime); drawTangentLine(ctx, last, first, last.r || ringSettings.size, first.r || ringSettings.size, shape.color, shape.strokeWidth / scale, 1, pulseAge); } } points.forEach(p => { draw3DRing(ctx, p.x, p.y, p.r || ringSettings.size, shape.color, shape.ringConfig?.tilt ?? 65, shape.strokeWidth / scale, p.timestamp || shape.timestamp); }); break;
        case 'player-move': if (shape.img && shape.box && points.length >= 2) { const originCenter = points[0]; const destCenter = points[1]; const { w, h } = shape.box; if (shape.bgImg) ctx.drawImage(shape.bgImg, shape.box.x, shape.box.y, w, h); ctx.beginPath(); ctx.strokeStyle = shape.color; ctx.lineWidth = shape.strokeWidth / scale; ctx.moveTo(originCenter.x, originCenter.y); ctx.lineTo(destCenter.x, destCenter.y); ctx.stroke(); drawArrowHead(ctx, originCenter, destCenter, (shape.strokeWidth * 4) / scale); ctx.save(); ctx.shadowColor = 'black'; ctx.shadowBlur = 10 / scale; ctx.drawImage(shape.img, destCenter.x - w/2, destCenter.y - h/2, w, h); ctx.restore(); } break;
        case 'spotlight': if (shape.spotlightConfig) drawSpotlight(ctx, points[0].x, points[0].y, shape.spotlightConfig.size, shape.spotlightConfig.intensity, shape.spotlightConfig.rotation, shape.spotlightConfig.particles, shape.timestamp); break;
        case 'text': if (shape.textConfig && points[0]) { ctx.restore(); drawText(ctx, points[0].x, points[0].y, shape.textConfig.text, shape.textConfig.fontSize, shape.textConfig.fontFamily, shape.textConfig.rotation, shape.tilt || 0, shape.color, false); ctx.save(); } break;
    }
    ctx.restore();
  };

  useEffect(() => {
    const syncSize = () => {
      if (containerRef.current && canvasRef.current) {
        const { clientWidth, clientHeight } = containerRef.current;
        canvasRef.current.width = clientWidth;
        canvasRef.current.height = clientHeight;
      }
    };
    const resizeObserver = new ResizeObserver(syncSize);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    window.addEventListener('resize', syncSize);
    syncSize();
    return () => {
        window.removeEventListener('resize', syncSize);
        resizeObserver.disconnect();
    };
  }, [videoUrl]);

  const handleColorRightClick = (e: React.MouseEvent, id: number) => {
    e.preventDefault();
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colors.find(c => c.id === id)?.value || '#ffffff';
    input.onchange = (ev) => {
      const val = (ev.target as HTMLInputElement).value;
      setColors(prev => prev.map(c => c.id === id ? { ...c, value: val } : c));
    };
    input.click();
  };

  const renderPropertiesPanel = () => {
      if (tool === null) {
          return (
              <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-blue-500/20 rounded"><Snowflake className="w-4 h-4 text-blue-500" /></div>
                      <div><h3 className="text-sm font-semibold text-white">Freeze Frames</h3><p className="text-[10px] text-gray-400">Persistent Telestrations</p></div>
                  </div>
                  {activeFreezeFrameId ? (
                      <div className="bg-blue-900/30 border border-blue-500/50 rounded-lg p-3 flex flex-col items-center justify-center space-y-1.5">
                          <span className="text-[10px] font-bold text-blue-300 uppercase tracking-wide">Active Freeze</span>
                          <div className="text-3xl font-black text-white font-mono">{countdownValue.toFixed(1)}s</div>
                          <div className="h-1 w-full bg-blue-900/50 rounded-full overflow-hidden mt-1.5">
                              <motion.div className="h-full bg-blue-400" initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: countdownValue, ease: "linear" }} />
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-2">
                          <button onClick={addFreezeFrame} disabled={isPlaying} className="w-full py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded flex items-center justify-center gap-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed">
                              <PlusCircle className="w-3.5 h-3.5" /> Add Freeze Frame
                          </button>
                          <div className="space-y-1.5">
                              {freezeFrames.length === 0 && <div className="text-center py-6 text-gray-500 text-xs italic">Pause video to add frames</div>}
                              {freezeFrames.sort((a,b) => a.timestamp - b.timestamp).map(ff => (
                                  <div key={ff.id} className="bg-[#111] border border-[#333] rounded p-1.5 group">
                                      <div className="flex items-center justify-between mb-1.5">
                                          <div className="flex items-center gap-1.5 text-blue-400 font-mono text-xs cursor-pointer hover:underline" onClick={() => { handleManualSeek(ff.timestamp); if(videoRef.current) { videoRef.current.pause(); setIsPlaying(false); } }}>
                                              <Clock className="w-3 h-3" /> {formatTime(ff.timestamp)}
                                          </div>
                                          <button onClick={() => deleteFreezeFrame(ff.id)} className="p-0.5 text-gray-500 hover:text-red-400"><Trash2 className="w-3 h-3" /></button>
                                      </div>
                                      <div className="flex items-center gap-1.5 bg-[#222] rounded px-1.5 py-0.5">
                                          <Timer className="w-3 h-3 text-gray-400" />
                                          <span className="text-[10px] text-gray-400 uppercase">Duration</span>
                                          <input type="number" min="1" max="60" value={ff.duration} onChange={(e) => updateFreezeFrameDuration(ff.id, parseFloat(e.target.value))} className="flex-1 bg-transparent text-right text-xs text-white focus:outline-none w-10 font-mono" />
                                          <span className="text-[10px] text-gray-500">s</span>
                                      </div>
                                  </div>
                              ))}
                          </div>
                      </div>
                  )}
              </div>
          );
      }

      if (tool === 'masking') {
          return (
              <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2">
                      <div className="p-1.5 bg-green-500/20 rounded"><Layers className="w-4 h-4 text-green-500" /></div>
                      <div><h3 className="text-sm font-semibold text-white">Chroma Key</h3><p className="text-[10px] text-gray-400">Green Screen Masking</p></div>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-[#111] border border-[#333] rounded">
                      <span className="text-xs font-medium text-gray-300">Enable Effect</span>
                      <button onClick={() => setMaskSettings({...maskSettings, enabled: !maskSettings.enabled})} className={`w-9 h-4 rounded-full relative transition-colors ${maskSettings.enabled ? 'bg-green-500' : 'bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${maskSettings.enabled ? 'left-5' : 'left-0.5'}`} />
                      </button>
                  </div>
                  {maskSettings.enabled && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Sensitivity</label><span className="text-xs font-mono text-gray-500">{maskSettings.sensitivity}</span></div>
                              <input type="range" min="1" max="100" value={maskSettings.sensitivity} onChange={(e) => setMaskSettings({...maskSettings, sensitivity: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500" />
                          </div>
                          <div className="flex items-center gap-1.5 cursor-pointer" onClick={() => setMaskSettings({...maskSettings, showOverlay: !maskSettings.showOverlay})}>
                              {maskSettings.showOverlay ? <Eye className="w-3.5 h-3.5 text-green-400" /> : <EyeOff className="w-3.5 h-3.5 text-gray-500" />}
                              <span className="text-xs text-gray-300">Show Debug Overlay</span>
                          </div>
                          {isProcessingMask && <div className="text-[10px] text-yellow-500 animate-pulse flex items-center gap-1"><Activity className="w-3 h-3" /> Processing frames...</div>}
                      </div>
                  )}
              </div>
          );
      }

      if (tool === 'spotlight') {
          return (
              <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-yellow-500/20 rounded"><Flashlight className="w-4 h-4 text-yellow-500" /></div><div><h3 className="text-sm font-semibold text-white">Spotlight</h3><p className="text-[10px] text-gray-400">Focus Attention</p></div></div>
                  <div className="space-y-2">
                      <div className="space-y-1"><div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Size</label><span className="text-xs font-mono text-gray-500">{spotlightSettings.size}px</span></div><input type="range" min="20" max="150" value={spotlightSettings.size} onChange={(e) => setSpotlightSettings({...spotlightSettings, size: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Intensity</label><span className="text-xs font-mono text-gray-500">{Math.round(spotlightSettings.intensity * 100)}%</span></div><input type="range" min="0.1" max="1" step="0.05" value={spotlightSettings.intensity} onChange={(e) => setSpotlightSettings({...spotlightSettings, intensity: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Rotation</label><span className="text-xs font-mono text-gray-500">{(spotlightSettings.rotation * 90).toFixed(0)}°</span></div><input type="range" min="0.1" max="1" step="0.05" value={spotlightSettings.rotation} onChange={(e) => setSpotlightSettings({...spotlightSettings, rotation: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-yellow-500" /></div>
                  </div>
              </div>
          )
      }

      if (tool === 'lens') {
          return (
              <div className="space-y-3">
                  <div className="flex items-center gap-2 mb-2"><div className="p-1.5 bg-cyan-500/20 rounded"><ZoomIn className="w-4 h-4 text-cyan-500" /></div><div><h3 className="text-sm font-semibold text-white">Zoom Lens</h3><p className="text-[10px] text-gray-400">Magnify Details</p></div></div>
                  <div className="space-y-2">
                      <div className="space-y-1"><div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Size</label><span className="text-xs font-mono text-gray-500">{lensSettings.size}px</span></div><input type="range" min="40" max="150" value={lensSettings.size} onChange={(e) => setLensSettings({...lensSettings, size: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Zoom</label><span className="text-xs font-mono text-gray-500">{lensSettings.zoom.toFixed(1)}x</span></div><input type="range" min="1.5" max="4.0" step="0.1" value={lensSettings.zoom} onChange={(e) => setLensSettings({...lensSettings, zoom: parseFloat(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-500" /></div>
                  </div>
              </div>
          )
      }

      // Default Drawing Tools
      return (
          <div className="space-y-3">
              <div className="flex items-center gap-2 mb-2">
                  <div className="p-1.5 bg-gray-800 rounded"><Pen className="w-4 h-4 text-gray-300" /></div>
                  <div><h3 className="text-sm font-semibold text-white">Drawing Tools</h3><p className="text-[10px] text-gray-400">Customize Stroke</p></div>
              </div>
              <div className="space-y-2">
                  <div className="space-y-1">
                      <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Stroke Width</label><span className="text-xs font-mono text-gray-500">{strokeWidth}px</span></div>
                      <input type="range" min="1" max="20" value={strokeWidth} onChange={(e) => setStrokeWidth(parseInt(e.target.value))} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white" />
                  </div>

                  {tool === 'arrow' && (
                      <div className="space-y-1 pt-1.5 border-t border-[#333]">
                          <label className="flex items-center gap-1.5 cursor-pointer p-1.5 hover:bg-[#222] rounded"><input type="checkbox" checked={arrowSettings.isDashed} onChange={(e) => setArrowSettings({...arrowSettings, isDashed: e.target.checked})} className="rounded bg-[#333] border-gray-600 text-blue-600 focus:ring-0" /><span className="text-xs text-gray-300">Dashed Line</span></label>
                          <label className="flex items-center gap-1.5 cursor-pointer p-1.5 hover:bg-[#222] rounded"><input type="checkbox" checked={arrowSettings.isFreehand} onChange={(e) => setArrowSettings({...arrowSettings, isFreehand: e.target.checked})} className="rounded bg-[#333] border-gray-600 text-blue-600 focus:ring-0" /><span className="text-xs text-gray-300">Freehand Mode</span></label>
                      </div>
                  )}

                  {tool === 'curved-arrow' && (
                      <div className="space-y-1 pt-1.5 border-t border-[#333]">
                          <label className="flex items-center gap-1.5 cursor-pointer p-1.5 hover:bg-[#222] rounded"><input type="checkbox" checked={arrowSettings.isDashed} onChange={(e) => setArrowSettings({...arrowSettings, isDashed: e.target.checked})} className="rounded bg-[#333] border-gray-600 text-blue-600 focus:ring-0" /><span className="text-xs text-gray-300">Dashed Line</span></label>
                      </div>
                  )}

                  {(tool === 'circle' || tool === 'connected-circle') && (
                      <div className="space-y-2 pt-1.5 border-t border-[#333]">
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">3D Tilt</label><span className="text-xs font-mono text-gray-500">{ringSettings.tilt}°</span></div>
                              <input type="range" min="0" max="85" value={ringSettings.tilt} onChange={(e) => setRingSettings({...ringSettings, tilt: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500" />
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Ring Size</label><span className="text-xs font-mono text-gray-500">{ringSettings.size}px</span></div>
                              <input type="range" min="20" max="120" value={ringSettings.size} onChange={(e) => setRingSettings({...ringSettings, size: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500" />
                          </div>
                          {tool === 'connected-circle' && (
                              <label className="flex items-center gap-1.5 cursor-pointer p-1.5 hover:bg-[#222] rounded"><input type="checkbox" checked={ringSettings.isFilled} onChange={(e) => setRingSettings({...ringSettings, isFilled: e.target.checked})} className="rounded bg-[#333] border-gray-600 text-blue-600 focus:ring-0" /><span className="text-xs text-gray-300">Filled Shape (if closed)</span></label>
                          )}
                      </div>
                  )}

                  {(tool === 'line' || tool === 'arrow') && (
                      <div className="space-y-1 pt-1.5 border-t border-[#333]">
                          <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Tilt</label><span className="text-xs font-mono text-gray-500">{generalTilt}°</span></div>
                          <input type="range" min="0" max="85" value={generalTilt} onChange={(e) => setGeneralTilt(parseInt(e.target.value))} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-purple-500" />
                      </div>
                  )}

                  {tool === 'text' && (
                      <div className="space-y-2 pt-1.5 border-t border-[#333]">
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-400 uppercase">Text</label>
                              <input type="text" value={textSettings.text} onChange={(e) => setTextSettings({...textSettings, text: e.target.value})} className="w-full bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500" />
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Font Size</label><span className="text-xs font-mono text-gray-500">{textSettings.fontSize}px</span></div>
                              <input type="range" min="12" max="100" value={textSettings.fontSize} onChange={(e) => setTextSettings({...textSettings, fontSize: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500" />
                          </div>
                          <div className="space-y-1">
                              <label className="text-xs font-bold text-gray-400 uppercase">Font Family</label>
                              <select value={textSettings.fontFamily} onChange={(e) => setTextSettings({...textSettings, fontFamily: e.target.value})} className="w-full bg-[#222] border border-[#333] rounded px-2 py-1.5 text-white text-sm focus:outline-none focus:border-blue-500">
                                  <option value="Arial">Arial</option>
                                  <option value="Impact">Impact</option>
                                  <option value="Courier New">Courier New</option>
                                  <option value="Georgia">Georgia</option>
                                  <option value="Times New Roman">Times New Roman</option>
                                  <option value="Verdana">Verdana</option>
                              </select>
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Rotation</label><span className="text-xs font-mono text-gray-500">{textSettings.rotation}°</span></div>
                              <input type="range" min="-180" max="180" value={textSettings.rotation} onChange={(e) => setTextSettings({...textSettings, rotation: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500" />
                          </div>
                          <div className="space-y-1">
                              <div className="flex justify-between"><label className="text-xs font-bold text-gray-400 uppercase">Tilt</label><span className="text-xs font-mono text-gray-500">{textSettings.tilt}°</span></div>
                              <input type="range" min="0" max="85" value={textSettings.tilt} onChange={(e) => setTextSettings({...textSettings, tilt: parseInt(e.target.value)})} className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-500" />
                          </div>
                      </div>
                  )}
              </div>
          </div>
      );
  };

  return (
    <div className="w-full h-full flex flex-col bg-[#0e0e0e] relative">
      {/* Top Bar */}
      <div className="h-10 bg-[#111] border-b border-[#222] flex items-center justify-between px-3 z-20 shrink-0 gap-3">
        {/* Left: Branding & Project Info */}
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={() => setShowCloseConfirm(true)} className="flex items-center gap-1.5 text-gray-400 hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="text-base font-bold bg-gradient-to-r from-blue-400 to-emerald-400 bg-clip-text text-transparent">RET MOTION</span>
          </button>
          <div className="h-4 w-[1px] bg-[#333]" />
          <span className="text-xs text-gray-400 font-medium truncate max-w-[150px]">{project.name}</span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-0.5">
             <button onClick={undo} className="p-1.5 hover:bg-[#222] rounded text-gray-300 hover:text-white transition-colors" title="Undo (Ctrl+Z)"><Undo2 className="w-4 h-4" /></button>
            <button onClick={redo} className="p-1.5 hover:bg-[#222] rounded text-gray-300 hover:text-white transition-colors" title="Redo (Ctrl+Y)"><Redo2 className="w-4 h-4" /></button>
            <div className="h-3 w-[1px] bg-[#333] mx-1.5" />
            <button onClick={clearAll} className="p-1.5 hover:bg-red-900/30 rounded text-gray-300 hover:text-red-400 transition-colors" title="Clear All (Del)"><Trash2 className="w-4 h-4" /></button>
            {activeFreezeFrameId && (
                <>
                    <div className="h-3 w-[1px] bg-[#333] mx-1.5" />
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-blue-600 rounded text-white text-xs font-bold" title="Freeze Frame Active">
                        <Snowflake className="w-3 h-3" />
                        <span className="font-mono text-[10px]">{countdownValue.toFixed(1)}s</span>
                    </div>
                </>
            )}
        </div>

        <div className="flex-1" />

        {/* Right: Colors */}
        <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
                {colors.map((color) => (
                <button
                    key={color.id}
                    onClick={() => setActiveColorId(color.id)}
                    onContextMenu={(e) => handleColorRightClick(e, color.id)}
                    className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${activeColorId === color.id ? 'border-white scale-125' : 'border-transparent ring-1 ring-white/10'}`}
                    style={{ backgroundColor: color.value }}
                    title="Left-click to select, Right-click to edit"
                />
                ))}
            </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar Container */}
        <div className="flex h-full shrink-0 z-30 relative">
            <div className="w-12 bg-[#111] border-r border-[#222] flex flex-col justify-between py-2 z-40 overflow-y-auto no-scrollbar">
                {/* Tools */}
                <div className="flex flex-col items-center gap-1">
                    {[
                    { id: 'select', icon: MousePointer2, label: 'Select & Edit' },
                    { id: 'pen', icon: Pen, label: 'Freehand Pen' },
                    { id: 'line', icon: Minus, label: 'Line' },
                    { id: 'arrow', icon: MoveUpRight, label: 'Arrow' },
                    { id: 'curved-arrow', icon: CornerUpRight, label: 'Curved Arrow' },
                    { id: 'circle', icon: Circle, label: 'Telestration Ring' },
                    { id: 'connected-circle', icon: GitCommitVertical, label: 'Chain' },
                    { id: 'text', icon: Type, label: 'Text' },
                    { id: 'spotlight', icon: Flashlight, label: 'Spotlight' },
                    { id: 'lens', icon: ZoomIn, label: 'Zoom Lens' },
                    { id: 'player-move', icon: User, label: 'Player Dragger' },
                    { id: 'polygon', icon: Hexagon, label: 'Polygon' },
                    { id: 'masking', icon: Layers, label: 'Masking / Green Screen' },
                    ].map((item) => (
                        <div key={item.id} className="relative group w-full flex justify-center">
                            <button
                                onClick={() => {
                                    if (item.id === 'masking') {
                                        setTool(tool === 'masking' ? null : 'masking');
                                    } else {
                                        setTool(tool === item.id ? null : item.id as ToolType);
                                    }
                                }}
                                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                                tool === item.id
                                    ? 'bg-blue-600/20 text-blue-400 ring-2 ring-blue-500/50'
                                    : 'text-gray-400 hover:bg-[#222] hover:text-white'
                                }`}
                            >
                                <item.icon className={`w-4 h-4 ${tool === item.id ? 'stroke-[2.5px]' : ''}`} />
                            </button>
                             <div className="absolute left-full ml-2 px-2 py-1 bg-gray-800 text-white text-xs font-medium rounded opacity-0 group-hover:opacity-100 group-hover:scale-100 scale-95 pointer-events-none transition-all duration-200 transform translate-x-[-10px] group-hover:translate-x-0 whitespace-nowrap z-50 shadow-xl border border-gray-700 flex items-center origin-left">
                                {item.label}
                                <div className="absolute right-full top-1/2 -translate-y-1/2 -mr-[1px] border-6 border-transparent border-r-gray-800"></div>
                            </div>
                        </div>
                    ))}
                </div>
                 <div className="flex flex-col items-center gap-1 pt-2 border-t border-[#222]">
                    <div className="relative group w-full flex justify-center">
                        <button onClick={() => setTool(null)} className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${tool === null ? 'bg-blue-600/20 text-blue-400 ring-2 ring-blue-500/50' : 'text-gray-400 hover:bg-[#222] hover:text-white'}`}>
                            <Snowflake className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Properties Panel */}
            <div className="w-[180px] bg-[#161616] border-r border-[#222] overflow-hidden flex flex-col relative z-30 shrink-0">
                <div className="h-full overflow-y-auto p-2">
                    {renderPropertiesPanel()}
                </div>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0a0a0a]">
            {/* Canvas Container */}
            <div ref={containerRef} className="flex-1 relative flex items-center justify-center overflow-hidden bg-black">
                <video
                    ref={videoRef}
                    src={videoUrl}
                    className="absolute max-w-none max-h-none"
                    style={{ 
                    width: containerRef.current ? '100%' : 'auto',
                    height: '100%',
                    objectFit: 'contain'
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onLoadedMetadata={handleLoadedMetadata}
                    onEnded={() => setIsPlaying(false)}
                    disablePictureInPicture
                    controls={false}
                />
                <canvas
                    ref={canvasRef}
                    className={`absolute inset-0 z-10 touch-none ${tool === 'masking' ? 'cursor-default' : (tool ? 'cursor-crosshair' : 'cursor-default')}`}
                    onMouseDown={startDrawing}
                    onMouseMove={drawPreview}
                    onMouseUp={finishDrawing}
                    onMouseLeave={() => { setIsDrawing(false); mousePosRef.current = null; }}
                    onDoubleClick={handleDoubleClick}
                    onContextMenu={handleContextMenu}
                    onClick={handleCanvasClick}
                />
            </div>

            {/* TWO LAYER PLAYBAR */}
            <div className="flex flex-col bg-[#111] border-t border-[#222] relative z-20 shrink-0">

                {/* Layer 1: Timeline / Scrubber */}
                <div className="h-10 relative w-full group/timeline bg-[#0e0e0e] border-b border-[#222] overflow-hidden" ref={timelineContainerRef}>
                    
                    {/* Event Trimmer Overlay (If event selected) */}
                    <AnimatePresence>
                        {selectedEventIds.size === 1 && (
                            <EventPlaybar 
                                event={tagEvents.find(e => e.id === Array.from(selectedEventIds)[0])!}
                                tag={tags.find(t => t.id === tagEvents.find(e => e.id === Array.from(selectedEventIds)[0])?.tagId)}
                                videoDuration={duration}
                                videoRef={videoRef}
                                onUpdate={handleEventUpdate}
                                onClose={() => setSelectedEventIds(new Set())}
                            />
                        )}
                    </AnimatePresence>

                    {/* Standard Timeline (Hidden if trimming) */}
                    {selectedEventIds.size !== 1 && (
                        <div className="relative h-full" style={{ width: `${timelineZoom * 100}%` }}>
                             {/* Live Recording Overlay */}
                            {isTaggingMode && activeRecording && (
                                <div 
                                    style={{
                                        left: `${(activeRecording.startTime / (duration || 1)) * 100}%`,
                                        width: `${((currentTime - activeRecording.startTime) / (duration || 1)) * 100}%`,
                                        backgroundColor: tags.find(t => t.id === activeRecording.tagId)?.color || 'red'
                                    }}
                                    className="absolute top-0 bottom-0 opacity-30 z-0 pointer-events-none animate-pulse"
                                />
                            )}

                            {/* Ticks/Grid */}
                            <div className="absolute inset-0 flex justify-between opacity-10 pointer-events-none">
                                {[...Array(20)].map((_, i) => <div key={i} className="w-[1px] h-full bg-white" />)}
                            </div>

                            {/* Playhead */}
                            <div 
                                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-50 pointer-events-none shadow-[0_0_10px_rgba(239,68,68,0.8)]"
                                style={{ left: `${(currentTime / (duration || 1)) * 100}%` }}
                            >
                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow-sm" />
                            </div>

                            {/* Events Layer */}
                            <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-6 pointer-events-none z-10">
                                {tagEvents.filter(e => filterTagId ? e.tagId === filterTagId : true).map(evt => {
                                    const tag = tags.find(t => t.id === evt.tagId);
                                    const startPct = (evt.startTime / (duration || 1)) * 100;
                                    const widthPct = ((evt.endTime - evt.startTime) / (duration || 1)) * 100;
                                    const isSelected = selectedEventIds.has(evt.id);

                                    return (
                                        <div
                                            key={evt.id}
                                            style={{ 
                                                left: `${startPct}%`,
                                                width: `${Math.max(widthPct, 0.4)}%`,
                                                backgroundColor: tag?.color || '#fff'
                                            }}
                                            className={`absolute top-0 bottom-0 cursor-pointer pointer-events-auto transition-all duration-200 ease-out group/tagevent rounded-sm
                                                ${isSelected ? 'ring-2 ring-white z-40 opacity-100 scale-y-125 brightness-110' : 'opacity-80 hover:opacity-100 hover:scale-y-150 hover:brightness-125 hover:z-50 hover:shadow-lg'}
                                            `}
                                            onClick={(e) => handleEventClick(e, evt.id, evt.startTime)}
                                            onContextMenu={(e) => handleEventContextMenu(e, evt.id)}
                                        >
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-0.5 bg-black/90 text-white text-[9px] rounded whitespace-nowrap opacity-0 group-hover/tagevent:opacity-100 pointer-events-none transition-opacity border border-[#333] z-50">
                                                {tag?.name} ({ (evt.endTime - evt.startTime).toFixed(1) }s)
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>

                             <div className="absolute top-0 bottom-0 left-0 w-full pointer-events-none z-30">
                                {freezeFrames.map(ff => (
                                    <div key={ff.id} style={{ left: `${(ff.timestamp / (duration || 1)) * 100}%` }} className="absolute top-0 bottom-0 w-0.5 bg-blue-500 group/ffmarker">
                                        <div className="absolute -top-1.5 left-1/2 -translate-x-1/2"><Snowflake className="w-3 h-3 text-blue-400 fill-blue-900" /></div>
                                    </div>
                                ))}
                            </div>
                             <div className="absolute top-1/2 -translate-y-1/2 left-0 w-full h-8 pointer-events-none z-40">
                                {markers.map(marker => (
                                    <div key={marker.id} style={{ left: `${(marker.time / (duration || 1)) * 100}%`, backgroundColor: marker.color }} className="absolute top-0 bottom-0 w-0.5 pointer-events-auto hover:w-1 transition-all cursor-pointer group/marker" onClick={(e) => { e.stopPropagation(); jumpToMarker(marker.time); }} onContextMenu={(e) => handleMarkerContextMenu(e, marker)}>
                                        <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full" style={{backgroundColor: marker.color}} />
                                    </div>
                                ))}
                            </div>

                            <input type="range" min="0" max={duration || 100} step="0.01" value={currentTime} onChange={handleSeek} onContextMenu={handleTimelineContextMenu} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-0" />
                        </div>
                    )}
                </div>

                {/* Layer 2: Controls */}
                <div className="h-9 flex items-center gap-4 px-4 bg-[#111]">
                    {/* Playback Controls */}
                    <div className="flex items-center gap-1">
                        <button onClick={jumpPrevEvent} className="p-1 hover:bg-[#222] rounded-full text-white"><SkipBack className="w-3.5 h-3.5" /></button>
                        <button onClick={() => { if(videoRef.current) handleManualSeek(videoRef.current.currentTime - 5); }} className="p-1 hover:bg-[#222] rounded-full text-white"><RotateCcw className="w-3.5 h-3.5" /></button>
                        <button onClick={togglePlay} className="p-1.5 bg-white text-black rounded-full hover:bg-gray-200 transition-colors mx-0.5">
                            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
                        </button>
                        <button onClick={() => { if(videoRef.current) handleManualSeek(videoRef.current.currentTime + 5); }} className="p-1 hover:bg-[#222] rounded-full text-white"><RotateCw className="w-3.5 h-3.5" /></button>
                        <button onClick={jumpNextEvent} className="p-1 hover:bg-[#222] rounded-full text-white"><SkipForward className="w-3.5 h-3.5" /></button>
                    </div>

                    <div className="flex flex-col items-center text-[9px] text-gray-400 font-mono w-16">
                        <span className="text-white font-bold">{formatTime(currentTime)}</span>
                        <span>/ {formatTime(duration)}</span>
                    </div>

                    <div className="w-[1px] h-4 bg-[#333]" />

                    {/* Zoom & Speed */}
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1">
                            <button onClick={handleZoomOut} disabled={timelineZoom <= 1} className="p-1 hover:bg-[#222] rounded-full text-gray-300 disabled:opacity-50"><ZoomOut className="w-3.5 h-3.5" /></button>
                            <span className="text-xs font-mono w-7 text-center text-gray-500">{Math.round(timelineZoom * 100)}%</span>
                            <button onClick={handleZoomIn} disabled={timelineZoom >= 10} className="p-1 hover:bg-[#222] rounded-full text-gray-300 disabled:opacity-50"><ZoomIn className="w-3.5 h-3.5" /></button>
                        </div>

                        <div className="flex items-center gap-1.5 bg-[#1a1a1a] rounded-full px-2 py-0.5 border border-[#333]">
                            <span className="text-[9px] text-gray-400">Speed</span>
                            <input
                                type="range" min="0.1" max="4.0" step="0.1" value={playbackRate}
                                onChange={(e) => setPlaybackRate(parseFloat(e.target.value))}
                                className="w-14 h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-blue-500"
                            />
                            <span className="text-[9px] font-mono w-6">{playbackRate.toFixed(1)}x</span>
                        </div>
                    </div>

                    <div className="flex-1" />

                    {/* Volume */}
                    <div className="flex items-center gap-1.5 group relative w-20">
                        <button onClick={toggleMute} className="p-1 hover:bg-[#222] rounded-full text-gray-300">
                            {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        </button>
                        <div className="flex-1">
                            <input
                                type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume}
                                onChange={(e) => { setVolume(parseFloat(e.target.value)); if (isMuted && parseFloat(e.target.value) > 0) setIsMuted(false); }}
                                className="w-full h-1 bg-[#333] rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-gray-400 group-hover:[&::-webkit-slider-thumb]:bg-blue-500"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>

        {/* --- RIGHT SIDEBAR --- */}
        <div ref={sidebarRef} className="flex flex-col bg-[#111] border-l border-[#222] z-30 shrink-0 relative" style={{ width: sidebarWidth }}>
             <div className="absolute top-0 bottom-0 -left-1 w-2 cursor-ew-resize hover:bg-blue-500/50 transition-colors z-50" onMouseDown={() => setIsResizingSidebar(true)} />

             {/* Tagging Header */}
             <div className="p-3 border-b border-[#222] flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-1.5"><Tags className="w-3.5 h-3.5 text-blue-400" /><h3 className="text-sm font-semibold text-white">Event Tagging</h3></div>
                 <div className="flex items-center gap-1.5">
                     <span className={`text-[9px] font-bold uppercase tracking-wider ${isTaggingMode ? 'text-red-500 animate-pulse' : 'text-gray-500'}`}>{isTaggingMode ? 'REC' : 'OFF'}</span>
                     <button onClick={() => { setIsTaggingMode(!isTaggingMode); setActiveRecording(null); }} className={`w-9 h-4 rounded-full relative transition-colors ${isTaggingMode ? 'bg-red-500' : 'bg-gray-700'}`}>
                        <motion.div className="w-3 h-3 bg-white rounded-full absolute top-0.5" animate={{ left: isTaggingMode ? 'calc(100% - 14px)' : '2px' }} />
                     </button>
                     <button className="p-0.5 text-gray-400 hover:text-white" onClick={() => setTagSettingsOpen(true)} title="Code Window"><Settings2 className="w-3.5 h-3.5" /></button>
                 </div>
             </div>

             {/* Tags Grid */}
             <div className="p-3 overflow-y-auto border-b border-[#222]" style={{ height: `${eventSectionHeight}%` }}>
                <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
                     {tags.map(tag => {
                         const isActive = activeRecording?.tagId === tag.id;
                         const count = tagEvents.filter(e => e.tagId === tag.id).length;
                         const isFiltered = filterTagId === tag.id;
                         return (
                             <button key={tag.id} onClick={() => handleTagClick(tag.id)} className={`relative h-12 rounded-lg border flex items-center justify-between px-3 transition-all overflow-hidden group ${isTaggingMode ? (isActive ? 'border-transparent bg-gray-800 scale-95 ring-2' : 'border-[#333] bg-[#161616] hover:bg-[#222]') : (isFiltered ? 'border-transparent bg-[#222] ring-1 ring-white' : 'border-[#333] bg-[#161616] hover:bg-[#222]')}`} style={{ borderColor: (isActive || isFiltered) ? tag.color : undefined, boxShadow: isActive ? `0 0 15px ${fadeColor(tag.color, 0.2)}` : undefined }}>
                                 <div className="absolute left-0 top-0 bottom-0 w-1" style={{ backgroundColor: tag.color }} />
                                 <span className="text-xs font-medium text-gray-200 truncate">{tag.name}</span>
                                 <div className="flex items-center gap-2">
                                    <div className="flex items-center justify-center w-5 h-5 bg-[#333] rounded text-[10px] font-bold text-gray-400 group-hover:text-white border border-[#444]">{tag.shortcut}</div>
                                    {!isTaggingMode && <span className="text-[10px] text-gray-600 font-mono">{count}</span>}
                                 </div>
                                 {isActive && <div className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                 {isTaggingMode && tag.leadLagEnabled && <div className="absolute bottom-1 right-1 opacity-50"><Zap className="w-2.5 h-2.5 text-yellow-500 fill-yellow-500" /></div>}
                             </button>
                         );
                     })}
                 </div>
             </div>

             <div className="h-2 bg-[#111] border-b border-[#222] cursor-ns-resize hover:bg-blue-500/50 transition-colors z-40" onMouseDown={() => setIsResizingSection(true)} />

             {/* Playlists Header */}
             <div className="p-4 border-b border-[#222] flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-2"><ListPlus className="w-4 h-4 text-emerald-400" /><h3 className="text-sm font-semibold text-white">Playlists</h3></div>
                 <div className="flex items-center gap-1">
                     <button onClick={() => setPlaylistModal({ isOpen: true, mode: 'create', tempName: '' })} className="p-1 text-gray-400 hover:text-white" title="New Playlist"><FolderPlus className="w-4 h-4" /></button>
                 </div>
             </div>

             <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
                 <div className="px-2 pt-2 pb-2 space-y-1 shrink-0 max-h-[150px] overflow-y-auto">
                     {playlists.map(pl => (
                         <div key={pl.id} className="group relative">
                             <button onClick={() => setActivePlaylistId(pl.id)} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors pr-8 ${activePlaylistId === pl.id ? 'bg-[#222] text-white' : 'text-gray-400 hover:text-gray-200 hover:bg-[#1a1a1a]'}`}>
                                 <Folder className={`w-4 h-4 ${activePlaylistId === pl.id ? 'text-blue-400 fill-blue-400/20' : ''}`} />
                                 <span className="flex-1 text-left truncate">{pl.name}</span>
                                 <span className="text-xs text-gray-600">{pl.events.length}</span>
                             </button>
                             <div className="absolute right-1 top-1/2 -translate-y-1/2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#222] rounded p-0.5">
                                 <button onClick={(e) => { e.stopPropagation(); setPlaylistModal({ isOpen: true, mode: 'edit', playlistId: pl.id, tempName: pl.name }); }} className="p-1 hover:bg-[#333] rounded text-gray-400 hover:text-white"><Pencil className="w-3 h-3" /></button>
                                 <button onClick={(e) => { e.stopPropagation(); setPlaylistDeleteId(pl.id); }} className="p-1 hover:bg-red-900/30 rounded text-gray-400 hover:text-red-400"><Trash className="w-3 h-3" /></button>
                             </div>
                         </div>
                     ))}
                 </div>
                 <div className="border-t border-[#222] p-2 bg-[#141414] shrink-0 flex items-center justify-between">
                     <div className="flex items-center gap-2 overflow-hidden"><Folder className="w-3 h-3 text-blue-500" /><h4 className="text-[11px] font-bold text-gray-300 truncate max-w-[120px]">{playlists.find(p => p.id === activePlaylistId)?.name}</h4></div>
                     <div className="flex items-center gap-1">
                         {autoplay.active && autoplay.playlistId === activePlaylistId ? (
                             <button onClick={() => setAutoplay({ active: false, playlistId: null, eventIndex: -1 })} className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded text-[10px] font-bold"><StopCircle className="w-3 h-3" /> Stop</button>
                         ) : (
                             <button onClick={() => startPlaylistAutoplay(activePlaylistId)} disabled={!playlists.find(p => p.id === activePlaylistId)?.events.length} className="flex items-center gap-1 px-2 py-1 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 rounded text-[10px] font-bold disabled:opacity-50"><PlayCircle className="w-3 h-3" /> Play All</button>
                         )}
                     </div>
                 </div>
                 <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-[#0a0a0a]">
                     {playlists.find(p => p.id === activePlaylistId)?.events.map((evt, i) => {
                         const tag = tags.find(t => t.id === evt.tagId);
                         const isPlayingEvent = autoplay.active && autoplay.playlistId === activePlaylistId && autoplay.eventIndex === i;
                         return (
                             <div key={i} draggable onDragStart={(e) => { e.dataTransfer.setData('text/plain', i.toString()); e.dataTransfer.effectAllowed = 'move'; setDraggingEventIndex(i); }} onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }} onDrop={(e) => { e.preventDefault(); const fromIndex = parseInt(e.dataTransfer.getData('text/plain')); if (fromIndex !== i) { reorderPlaylistEvents(activePlaylistId, fromIndex, i); } setDraggingEventIndex(null); }} onClick={(e) => handleEventClick(e, evt.id, evt.startTime)} className={`flex flex-col gap-1 p-2 rounded border border-transparent group transition-all ${isPlayingEvent ? 'bg-[#1a1a1a] border-blue-500/50' : (selectedEventIds.has(evt.id) ? 'bg-[#1a1a1a] border-blue-500/30' : 'bg-[#161616] hover:bg-[#222] hover:border-[#333]')} ${draggingEventIndex === i ? 'opacity-50 dashed border-gray-500' : ''}`}>
                                 <div className="flex items-center gap-2">
                                    <div className="cursor-grab text-gray-600 hover:text-gray-400"><GripVertical className="w-3 h-3" /></div>
                                    <div className="w-1 h-3 rounded-full shrink-0" style={{ backgroundColor: tag?.color }} />
                                    <div className="flex-1 min-w-0"><div className="text-xs font-medium text-gray-300 truncate">{tag?.name}</div></div>
                                    <div className="text-[10px] text-gray-500 font-mono">{new Date(evt.startTime * 1000).toISOString().substr(14, 5)}</div>
                                    <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); jumpToMarker(evt.startTime); }} className="p-1.5 text-gray-400 hover:text-white"><Play className="w-3 h-3" /></button>
                                        <button onClick={(e) => { e.stopPropagation(); removeEventFromPlaylist(activePlaylistId, i); }} className="p-1.5 text-gray-400 hover:text-red-400"><X className="w-3 h-3" /></button>
                                    </div>
                                 </div>
                                 {evt.notes && (<div className="flex items-start gap-1 text-[10px] text-gray-400 pl-6 border-l-2 border-[#333] ml-1"><MessageSquare className="w-2.5 h-2.5 mt-0.5 shrink-0" /><span className="italic line-clamp-2">{evt.notes}</span></div>)}
                             </div>
                         );
                     })}
                 </div>
             </div>
             <div className="p-3 border-t border-[#222] flex gap-2 shrink-0 bg-[#111]">
                 <button id="save-playlist-btn" onClick={addSelectedToPlaylist} className="flex-1 bg-[#222] hover:bg-[#333] text-white text-xs font-bold py-2 rounded flex items-center justify-center gap-2 transition-colors border border-[#333]"><Save className="w-3 h-3" /> Add Selection (Ctrl+S)</button>
             </div>
        </div>
      </div>
      
       <AnimatePresence>
         {tagSettingsOpen && (
             <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                 <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1a1a1a] border border-[#333] rounded-xl w-[700px] shadow-2xl flex flex-col max-h-[85vh]">
                     <div className="p-4 border-b border-[#333] flex items-center justify-between">
                         <div className="flex items-center gap-2">
                             <Code className="w-5 h-5 text-blue-500" />
                             <h3 className="font-semibold text-white">Code Window</h3>
                         </div>
                         <div className="flex items-center gap-2">
                             <button
                                 onClick={() => {
                                     const dataStr = JSON.stringify(tags, null, 2);
                                     const dataBlob = new Blob([dataStr], { type: 'application/json' });
                                     const url = URL.createObjectURL(dataBlob);
                                     const link = document.createElement('a');
                                     link.href = url;
                                     link.download = `tags-template-${Date.now()}.json`;
                                     link.click();
                                     URL.revokeObjectURL(url);
                                 }}
                                 className="px-3 py-1.5 bg-[#222] hover:bg-[#333] text-gray-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                                 title="Export tags as JSON template"
                             >
                                 <Download className="w-3.5 h-3.5" />
                                 Export
                             </button>
                             <button
                                 onClick={() => {
                                     const input = document.createElement('input');
                                     input.type = 'file';
                                     input.accept = '.json';
                                     input.onchange = (e) => {
                                         const file = (e.target as HTMLInputElement).files?.[0];
                                         if (file) {
                                             const reader = new FileReader();
                                             reader.onload = (event) => {
                                                 try {
                                                     const importedTags = JSON.parse(event.target?.result as string);
                                                     if (Array.isArray(importedTags) && importedTags.every(t => t.id && t.name && t.color && t.shortcut)) {
                                                         setTags(importedTags);
                                                     } else {
                                                         alert('Invalid tags file format');
                                                     }
                                                 } catch (err) {
                                                     alert('Error reading tags file');
                                                 }
                                             };
                                             reader.readAsText(file);
                                         }
                                     };
                                     input.click();
                                 }}
                                 className="px-3 py-1.5 bg-[#222] hover:bg-[#333] text-gray-300 hover:text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
                                 title="Import tags from JSON template"
                             >
                                 <Upload className="w-3.5 h-3.5" />
                                 Import
                             </button>
                             <button onClick={() => setTagSettingsOpen(false)} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
                         </div>
                     </div>
                     <div className="p-4 bg-[#111] border-b border-[#333] grid grid-cols-12 gap-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
                         <div className="col-span-1 text-center">Color</div>
                         <div className="col-span-3">Name</div>
                         <div className="col-span-1 text-center">Hotkey</div>
                         <div className="col-span-5 text-center">Lead / Lag (Quick Code)</div>
                         <div className="col-span-2 text-right">Actions</div>
                     </div>
                     <div className="overflow-y-auto flex-1 p-2 space-y-1">
                         {tags.map(tag => {
                             const isEditing = editingTagId === tag.id;
                             return (
                                 <div key={tag.id} className={`grid grid-cols-12 gap-2 items-center p-3 rounded-lg border transition-colors ${isEditing ? 'bg-[#1e1e1e] border-blue-500/50' : 'bg-[#161616] border-[#333] hover:border-gray-600'}`}>
                                     {isEditing ? (
                                         <>
                                             <div className="col-span-1 flex justify-center">
                                                <input type="color" value={tempTag.color || tag.color} onChange={e => setTempTag({...tempTag, color: e.target.value})} className="w-6 h-6 rounded cursor-pointer bg-transparent border-0 p-0" />
                                             </div>
                                             <div className="col-span-3">
                                                <input type="text" value={tempTag.name !== undefined ? tempTag.name : tag.name} onChange={e => setTempTag({...tempTag, name: e.target.value})} className="w-full bg-[#111] border border-[#444] rounded px-2 py-1 text-sm text-white focus:border-blue-500 outline-none" placeholder="Tag Name" />
                                             </div>
                                             <div className="col-span-1 flex justify-center">
                                                <input type="text" maxLength={1} value={tempTag.shortcut !== undefined ? tempTag.shortcut : tag.shortcut} onChange={e => setTempTag({...tempTag, shortcut: e.target.value.toUpperCase()})} className="w-8 text-center bg-[#111] border border-[#444] rounded px-1 py-1 text-sm text-white focus:border-blue-500 outline-none font-mono" />
                                             </div>
                                             <div className="col-span-5 flex items-center justify-center gap-4">
                                                 <label className="flex items-center gap-2 cursor-pointer">
                                                     <input type="checkbox" checked={tempTag.leadLagEnabled ?? tag.leadLagEnabled} onChange={(e) => setTempTag({...tempTag, leadLagEnabled: e.target.checked})} className="rounded bg-[#333] border-gray-600 text-blue-600 focus:ring-0" />
                                                     <span className="text-xs text-gray-300">Quick</span>
                                                 </label>
                                                 {(tempTag.leadLagEnabled ?? tag.leadLagEnabled) && (
                                                     <div className="flex items-center gap-2">
                                                         <div className="flex flex-col gap-0.5">
                                                             <div className="flex items-center gap-1 bg-[#111] border border-[#333] rounded px-2 py-1">
                                                                 <span className="text-[10px] text-gray-400 font-medium" title="Start event this many seconds before tagging">Lead:</span>
                                                                 <button
                                                                     onClick={() => setTempTag({...tempTag, preTime: Math.max(0, (tempTag.preTime ?? tag.preTime ?? 10) - 1)})}
                                                                     className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#333] rounded text-xs"
                                                                 >-</button>
                                                                 <input
                                                                     type="number"
                                                                     min="0"
                                                                     max="60"
                                                                     value={tempTag.preTime ?? tag.preTime ?? 10}
                                                                     onChange={(e) => setTempTag({...tempTag, preTime: Math.max(0, Math.min(60, parseInt(e.target.value) || 0))})}
                                                                     className="w-8 bg-transparent text-center text-xs text-white outline-none font-mono"
                                                                 />
                                                                 <button
                                                                     onClick={() => setTempTag({...tempTag, preTime: Math.min(60, (tempTag.preTime ?? tag.preTime ?? 10) + 1)})}
                                                                     className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#333] rounded text-xs"
                                                                 >+</button>
                                                                 <span className="text-[10px] text-gray-500">s</span>
                                                             </div>
                                                         </div>
                                                         <div className="flex flex-col gap-0.5">
                                                             <div className="flex items-center gap-1 bg-[#111] border border-[#333] rounded px-2 py-1">
                                                                 <span className="text-[10px] text-gray-400 font-medium" title="End event this many seconds after tagging">Lag:</span>
                                                                 <button
                                                                     onClick={() => setTempTag({...tempTag, postTime: Math.max(0, (tempTag.postTime ?? tag.postTime ?? 10) - 1)})}
                                                                     className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#333] rounded text-xs"
                                                                 >-</button>
                                                                 <input
                                                                     type="number"
                                                                     min="0"
                                                                     max="60"
                                                                     value={tempTag.postTime ?? tag.postTime ?? 10}
                                                                     onChange={(e) => setTempTag({...tempTag, postTime: Math.max(0, Math.min(60, parseInt(e.target.value) || 0))})}
                                                                     className="w-8 bg-transparent text-center text-xs text-white outline-none font-mono"
                                                                 />
                                                                 <button
                                                                     onClick={() => setTempTag({...tempTag, postTime: Math.min(60, (tempTag.postTime ?? tag.postTime ?? 10) + 1)})}
                                                                     className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#333] rounded text-xs"
                                                                 >+</button>
                                                                 <span className="text-[10px] text-gray-500">s</span>
                                                             </div>
                                                         </div>
                                                     </div>
                                                 )}
                                             </div>
                                             <div className="col-span-2 flex justify-end gap-1">
                                                <button onClick={() => {
                                                    const newShortcut = tempTag.shortcut !== undefined ? tempTag.shortcut : tag.shortcut;
                                                    const isDuplicate = tags.some(t => t.id !== tag.id && t.shortcut.toUpperCase() === newShortcut?.toUpperCase());
                                                    if (isDuplicate) {
                                                        alert(`Hotkey "${newShortcut}" is already in use by another tag.`);
                                                        return;
                                                    }
                                                    setTags(prev => prev.map(t => t.id === tag.id ? { ...t, ...tempTag } as Tag : t));
                                                    setEditingTagId(null);
                                                    setTempTag({});
                                                    setIsAddingNewTag(false);
                                                }} className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded transition-colors" title="Save changes"><Check className="w-4 h-4" /></button>
                                                <button
                                                    onClick={() => {
                                                        if (isAddingNewTag) {
                                                            setTags(prev => prev.filter(t => t.id !== tag.id));
                                                        }
                                                        setEditingTagId(null);
                                                        setTempTag({});
                                                        setIsAddingNewTag(false);
                                                    }}
                                                    className={`p-1.5 text-white rounded transition-colors ${isAddingNewTag ? 'bg-red-600 hover:bg-red-700' : 'bg-[#333] hover:bg-[#444]'}`}
                                                    title={isAddingNewTag ? "Discard new tag" : "Cancel editing"}
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                             </div>
                                         </>
                                     ) : (
                                         <>
                                             <div className="col-span-1 flex justify-center">
                                                 <div className="w-5 h-5 rounded-full border border-white/20 shadow-sm" style={{backgroundColor: tag.color}} />
                                             </div>
                                             <div className="col-span-3 font-medium text-sm text-gray-200 truncate">{tag.name}</div>
                                             <div className="col-span-1 flex justify-center">
                                                 <span className="w-6 h-6 flex items-center justify-center text-xs font-mono font-bold bg-[#222] border border-[#333] rounded text-gray-400">{tag.shortcut}</span>
                                             </div>
                                             <div className="col-span-5 flex justify-center">
                                                 {tag.leadLagEnabled ? (
                                                     <div className="flex items-center gap-2 px-2 py-1 bg-blue-900/20 border border-blue-500/30 rounded text-blue-400">
                                                         <Zap className="w-3 h-3 fill-blue-500/50" />
                                                         <span className="text-xs font-mono">-{tag.preTime || 10}s / +{tag.postTime || 10}s</span>
                                                     </div>
                                                 ) : (
                                                     <span className="text-xs text-gray-600 font-medium px-2 py-1 rounded bg-[#222]">Manual Mode</span>
                                                 )}
                                             </div>
                                             <div className="col-span-2 flex justify-end gap-1">
                                                 <button onClick={() => { setEditingTagId(tag.id); setTempTag({ name: tag.name, color: tag.color, shortcut: tag.shortcut, leadLagEnabled: tag.leadLagEnabled, preTime: tag.preTime, postTime: tag.postTime }); setIsAddingNewTag(false); }} className="p-1.5 text-gray-400 hover:text-white hover:bg-[#333] rounded"><Edit2 className="w-4 h-4" /></button>
                                                 <button onClick={() => { if (confirm('Delete this tag?')) setTags(prev => prev.filter(t => t.id !== tag.id)); }} className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-900/20 rounded"><Trash2 className="w-4 h-4" /></button>
                                             </div>
                                         </>
                                     )}
                                 </div>
                             );
                         })}
                     </div>
                     {!editingTagId && (
                         <div className="p-4 border-t border-[#333] bg-[#111]">
                            <button onClick={() => { const newId = Date.now().toString(); setTags(prev => [...prev, { id: newId, name: 'New Tag', color: '#ffffff', shortcut: '?', leadLagEnabled: false, preTime: 10, postTime: 10 }]); setEditingTagId(newId); setTempTag({ name: 'New Tag', color: '#ffffff', shortcut: '?', leadLagEnabled: false, preTime: 10, postTime: 10 }); setIsAddingNewTag(true); }} className="w-full py-3 border border-dashed border-[#444] rounded-lg text-gray-500 hover:text-white hover:border-blue-500 hover:bg-blue-500/5 flex items-center justify-center gap-2 text-sm font-medium transition-all">
                                <Plus className="w-4 h-4" /> Add New Code
                            </button>
                         </div>
                     )}
                 </motion.div>
             </div>
         )}
       </AnimatePresence>

       <AnimatePresence>
        {playlistModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                 <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1a1a1a] border border-[#333] p-6 rounded-xl w-80 shadow-2xl flex flex-col gap-4">
                    <div className="flex items-center justify-between pb-2 border-b border-[#333]"><h4 className="text-sm font-semibold text-white">{playlistModal.mode === 'create' ? 'Create Playlist' : 'Rename Playlist'}</h4><button onClick={() => setPlaylistModal(null)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button></div>
                    <div className="space-y-1"><label className="text-[10px] text-gray-400 uppercase font-semibold">Name</label><input type="text" autoFocus placeholder="Playlist Name..." value={playlistModal.tempName} onChange={(e) => setPlaylistModal({...playlistModal, tempName: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && savePlaylist()} className="w-full bg-[#111] border border-[#333] rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500" /></div>
                    <div className="flex gap-2 pt-2"><button onClick={savePlaylist} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors">Save</button></div>
                 </motion.div>
            </div>
        )}
       </AnimatePresence>

        <AnimatePresence>
            {playlistDeleteId && (
                <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1a1a1a] border border-[#333] p-6 rounded-xl w-80 shadow-2xl text-center">
                        <div className="flex justify-center mb-4 text-red-500"><AlertTriangle className="w-8 h-8" /></div>
                        <h3 className="font-semibold text-white mb-2">Delete Playlist?</h3>
                        <div className="flex gap-3 justify-center"><button onClick={() => setPlaylistDeleteId(null)} className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#222] rounded-lg">Cancel</button><button onClick={confirmDeletePlaylist} className="px-4 py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium">Delete</button></div>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>

       {contextMenu && (
           <>
            <div className="fixed inset-0 z-[65] bg-transparent" onClick={() => setContextMenu(null)} />
            <div className="fixed z-[70] bg-[#1a1a1a] border border-[#333] rounded shadow-xl py-1 w-32" style={{ left: contextMenu.x, top: contextMenu.y }}>
               <button onClick={handleEditEvent} className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-[#333] hover:text-white flex items-center gap-2"><Edit2 className="w-3 h-3" /> Edit Event</button>
               <button onClick={handleDeleteEventRequest} className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/30 hover:text-red-300 flex items-center gap-2"><Trash className="w-3 h-3" /> Delete Event</button>
           </div>
           </>
       )}

       <AnimatePresence>
            {editEventModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-[#1a1a1a] border border-[#333] p-5 rounded-xl w-80 shadow-2xl flex flex-col gap-4">
                        <div className="flex items-center justify-between pb-2 border-b border-[#333]"><h4 className="text-sm font-semibold text-white">Edit Event</h4><button onClick={() => setEditEventModal(null)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button></div>
                        <div className="space-y-3">
                            <div className="space-y-1"><div className="flex justify-between"><label className="text-[10px] text-gray-400 uppercase font-semibold">Start Time</label><button onClick={() => setEditEventModal(prev => prev ? {...prev, startTime: currentTime} : null)} className="text-[10px] text-blue-400 hover:text-blue-300">Set to Current</button></div><input type="number" step="0.1" value={editEventModal.startTime} onChange={(e) => setEditEventModal({...editEventModal, startTime: parseFloat(e.target.value)})} className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" /></div>
                            <div className="space-y-1"><div className="flex justify-between"><label className="text-[10px] text-gray-400 uppercase font-semibold">End Time</label><button onClick={() => setEditEventModal(prev => prev ? {...prev, endTime: currentTime} : null)} className="text-[10px] text-blue-400 hover:text-blue-300">Set to Current</button></div><input type="number" step="0.1" value={editEventModal.endTime} onChange={(e) => setEditEventModal({...editEventModal, endTime: parseFloat(e.target.value)})} className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" /></div>
                            <div className="space-y-1"><label className="text-[10px] text-gray-400 uppercase font-semibold">Notes</label><textarea value={editEventModal.notes} onChange={(e) => setEditEventModal({...editEventModal, notes: e.target.value})} placeholder="Add tactical notes..." className="w-full bg-[#111] border border-[#333] rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-blue-500 min-h-[60px]" /></div>
                        </div>
                        <div className="flex gap-2 pt-2 border-t border-[#333]"><button onClick={handleDeleteEventRequest} className="px-3 py-2 bg-red-900/20 text-red-400 hover:bg-red-900/40 rounded text-xs font-medium transition-colors">Delete</button><button onClick={saveEditedEvent} className="flex-1 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors">Save Changes</button></div>
                    </motion.div>
                </div>
            )}
       </AnimatePresence>

       <AnimatePresence>
        {markerModal && (
            <div className="fixed inset-0 z-[60] pointer-events-none">
                 <div className="absolute inset-0 pointer-events-auto" onMouseDown={() => setMarkerModal(null)} />
                 <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} style={{ left: markerModal.x, top: markerModal.y }} className="absolute bg-[#1a1a1a] border border-[#333] p-4 rounded-xl w-64 shadow-2xl origin-bottom-left pointer-events-auto flex flex-col gap-3">
                    <div className="flex items-center justify-between pb-2 border-b border-[#333]"><h4 className="text-sm font-semibold text-white">{markerModal.mode === 'create' ? 'Add Marker' : 'Edit Marker'}</h4><button onClick={() => setMarkerModal(null)} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button></div>
                    <div className="space-y-1"><label className="text-[10px] text-gray-400 uppercase font-semibold">Label</label><input type="text" autoFocus placeholder="Tactical Note..." value={markerModal.tempLabel} onChange={(e) => setMarkerModal({...markerModal, tempLabel: e.target.value})} onKeyDown={(e) => e.key === 'Enter' && saveMarker()} className="w-full bg-[#111] border border-[#333] rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-blue-500" /></div>
                    <div className="space-y-1"><label className="text-[10px] text-gray-400 uppercase font-semibold">Color</label><div className="flex gap-2">{['#ef4444', '#eab308', '#3b82f6', '#22c55e', '#a855f7', '#ffffff'].map(c => (<button key={c} onClick={() => setMarkerModal({...markerModal, tempColor: c})} className={`w-6 h-6 rounded-full border-2 transition-transform ${markerModal.tempColor === c ? 'border-white scale-110' : 'border-transparent ring-1 ring-white/10'}`} style={{ backgroundColor: c }} />))}</div></div>
                    <div className="flex gap-2 pt-2">{markerModal.mode === 'edit' && (<button onClick={deleteMarker} className="flex-1 py-1.5 bg-red-900/30 text-red-400 hover:bg-red-900/50 rounded text-xs font-medium transition-colors">Delete</button>)}<button onClick={saveMarker} className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded text-xs font-medium transition-colors">Save</button></div>
                 </motion.div>
            </div>
        )}
       </AnimatePresence>

       <AnimatePresence>
        {showCloseConfirm && (
          <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
             <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#1a1a1a] border border-[#333] p-6 rounded-xl w-80 shadow-2xl">
                <div className="flex items-center gap-3 text-amber-500 mb-4"><AlertTriangle className="w-6 h-6" /><h3 className="font-semibold text-white">End Session?</h3></div>
                <p className="text-gray-400 text-sm mb-6">Return to project selection? Unsaved changes are automatically saved to local session.</p>
                <div className="flex gap-3 justify-end"><button onClick={() => setShowCloseConfirm(false)} className="px-4 py-2 text-sm text-gray-300 hover:text-white hover:bg-[#222] rounded-lg">Cancel</button><button onClick={confirmClose} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">Exit Project</button></div>
             </motion.div>
          </div>
        )}
       </AnimatePresence>
    </div>
  );
};

export default Workspace;
