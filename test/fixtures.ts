import { writePsd, type Layer, type Psd } from 'ag-psd';
import { readDocument } from '../src/psd/io';
import { surfaceFromPixels } from '../src/model/surface';
import type { LayerDocument, PixelLayer } from '../src/model/types';
import { createNodeId } from '../src/model/ids';

export type Rgba = [number, number, number, number];

export function solidPixels(width: number, height: number, color: Rgba): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set(color, index);
  }
  return data;
}

export function solidLayer(name: string, left: number, top: number, width: number, height: number, color: Rgba, extra: Partial<Layer> = {}): Layer {
  return {
    name,
    left,
    top,
    right: left + width,
    bottom: top + height,
    imageData: { width, height, data: solidPixels(width, height, color) },
    ...extra,
  };
}

export function samplePsd(): Psd {
  return {
    width: 64,
    height: 48,
    imageData: { width: 64, height: 48, data: solidPixels(64, 48, [255, 255, 255, 255]) },
    children: [
      solidLayer('background', 0, 0, 64, 48, [255, 255, 255, 255]),
      {
        name: 'body',
        opened: true,
        children: [
          solidLayer('arm', 10, 10, 8, 6, [255, 0, 0, 255]),
          solidLayer('head', 20, 4, 12, 12, [0, 0, 255, 255], { opacity: 0.5 }),
        ],
      },
      solidLayer('sketch', 30, 30, 10, 10, [0, 255, 0, 255], { hidden: true, blendMode: 'multiply' }),
    ],
  };
}

export function psdBuffer(psd: Psd): ArrayBuffer {
  return writePsd(psd, { generateThumbnail: false });
}

export function sampleDocument(psd: Psd = samplePsd()): LayerDocument {
  return readDocument(psdBuffer(psd), 'sample.psd');
}

export function testLayer(name: string, left: number, top: number, width: number, height: number, color: Rgba, extra: Partial<PixelLayer> = {}): PixelLayer {
  return {
    kind: 'layer',
    id: createNodeId(),
    name,
    hidden: false,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'normal',
    clipping: false,
    locked: false,
    mask: null,
    offsetX: 0,
    offsetY: 0,
    source: {},
    left,
    top,
    width,
    height,
    surface: width > 0 && height > 0 ? surfaceFromPixels(width, height, solidPixels(width, height, color)) : null,
    originalPixels: null,
    pixelsEdited: false,
    ...extra,
  };
}

export function testDocument(children: LayerDocument['children'], width = 20, height = 20): LayerDocument {
  return { width, height, children, source: { width, height }, storedComposite: null, fileName: 'test.psd' };
}

export function pixelAt(surface: { getContext(type: '2d'): CanvasRenderingContext2D | null }, x: number, y: number): Rgba {
  const data = surface.getContext('2d')!.getImageData(x, y, 1, 1).data;
  return [data[0], data[1], data[2], data[3]];
}

export function byName(document: LayerDocument, name: string) {
  const search = (nodes: LayerDocument['children']): LayerDocument['children'][number] | undefined => {
    for (const node of nodes) {
      if (node.name === name) {
        return node;
      }
      if (node.kind === 'group') {
        const found = search(node.children);
        if (found) {
          return found;
        }
      }
    }
    return undefined;
  };
  const found = search(document.children);
  if (!found) {
    throw new Error(`No node named ${name}`);
  }
  return found;
}
