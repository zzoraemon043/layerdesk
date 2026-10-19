import { readPsd, type Psd } from 'ag-psd';
import { describe, expect, it } from 'vitest';
import { duplicateNodes, groupNodes, moveBy, moveNodes, replaceLayerPixels, setProperties } from '../src/model/commands';
import { createSurface } from '../src/model/surface';
import { readOnlyReason } from '../src/psd/fromPsd';
import { readDocument, readOptions, writeDocument } from '../src/psd/io';
import { psdFromDocument } from '../src/psd/toPsd';
import { composeDocument } from '../src/render/compose';
import type { LayerDocument } from '../src/model/types';
import { byName, psdBuffer, samplePsd, sampleDocument, solidLayer, solidPixels } from './fixtures';

function roundTrip(document: LayerDocument): { document: LayerDocument; psd: Psd } {
  const { buffer } = writeDocument(document, composeDocument(document));
  return { document: readDocument(buffer, 'out.psd'), psd: readPsd(buffer, readOptions) };
}

describe('reading', () => {
  it('builds the layer tree with properties', () => {
    const document = sampleDocument();
    expect(document.width).toBe(64);
    expect(document.children.map((node) => node.name)).toEqual(['background', 'body', 'sketch']);
    expect(byName(document, 'head')).toMatchObject({ kind: 'layer', left: 20, top: 4, width: 12, height: 12, opacity: expect.closeTo(0.5, 2) });
    expect(byName(document, 'sketch')).toMatchObject({ hidden: true, blendMode: 'multiply' });
    expect(byName(document, 'body')).toMatchObject({ kind: 'group', opened: true, blendMode: 'pass through' });
    expect(document.storedComposite?.width).toBe(64);
  });

  it('reports documents that cannot be saved back', () => {
    const document = sampleDocument();
    expect(readOnlyReason(document)).toBeNull();
    expect(readOnlyReason({ ...document, source: { ...document.source, bitsPerChannel: 16 } })).toBe('bit-depth');
    expect(readOnlyReason({ ...document, source: { ...document.source, colorMode: 4 } })).toBe('color-mode');
  });

  it('ignores a stored preview that is fully transparent', () => {
    const psd = samplePsd();
    psd.imageData = { width: 64, height: 48, data: new Uint8ClampedArray(64 * 48 * 4) };
    expect(sampleDocument(psd).storedComposite).toBeNull();
  });

  it('reads empty layers without pixels', () => {
    const psd = samplePsd();
    psd.children!.push({ name: 'empty' });
    const document = sampleDocument(psd);
    expect(byName(document, 'empty')).toMatchObject({ kind: 'layer', width: 0, height: 0, surface: null });
  });
});

