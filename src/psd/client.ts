import type { Psd } from 'ag-psd';
import PsdWorker from './worker?worker';
import type { WorkerRequest, WorkerResponse } from './worker';

type Pending = { resolve: (value: Psd | ArrayBuffer) => void; reject: (error: Error) => void };

let worker: Worker | null = null;
let nextRequestId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker {
  if (worker) {
    return worker;
  }
  worker = new PsdWorker();
  worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    pending.delete(response.id);
    if (!request) {
      return;
    }
    if (response.ok) {
      request.resolve(response.result);
    } else {
      request.reject(new Error(response.error));
    }
  };
  worker.onerror = (event) => {
    for (const request of pending.values()) {
      request.reject(new Error(event.message || 'Worker failed'));
    }
    pending.clear();
    worker?.terminate();
    worker = null;
  };
  return worker;
}

type RequestBody = { type: 'parse'; buffer: ArrayBuffer } | { type: 'encode'; psd: Psd };

function send(body: RequestBody, transfer: Transferable[]): Promise<Psd | ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const id = nextRequestId++;
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, ...body } as WorkerRequest, transfer);
  });
}

export async function parseInWorker(buffer: ArrayBuffer): Promise<Psd> {
  return (await send({ type: 'parse', buffer }, [buffer])) as Psd;
}

export async function encodeInWorker(psd: Psd): Promise<ArrayBuffer> {
  return (await send({ type: 'encode', psd }, [])) as ArrayBuffer;
}
