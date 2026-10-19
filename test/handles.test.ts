import { describe, expect, it } from 'vitest';
import { dragMove, dragRotate, dragScale, pointInQuad, scaleHandles } from '../src/render/transformHandles';
import { startTransform, transformedCorners } from '../src/render/transform';
import { matchingPixelRatio } from '../src/render/compare';
import { centered, fitViewport, screenToDocument, zoomAround, documentToScreen } from '../src/ui/viewport';
import { surfaceFromPixels } from '../src/model/surface';
import { solidPixels, testLayer } from './fixtures';

const start = startTransform(testLayer('a', 0, 0, 10, 20, [0, 0, 0, 255]));

describe('transform handles', () => {
  it('lists eight handles around the box', () => {
    const handles = scaleHandles(start);
    expect(handles).toHaveLength(8);
    expect(handles[0].point).toEqual({ x: 0, y: 0 });
    expect(handles[4].point).toEqual({ x: 10, y: 20 });
  });

  it('scales from a corner while the opposite corner stays put', () => {
    const result = dragScale(start, 1, 1, { x: 20, y: 40 }, false);
    expect(result.scaleX).toBeCloseTo(2);
    expect(result.scaleY).toBeCloseTo(2);
    const corners = transformedCorners(result);
    expect(corners[0].x).toBeCloseTo(0);
    expect(corners[0].y).toBeCloseTo(0);
    expect(corners[2].x).toBeCloseTo(20);
    expect(corners[2].y).toBeCloseTo(40);
  });

  it('scales one axis from an edge handle', () => {
    const result = dragScale(start, 1, 0, { x: 15, y: 999 }, false);
    expect(result.scaleX).toBeCloseTo(1.5);
    expect(result.scaleY).toBe(1);
    expect(transformedCorners(result)[0].x).toBeCloseTo(0);
  });

  it('keeps proportions when asked', () => {
    const result = dragScale(start, 1, 1, { x: 30, y: 25 }, true);
    expect(result.scaleX).toBeCloseTo(result.scaleY);
    expect(result.scaleX).toBeCloseTo(3);
  });

  it('never collapses below the minimum scale', () => {
    const result = dragScale(start, 1, 1, { x: -50, y: -50 }, false);
    expect(result.scaleX).toBeGreaterThan(0);
    expect(result.scaleY).toBeGreaterThan(0);
  });

  it('rotates around the center and snaps', () => {
    const free = dragRotate(start, { x: 15, y: 10 }, { x: 5, y: 20 }, false);
    expect(free.rotation).toBeCloseTo(Math.PI / 2);
    const snapped = dragRotate(start, { x: 15, y: 10 }, { x: 15, y: 10.6 }, true);
    expect(snapped.rotation).toBe(0);
  });

  it('moves the box', () => {
    expect(dragMove(start, 3, 4)).toMatchObject({ translateX: 3, translateY: 4 });
  });

  it('tests points against the box', () => {
    const corners = transformedCorners(start);
    expect(pointInQuad({ x: 5, y: 5 }, corners)).toBe(true);
    expect(pointInQuad({ x: 15, y: 5 }, corners)).toBe(false);
  });
});

describe('viewport math', () => {
  it('fits and centers the document', () => {
    const viewport = fitViewport({ width: 1000, height: 500 }, { width: 564, height: 564 });
    expect(viewport.zoom).toBeCloseTo(0.5);
    expect(viewport.x).toBeCloseTo(32);
    expect(centered({ width: 10, height: 10 }, { width: 30, height: 30 }, 1)).toEqual({ zoom: 1, x: 10, y: 10 });
  });

  it('keeps the point under the cursor fixed while zooming', () => {
    const viewport = { zoom: 1, x: 10, y: 20 };
    const zoomed = zoomAround(viewport, 4, 110, 120);
    const before = screenToDocument(viewport, 110, 120);
    const after = documentToScreen(zoomed, before.x, before.y);
    expect(after.x).toBeCloseTo(110);
    expect(after.y).toBeCloseTo(120);
  });
});

describe('composite comparison', () => {
  it('reports the share of matching pixels', () => {
    const a = surfaceFromPixels(2, 1, new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 255]));
    const b = surfaceFromPixels(2, 1, new Uint8ClampedArray([254, 0, 0, 255, 255, 255, 255, 255]));
    expect(matchingPixelRatio(a, b)).toBe(0.5);
    expect(matchingPixelRatio(a, surfaceFromPixels(1, 1, solidPixels(1, 1, [0, 0, 0, 0])))).toBeNull();
  });
});
