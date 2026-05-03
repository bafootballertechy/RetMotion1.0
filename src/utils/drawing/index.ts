import { Point, Particle, Shape } from '@/src/types';
import { fadeColor, adjustBrightness, shiftColor } from '../colors';

export const drawArrowHead = (ctx: CanvasRenderingContext2D, from: Point, to: Point, size: number) => {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(angle - Math.PI / 6), to.y - size * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - size * Math.cos(angle + Math.PI / 6), to.y - size * Math.sin(angle + Math.PI / 6));
  ctx.lineTo(to.x, to.y);
  ctx.fill();
};

export const drawDashedLine = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, width: number = 2) => {
  ctx.save();
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([width * 2, width * 2]);
  ctx.moveTo(p1.x, p1.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.restore();
};

export const drawLabel = (ctx: CanvasRenderingContext2D, p: Point, text: string, scale: number) => {
  ctx.save();
  const fontSize = 11 / scale;
  ctx.font = `500 ${fontSize}px Inter, sans-serif`;
  const metrics = ctx.measureText(text);
  const paddingX = 8 / scale;
  const h = 22 / scale;
  const w = metrics.width + paddingX * 2;
  const x = p.x + (15 / scale);
  const y = p.y + (15 / scale);
  const radius = 4 / scale;

  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 4 / scale;
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, radius);
  } else {
    ctx.rect(x, y, w, h);
  }
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.2)';
  ctx.lineWidth = 1 / scale;
  ctx.stroke();

  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  ctx.shadowBlur = 0;
  ctx.fillText(text, x + paddingX, y + h / 2 + (1 / scale));
  ctx.restore();
};

export const getShimmerGradient = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, isPreview: boolean) => {
  const grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
  const shimmerSpeed = 0.001;
  const shimmerOffset = (Date.now() * shimmerSpeed) % 2;

  if (isPreview) {
    grad.addColorStop(0, fadeColor(color, 0.2));
    grad.addColorStop(0.5, color);
    grad.addColorStop(1, fadeColor(color, 0.2));
  } else {
    const stop1 = Math.max(0, Math.min(1, shimmerOffset - 0.2));
    const stop2 = Math.max(0, Math.min(1, shimmerOffset));
    const stop3 = Math.max(0, Math.min(1, shimmerOffset + 0.2));
    grad.addColorStop(0, fadeColor(color, 0.6));
    if (stop2 > 0 && stop2 < 1) {
      grad.addColorStop(stop1, color);
      grad.addColorStop(stop2, '#ffffff');
      grad.addColorStop(stop3, color);
    } else {
      grad.addColorStop(0.5, color);
    }
    grad.addColorStop(1, fadeColor(color, 0.6));
  }
  return grad;
};

export const drawFreehandArrow = (ctx: CanvasRenderingContext2D, points: Point[], color: string, thickness: number, isDashed: boolean, timestamp: number, isPreview: boolean) => {
  if (points.length < 2) return;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = thickness;
  const pStart = points[0];
  const pEnd = points[points.length - 1];
  ctx.strokeStyle = getShimmerGradient(ctx, pStart, pEnd, color, isPreview);
  if (isDashed) ctx.setLineDash([thickness * 2, thickness * 1.5]);
  if (!isPreview) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 2; i++) {
    const xc = (points[i].x + points[i + 1].x) / 2;
    const yc = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, xc, yc);
  }
  if (points.length > 2) ctx.quadraticCurveTo(points[points.length - 2].x, points[points.length - 2].y, points[points.length - 1].x, points[points.length - 1].y);
  else ctx.lineTo(points[1].x, points[1].y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = color;
  drawArrowHead(ctx, points.length > 2 ? points[points.length - 2] : points[0], pEnd, thickness * 3);
  ctx.restore();
};

