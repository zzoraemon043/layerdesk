import type { BlendMode } from 'ag-psd';
import { createNodeId } from './ids';
import type { Surface } from './surface';
import { allNodes, locate, mapDocument, walk } from './tree';
import type { GroupLayer, LayerDocument, LayerNode, NodeId } from './types';

export interface NodePropertyPatch {
  name?: string;
  hidden?: boolean;
  opacity?: number;
  blendMode?: BlendMode;
  clipping?: boolean;
  locked?: boolean;
  opened?: boolean;
}

export type DropPosition = 'above' | 'below' | 'inside';

export function setProperties(document: LayerDocument, ids: NodeId[], patch: NodePropertyPatch): LayerDocument {
  const targets = new Set(ids);
  return mapDocument(document, (node) => {
    if (!targets.has(node.id)) {
      return node;
    }
    const { opened, ...common } = patch;
    const updated = { ...node, ...common };
    if (updated.kind === 'group' && opened !== undefined) {
      return { ...updated, opened };
    }
    return updated;
  });
}

export function topLevelSelection(document: LayerDocument, ids: NodeId[]): NodeId[] {
  const selected = new Set(ids);
  return documentOrder(document).filter((id) => {
    if (!selected.has(id)) {
      return false;
    }
    const location = locate(document, id);
    return !!location && !location.ancestors.some((ancestor) => selected.has(ancestor.id));
  });
}

export function documentOrder(document: LayerDocument): NodeId[] {
  return allNodes(document).map((node) => node.id);
}

export function movableSelection(document: LayerDocument, ids: NodeId[]): NodeId[] {
  return topLevelSelection(document, ids).filter((id) => {
    const location = locate(document, id);
    return !!location && !location.node.locked && !location.ancestors.some((ancestor) => ancestor.locked);
  });
}

export function moveBy(document: LayerDocument, ids: NodeId[], dx: number, dy: number): LayerDocument {
  if (dx === 0 && dy === 0) {
    return document;
  }
  const roots = new Set(movableSelection(document, ids));
  const shifted = new Set<NodeId>();
  for (const id of roots) {
    const location = locate(document, id);
    if (location) {
      walk([location.node], (node) => shifted.add(node.id));
    }
  }
  return mapDocument(document, (node) => (shifted.has(node.id) ? shiftNode(node, dx, dy) : node));
}

function shiftNode(node: LayerNode, dx: number, dy: number): LayerNode {
  const mask = node.mask ? { ...node.mask, left: node.mask.left + dx, top: node.mask.top + dy } : null;
  const common = { mask, offsetX: node.offsetX + dx, offsetY: node.offsetY + dy };
  if (node.kind === 'layer') {
    return { ...node, ...common, left: node.left + dx, top: node.top + dy };
  }
  return { ...node, ...common };
}

export function replaceLayerPixels(document: LayerDocument, id: NodeId, surface: Surface, left: number, top: number): LayerDocument {
  return mapDocument(document, (node) => {
    if (node.id !== id || node.kind !== 'layer') {
      return node;
    }
    return {
      ...node,
      surface,
      left,
      top,
      width: surface.width,
      height: surface.height,
      originalPixels: null,
      pixelsEdited: true,
    };
  });
}

function removeFromNodes(nodes: LayerNode[], ids: Set<NodeId>): LayerNode[] {
  const kept = nodes.filter((node) => !ids.has(node.id));
  let changed = kept.length !== nodes.length;
  const result = kept.map((node) => {
    if (node.kind !== 'group') {
      return node;
    }
    const children = removeFromNodes(node.children, ids);
    if (children === node.children) {
      return node;
    }
    changed = true;
    return { ...node, children };
  });
  return changed ? result : nodes;
}

function insertIntoNodes(nodes: LayerNode[], parentId: NodeId | null, index: number, inserted: LayerNode[]): LayerNode[] {
  if (parentId === null) {
    return [...nodes.slice(0, index), ...inserted, ...nodes.slice(index)];
  }
  return nodes.map((node) => {
    if (node.kind !== 'group') {
      return node;
    }
    if (node.id === parentId) {
      return { ...node, children: [...node.children.slice(0, index), ...inserted, ...node.children.slice(index)] };
    }
    const children = insertIntoNodes(node.children, parentId, index, inserted);
    return children === node.children ? node : { ...node, children };
  });
}

