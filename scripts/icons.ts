import { writeFileSync } from 'node:fs';
import { createCanvas } from '@napi-rs/canvas';

function drawIcon(size: number): Buffer {
  const canvas = createCanvas(size, size);
  const context = canvas.getContext('2d');
  const scale = size / 64;
  context.scale(scale, scale);
  context.fillStyle = '#1d2027';
  context.beginPath();
  context.roundRect(0, 0, 64, 64, 14);
  context.fill();
  const layers: [string, number][] = [
    ['#b9e0ff', 16],
    ['#7cc4ff', 8],
  ];
  for (const [color, offset] of layers) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(15.5, 23.2 + offset);
    context.lineTo(32, 32.4 + offset);
    context.lineTo(48.5, 23.2 + offset);
    context.lineTo(52, 25 + offset);
    context.lineTo(32, 36 + offset);
    context.lineTo(12, 25 + offset);
    context.closePath();
    context.fill();
  }
  context.fillStyle = '#4da3ff';
  context.beginPath();
  context.moveTo(32, 14);
  context.lineTo(52, 25);
  context.lineTo(32, 36);
  context.lineTo(12, 25);
  context.closePath();
  context.fill();
  return canvas.toBuffer('image/png');
}

for (const size of [192, 512]) {
  writeFileSync(`public/icon-${size}.png`, drawIcon(size));
}