export const drawProArrow = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, thickness: number, isDashed: boolean, timestamp: number, isPreview: boolean = false) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx);
  const length = Math.sqrt(dx * dx + dy * dy);
  const duration = 500;
  const age = isPreview ? duration : (Date.now() - timestamp);
  const progress = Math.min(1, age / duration);
  if (length < 1) return;
  const currentLength = length * progress;
  const currentEndX = p1.x + Math.cos(angle) * currentLength;
  const currentEndY = p1.y + Math.sin(angle) * currentLength;
  const headSize = Math.max(thickness * 2.5, 10);
  const headLength = headSize * 0.85;
  const shortenDist = headLength * Math.cos(Math.PI / 6) * 0.9;
  let lineEndX = currentEndX;
  let lineEndY = currentEndY;
  const hasHead = currentLength > shortenDist || isPreview;
  if (hasHead) {
    lineEndX = currentEndX - Math.cos(angle) * shortenDist;
    lineEndY = currentEndY - Math.sin(angle) * shortenDist;
  }
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = getShimmerGradient(ctx, p1, { x: currentEndX, y: currentEndY }, color, isPreview);
  ctx.lineWidth = thickness;
  if (isDashed) ctx.setLineDash([thickness * 2, thickness * 1.5]);
  if (!isPreview) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
  ctx.beginPath();
  ctx.moveTo(p1.x, p1.y);
  if (currentLength > 0) { ctx.lineTo(lineEndX, lineEndY); ctx.stroke(); }
  ctx.shadowBlur = 0;
  ctx.setLineDash([]);
  if (hasHead) {
    const tipX = currentEndX;
    const tipY = currentEndY;
    const barb1x = tipX - headLength * Math.cos(angle - Math.PI / 6);
    const barb1y = tipY - headLength * Math.sin(angle - Math.PI / 6);
    const barb2x = tipX - headLength * Math.cos(angle + Math.PI / 6);
    const barb2y = tipY - headLength * Math.sin(angle + Math.PI / 6);
    ctx.beginPath();
    ctx.moveTo(barb1x, barb1y);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(barb2x, barb2y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = adjustBrightness(color, -40);
    ctx.lineWidth = Math.max(1, thickness * 0.2);
    ctx.stroke();
  }
  ctx.restore();
};

export const draw3DRing = (ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, tiltDegrees: number, strokeWidth: number, timestamp: number, isGhost: boolean = false) => {
  if (radius < 1) return;
  const now = Date.now();
  const timeElapsed = isGhost ? now : (now - timestamp);
  let scaleEnt = 1;
  let alphaEnt = 1;
  if (!isGhost && timeElapsed < 500) {
    const p = timeElapsed / 500;
    if (p < 0.6) scaleEnt = 0.3 + (1.08 - 0.3) * (p / 0.6);
    else scaleEnt = 1.08 - (0.08) * ((p - 0.6) / 0.4);
    alphaEnt = Math.min(1, p * 2);
  }
  const tiltRad = (tiltDegrees * Math.PI) / 180;
  const scaleY = Math.max(0.01, Math.cos(tiltRad));
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scaleEnt, scaleEnt * scaleY);
  ctx.globalAlpha = alphaEnt * (isGhost ? 0.7 : 1.0);
  const duration = 2500;
  const spinAngle = (timeElapsed % duration) / duration * Math.PI * 2;
  const innerRadius = radius * 0.65;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.arc(0, 0, innerRadius, Math.PI * 2, 0, true);
  ctx.closePath();
  ctx.clip();
  try {
    const grad = ctx.createConicGradient(spinAngle, 0, 0);
    grad.addColorStop(0, color);
    grad.addColorStop(0.4, shiftColor(color, -30));
    grad.addColorStop(0.7, shiftColor(color, -10));
    grad.addColorStop(1, color);
    ctx.fillStyle = grad;
    ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
  } catch (e) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.lineWidth = strokeWidth;
  ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, innerRadius, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
  if (!isGhost) { ctx.shadowBlur = 15; ctx.shadowColor = fadeColor(color, 0.4); }
  ctx.restore();
};

