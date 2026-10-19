import { describe, expect, it } from 'vitest';
import {
  documentOrder,
  duplicateNodes,
  groupNodes,
  moveBy,
  moveNodes,
  removeNodes,
  replaceLayerPixels,
  setProperties,
  topLevelSelection,
  ungroup,
} from '../src/model/commands';
import { createSurface } from '../src/model/surface';
import { locate } from '../src/model/tree';
import type { LayerDocument } from '../src/model/types';
import { byName, sampleDocument } from './fixtures';

const names = (document: LayerDocument) => document.children.map((node) => node.name);

describe('setProperties', () => {
  it('changes only the targeted nodes', () => {
    const document = sampleDocument();
    const arm = byName(document, 'arm');
    const result = setProperties(document, [arm.id], { name: 'left arm', hidden: true, opacity: 0.25 });
    expect(byName(result, 'left arm')).toMatchObject({ hidden: true, opacity: 0.25 });
    expect(byName(result, 'head')).toBe(byName(document, 'head'));
    expect(byName(result, 'background')).toBe(byName(document, 'background'));
  });

  it('sets opened only on groups', () => {
    const document = sampleDocument();
    const result = setProperties(document, [byName(document, 'body').id], { opened: false });
    expect(byName(result, 'body')).toMatchObject({ kind: 'group', opened: false });
  });
});

describe('moveBy', () => {
  it('moves a layer and records the offset', () => {
    const document = sampleDocument();
    const arm = byName(document, 'arm');
    const result = moveBy(document, [arm.id], 5, -3);
    expect(byName(result, 'arm')).toMatchObject({ left: 15, top: 7, offsetX: 5, offsetY: -3 });
  });

  it('moves every layer inside a moved group once', () => {
    const document = sampleDocument();
    const body = byName(document, 'body');
    const arm = byName(document, 'arm');
    const result = moveBy(document, [body.id, arm.id], 2, 2);
    expect(byName(result, 'arm')).toMatchObject({ left: 12, top: 12 });
    expect(byName(result, 'head')).toMatchObject({ left: 22, top: 6 });
    expect(byName(result, 'body')).toMatchObject({ offsetX: 2, offsetY: 2 });
  });

  it('skips locked layers and layers inside locked groups', () => {
    const document = sampleDocument();
    const locked = setProperties(document, [byName(document, 'body').id, byName(document, 'background').id], { locked: true });
    const result = moveBy(locked, [byName(locked, 'arm').id, byName(locked, 'background').id], 4, 4);
    expect(result).toBe(locked);
  });

  it('moves the layer mask with the layer', () => {
    const document = sampleDocument();
    const arm = byName(document, 'arm');
    const withMask: LayerDocument = {
      ...document,
      children: document.children.map((node) =>
        node.kind === 'group'
          ? { ...node, children: node.children.map((child) => (child.id === arm.id ? { ...child, mask: { left: 10, top: 10, width: 4, height: 4, defaultColor: 0, disabled: false, surface: null } } : child)) }
          : node,
      ),
    };
    const result = moveBy(withMask, [arm.id], 3, 1);
    expect(byName(result, 'arm').mask).toMatchObject({ left: 13, top: 11 });
  });

  it('returns the same document for a zero move', () => {
    const document = sampleDocument();
    expect(moveBy(document, [byName(document, 'arm').id], 0, 0)).toBe(document);
  });
});

