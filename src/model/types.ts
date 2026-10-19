import type { BlendMode, Layer as PsdLayer, PixelData, Psd } from 'ag-psd';
import type { Surface } from './surface';

export type NodeId = string;

export interface LayerMask {
  left: number;
  top: number;
  width: number;
  height: number;
  defaultColor: number;
  disabled: boolean;
  surface: Surface | null;
}

interface NodeBase {
  id: NodeId;
  name: string;
  hidden: boolean;
  opacity: number;
  fillOpacity: number;
  blendMode: BlendMode;
  clipping: boolean;
  locked: boolean;
  mask: LayerMask | null;
  offsetX: number;
  offsetY: number;
  source: PsdLayer;
}

export interface PixelLayer extends NodeBase {
  kind: 'layer';
  left: number;
  top: number;
  width: number;
  height: number;
  surface: Surface | null;
  originalPixels: PixelData | null;
  pixelsEdited: boolean;
}

export interface GroupLayer extends NodeBase {
  kind: 'group';
  opened: boolean;
  children: LayerNode[];
}

export type LayerNode = PixelLayer | GroupLayer;

export interface LayerDocument {
  width: number;
  height: number;
  children: LayerNode[];
  source: Omit<Psd, 'children' | 'imageData' | 'canvas'>;
  storedComposite: Surface | null;
  fileName: string;
}

export interface Bounds {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
