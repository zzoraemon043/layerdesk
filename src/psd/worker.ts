import type { Layer, Psd } from 'ag-psd';
import { encodePsd, parsePsd } from './io';

export type WorkerRequest = { id: number; type: 'parse'; buffer: ArrayBuffer } | { id: number; type: 'encode'; psd: Psd };

export type WorkerResponse = { id: number; ok: true; result: Psd | ArrayBuffer } | { id: number; ok: false; error: string };

function collectBuffers(psd: Psd): ArrayBuffer[] {
  const buffers = new Set<ArrayBuffer>();
  const add = (data: { buffer: ArrayBufferLike } | undefined) => {
    if (data && data.buffer instanceof ArrayBuffer) {
      buffers.add(data.buffer);
    }
  };
  const visit = (layers: Layer[] | undefined) => {
    for (const layer of layers ?? []) {
      add(layer.imageData?.data);
      add(layer.mask?.imageData?.data);
      add(layer.realMask?.imageData?.data);
      visit(layer.children);
    }
  };
  add(psd.imageData?.data);
  visit(psd.children);
  return [...buffers];
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  try {
    if (request.type === 'parse') {
      const psd = parsePsd(request.buffer);
      self.postMessage({ id: request.id, ok: true, result: psd } satisfies WorkerResponse, { transfer: collectBuffers(psd) });
    } else {
      const buffer = encodePsd(request.psd);
      self.postMessage({ id: request.id, ok: true, result: buffer } satisfies WorkerResponse, { transfer: [buffer] });
    }
  } catch (error) {
    self.postMessage({ id: request.id, ok: false, error: error instanceof Error ? error.message : String(error) } satisfies WorkerResponse);
  }
};
