import { context2d, createSurface, type Surface } from '../model/surface';
import type { PixelLayer } from '../model/types';

export type Matrix = [number, number, number, number, number, number];

export interface FreeTransform {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  translateX: number;
  translateY: number;
}

export const maximumBakeEdge = 16384;

export interface Point {
  x: number;
  y: number;
}

export function startTransform(layer: PixelLayer): FreeTransform {
  return {
    id: layer.id,
    left: layer.left,
    top: layer.top,
    width: layer.width,
    height: layer.height,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    translateX: 0,
    translateY: 0,
  };
}

export function centerOf(transform: FreeTransform): Point {
  return { x: transform.left + transform.width / 2, y: transform.top + transform.height / 2 };
}

export function multiply(first: Matrix, second: Matrix): Matrix {
  const [a1, b1, c1, d1, e1, f1] = first;
  const [a2, b2, c2, d2, e2, f2] = second;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

export function matrixOf(transform: FreeTransform): Matrix {
  const center = centerOf(transform);
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const toOrigin: Matrix = [1, 0, 0, 1, -center.x, -center.y];
  const scale: Matrix = [transform.scaleX, 0, 0, transform.scaleY, 0, 0];
  const rotate: Matrix = [cos, sin, -sin, cos, 0, 0];
  const back: Matrix = [1, 0, 0, 1, center.x + transform.translateX, center.y + transform.translateY];
  return multiply(back, multiply(rotate, multiply(scale, toOrigin)));
}

export function applyMatrix(matrix: Matrix, point: Point): Point {
  const [a, b, c, d, e, f] = matrix;
  return { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}

export function transformedCorners(transform: FreeTransform): Point[] {
  const matrix = matrixOf(transform);
  const { left, top, width, height } = transform;
  return [
    { x: left, y: top },
    { x: left + width, y: top },
    { x: left + width, y: top + height },
    { x: left, y: top + height },
  ].map((point) => applyMatrix(matrix, point));
}

export function isIdentity(transform: FreeTransform): boolean {
  return transform.scaleX === 1 && transform.scaleY === 1 && transform.rotation === 0 && transform.translateX === 0 && transform.translateY === 0;
}

export function bakeTransform(layer: PixelLayer, transform: FreeTransform): { surface: Surface; left: number; top: number } | null {
  if (!layer.surface) {
    return null;
  }
  const corners = transformedCorners(transform);
  if (corners.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) {
    return null;
  }
  const left = Math.floor(Math.min(...corners.map((point) => point.x)));
  const top = Math.floor(Math.min(...corners.map((point) => point.y)));
  const right = Math.ceil(Math.max(...corners.map((point) => point.x)));
  const bottom = Math.ceil(Math.max(...corners.map((point) => point.y)));
  if (right - left < 1 || bottom - top < 1 || right - left > maximumBakeEdge || bottom - top > maximumBakeEdge) {
    return null;
  }
  const surface = createSurface(right - left, bottom - top);
  const context = context2d(surface);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  const [a, b, c, d, e, f] = matrixOf(transform);
  context.setTransform(a, b, c, d, e - left, f - top);
  context.drawImage(layer.surface, layer.left, layer.top);
  return { surface, left, top };
}
