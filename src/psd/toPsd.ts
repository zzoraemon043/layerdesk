import type { Layer as PsdLayer, LayerVectorMask, Psd } from 'ag-psd';
import { pixelsOf, type Surface } from '../model/surface';
import type { LayerDocument, LayerNode, PixelLayer } from '../model/types';

export interface SaveReport {
  rasterized: string[];
}

const vectorKeys = ['text', 'placedLayer', 'vectorFill', 'vectorMask', 'vectorStroke', 'vectorOrigination', 'adjustment'] as const;

export function psdFromDocument(document: LayerDocument, composite: Surface): { psd: Psd; report: SaveReport } {
  const report: SaveReport = { rasterized: [] };
  const psd: Psd = {
    ...document.source,
    width: document.width,
    height: document.height,
    children: document.children.map((node) => psdLayerFromNode(node, report)),
    imageData: pixelsOf(composite),
  };
  return { psd, report };
}

function shiftPoints(points: number[] | undefined, dx: number, dy: number): number[] | undefined {
  return points?.map((value, index) => value + (index % 2 === 0 ? dx : dy));
}

function shiftVectorMask(mask: LayerVectorMask, dx: number, dy: number): LayerVectorMask {
  return {
    ...mask,
    paths: mask.paths.map((path) => ({
      ...path,
      knots: path.knots.map((knot) => ({ ...knot, points: shiftPoints(knot.points, dx, dy) ?? knot.points })),
    })),
  };
}

function shiftedSource(node: LayerNode): PsdLayer {
  const { offsetX: dx, offsetY: dy } = node;
  const source: PsdLayer = { ...node.source };
  if (dx === 0 && dy === 0) {
    return source;
  }
  if (source.text?.transform) {
    const transform = [...source.text.transform];
    transform[4] += dx;
    transform[5] += dy;
    source.text = { ...source.text, transform };
  }
  if (source.placedLayer) {
    source.placedLayer = {
      ...source.placedLayer,
      transform: shiftPoints(source.placedLayer.transform, dx, dy) ?? source.placedLayer.transform,
      nonAffineTransform: shiftPoints(source.placedLayer.nonAffineTransform, dx, dy),
    };
  }
  if (source.vectorMask) {
    source.vectorMask = shiftVectorMask(source.vectorMask, dx, dy);
  }
  if (source.realMask) {
    source.realMask = {
      ...source.realMask,
      left: (source.realMask.left ?? 0) + dx,
      top: (source.realMask.top ?? 0) + dy,
      right: (source.realMask.right ?? 0) + dx,
      bottom: (source.realMask.bottom ?? 0) + dy,
    };
  }
  return source;
}

function applyCommonProperties(target: PsdLayer, node: LayerNode) {
  target.name = node.name;
  target.hidden = node.hidden;
  target.opacity = node.opacity;
  target.blendMode = node.blendMode;
  target.clipping = node.clipping;
  target.protected = { ...target.protected, position: node.locked };
  if (node.mask && target.mask) {
    target.mask = {
      ...target.mask,
      left: node.mask.left,
      top: node.mask.top,
      right: node.mask.left + node.mask.width,
      bottom: node.mask.top + node.mask.height,
    };
  }
}

function rasterize(target: PsdLayer, layer: PixelLayer, report: SaveReport) {
  const removed = vectorKeys.filter((key) => target[key] !== undefined);
  if (removed.length === 0) {
    return;
  }
  for (const key of removed) {
    delete target[key];
  }
  report.rasterized.push(layer.name);
}

function psdLayerFromNode(node: LayerNode, report: SaveReport): PsdLayer {
  const target = shiftedSource(node);
  applyCommonProperties(target, node);
  if (node.kind === 'group') {
    target.opened = node.opened;
    target.children = node.children.map((child) => psdLayerFromNode(child, report));
    return target;
  }
  target.left = node.left;
  target.top = node.top;
  target.right = node.left + node.width;
  target.bottom = node.top + node.height;
  if (node.pixelsEdited) {
    rasterize(target, node, report);
  }
  if (node.width > 0 && node.height > 0) {
    target.imageData = !node.pixelsEdited && node.originalPixels ? node.originalPixels : node.surface ? pixelsOf(node.surface) : undefined;
  }
  return target;
}

export function layersToRasterize(document: LayerDocument): string[] {
  const names: string[] = [];
  const visit = (nodes: LayerNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'group') {
        visit(node.children);
      } else if (node.pixelsEdited && vectorKeys.some((key) => node.source[key] !== undefined)) {
        names.push(node.name);
      }
    }
  };
  visit(document.children);
  return names;
}