describe('moveNodes', () => {
  it('moves a layer above another layer', () => {
    const document = sampleDocument();
    const result = moveNodes(document, [byName(document, 'background').id], byName(document, 'sketch').id, 'above');
    expect(names(result)).toEqual(['body', 'sketch', 'background']);
  });

  it('moves a layer below another layer', () => {
    const document = sampleDocument();
    const result = moveNodes(document, [byName(document, 'sketch').id], byName(document, 'background').id, 'below');
    expect(names(result)).toEqual(['sketch', 'background', 'body']);
  });

  it('moves a layer into a group as its top child', () => {
    const document = sampleDocument();
    const result = moveNodes(document, [byName(document, 'sketch').id], byName(document, 'body').id, 'inside');
    const body = byName(result, 'body');
    expect(body.kind === 'group' && body.children.map((child) => child.name)).toEqual(['arm', 'head', 'sketch']);
  });

  it('moves a layer out of a group', () => {
    const document = sampleDocument();
    const result = moveNodes(document, [byName(document, 'arm').id], byName(document, 'sketch').id, 'above');
    expect(names(result)).toEqual(['background', 'body', 'sketch', 'arm']);
  });

  it('refuses to move a group into itself', () => {
    const document = sampleDocument();
    expect(moveNodes(document, [byName(document, 'body').id], byName(document, 'arm').id, 'above')).toBe(document);
    expect(moveNodes(document, [byName(document, 'body').id], byName(document, 'body').id, 'inside')).toBe(document);
  });

  it('refuses to drop inside a layer', () => {
    const document = sampleDocument();
    expect(moveNodes(document, [byName(document, 'arm').id], byName(document, 'sketch').id, 'inside')).toBe(document);
  });
});

describe('groupNodes and ungroup', () => {
  it('wraps the selection in a group at the position of the topmost selected node', () => {
    const document = sampleDocument();
    const { document: result, groupId } = groupNodes(document, [byName(document, 'background').id, byName(document, 'sketch').id], 'new group');
    expect(names(result)).toEqual(['body', 'new group']);
    const group = byName(result, 'new group');
    expect(group.id).toBe(groupId);
    expect(group.kind === 'group' && group.children.map((child) => child.name)).toEqual(['background', 'sketch']);
  });

  it('ungroups back to the same order', () => {
    const document = sampleDocument();
    const result = ungroup(document, byName(document, 'body').id);
    expect(names(result)).toEqual(['background', 'arm', 'head', 'sketch']);
  });

  it('ignores ungroup on a layer', () => {
    const document = sampleDocument();
    expect(ungroup(document, byName(document, 'arm').id)).toBe(document);
  });
});

describe('duplicateNodes and removeNodes', () => {
  it('inserts a copy right above the original with new ids', () => {
    const document = sampleDocument();
    const body = byName(document, 'body');
    const { document: result, ids } = duplicateNodes(document, [body.id], ' copy');
    expect(names(result)).toEqual(['background', 'body', 'body copy', 'sketch']);
    const copy = byName(result, 'body copy');
    expect(ids).toEqual([copy.id]);
    expect(copy.id).not.toBe(body.id);
    expect(copy.kind === 'group' && copy.children[0].id).not.toBe(body.kind === 'group' && body.children[0].id);
    expect(new Set(documentOrder(result)).size).toBe(documentOrder(result).length);
  });

  it('removes nodes anywhere in the tree', () => {
    const document = sampleDocument();
    const result = removeNodes(document, [byName(document, 'head').id, byName(document, 'sketch').id]);
    expect(names(result)).toEqual(['background', 'body']);
    expect(locate(result, byName(document, 'head').id)).toBeNull();
  });
});

describe('selection helpers', () => {
  it('drops children of selected groups and keeps document order', () => {
    const document = sampleDocument();
    const ids = [byName(document, 'sketch').id, byName(document, 'arm').id, byName(document, 'body').id];
    expect(topLevelSelection(document, ids)).toEqual([byName(document, 'body').id, byName(document, 'sketch').id]);
  });
});

describe('replaceLayerPixels', () => {
  it('stores new pixels and marks the layer as edited', () => {
    const document = sampleDocument();
    const surface = createSurface(3, 2);
    const result = replaceLayerPixels(document, byName(document, 'arm').id, surface, 1, 2);
    expect(byName(result, 'arm')).toMatchObject({ left: 1, top: 2, width: 3, height: 2, pixelsEdited: true, originalPixels: null });
  });
});
