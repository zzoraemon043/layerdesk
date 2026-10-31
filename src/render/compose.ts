import { context2d, createSurface, type Surface } from '../model/surface';
import type { Bounds, GroupLayer, LayerDocument, LayerMask, LayerNode, NodeId, PixelLayer } from '../model/types';
import { compositeOperationFor } from './blend';
import { applyMatrix, type Matrix } from './transform';

export interface LayerTransform {
  id: NodeId;
  matrix: Matrix;
}

interface RenderContext {
  canvas: Bounds;
  transform: LayerTransform | null;
  groupCache: WeakMap<GroupLayer, RenderTarget | null>;
}

interface RenderTarget {
  surface: Surface;
  left: number;
  top: number;
}

export interface Compositor {
  render(document: LayerDocument, transform?: LayerTransform | null): Surface;
}

export function createCompositor(): Compositor {
  const groupCache = new WeakMap<GroupLayer, RenderTarget | null>();
  return {
    render(document, transform = null) {
      const surface = createSurface(document.width, document.height);
      const renderContext: RenderContext = { canvas: { left: 0, top: 0, right: document.width, bottom: document.height }, transform, groupCache };
      drawChildren(context2d(surface), document.children, renderContext);
      return surface;
    },
  };
}

export function composeDocument(document: LayerDocument, transform: LayerTransform | null = null): Surface {
  return createCompositor().render(document, transform);
}

function intersect(a: Bounds, b: Bounds): Bounds | null {
  const result = { left: Math.max(a.left, b.left), top: Math.max(a.top, b.top), right: Math.min(a.right, b.right), bottom: Math.min(a.bottom, b.bottom) };
  return result.right > result.left && result.bottom > result.top ? result : null;
}

function union(boundsList: (Bounds | null)[]): Bounds | null {
  const present = boundsList.filter((bounds): bounds is Bounds => bounds !== null);
  if (present.length === 0) {
    return null;
  }
  return {
    left: Math.min(...present.map((bounds) => bounds.left)),
    top: Math.min(...present.map((bounds) => bounds.top)),
    right: Math.max(...present.map((bounds) => bounds.right)),
    bottom: Math.max(...present.map((bounds) => bounds.bottom)),
  };
}

function layerBounds(layer: PixelLayer, renderContext: RenderContext): Bounds | null {
  if (!layer.surface) {
    return null;
  }
  if (renderContext.transform?.id === layer.id) {
    const corners = [
      { x: layer.left, y: layer.top },
      { x: layer.left + layer.width, y: layer.top },
      { x: layer.left + layer.width, y: layer.top + layer.height },
      { x: layer.left, y: layer.top + layer.height },
    ].map((point) => applyMatrix(renderContext.transform!.matrix, point));
    return {
      left: Math.floor(Math.min(...corners.map((point) => point.x))),
      top: Math.floor(Math.min(...corners.map((point) => point.y))),
      right: Math.ceil(Math.max(...corners.map((point) => point.x))),
      bottom: Math.ceil(Math.max(...corners.map((point) => point.y))),
    };
  }
  return { left: layer.left, top: layer.top, right: layer.left + layer.width, bottom: layer.top + layer.height };
}

function contentBounds(node: LayerNode, renderContext: RenderContext): Bounds | null {
  const bounds = node.kind === 'layer' ? layerBounds(node, renderContext) : union(node.children.filter((child) => !child.hidden).map((child) => contentBounds(child, renderContext)));
  return bounds ? intersect(bounds, renderContext.canvas) : null;
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
    } else {
      drawClippingStack(target, base, visibleClipped, renderContext);
    }
  }
}

function renderToTarget(node: LayerNode, renderContext: RenderContext): RenderTarget | null {
  const bounds = contentBounds(node, renderContext);
  if (!bounds) {
    return null;
  }
  const surface = createSurface(bounds.right - bounds.left, bounds.bottom - bounds.top);
  const context = context2d(surface);
  context.translate(-bounds.left, -bounds.top);
  drawNodeContent(context, node, renderContext, bounds);
  return { surface, left: bounds.left, top: bounds.top };
}

