import type { Layer as PsdLayer, LayerMaskData, Psd } from 'ag-psd';
import { createNodeId } from '../model/ids';
import { surfaceFromPixels } from '../model/surface';
import type { LayerDocument, LayerMask, LayerNode } from '../model/types';
import { grayToAlpha, toEightBit } from './pixels';

const rgbColorMode = 3;

export function documentFromPsd(psd: Psd, fileName: string): LayerDocument {
  const { children = [], imageData, ...source } = psd;
  return {
    width: psd.width,
    height: psd.height,
    children: children.map(nodeFromPsdLayer),
    source,
    storedComposite: imageData ? surfaceFromPixels(imageData.width, imageData.height, toEightBit(imageData)) : null,
    fileName,
  };
}

export function readOnlyReason(document: LayerDocument): 'bit-depth' | 'color-mode' | null {
  const { bitsPerChannel = 8, colorMode = rgbColorMode } = document.source;
  if (bitsPerChannel !== 8) {
    return 'bit-depth';
  }
  if (colorMode !== rgbColorMode) {
    return 'color-mode';
  }
  return null;
}

function maskFromPsd(mask: LayerMaskData | undefined): LayerMask | null {
  if (!mask) {
    return null;
  }
  const left = mask.left ?? 0;
  const top = mask.top ?? 0;
  const width = Math.max(0, (mask.right ?? 0) - left);
  const height = Math.max(0, (mask.bottom ?? 0) - top);
  const pixels = mask.imageData;
  return {
    left,
    top,
    width,
    height,
    defaultColor: mask.defaultColor ?? 255,
    disabled: !!mask.disabled,
    surface: pixels && width > 0 && height > 0 ? surfaceFromPixels(width, height, grayToAlpha(toEightBit(pixels))) : null,
  };
}

function nodeFromPsdLayer(layer: PsdLayer): LayerNode {
  const { children, imageData, ...source } = layer;
  const common = {
    id: createNodeId(),
    name: layer.name ?? '',
    hidden: !!layer.hidden,
    opacity: layer.opacity ?? 1,
    fillOpacity: layer.fillOpacity ?? 1,
    blendMode: layer.blendMode ?? (children ? 'pass through' : 'normal'),
    clipping: !!layer.clipping,
    locked: !!layer.protected?.position,
    mask: maskFromPsd(layer.mask),
    offsetX: 0,
    offsetY: 0,
    source,
  };
  if (children) {
    return { ...common, kind: 'group', opened: layer.opened ?? true, children: children.map(nodeFromPsdLayer) };
  }
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const width = Math.max(0, (layer.right ?? 0) - left);
  const height = Math.max(0, (layer.bottom ?? 0) - top);
  const hasPixels = !!imageData && width > 0 && height > 0;
  return {
    ...common,
    kind: 'layer',
    left,
    top,
    width: hasPixels ? width : 0,
    height: hasPixels ? height : 0,
    surface: hasPixels ? surfaceFromPixels(width, height, toEightBit(imageData)) : null,
    originalPixels: hasPixels ? imageData : null,
    pixelsEdited: false,
  };
}
