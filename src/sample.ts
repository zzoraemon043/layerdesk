import type { Layer, Psd } from 'ag-psd';
import type { MessageKey } from './i18n/messages';
import { context2d, createSurface, pixelsOf } from './model/surface';

const sampleWidth = 1024;
const sampleHeight = 768;

interface Placement {
  file: string;
  name: MessageKey;
  left: number;
  top: number;
}

const placements: Record<'background' | 'easel' | 'character' | 'cat', Placement> = {
  background: { file: 'background.webp', name: 'sample.background', left: 0, top: 0 },
  easel: { file: 'easel.webp', name: 'sample.easel', left: 110, top: 330 },
  character: { file: 'character.webp', name: 'sample.character', left: 380, top: 220 },
  cat: { file: 'cat.webp', name: 'sample.cat', left: 700, top: 540 },
};

async function loadImage(file: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.src = `${import.meta.env.BASE_URL}sample/${file}`;
  await image.decode();
  return image;
}

async function imageLayer(placement: Placement, name: (key: MessageKey) => string): Promise<Layer> {
  const image = await loadImage(placement.file);
  const surface = createSurface(image.naturalWidth, image.naturalHeight);
  context2d(surface).drawImage(image, 0, 0);
  return {
    name: name(placement.name),
    left: placement.left,
    top: placement.top,
    right: placement.left + surface.width,
    bottom: placement.top + surface.height,
    imageData: pixelsOf(surface),
  };
}

function drawnLayer(name: string, left: number, top: number, width: number, height: number, draw: (context: CanvasRenderingContext2D) => void, extra: Partial<Layer>): Layer {
  const surface = createSurface(width, height);
  draw(context2d(surface));
  return { name, left, top, right: left + width, bottom: top + height, imageData: pixelsOf(surface), ...extra };
}

function shadows(context: CanvasRenderingContext2D) {
  context.fillStyle = '#3d4a3a';
  for (const [x, y, radiusX, radiusY] of [
    [205, 40, 110, 22],
    [430, 40, 120, 26],
    [690, 40, 70, 16],
  ]) {
    context.beginPath();
    context.ellipse(x, y, radiusX, radiusY, 0, 0, Math.PI * 2);
    context.fill();
  }
}

function sketch(context: CanvasRenderingContext2D) {
  context.strokeStyle = '#d0453a';
  context.lineWidth = 3;
  context.setLineDash([12, 8]);
  context.strokeRect(6, 6, 348, 568);
}

export async function samplePsd(name: (key: MessageKey) => string): Promise<Psd> {
  const [background, easel, character, cat] = await Promise.all([
    imageLayer(placements.background, name),
    imageLayer(placements.easel, name),
    imageLayer(placements.character, name),
    imageLayer(placements.cat, name),
  ]);
  const shadow = drawnLayer(name('sample.shadow'), 100, 680, 820, 80, shadows, { blendMode: 'multiply', opacity: 0.35 });
  const guide = drawnLayer(name('sample.sketch'), 350, 180, 360, 580, sketch, { hidden: true });
  return {
    width: sampleWidth,
    height: sampleHeight,
    children: [background, shadow, { name: name('sample.foreground'), opened: true, children: [easel, character, cat] }, guide],
  };
}
