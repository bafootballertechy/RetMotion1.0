import { Point, Particle } from '@/src/types';

export const formatTime = (seconds: number): string => {
  if (!isFinite(seconds) || isNaN(seconds)) return "00:00.0";
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.floor(Math.abs(seconds) % 60);
  const ms = Math.floor((Math.abs(seconds) % 1) * 10);
  return `${seconds < 0 ? '-' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
};

export const getDistance = (p1: Point, p2: Point): number =>
  Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));

export const getVideoLayout = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const cw = canvas.width;
  const ch = canvas.height;
  if (!vw || !vh) return { x: 0, y: 0, w: cw, h: ch, scale: 1 };

  const videoRatio = vw / vh;
  const canvasRatio = cw / ch;

  let drawW, drawH, drawX, drawY, scale;

  if (canvasRatio > videoRatio) {
    drawH = ch;
    drawW = ch * videoRatio;
    drawX = (cw - drawW) / 2;
    drawY = 0;
    scale = drawH / vh;
  } else {
    drawW = cw;
    drawH = cw / videoRatio;
    drawY = (ch - drawH) / 2;
    drawX = 0;
    scale = drawW / vw;
  }

  return { x: drawX, y: drawY, w: drawW, h: drawH, scale };
};

export const createParticles = (count: number = 30): Particle[] => {
  const arr: Particle[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      initialAngle: Math.random() * Math.PI * 2,
      speed: 0.002 + Math.random() * 0.003
    });
  }
  return arr;
};

export const clamp = (v: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, v));
