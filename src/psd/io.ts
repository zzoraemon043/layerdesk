import { initializeCanvas, readPsd, writePsd, type Psd } from 'ag-psd';
import type { Surface } from '../model/surface';
import type { LayerDocument } from '../model/types';
import { documentFromPsd } from './fromPsd';
import { psdFromDocument, type SaveReport } from './toPsd';

function createWorkerCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof OffscreenCanvas === 'undefined') {
    throw new Error('Canvas is not available');
  }
  return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement;
}

function createPlainImageData(width: number, height: number): ImageData {
  return { width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' } as ImageData;
}

initializeCanvas(createWorkerCanvas, createPlainImageData);

export const readOptions = { useImageData: true, skipThumbnail: true } as const;
export const writeOptions = { generateThumbnail: false } as const;

export function parsePsd(buffer: ArrayBuffer): Psd {
  return readPsd(buffer, readOptions);
}

export function encodePsd(psd: Psd): ArrayBuffer {
  return writePsd(psd, writeOptions);
}

export function readDocument(buffer: ArrayBuffer, fileName: string): LayerDocument {
  return documentFromPsd(parsePsd(buffer), fileName);
}

export function writeDocument(document: LayerDocument, composite: Surface): { buffer: ArrayBuffer; report: SaveReport } {
  const { psd, report } = psdFromDocument(document, composite);
  return { buffer: encodePsd(psd), report };
}
