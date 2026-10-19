import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeCanvas, readPsd, writePsd, type Layer, type Psd } from 'ag-psd';
import type { Download, Page } from '@playwright/test';

initializeCanvas(
  () => {
    throw new Error('Canvas is not available');
  },
  (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4), colorSpace: 'srgb' }) as ImageData,
);

function solid(name: string, left: number, top: number, width: number, height: number, color: [number, number, number], extra: Partial<Layer> = {}): Layer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data.set([...color, 255], index);
  }
  return { name, left, top, right: left + width, bottom: top + height, imageData: { width, height, data }, ...extra };
}

export function writeFixture(): string {
  const psd: Psd = {
    width: 200,
    height: 200,
    children: [
      solid('paper', 0, 0, 200, 200, [250, 250, 250]),
      { name: 'figure', opened: true, children: [solid('torso', 60, 80, 80, 90, [40, 110, 200]), solid('face', 70, 20, 60, 60, [240, 190, 150])] },
      solid('tone', 20, 170, 160, 20, [90, 90, 90], { blendMode: 'multiply' }),
    ],
  };
  const directory = mkdtempSync(join(tmpdir(), 'layerdesk-'));
  const path = join(directory, 'figure.psd');
  writeFileSync(path, Buffer.from(writePsd(psd, { generateThumbnail: false })));
  return path;
}

export async function openFixture(page: Page) {
  await page.goto('/');
  await page.getByTestId('file-input').setInputFiles(writeFixture());
  await page.getByTestId('layer-row').first().waitFor();
}

export async function readDownload(download: Download): Promise<Buffer> {
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export function parseSaved(buffer: Buffer): Psd {
  return readPsd(new Uint8Array(buffer).buffer, { useImageData: true });
}

export function layerNamed(psd: Psd, name: string): Layer {
  const search = (layers: Layer[] = []): Layer | undefined => {
    for (const layer of layers) {
      if (layer.name === name) {
        return layer;
      }
      const found = search(layer.children);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  const found = search(psd.children);
  if (!found) {
    throw new Error(`Missing layer ${name}`);
  }
  return found;
}

export async function canvasPoint(page: Page, x: number, y: number) {
  const box = (await page.getByTestId('canvas').boundingBox())!;
  const zoomText = await page.locator('.zoom-readout').innerText();
  const zoom = Number(zoomText.replace('%', '')) / 100;
  const documentSize = 200 * zoom;
  const originX = box.x + (box.width - documentSize) / 2;
  const originY = box.y + (box.height - documentSize) / 2;
  return { x: originX + x * zoom, y: originY + y * zoom };
}