function insertNodes(document: LayerDocument, parentId: NodeId | null, index: number, inserted: LayerNode[]): LayerDocument {
  return { ...document, children: insertIntoNodes(document.children, parentId, index, inserted) };
}

export function removeNodes(document: LayerDocument, ids: NodeId[]): LayerDocument {
  return { ...document, children: removeFromNodes(document.children, new Set(ids)) };
}

function selectedNodes(document: LayerDocument, ids: NodeId[]): LayerNode[] {
  return topLevelSelection(document, ids)
    .map((id) => locate(document, id)?.node)
    .filter((node): node is LayerNode => !!node);
}

export function moveNodes(document: LayerDocument, ids: NodeId[], referenceId: NodeId, position: DropPosition): LayerDocument {
  const moving = selectedNodes(document, ids);
  const movingIds = new Set(moving.map((node) => node.id));
  const reference = locate(document, referenceId);
  if (!reference || moving.length === 0) {
    return document;
  }
  if (movingIds.has(referenceId) || reference.ancestors.some((ancestor) => movingIds.has(ancestor.id))) {
    return document;
  }
  if (position === 'inside' && reference.node.kind !== 'group') {
    return document;
  }
  const withoutMoving = removeNodes(document, [...movingIds]);
  const target = locate(withoutMoving, referenceId);
  if (!target) {
    return document;
  }
  if (position === 'inside' && target.node.kind === 'group') {
    return insertNodes(withoutMoving, target.node.id, target.node.children.length, moving);
  }
  const index = position === 'above' ? target.index + 1 : target.index;
  return insertNodes(withoutMoving, target.parent?.id ?? null, index, moving);
}

export function createGroup(name: string, children: LayerNode[]): GroupLayer {
  return {
    kind: 'group',
    id: createNodeId(),
    name,
    hidden: false,
    opacity: 1,
    fillOpacity: 1,
    blendMode: 'pass through',
    clipping: false,
    locked: false,
    mask: null,
    offsetX: 0,
    offsetY: 0,
    opened: true,
    children,
    source: {},
  };
}

export function groupNodes(document: LayerDocument, ids: NodeId[], name: string): { document: LayerDocument; groupId: NodeId | null } {
  const moving = selectedNodes(document, ids);
  if (moving.length === 0) {
    return { document, groupId: null };
  }
  const topmost = locate(document, moving[moving.length - 1].id);
  if (!topmost) {
    return { document, groupId: null };
  }
  const movingIds = new Set(moving.map((node) => node.id));
  const anchorParentId = topmost.parent?.id ?? null;
  const removedBeforeAnchor = topmost.siblings.slice(0, topmost.index).filter((node) => movingIds.has(node.id)).length;
  const group = createGroup(name, moving);
  const withoutMoving = removeNodes(document, [...movingIds]);
  const index = topmost.index - removedBeforeAnchor;
  return { document: insertNodes(withoutMoving, anchorParentId, index, [group]), groupId: group.id };
}

export function ungroup(document: LayerDocument, id: NodeId): LayerDocument {
  const location = locate(document, id);
  if (!location || location.node.kind !== 'group') {
    return document;
  }
  const children = location.node.children;
  const withoutGroup = removeNodes(document, [id]);
  return insertNodes(withoutGroup, location.parent?.id ?? null, location.index, children);
}

function cloneNode(node: LayerNode): LayerNode {
  const source = { ...node.source };
  delete source.id;
  if (node.kind === 'layer') {
    return { ...node, id: createNodeId(), source };
  }
  return { ...node, id: createNodeId(), source, children: node.children.map(cloneNode) };
}

export function duplicateNodes(document: LayerDocument, ids: NodeId[], nameSuffix: string): { document: LayerDocument; ids: NodeId[] } {
  const originals = selectedNodes(document, ids);
  let result = document;
  const created: NodeId[] = [];
  for (const original of originals) {
    const location = locate(result, original.id);
    if (!location) {
      continue;
    }
    const copy = { ...cloneNode(original), name: `${original.name}${nameSuffix}` };
    result = insertNodes(result, location.parent?.id ?? null, location.index + 1, [copy]);
    created.push(copy.id);
  }
  return { document: result, ids: created };
}
