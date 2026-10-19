import type { Layer, Psd } from 'ag-psd';
import type { MessageKey } from './i18n/messages';
import { context2d, createSurface, pixelsOf } from './model/surface';

type Draw = (context: CanvasRenderingContext2D) => void;

const sampleWidth = 512;
const sampleHeight = 512;

function pixelLayer(name: string, left: number, top: number, width: number, height: number, draw: Draw, extra: Partial<Layer> = {}): Layer {
  const surface = createSurface(width, height);
  const context = context2d(surface);
  draw(context);
  return { name, left, top, right: left + width, bottom: top + height, imageData: pixelsOf(surface), ...extra };
}

function ellipse(color: string, width: number, height: number): Draw {
  return (context) => {
    context.fillStyle = color;
    context.beginPath();
    context.ellipse(width / 2, height / 2, width / 2, height / 2, 0, 0, Math.PI * 2);
    context.fill();
  };
}

function roundedRect(color: string, width: number, height: number, radius: number): Draw {
  return (context) => {
    context.fillStyle = color;
    context.beginPath();
    context.roundRect(0, 0, width, height, radius);
    context.fill();
  };
}

export function samplePsd(name: (key: MessageKey) => string): Psd {
  const background = pixelLayer(name('sample.background'), 0, 0, sampleWidth, sampleHeight, (context) => {
    const gradient = context.createLinearGradient(0, 0, 0, sampleHeight);
    gradient.addColorStop(0, '#dfe9f5');
    gradient.addColorStop(1, '#f7efe3');
    context.fillStyle = gradient;
    context.fillRect(0, 0, sampleWidth, sampleHeight);
  });
  const shadow = pixelLayer(name('sample.shadow'), 156, 420, 200, 40, ellipse('#6b6f7a', 200, 40), { blendMode: 'multiply', opacity: 0.45 });
  const body = pixelLayer(name('sample.body'), 196, 230, 120, 190, roundedRect('#3f7cc4', 120, 190, 36));
  const armLeft = pixelLayer(name('sample.armLeft'), 150, 250, 44, 130, roundedRect('#f2c6a0', 44, 130, 22));
  const armRight = pixelLayer(name('sample.armRight'), 318, 250, 44, 130, roundedRect('#f2c6a0', 44, 130, 22));
  const head = pixelLayer(name('sample.head'), 186, 90, 140, 140, ellipse('#f2c6a0', 140, 140));
  const sketch = pixelLayer(
    name('sample.sketch'),
    120,
    60,
    280,
    400,
    (context) => {
      context.strokeStyle = '#d0453a';
      context.lineWidth = 3;
      context.strokeRect(10, 10, 260, 380);
    },
    { hidden: true },
  );
  const character: Layer = { name: name('sample.character'), opened: true, children: [armLeft, body, armRight, head] };
  return {
    width: sampleWidth,
    height: sampleHeight,
    children: [background, shadow, character, sketch],
  };
}
