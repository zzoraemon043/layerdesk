import { context2d } from '../model/surface';
import type { GroupLayer, LayerDocument, LayerNode, NodeId, PixelLayer } from '../model/types';

function visibleLayersTopFirst(nodes: LayerNode[]): PixelLayer[] {
  const result: PixelLayer[] = [];
  for (let index = nodes.length - 1; index >= 0; index--) {
    const node = nodes[index];
    if (node.hidden) {
      continue;
    }
    if (node.kind === 'group') {
      result.push(...visibleLayersTopFirst((node as GroupLayer).children));
    } else {
      result.push(node);
    }
  }
  return result;
}

function isOpaqueAt(layer: PixelLayer, x: number, y: number): boolean {
  if (!layer.surface) {
    return false;
  }
  const localX = Math.floor(x - layer.left);
  const localY = Math.floor(y - layer.top);
  if (localX < 0 || localY < 0 || localX >= layer.width || localY >= layer.height) {
    return false;
  }
  return context2d(layer.surface).getImageData(localX, localY, 1, 1).data[3] > 0;
}

export function layersAt(document: LayerDocument, x: number, y: number): NodeId[] {
  return visibleLayersTopFirst(document.children)
    .filter((layer) => isOpaqueAt(layer, x, y))
    .map((layer) => layer.id);
}

export function pickLayer(document: LayerDocument, x: number, y: number, after: NodeId | null = null): NodeId | null {
  const hits = layersAt(document, x, y);
  if (hits.length === 0) {
    return null;
  }
  if (after === null) {
    return hits[0];
  }
  const index = hits.indexOf(after);
  return hits[(index + 1) % hits.length];
}