export const drawSpotlight = (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, intensity: number, rotation: number, particles: Particle[], timestamp: number, isGhost: boolean = false) => {
  const now = Date.now();
  const alpha = isGhost ? 0.4 : 1.0;
  const beamWidth = size;
  const topY = 0;
  const bottomY = y;
  ctx.save();
  const grad = ctx.createLinearGradient(x, topY, x, bottomY);
  grad.addColorStop(0, `rgba(255,255,255,0)`);
  grad.addColorStop(0.5, `rgba(255,255,255,${intensity * 0.25 * alpha})`);
  grad.addColorStop(1, `rgba(255,255,255,${0.05 * alpha})`);
  ctx.fillStyle = grad;
  ctx.beginPath(); ctx.moveTo(x - beamWidth / 4, topY); ctx.lineTo(x + beamWidth / 4, topY); ctx.lineTo(x + beamWidth / 2, bottomY); ctx.lineTo(x - beamWidth / 2, bottomY); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(x, bottomY);
  ctx.scale(1, rotation);
  const ringRadius = beamWidth / 2;
  const ringGrad = ctx.createRadialGradient(0, 0, ringRadius * 0.3, 0, 0, ringRadius * 1.3);
  ringGrad.addColorStop(0, `rgba(255,255,255,${0.9 * alpha})`);
  ringGrad.addColorStop(0.6, `rgba(255,255,255,${0.3 * alpha})`);
  ringGrad.addColorStop(1, `rgba(255,255,255,0)`);
  ctx.fillStyle = ringGrad;
  ctx.beginPath(); ctx.arc(0, 0, ringRadius * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.2 * intensity * alpha})`;
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, ringRadius, 0, Math.PI * 2); ctx.stroke();
  if (!isGhost) {
    const timeDelta = now - timestamp;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const currentAngle = p.initialAngle + (timeDelta * p.speed);
      const px = Math.cos(currentAngle) * ringRadius;
      const py = Math.sin(currentAngle) * ringRadius;
      const flicker = 0.5 + 0.5 * Math.sin(timeDelta * 0.005 + i);
      ctx.fillStyle = `rgba(255,255,255,${0.6 * flicker})`;
      ctx.beginPath(); ctx.arc(px, py, 2, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.restore();
};

export const drawTangentLine = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, r1: number, r2: number, color: string, strokeWidth: number, progress: number, pulseAge: number = 0) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 1e-6) return;
  const ux = dx / dist; const uy = dy / dist;
  const startX = p1.x + ux * (r1 * 0.8); const startY = p1.y + uy * (r1 * 0.8);
  const endX = p2.x - ux * (r2 * 0.8); const endY = p2.y - uy * (r2 * 0.8);
  const lineLen = Math.sqrt(Math.pow(endX - startX, 2) + Math.pow(endY - startY, 2));
  ctx.save();
  ctx.beginPath();
  const grad = ctx.createLinearGradient(startX, startY, endX, endY);
  const cBase = color; const cDark = shiftColor(color, -30);
  grad.addColorStop(0, cBase); grad.addColorStop(0.3, cDark); grad.addColorStop(0.7, cBase); grad.addColorStop(1, cDark);
  ctx.strokeStyle = grad;
  ctx.lineWidth = strokeWidth * 1.5;
  ctx.lineCap = 'round';
  if (pulseAge > 0) {
    const pulse = Math.sin((pulseAge / 500));
    ctx.shadowBlur = 2 + 2 * pulse; ctx.shadowColor = color; ctx.globalAlpha = 0.4 + 0.2 * pulse;
  } else {
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.9;
  }
  ctx.setLineDash([lineLen]); ctx.lineDashOffset = lineLen * (1 - progress);
  ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.beginPath(); ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.moveTo(startX, startY); ctx.lineTo(endX, endY); ctx.stroke();
  ctx.restore();
};

export const drawCurvedArrow = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, width: number, isDashed: boolean, timestamp: number, renderMode: 'full' | 'shadow' | 'body' = 'full', tilt?: number) => {
  const now = Date.now();
  const duration = 600;
  const progress = timestamp > 0 ? Math.min(1, (now - timestamp) / duration) : 1;
  const dx = p2.x - p1.x; const dy = p2.y - p1.y; const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 2) return;

  ctx.save();
  if (tilt !== undefined) {
    const centerX = (p1.x + p2.x) / 2;
    const centerY = (p1.y + p2.y) / 2;
    const tiltScale = Math.max(0.2, Math.cos((tilt * Math.PI) / 180));
    ctx.translate(centerX, centerY);
    ctx.scale(1, tiltScale);
    ctx.translate(-centerX, -centerY);
  }

  const mx = (p1.x + p2.x) / 2; const my = (p1.y + p2.y) / 2;
  const arcHeight = dist * 0.3; const cpx = mx; const cpy = my - arcHeight;
  if (renderMode === 'full' || renderMode === 'shadow') {
    ctx.save(); ctx.beginPath(); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = width; ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.3)'; ctx.lineCap = 'round';
    const arcLen = dist * 1.2;
    if (isDashed) ctx.setLineDash([width * 2, width * 1.5]);
    else { ctx.setLineDash([arcLen]); ctx.lineDashOffset = arcLen * (1 - progress); }
    ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
    if (progress > 0.9) { ctx.setLineDash([]); ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.shadowBlur = 5; drawArrowHead(ctx, p1, p2, width * 3); }
    ctx.restore();
  }
  if (renderMode === 'full' || renderMode === 'body') {
    ctx.save();
    ctx.strokeStyle = getShimmerGradient(ctx, p1, p2, color, timestamp === 0);
    ctx.lineWidth = width; ctx.lineCap = 'round';
    if (isDashed) ctx.setLineDash([width * 2, width * 1.5]);
    else { const arcLen = dist * 1.2; ctx.setLineDash([arcLen]); ctx.lineDashOffset = arcLen * (1 - progress); }
    ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.quadraticCurveTo(cpx, cpy, p2.x, p2.y); ctx.stroke();
    if (progress > 0.8) {
      ctx.setLineDash([]);
      const angle = Math.atan2(p2.y - cpy, p2.x - cpx);
      const headSize = width * 4; const tipX = p2.x; const tipY = p2.y;
      const barb1x = tipX - headSize * Math.cos(angle - Math.PI / 6);
      const barb1y = tipY - headSize * Math.sin(angle - Math.PI / 6);
      const barb2x = tipX - headSize * Math.cos(angle + Math.PI / 6);
      const barb2y = tipY - headSize * Math.sin(angle + Math.PI / 6);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(barb1x, barb1y); ctx.lineTo(tipX, tipY); ctx.lineTo(barb2x, barb2y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
};

export const drawLens = (ctx: CanvasRenderingContext2D, center: Point, radius: number, zoom: number, video: HTMLVideoElement, scale: number, isGhost: boolean = false) => {
  const radiusVideo = radius / scale;
  const sourceW = (radiusVideo * 2) / zoom;
  const sourceH = sourceW;
  const sourceX = center.x - sourceW / 2;
  const sourceY = center.y - sourceH / 2;
  ctx.save();
  if (isGhost) ctx.globalAlpha = 0.8;
  ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 20 / scale; ctx.shadowOffsetY = 10 / scale;
  ctx.beginPath(); ctx.arc(center.x, center.y, radiusVideo, 0, Math.PI * 2); ctx.clip();
  try { ctx.drawImage(video, sourceX, sourceY, sourceW, sourceH, center.x - radiusVideo, center.y - radiusVideo, radiusVideo * 2, radiusVideo * 2); } catch (e) { ctx.fillStyle = '#000'; ctx.fill(); }
  const grad = ctx.createRadialGradient(center.x - radiusVideo * 0.3, center.y - radiusVideo * 0.3, radiusVideo * 0.2, center.x, center.y, radiusVideo);
  grad.addColorStop(0, 'rgba(255,255,255,0.15)'); grad.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.arc(center.x, center.y, radiusVideo, 0, Math.PI * 2);
  ctx.shadowColor = 'transparent'; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4 / scale; ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1 / scale; ctx.stroke();
  ctx.restore();
  if (isGhost) drawLabel(ctx, { x: center.x, y: center.y + radiusVideo }, `${zoom}x`, scale);
};

export const drawText = (ctx: CanvasRenderingContext2D, x: number, y: number, text: string, fontSize: number, fontFamily: string, rotation: number, tilt: number, color: string, isGhost: boolean = false) => {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((rotation * Math.PI) / 180);
  const tiltScale = Math.max(0.2, Math.cos((tilt * Math.PI) / 180));
  ctx.scale(1, tiltScale);
  if (isGhost) ctx.globalAlpha = 0.6;
  ctx.font = `bold ${fontSize}px ${fontFamily}`;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 4;
  ctx.fillText(text, 0, 0);
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeText(text, 0, 0);
  ctx.restore();
};

export const drawSelectionHandles = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  const handleSize = 8 / scale;
  ctx.save();
  for (const pt of points) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, handleSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
};

export const drawSelectionBox = (ctx: CanvasRenderingContext2D, points: Point[], scale: number) => {
  if (points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = '#3b82f6';
  ctx.lineWidth = 2 / scale;
  ctx.setLineDash([5 / scale, 5 / scale]);
  ctx.beginPath();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const pt of points) {
    minX = Math.min(minX, pt.x);
    minY = Math.min(minY, pt.y);
    maxX = Math.max(maxX, pt.x);
    maxY = Math.max(maxY, pt.y);
  }
  const padding = 10 / scale;
  ctx.rect(minX - padding, minY - padding, maxX - minX + padding * 2, maxY - minY + padding * 2);
  ctx.stroke();
  ctx.restore();
};

export const drawTiltedLine = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, strokeWidth: number, tilt: number, isDashed: boolean) => {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const angle = Math.atan2(dy, dx);
  const length = Math.sqrt(dx * dx + dy * dy);
  const tiltScale = Math.max(0.2, Math.cos((tilt * Math.PI) / 180));
  ctx.save();
  ctx.translate(p1.x, p1.y);
  ctx.rotate(angle);
  ctx.scale(1, tiltScale);
  ctx.strokeStyle = color;
  ctx.lineWidth = strokeWidth;
  ctx.lineCap = 'round';
  if (isDashed) ctx.setLineDash([strokeWidth * 2, strokeWidth * 1.5]);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(length, 0);
  ctx.stroke();
  ctx.restore();
};

export const drawTiltedPolygon = (ctx: CanvasRenderingContext2D, points: Point[], color: string, strokeWidth: number, tilt: number, isFilled: boolean) => {
  if (points.length < 3) return;
  let centerX = 0, centerY = 0;
  for (const pt of points) {
    centerX += pt.x;
    centerY += pt.y;
  }
  centerX /= points.length;
  centerY /= points.length;
  const tiltScale = Math.max(0.2, Math.cos((tilt * Math.PI) / 180));
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.scale(1, tiltScale);
  ctx.translate(-centerX, -centerY);
  ctx.strokeStyle = color;
  ctx.fillStyle = fadeColor(color, 0.3);
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
  if (isFilled) ctx.fill();
  ctx.stroke();
  ctx.restore();
};
