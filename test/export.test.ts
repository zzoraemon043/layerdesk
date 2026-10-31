import { unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createGroup } from '../src/model/commands';
import { surfaceFromPixels } from '../src/model/surface';
import { buildLayerZip, maskedLayerSurface, planLayerExport, safeFileName } from '../src/export/layerExport';
import { pixelAt, solidPixels, testDocument, testLayer } from './fixtures';

describe('layer export', () => {
  const arm = testLayer('arm', 2, 3, 4, 4, [255, 0, 0, 255]);
  const armAgain = testLayer('arm', 0, 0, 2, 2, [0, 255, 0, 255]);
  const empty = testLayer('empty', 0, 0, 0, 0, [0, 0, 0, 0]);
  const hidden = testLayer('a/b', 0, 0, 2, 2, [0, 0, 255, 255], { hidden: true });
  const group = createGroup('body', [arm, armAgain]);
  const document = testDocument([group, empty, hidden]);

  it('makes file names safe', () => {
    expect(safeFileName('a/b:c')).toBe('a_b_c');
    expect(safeFileName('  ')).toBe('layer');
    expect(safeFileName('..')).toBe('layer');
    expect(safeFileName('arm.')).toBe('arm');
    expect(safeFileName('a\nb')).toBe('a_b');
    expect(safeFileName('NUL')).toBe('_NUL');
    expect(safeFileName('com1.v2')).toBe('_com1.v2');
    expect(safeFileName('console')).toBe('console');
  });

  it('does not reuse a path that differs only by case', () => {
    const doc = testDocument([testLayer('Hand', 0, 0, 2, 2, [1, 2, 3, 255]), testLayer('hand', 0, 0, 2, 2, [1, 2, 3, 255])]);
    expect(planLayerExport(doc, false).map(({ entry }) => entry.path)).toEqual(['Hand.png', 'hand_2.png']);
  });

  it('plans unique paths, skips empty layers and records visibility', () => {
    const flat = planLayerExport(document, false).map(({ entry }) => entry);
    expect(flat.map((entry) => entry.path)).toEqual(['arm.png', 'arm_2.png', 'a_b.png']);
    expect(flat[0]).toMatchObject({ left: 2, top: 3, width: 4, height: 4, visible: true, order: 0 });
    expect(flat[2].visible).toBe(false);
  });

  it('keeps group folders when asked', () => {
    const paths = planLayerExport(document, true).map(({ entry }) => entry.path);
    expect(paths).toEqual(['body/arm.png', 'body/arm_2.png', 'a_b.png']);
  });

  it('applies the layer mask to exported pixels', () => {
    const maskSurface = surfaceFromPixels(1, 1, solidPixels(1, 1, [0, 0, 0, 255]));
    const masked = { ...arm, mask: { left: 2, top: 3, width: 1, height: 1, defaultColor: 0, disabled: false, surface: maskSurface } };
    const surface = maskedLayerSurface(masked)!;
    expect(pixelAt(surface, 0, 0)[3]).toBe(255);
    expect(pixelAt(surface, 2, 2)[3]).toBe(0);
  });

  it('builds a zip with every layer and a manifest', async () => {
    const zip = await buildLayerZip(document, true, async () => new Uint8Array([1, 2, 3]));
    const files = unzipSync(zip);
    expect(Object.keys(files).sort()).toEqual(['a_b.png', 'body/arm.png', 'body/arm_2.png', 'layers.json']);
    const manifest = JSON.parse(new TextDecoder().decode(files['layers.json']));
    expect(manifest).toMatchObject({ width: 20, height: 20 });
    expect(manifest.layers).toHaveLength(3);
  });
});
