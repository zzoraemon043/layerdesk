import { pixelsOf, type Surface } from '../model/surface';

export function matchingPixelRatio(first: Surface, second: Surface, tolerance = 2): number | null {
  if (first.width !== second.width || first.height !== second.height) {
    return null;
  }
  const a = pixelsOf(first).data;
  const b = pixelsOf(second).data;
  let matching = 0;
  const total = a.length / 4;
  for (let index = 0; index < a.length; index += 4) {
    const alphaA = a[index + 3];
    const alphaB = b[index + 3];
    if (alphaA === 0 && alphaB === 0) {
      matching++;
      continue;
    }
    if (
      Math.abs(a[index] - b[index]) <= tolerance &&
      Math.abs(a[index + 1] - b[index + 1]) <= tolerance &&
      Math.abs(a[index + 2] - b[index + 2]) <= tolerance &&
      Math.abs(alphaA - alphaB) <= tolerance
    ) {
      matching++;
    }
  }
  return total === 0 ? 1 : matching / total;
}
