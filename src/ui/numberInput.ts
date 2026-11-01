export const maxPositionMagnitude = 1_000_000;

export function parsePositionInput(text: string): number | null {
  if (text.trim() === '') {
    return null;
  }
  const value = Number(text);
  if (!Number.isFinite(value) || Math.abs(value) > maxPositionMagnitude) {
    return null;
  }
  return Math.round(value);
}
