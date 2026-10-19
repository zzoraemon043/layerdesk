import { centerOf, transformedCorners, type FreeTransform, type Point } from './transform';

export type Axis = -1 | 0 | 1;

export interface ScaleHandle {
  sx: Axis;
  sy: Axis;
  point: Point;
}

const minimumScale = 0.01;
const rotationSnap = Math.PI / 12;

export function transformedCenter(transform: FreeTransform): Point {
  const center = centerOf(transform);
  return { x: center.x + transform.translateX, y: center.y + transform.translateY };
}

function rotate(point: Point, angle: number): Point {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

function toLocal(transform: FreeTransform, point: Point): Point {
  const center = transformedCenter(transform);
  return rotate({ x: point.x - center.x, y: point.y - center.y }, -transform.rotation);
}

export function scaleHandles(transform: FreeTransform): ScaleHandle[] {
  const [topLeft, topRight, bottomRight, bottomLeft] = transformedCorners(transform);
  const middle = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  return [
    { sx: -1, sy: -1, point: topLeft },
    { sx: 0, sy: -1, point: middle(topLeft, topRight) },
    { sx: 1, sy: -1, point: topRight },
    { sx: 1, sy: 0, point: middle(topRight, bottomRight) },
    { sx: 1, sy: 1, point: bottomRight },
    { sx: 0, sy: 1, point: middle(bottomRight, bottomLeft) },
    { sx: -1, sy: 1, point: bottomLeft },
    { sx: -1, sy: 0, point: middle(bottomLeft, topLeft) },
  ];
}

export function pointInQuad(point: Point, corners: Point[]): boolean {
  let inside = false;
  for (let index = 0, previous = corners.length - 1; index < corners.length; previous = index++) {
    const a = corners[index];
    const b = corners[previous];
    const crosses = a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) {
      inside = !inside;
    }
  }
  return inside;
}

export function dragMove(start: FreeTransform, dx: number, dy: number): FreeTransform {
  return { ...start, translateX: start.translateX + dx, translateY: start.translateY + dy };
}

export function dragScale(start: FreeTransform, sx: Axis, sy: Axis, pointer: Point, keepRatio: boolean): FreeTransform {
  const halfWidth = start.width / 2;
  const halfHeight = start.height / 2;
  const fixed = { x: -sx * halfWidth * start.scaleX, y: -sy * halfHeight * start.scaleY };
  const local = toLocal(start, pointer);
  let scaleX = sx === 0 ? start.scaleX : Math.max(minimumScale, ((local.x - fixed.x) * sx) / start.width);
  let scaleY = sy === 0 ? start.scaleY : Math.max(minimumScale, ((local.y - fixed.y) * sy) / start.height);
  if (keepRatio) {
    const factor = sx === 0 ? scaleY / start.scaleY : sy === 0 ? scaleX / start.scaleX : Math.max(scaleX / start.scaleX, scaleY / start.scaleY);
    scaleX = Math.max(minimumScale, start.scaleX * factor);
    scaleY = Math.max(minimumScale, start.scaleY * factor);
  }
  const localCenter = {
    x: sx === 0 ? 0 : fixed.x + sx * halfWidth * scaleX,
    y: sy === 0 ? 0 : fixed.y + sy * halfHeight * scaleY,
  };
  const offset = rotate(localCenter, start.rotation);
  const center = transformedCenter(start);
  const original = centerOf(start);
  return {
    ...start,
    scaleX,
    scaleY,
    translateX: center.x + offset.x - original.x,
    translateY: center.y + offset.y - original.y,
  };
}

export function dragRotate(start: FreeTransform, from: Point, pointer: Point, snap: boolean): FreeTransform {
  const center = transformedCenter(start);
  const delta = Math.atan2(pointer.y - center.y, pointer.x - center.x) - Math.atan2(from.y - center.y, from.x - center.x);
  const rotation = start.rotation + delta;
  return { ...start, rotation: snap ? Math.round(rotation / rotationSnap) * rotationSnap : rotation };
}
