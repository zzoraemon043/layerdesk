import { context2d, createSurface, type Surface } from '../model/surface';
import type { GroupLayer, LayerDocument, LayerMask, LayerNode, NodeId, PixelLayer } from '../model/types';
import { compositeOperationFor } from './blend';
import type { Matrix } from './transform';

export interface LayerTransform {
  id: NodeId;
  matrix: Matrix;
}

interface RenderContext {
  width: number;
  height: number;
  transform: LayerTransform | null;
  groupCache: WeakMap<GroupLayer, Surface>;
}

export interface Compositor {
  render(document: LayerDocument, transform?: LayerTransform | null): Surface;
}

export function createCompositor(): Compositor {
  const groupCache = new WeakMap<GroupLayer, Surface>();
  return {
    render(document, transform = null) {
      const surface = createSurface(document.width, document.height);
      const renderContext: RenderContext = { width: document.width, height: document.height, transform, groupCache };
      drawChildren(context2d(surface), document.children, renderContext);
      return surface;
    },
  };
}

export function composeDocument(document: LayerDocument, transform: LayerTransform | null = null): Surface {
  return createCompositor().render(document, transform);
}

function containsTransformTarget(node: LayerNode, transform: LayerTransform | null): boolean {
  if (!transform) {
    return false;
  }
  if (node.id === transform.id) {
    return true;
  }
  return node.kind === 'group' && node.children.some((child) => containsTransformTarget(child, transform));
}

function drawChildren(target: CanvasRenderingContext2D, children: LayerNode[], renderContext: RenderContext) {
  let index = 0;
  while (index < children.length) {
    const base = children[index];
    const clipped: LayerNode[] = [];
    let next = index + 1;
    while (next < children.length && children[next].clipping) {
      clipped.push(children[next]);
      next++;
    }
    index = next;
    if (base.hidden) {
      continue;
    }
    const visibleClipped = clipped.filter((node) => !node.hidden);
    if (visibleClipped.length === 0) {
      drawNode(target, base, renderContext);
      continue;
    }
    drawClippingStack(target, base, visibleClipped, renderContext);
  }
}

function drawClippingStack(target: CanvasRenderingContext2D, base: LayerNode, clipped: LayerNode[], renderContext: RenderContext) {
  const stack = createSurface(renderContext.width, renderContext.height);
  const stackContext = context2d(stack);
  drawNodeContent(stackContext, base, renderContext);
  for (const node of clipped) {
    const layerSurface = createSurface(renderContext.width, renderContext.height);
    drawNodeContent(context2d(layerSurface), node, renderContext);
    stackContext.globalAlpha = node.opacity * node.fillOpacity;
    stackContext.globalCompositeOperation = 'source-atop';
    stackContext.drawImage(layerSurface, 0, 0);
  }
  composite(target, stack, base);
}

function composite(target: CanvasRenderingContext2D, surface: Surface, node: LayerNode) {
  target.save();
  target.globalAlpha = node.kind === 'layer' ? node.opacity * node.fillOpacity : node.opacity;
  target.globalCompositeOperation = compositeOperationFor(node.blendMode);
  target.drawImage(surface, 0, 0);
  target.restore();
}

function drawNode(target: CanvasRenderingContext2D, node: LayerNode, renderContext: RenderContext) {
  if (node.kind === 'group' && node.blendMode === 'pass through' && node.opacity === 1 && !activeMask(node.mask)) {
    drawChildren(target, node.children, renderContext);
    return;
  }
  if (node.kind === 'layer' && !activeMask(node.mask) && !isTransformTarget(node, renderContext)) {
    drawPlainLayer(target, node);
    return;
  }
  const surface = createSurface(renderContext.width, renderContext.height);
  drawNodeContent(context2d(surface), node, renderContext);
  composite(target, surface, node);
}

function isTransformTarget(node: LayerNode, renderContext: RenderContext): boolean {
  return renderContext.transform?.id === node.id;
}

function drawPlainLayer(target: CanvasRenderingContext2D, layer: PixelLayer) {
  if (!layer.surface) {
    return;
  }
  target.save();
  target.globalAlpha = layer.opacity * layer.fillOpacity;
  target.globalCompositeOperation = compositeOperationFor(layer.blendMode);
  target.drawImage(layer.surface, layer.left, layer.top);
  target.restore();
}

function drawNodeContent(target: CanvasRenderingContext2D, node: LayerNode, renderContext: RenderContext) {
  if (node.kind === 'group') {
    target.drawImage(groupSurface(node, renderContext), 0, 0);
  } else if (node.surface) {
    if (isTransformTarget(node, renderContext) && renderContext.transform) {
      target.save();
      target.setTransform(...renderContext.transform.matrix);
      target.drawImage(node.surface, node.left, node.top);
      target.restore();
    } else {
      target.drawImage(node.surface, node.left, node.top);
    }
  }
  if (activeMask(node.mask)) {
    applyMask(target, node.mask, renderContext);
  }
}

function groupSurface(group: GroupLayer, renderContext: RenderContext): Surface {
  const cacheable = !containsTransformTarget(group, renderContext.transform);
  const cached = cacheable ? renderContext.groupCache.get(group) : undefined;
  if (cached) {
    return cached;
  }
  const surface = createSurface(renderContext.width, renderContext.height);
  drawChildren(context2d(surface), group.children, renderContext);
  if (cacheable) {
    renderContext.groupCache.set(group, surface);
  }
  return surface;
}

function activeMask(mask: LayerMask | null): mask is LayerMask {
  return !!mask && !mask.disabled;
}

function applyMask(target: CanvasRenderingContext2D, mask: LayerMask, renderContext: RenderContext) {
  const alpha = createSurface(renderContext.width, renderContext.height);
  const alphaContext = context2d(alpha);
  if (mask.defaultColor > 0) {
    alphaContext.fillStyle = `rgba(0,0,0,${mask.defaultColor / 255})`;
    alphaContext.fillRect(0, 0, renderContext.width, renderContext.height);
    alphaContext.clearRect(mask.left, mask.top, mask.width, mask.height);
  }
  if (mask.surface) {
    alphaContext.drawImage(mask.surface, mask.left, mask.top);
  }
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'destination-in';
  target.drawImage(alpha, 0, 0);
  target.restore();
}
