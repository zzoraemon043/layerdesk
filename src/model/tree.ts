import type { Bounds, GroupLayer, LayerDocument, LayerNode, NodeId, PixelLayer } from './types';

export interface NodeLocation {
  node: LayerNode;
  parent: GroupLayer | null;
  siblings: LayerNode[];
  index: number;
  ancestors: GroupLayer[];
}

export function locate(document: LayerDocument, id: NodeId): NodeLocation | null {
  const search = (siblings: LayerNode[], parent: GroupLayer | null, ancestors: GroupLayer[]): NodeLocation | null => {
    for (let index = 0; index < siblings.length; index++) {
      const node = siblings[index];
      if (node.id === id) {
        return { node, parent, siblings, index, ancestors };
      }
      if (node.kind === 'group') {
        const found = search(node.children, node, [...ancestors, node]);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };
  return search(document.children, null, []);
}

export function findNode(document: LayerDocument, id: NodeId): LayerNode | null {
  return locate(document, id)?.node ?? null;
}

export function walk(nodes: LayerNode[], visit: (node: LayerNode, ancestors: GroupLayer[]) => void, ancestors: GroupLayer[] = []) {
  for (const node of nodes) {
    visit(node, ancestors);
    if (node.kind === 'group') {
      walk(node.children, visit, [...ancestors, node]);
    }
  }
}

export function allNodes(document: LayerDocument): LayerNode[] {
  const nodes: LayerNode[] = [];
  walk(document.children, (node) => nodes.push(node));
  return nodes;
}

export function pixelLayersOf(node: LayerNode): PixelLayer[] {
  if (node.kind === 'layer') {
    return [node];
  }
  return node.children.flatMap(pixelLayersOf);
}

export function isDescendantOrSelf(document: LayerDocument, ancestorId: NodeId, id: NodeId): boolean {
  const location = locate(document, id);
  if (!location) {
    return false;
  }
  return id === ancestorId || location.ancestors.some((ancestor) => ancestor.id === ancestorId);
}

export function isEffectivelyHidden(location: NodeLocation): boolean {
  return location.node.hidden || location.ancestors.some((ancestor) => ancestor.hidden);
}

export function boundsOf(node: LayerNode): Bounds | null {
  const layers = pixelLayersOf(node).filter((layer) => layer.width > 0 && layer.height > 0);
  if (layers.length === 0) {
    return null;
  }
  return {
    left: Math.min(...layers.map((layer) => layer.left)),
    top: Math.min(...layers.map((layer) => layer.top)),
    right: Math.max(...layers.map((layer) => layer.left + layer.width)),
    bottom: Math.max(...layers.map((layer) => layer.top + layer.height)),
  };
}

export function unionBounds(boundsList: (Bounds | null)[]): Bounds | null {
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

export function mapNodes(nodes: LayerNode[], transform: (node: LayerNode) => LayerNode): LayerNode[] {
  let changed = false;
  const mapped = nodes.map((node) => {
    const withChildren = node.kind === 'group' ? withMappedChildren(node, transform) : node;
    const result = transform(withChildren);
    if (result !== node) {
      changed = true;
    }
    return result;
  });
  return changed ? mapped : nodes;
}

function withMappedChildren(group: GroupLayer, transform: (node: LayerNode) => LayerNode): GroupLayer {
  const children = mapNodes(group.children, transform);
  return children === group.children ? group : { ...group, children };
}

export function mapDocument(document: LayerDocument, transform: (node: LayerNode) => LayerNode): LayerDocument {
  const children = mapNodes(document.children, transform);
  return children === document.children ? document : { ...document, children };
}
