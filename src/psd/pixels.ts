import type { PixelData } from 'ag-psd';

export function toEightBit(pixels: PixelData): Uint8ClampedArray {
  const { data } = pixels;
  if (data instanceof Uint8ClampedArray) {
    return data;
  }
  if (data instanceof Uint8Array) {
    return new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  }
  const output = new Uint8ClampedArray(data.length);
  if (data instanceof Uint16Array) {
    for (let index = 0; index < data.length; index++) {
      output[index] = data[index] >> 8;
    }
    return output;
  }
  for (let index = 0; index < data.length; index++) {
    output[index] = Math.round(Math.min(1, Math.max(0, data[index])) * 255);
  }
  return output;
}

export function grayToAlpha(gray: Uint8ClampedArray): Uint8ClampedArray {
  const output = new Uint8ClampedArray(gray.length);
  for (let index = 0; index < gray.length; index += 4) {
    output[index + 3] = gray[index];
  }
  return output;
}
