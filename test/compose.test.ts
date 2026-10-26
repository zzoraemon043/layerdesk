import { describe, expect, it } from 'vitest';
import { createGroup } from '../src/model/commands';
import { surfaceFromPixels } from '../src/model/surface';
import { compositeOperationFor, isBlendModeRendered } from '../src/render/blend';
import { composeDocument, createCompositor } from '../src/render/compose';
import { pixelAt, solidPixels, testDocument, testLayer } from './fixtures';

const white = testLayer('white', 0, 0, 20, 20, [255, 255, 255, 255]);

describe('blend mode mapping', () => {
  it('maps supported modes and falls back to normal', () => {
    expect(compositeOperationFor('multiply')).toBe('multiply');
    expect(compositeOperationFor('linear dodge')).toBe('lighter');
    expect(compositeOperationFor('vivid light')).toBe('source-over');
    expect(isBlendModeRendered('vivid light')).toBe(false);
    expect(isBlendModeRendered('pass through')).toBe(true);
  });
});

describe('composeDocument', () => {
  it('draws layers at their positions', () => {
    const red = testLayer('red', 5, 5, 4, 4, [255, 0, 0, 255]);
    const surface = composeDocument(testDocument([white, red]));
    expect(pixelAt(surface, 6, 6)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(surface, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it('skips hidden layers and hidden groups', () => {
    const red = testLayer('red', 5, 5, 4, 4, [255, 0, 0, 255], { hidden: true });
    const blue = testLayer('blue', 0, 0, 4, 4, [0, 0, 255, 255]);
    const group = { ...createGroup('g', [blue]), hidden: true };
    const surface = composeDocument(testDocument([white, red, group]));
    expect(pixelAt(surface, 6, 6)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(surface, 1, 1)).toEqual([255, 255, 255, 255]);
  });

  it('applies opacity and blend modes', () => {
    const half = testLayer('half', 0, 0, 4, 4, [0, 0, 0, 255], { opacity: 0.5 });
    const gray = testLayer('gray', 10, 10, 4, 4, [128, 128, 128, 255], { blendMode: 'multiply' });
    const red = testLayer('red', 10, 10, 20, 20, [255, 0, 0, 255]);
    const surface = composeDocument(testDocument([white, half, red, gray]));
    const [r] = pixelAt(surface, 1, 1);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
    expect(pixelAt(surface, 11, 11)[0]).toBeGreaterThan(120);
    expect(pixelAt(surface, 11, 11)[1]).toBe(0);
  });

  it('applies group opacity once to the whole group', () => {
    const a = testLayer('a', 0, 0, 10, 10, [0, 0, 0, 255]);
    const b = testLayer('b', 0, 0, 10, 10, [0, 0, 0, 255]);
    const group = { ...createGroup('g', [a, b]), opacity: 0.5, blendMode: 'normal' as const };
    const surface = composeDocument(testDocument([white, group]));
    const [r] = pixelAt(surface, 2, 2);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
  });

  it('clips layers to their base layer', () => {
    const base = testLayer('base', 0, 0, 5, 5, [0, 0, 255, 255]);
    const clipped = testLayer('clipped', 0, 0, 10, 10, [255, 0, 0, 255], { clipping: true });
    const surface = composeDocument(testDocument([base, clipped]));
    expect(pixelAt(surface, 2, 2)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(surface, 7, 7)[3]).toBe(0);
  });

  it('applies the blend mode and opacity of clipped layers', () => {
    const base = testLayer('base', 0, 0, 5, 5, [0, 0, 255, 255]);
    const multiply = testLayer('multiply', 0, 0, 10, 10, [0, 255, 0, 255], { clipping: true, blendMode: 'multiply' });
    const surface = composeDocument(testDocument([base, multiply]));
    expect(pixelAt(surface, 2, 2)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(surface, 7, 7)[3]).toBe(0);

    const screen = testLayer('screen', 0, 0, 10, 10, [255, 0, 0, 255], { clipping: true, blendMode: 'screen', opacity: 0.5 });
    const [r, g, b, a] = pixelAt(composeDocument(testDocument([base, screen])), 2, 2);
    expect(r).toBeGreaterThan(120);
    expect(r).toBeLessThan(135);
    expect([g, b, a]).toEqual([0, 255, 255]);
  });

  it('hides clipped layers when the base layer is hidden', () => {
    const base = testLayer('base', 0, 0, 5, 5, [0, 0, 255, 255], { hidden: true });
    const clipped = testLayer('clipped', 0, 0, 10, 10, [255, 0, 0, 255], { clipping: true });
    const surface = composeDocument(testDocument([base, clipped]));
    expect(pixelAt(surface, 2, 2)[3]).toBe(0);
  });

  it('applies layer masks with their default color', () => {
    const maskSurface = surfaceFromPixels(2, 2, solidPixels(2, 2, [0, 0, 0, 255]));
    const hidesInside = testLayer('a', 0, 0, 10, 10, [255, 0, 0, 255], {
      mask: { left: 0, top: 0, width: 2, height: 2, defaultColor: 0, disabled: false, surface: maskSurface },
    });
    const surface = composeDocument(testDocument([hidesInside]));
    expect(pixelAt(surface, 1, 1)[3]).toBe(255);
    expect(pixelAt(surface, 5, 5)[3]).toBe(0);
    const disabled = composeDocument(testDocument([{ ...hidesInside, mask: { ...hidesInside.mask!, disabled: true } }]));
    expect(pixelAt(disabled, 5, 5)[3]).toBe(255);
  });

  it('draws the transform preview for the target layer', () => {
    const red = testLayer('red', 0, 0, 2, 2, [255, 0, 0, 255]);
    const surface = composeDocument(testDocument([red]), { id: red.id, matrix: [1, 0, 0, 1, 10, 10] });
    expect(pixelAt(surface, 0, 0)[3]).toBe(0);
    expect(pixelAt(surface, 10, 10)).toEqual([255, 0, 0, 255]);
  });

  it('reuses cached group renders but redraws changed groups', () => {
    const compositor = createCompositor();
    const blue = testLayer('blue', 0, 0, 4, 4, [0, 0, 255, 255]);
    const group = { ...createGroup('g', [blue]), blendMode: 'normal' as const };
    const first = compositor.render(testDocument([group]));
    const movedGroup = { ...group, children: [{ ...blue, left: 10, top: 10 }] };
    const second = compositor.render(testDocument([movedGroup]));
    expect(pixelAt(first, 1, 1)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(second, 1, 1)[3]).toBe(0);
    expect(pixelAt(second, 11, 11)).toEqual([0, 0, 255, 255]);
  });

  it('renders groups and masks away from the origin and clipped to the canvas', () => {
    const inner = testLayer('inner', 15, 15, 10, 10, [255, 0, 0, 255]);
    const group = { ...createGroup('g', [inner]), blendMode: 'normal' as const };
    const maskSurface = surfaceFromPixels(2, 2, solidPixels(2, 2, [0, 0, 0, 255]));
    const masked = testLayer('masked', 4, 4, 6, 6, [0, 0, 255, 255], {
      mask: { left: 5, top: 5, width: 2, height: 2, defaultColor: 0, disabled: false, surface: maskSurface },
    });
    const surface = composeDocument(testDocument([group, masked]));
    expect(pixelAt(surface, 17, 17)).toEqual([255, 0, 0, 255]);
    expect(pixelAt(surface, 14, 14)[3]).toBe(0);
    expect(pixelAt(surface, 5, 5)).toEqual([0, 0, 255, 255]);
    expect(pixelAt(surface, 4, 4)[3]).toBe(0);
    expect(pixelAt(surface, 8, 8)[3]).toBe(0);
  });

  it('clips a layer that sits inside a translated group', () => {
    const base = testLayer('base', 10, 10, 4, 4, [0, 0, 255, 255]);
    const clipped = testLayer('clipped', 8, 8, 10, 10, [0, 255, 0, 255], { clipping: true });
    const group = { ...createGroup('g', [base, clipped]), blendMode: 'normal' as const, opacity: 1 };
    const surface = composeDocument(testDocument([group]));
    expect(pixelAt(surface, 11, 11)).toEqual([0, 255, 0, 255]);
    expect(pixelAt(surface, 9, 9)[3]).toBe(0);
  });
});