function drawClippingStack(target: CanvasRenderingContext2D, base: LayerNode, clipped: LayerNode[], renderContext: RenderContext) {
  const stack = renderToTarget(base, renderContext);
  if (!stack) {
    return;
  }
  const stackContext = context2d(stack.surface);
  stackContext.setTransform(1, 0, 0, 1, 0, 0);
  for (const node of clipped) {
    const layer = renderToTarget(node, renderContext);
    if (!layer) {
      continue;
    }
    const blended = blendOntoCopy(stack.surface, layer, node, stack);
    stackContext.globalCompositeOperation = 'source-atop';
    stackContext.drawImage(blended, 0, 0);
  }
  composite(target, stack, base);
}

function blendOntoCopy(stackSurface: Surface, layer: RenderTarget, node: LayerNode, stack: RenderTarget): Surface {
  const copy = createSurface(stackSurface.width, stackSurface.height);
  const copyContext = context2d(copy);
  copyContext.drawImage(stackSurface, 0, 0);
  copyContext.globalAlpha = node.kind === 'layer' ? node.opacity * node.fillOpacity : node.opacity;
  copyContext.globalCompositeOperation = compositeOperationFor(node.blendMode);
  copyContext.drawImage(layer.surface, layer.left - stack.left, layer.top - stack.top);
  return copy;
}

function composite(target: CanvasRenderingContext2D, rendered: RenderTarget, node: LayerNode) {
  target.save();
  target.globalAlpha = node.kind === 'layer' ? node.opacity * node.fillOpacity : node.opacity;
  target.globalCompositeOperation = compositeOperationFor(node.blendMode);
  target.drawImage(rendered.surface, rendered.left, rendered.top);
  target.restore();
}

function isTransformTarget(node: LayerNode, renderContext: RenderContext): boolean {
  return renderContext.transform?.id === node.id;
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
  const rendered = node.kind === 'group' && !activeMask(node.mask) ? groupTarget(node, renderContext) : renderToTarget(node, renderContext);
  if (rendered) {
    composite(target, rendered, node);
  }
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

function drawNodeContent(target: CanvasRenderingContext2D, node: LayerNode, renderContext: RenderContext, area: Bounds) {
  if (node.kind === 'group') {
    const rendered = groupTarget(node, renderContext);
    if (rendered) {
      target.drawImage(rendered.surface, rendered.left, rendered.top);
    }
  } else if (node.surface) {
    if (isTransformTarget(node, renderContext) && renderContext.transform) {
      target.save();
      target.transform(...renderContext.transform.matrix);
      target.drawImage(node.surface, node.left, node.top);
      target.restore();
    } else {
      target.drawImage(node.surface, node.left, node.top);
    }
  }
  if (activeMask(node.mask)) {
    applyMask(target, node.mask, area);
  }
}

function groupTarget(group: GroupLayer, renderContext: RenderContext): RenderTarget | null {
  const cacheable = !containsTransformTarget(group, renderContext.transform);
  if (cacheable && renderContext.groupCache.has(group)) {
    return renderContext.groupCache.get(group) ?? null;
  }
  const bounds = contentBounds(group, renderContext);
  let rendered: RenderTarget | null = null;
  if (bounds) {
    const surface = createSurface(bounds.right - bounds.left, bounds.bottom - bounds.top);
    const context = context2d(surface);
    context.translate(-bounds.left, -bounds.top);
    drawChildren(context, group.children, renderContext);
    rendered = { surface, left: bounds.left, top: bounds.top };
  }
  if (cacheable) {
    renderContext.groupCache.set(group, rendered);
  }
  return rendered;
}

function activeMask(mask: LayerMask | null): mask is LayerMask {
  return !!mask && !mask.disabled;
}

function applyMask(target: CanvasRenderingContext2D, mask: LayerMask, area: Bounds) {
  const width = area.right - area.left;
  const height = area.bottom - area.top;
  const alpha = createSurface(width, height);
  const alphaContext = context2d(alpha);
  if (mask.defaultColor > 0) {
    alphaContext.fillStyle = `rgba(0,0,0,${mask.defaultColor / 255})`;
    alphaContext.fillRect(0, 0, width, height);
    alphaContext.clearRect(mask.left - area.left, mask.top - area.top, mask.width, mask.height);
  }
  if (mask.surface) {
    alphaContext.drawImage(mask.surface, mask.left - area.left, mask.top - area.top);
  }
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.globalCompositeOperation = 'destination-in';
  target.drawImage(alpha, 0, 0);
  target.restore();
}
