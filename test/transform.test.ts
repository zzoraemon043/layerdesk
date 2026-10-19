import { describe, expect, it } from 'vitest';
import { pickLayer, layersAt } from '../src/render/hitTest';
import { applyMatrix, bakeTransform, isIdentity, matrixOf, startTransform, transformedCorners } from '../src/render/transform';
import { createGroup } from '../src/model/commands';
import { pixelAt, testDocument, testLayer } from './fixtures';

describe('free transform', () => {
  const layer = testLayer('a', 10, 10, 4, 2, [255, 0, 0, 255]);

  it('starts as identity', () => {
    const transform = startTransform(layer);
    expect(isIdentity(transform)).toBe(true);
    expect(applyMatrix(matrixOf(transform), { x: 3, y: 4 })).toEqual({ x: 3, y: 4 });
  });

  it('scales around the center', () => {
    const transform = { ...startTransform(layer), scaleX: 2, scaleY: 2 };
    const corners = transformedCorners(transform);
    expect(corners[0]).toEqual({ x: 8, y: 9 });
    expect(corners[2]).toEqual({ x: 16, y: 13 });
  });

  it('bakes a rotation into a new surface with swapped size', () => {
    const transform = { ...startTransform(layer), rotation: Math.PI / 2 };
    const baked = bakeTransform(layer, transform)!;
    expect(baked.surface.width).toBe(2);
    expect(baked.surface.height).toBe(4);
    expect(baked.left).toBe(11);
    expect(baked.top).toBe(9);
    expect(pixelAt(baked.surface, 1, 2)).toEqual([255, 0, 0, 255]);
  });

  it('bakes a translation', () => {
    const transform = { ...startTransform(layer), translateX: 5, translateY: -3 };
    const baked = bakeTransform(layer, transform)!;
    expect([baked.left, baked.top, baked.surface.width, baked.surface.height]).toEqual([15, 7, 4, 2]);
  });

  it('refuses to bake a collapsed transform', () => {
    expect(bakeTransform(layer, { ...startTransform(layer), scaleX: 0 })).toBeNull();
  });
});

describe('hit testing', () => {
  const bottom = testLayer('bottom', 0, 0, 10, 10, [0, 0, 255, 255]);
  const top = testLayer('top', 5, 5, 10, 10, [255, 0, 0, 255]);
  const hidden = testLayer('hidden', 0, 0, 20, 20, [0, 255, 0, 255], { hidden: true });
  const document = testDocument([bottom, top, hidden]);

  it('picks the topmost visible opaque layer', () => {
    expect(pickLayer(document, 6, 6)).toBe(top.id);
    expect(pickLayer(document, 1, 1)).toBe(bottom.id);
    expect(pickLayer(document, 18, 18)).toBeNull();
  });

  it('cycles to the next layer below', () => {
    expect(pickLayer(document, 6, 6, top.id)).toBe(bottom.id);
    expect(pickLayer(document, 6, 6, bottom.id)).toBe(top.id);
  });

  it('ignores layers inside hidden groups', () => {
    const group = { ...createGroup('g', [testLayer('inner', 0, 0, 20, 20, [0, 0, 0, 255])]), hidden: true };
    expect(layersAt(testDocument([group]), 1, 1)).toEqual([]);
  });
});
