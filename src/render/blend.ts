import type { BlendMode } from 'ag-psd';

const compositeOperations: Partial<Record<BlendMode, GlobalCompositeOperation>> = {
  normal: 'source-over',
  'pass through': 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color dodge': 'color-dodge',
  'color burn': 'color-burn',
  'hard light': 'hard-light',
  'soft light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
  color: 'color',
  luminosity: 'luminosity',
  'linear dodge': 'lighter',
};

export const editableBlendModes: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color dodge',
  'color burn',
  'linear dodge',
  'hard light',
  'soft light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
];

export function compositeOperationFor(mode: BlendMode): GlobalCompositeOperation {
  return compositeOperations[mode] ?? 'source-over';
}

export function isBlendModeRendered(mode: BlendMode): boolean {
  return compositeOperations[mode] !== undefined;
}
