import { describe, expect, it } from 'vitest';
import { parsePositionInput } from '../src/ui/numberInput';

describe('parsePositionInput', () => {
  it('rejects blank text instead of reading it as zero', () => {
    expect(parsePositionInput('')).toBeNull();
    expect(parsePositionInput('   ')).toBeNull();
  });

  it('rejects non-numeric and non-finite text', () => {
    expect(parsePositionInput('abc')).toBeNull();
    expect(parsePositionInput('Infinity')).toBeNull();
  });

  it('rejects magnitudes far outside any canvas', () => {
    expect(parsePositionInput('1e21')).toBeNull();
    expect(parsePositionInput('-2000000')).toBeNull();
  });

  it('rounds valid values and keeps zero', () => {
    expect(parsePositionInput('0')).toBe(0);
    expect(parsePositionInput('12.6')).toBe(13);
    expect(parsePositionInput('-40')).toBe(-40);
  });
});
