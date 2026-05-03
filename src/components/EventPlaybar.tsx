import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X } from 'lucide-react';
import { TagEvent, Tag } from '@/src/types';
import { formatTime } from '@/src/utils/general';
import { fadeColor } from '@/src/utils/colors';

const EventPlaybar = ({
    event,
    tag,
    videoDuration,
    onUpdate,
    videoRef,
    onClose
}: {
    event: TagEvent;
    tag?: Tag;
    videoDuration: number;
    onUpdate: (start: number, end: number) => void;
    videoRef: React.RefObject<HTMLVideoElement>;
    onClose: () => void;
}) => {
    const [dragging, setDragging] = useState<'start' | 'end' | null>(null);
    const [tempStart, setTempStart] = useState(event.startTime);
    const [tempEnd, setTempEnd] = useState(event.endTime);
    const [viewWindow, setViewWindow] = useState<{start: number, end: number}>({ start: 0, end: 0 });

    useEffect(() => {
        if (!dragging) {
            setTempStart(event.startTime);
            setTempEnd(event.endTime);
            const padding = 5;
            const newStart = Math.max(0, event.startTime - padding);
            const newEnd = Math.min(videoDuration, event.endTime + padding);
            setViewWindow({ start: newStart, end: newEnd });
        }
    }, [event.id, event.startTime, event.endTime, videoDuration, dragging]);

    const handleDragStart = (type: 'start' | 'end') => {
        setDragging(type);
    };

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!dragging) return;
        const container = document.getElementById('event-trimmer-track');
        if (!container) return;
        const rect = container.getBoundingClientRect();
        const offsetX = e.clientX - rect.left;
        const pct = Math.max(0, Math.min(1, offsetX / rect.width));
        const windowDuration = viewWindow.end - viewWindow.start;
        const newTime = viewWindow.start + (pct * windowDuration);

        if (dragging === 'start') {
            const clamped = Math.min(newTime, tempEnd - 0.1);
            setTempStart(Math.max(0, clamped));
            if (videoRef.current && Math.abs(videoRef.current.currentTime - clamped) > 0.1) {
                videoRef.current.currentTime = clamped;
            }
        } else {
            const clamped = Math.max(newTime, tempStart + 0.1);
            setTempEnd(Math.min(videoDuration, clamped));
            if (videoRef.current && Math.abs(videoRef.current.currentTime - clamped) > 0.1) {
                videoRef.current.currentTime = clamped;
            }
        }
    }, [dragging, viewWindow, tempStart, tempEnd, videoDuration, videoRef]);

    const handleMouseUp = useCallback(() => {
        if (dragging) {
            onUpdate(tempStart, tempEnd);
            setDragging(null);
        }
    }, [dragging, tempStart, tempEnd, onUpdate]);

    useEffect(() => {
        if (dragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
            return () => {
                window.removeEventListener('mousemove', handleMouseMove);
                window.removeEventListener('mouseup', handleMouseUp);
            };
        }
    }, [dragging, handleMouseMove, handleMouseUp]);

    const windowDuration = viewWindow.end - viewWindow.start || 1;
    const startPct = ((tempStart - viewWindow.start) / windowDuration) * 100;
    const durationPct = ((tempEnd - tempStart) / windowDuration) * 100;
    const safeStartPct = Math.max(0, Math.min(100, startPct));
    const safeWidthPct = Math.max(0, Math.min(100 - safeStartPct, durationPct));

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute bottom-0 left-0 right-0 h-16 bg-[#161616] border-t border-[#333] z-50 flex flex-col"
        >
             <div className="flex justify-between items-center px-4 py-1 bg-[#111] border-b border-[#222]">
                <div className="flex items-center gap-2">
                     <span className="w-2 h-2 rounded-full" style={{backgroundColor: tag?.color}} />
                     <span className="text-xs font-bold text-gray-200">{tag?.name || 'Event'}</span>
                </div>
                <div className="flex items-center gap-4">
                    <div className="flex gap-4 text-[10px] text-gray-400 font-mono">
                        <span>In: {formatTime(tempStart)}</span>
                        <span className="text-white font-bold">Dur: {formatTime(tempEnd - tempStart)}</span>
                        <span>Out: {formatTime(tempEnd)}</span>
                    </div>
                    <div className="w-[1px] h-4 bg-[#333]" />
                    <button onClick={onClose} className="p-1 hover:bg-[#222] rounded text-gray-400 hover:text-white" title="Done"><X className="w-4 h-4" /></button>
                </div>
            </div>

            <div
                id="event-trimmer-track"
                className="relative flex-1 w-full bg-[#0a0a0a] overflow-hidden cursor-crosshair"
            >
                {/* Visual Grid/Ticks */}
                <div className="absolute inset-0 flex justify-between px-2 opacity-20 pointer-events-none">
                     {[...Array(20)].map((_, i) => <div key={i} className="w-[1px] h-full bg-white/20" />)}
                </div>

                {/* The Event Region */}
                <div
                    className="absolute top-0 bottom-0 h-full group"
                    style={{
                        left: `${safeStartPct}%`,
                        width: `${safeWidthPct}%`,
                        backgroundColor: fadeColor(tag?.color || '#3b82f6', 0.2),
                        borderLeft: `2px solid ${tag?.color || '#3b82f6'}`,
                        borderRight: `2px solid ${tag?.color || '#3b82f6'}`,
                        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 5px, ${fadeColor(tag?.color || '#3b82f6', 0.1)} 5px, ${fadeColor(tag?.color || '#3b82f6', 0.1)} 10px)`
                    }}
                >
                    {/* Left Handle */}
                    <div
                        onMouseDown={(e) => { e.stopPropagation(); handleDragStart('start'); }}
                        className="absolute left-0 top-0 bottom-0 w-6 -ml-3 cursor-ew-resize flex items-center justify-center hover:bg-white/10 z-20 group/handle"
                    >
                        <div className="w-1 h-8 bg-white/50 rounded-full shadow-lg group-hover/handle:bg-white transition-colors" />
                    </div>

                    {/* Right Handle */}
                    <div
                        onMouseDown={(e) => { e.stopPropagation(); handleDragStart('end'); }}
                        className="absolute right-0 top-0 bottom-0 w-6 -mr-3 cursor-ew-resize flex items-center justify-center hover:bg-white/10 z-20 group/handle"
                    >
                        <div className="w-1 h-8 bg-white/50 rounded-full shadow-lg group-hover/handle:bg-white transition-colors" />
                    </div>

                    {/* Center Grip */}
                    <div className="w-full h-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                         <div className="px-2 py-1 bg-black/50 rounded text-[9px] text-white">Adjust Clip</div>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};

export default EventPlaybar;