describe('writing', () => {
  it('keeps names, order, properties and pixels when nothing changed', () => {
    const original = sampleDocument();
    const { document } = roundTrip(original);
    expect(document.children.map((node) => node.name)).toEqual(['background', 'body', 'sketch']);
    expect(byName(document, 'sketch')).toMatchObject({ hidden: true, blendMode: 'multiply' });
    const before = byName(original, 'arm');
    const after = byName(document, 'arm');
    expect(after.kind === 'layer' && after.originalPixels?.data).toEqual(before.kind === 'layer' && before.originalPixels?.data);
  });

  it('writes moved positions and keeps the original pixel bytes', () => {
    const original = sampleDocument();
    const moved = moveBy(original, [byName(original, 'body').id], 7, 3);
    const { document } = roundTrip(moved);
    expect(byName(document, 'arm')).toMatchObject({ left: 17, top: 13, width: 8, height: 6 });
    expect(byName(document, 'head')).toMatchObject({ left: 27, top: 7 });
  });

  it('writes edits to properties, order and groups', () => {
    let document = sampleDocument();
    document = setProperties(document, [byName(document, 'arm').id], { name: 'arm left', hidden: true, opacity: 0.3, blendMode: 'screen', locked: true });
    document = moveNodes(document, [byName(document, 'sketch').id], byName(document, 'background').id, 'below');
    document = groupNodes(document, [byName(document, 'background').id], 'base').document;
    document = duplicateNodes(document, [byName(document, 'head').id], ' copy').document;
    const { document: result } = roundTrip(document);
    expect(result.children.map((node) => node.name)).toEqual(['sketch', 'base', 'body']);
    const body = byName(result, 'body');
    expect(body.kind === 'group' && body.children.map((child) => child.name)).toEqual(['arm left', 'head', 'head copy']);
    expect(byName(result, 'arm left')).toMatchObject({ hidden: true, blendMode: 'screen', locked: true, opacity: expect.closeTo(0.3, 2) });
  });

  it('writes replaced pixels', () => {
    const original = sampleDocument();
    const surface = createSurface(2, 2);
    surface.getContext('2d')!.fillStyle = 'rgb(0, 255, 0)';
    surface.getContext('2d')!.fillRect(0, 0, 2, 2);
    const edited = replaceLayerPixels(original, byName(original, 'arm').id, surface, 1, 1);
    const { psd } = roundTrip(edited);
    const arm = psd.children![1].children![0];
    expect(arm).toMatchObject({ left: 1, top: 1, right: 3, bottom: 3 });
    expect(Array.from(arm.imageData!.data.slice(0, 4))).toEqual([0, 255, 0, 255]);
  });

  it('writes the composite image', () => {
    const document = sampleDocument();
    const { psd } = roundTrip(document);
    expect(Array.from(psd.imageData!.data.slice(0, 4))).toEqual([255, 255, 255, 255]);
    const armPixel = (10 * 64 + 10) * 4;
    expect(Array.from(psd.imageData!.data.slice(armPixel, armPixel + 4))).toEqual([255, 0, 0, 255]);
  });

  it('moves text transforms, smart object transforms and vector masks with the layer', () => {
    const psd = samplePsd();
    psd.children!.push(
      solidLayer('title', 4, 4, 10, 4, [0, 0, 0, 255], { text: { text: 'hi', transform: [1, 0, 0, 1, 4, 8] } }),
      solidLayer('placed', 4, 4, 10, 10, [0, 0, 0, 255], {
        placedLayer: { id: '20953ddb-9391-11ec-b4f1-c15674f50bc4', type: 'raster', width: 10, height: 10, transform: [4, 4, 14, 4, 14, 14, 4, 14] },
      }),
      solidLayer('shape', 4, 4, 10, 10, [0, 0, 0, 255], {
        vectorMask: { paths: [{ open: false, fillRule: 'non-zero', knots: [{ linked: true, points: [4, 4, 4, 4, 4, 4] }] }] },
      }),
    );
    const document = readDocument(psdBuffer(psd), 'shapes.psd');
    const moved = moveBy(document, ['title', 'placed', 'shape'].map((name) => byName(document, name).id), 10, 20);
    const { psd: output } = psdFromDocument(moved, composeDocument(moved));
    const [title, placed, shape] = output.children!.slice(-3);
    expect(title.text?.transform?.slice(4)).toEqual([14, 28]);
    expect(placed.placedLayer?.transform).toEqual([14, 24, 24, 24, 24, 34, 14, 34]);
    shape.vectorMask!.paths[0].knots[0].points.forEach((value, index) => expect(value).toBeCloseTo(index % 2 === 0 ? 14 : 24, 3));
  });

  it('drops vector and text data from layers whose pixels were resampled and reports them', () => {
    const psd = samplePsd();
    psd.children!.push(solidLayer('title', 4, 4, 10, 4, [0, 0, 0, 255], { text: { text: 'hi', transform: [1, 0, 0, 1, 4, 8] } }));
    const document = readDocument(psdBuffer(psd), 'text.psd');
    const edited = replaceLayerPixels(document, byName(document, 'title').id, createSurface(5, 5), 0, 0);
    const { psd: output, report } = psdFromDocument(edited, composeDocument(edited));
    expect(output.children!.at(-1)!.text).toBeUndefined();
    expect(report.rasterized).toEqual(['title']);
  });

  it('round trips layer masks', () => {
    const psd = samplePsd();
    const maskData = solidPixels(4, 4, [0, 0, 0, 255]);
    psd.children!.push(
      solidLayer('masked', 0, 0, 8, 8, [255, 0, 0, 255], { mask: { left: 2, top: 2, right: 6, bottom: 6, defaultColor: 255, imageData: { width: 4, height: 4, data: maskData } } }),
    );
    const document = readDocument(psdBuffer(psd), 'mask.psd');
    expect(byName(document, 'masked').mask).toMatchObject({ left: 2, top: 2, width: 4, height: 4, defaultColor: 255 });
    const moved = moveBy(document, [byName(document, 'masked').id], 1, 1);
    const { document: result } = roundTrip(moved);
    expect(byName(result, 'masked').mask).toMatchObject({ left: 3, top: 3, width: 4, height: 4 });
  });
});
