import { useCallback, useMemo, useRef, useState } from 'react';
import { replaceLayerPixels } from '../model/commands';
import { commit, commitFrom, createHistory, jumpTo, preview, redo, undo, type History } from '../model/history';
import { locate } from '../model/tree';
import type { LayerDocument, NodeId } from '../model/types';
import { bakeTransform, isIdentity, startTransform, type FreeTransform } from '../render/transform';

export interface Editor {
  history: History | null;
  document: LayerDocument | null;
  selection: NodeId[];
  transform: FreeTransform | null;
  dirty: boolean;
  load(document: LayerDocument, label: string): void;
  apply(label: string, change: (document: LayerDocument) => LayerDocument): void;
  replace(change: (document: LayerDocument) => LayerDocument): void;
  beginPreview(): void;
  updatePreview(change: (base: LayerDocument) => LayerDocument): void;
  endPreview(label: string): void;
  undo(): void;
  redo(): void;
  jump(index: number): void;
  select(ids: NodeId[]): void;
  markSaved(document: LayerDocument): void;
  beginTransform(): boolean;
  updateTransform(transform: FreeTransform): void;
  applyTransform(label: string): void;
  cancelTransform(): void;
}

export function useEditor(): Editor {
  const [history, setHistory] = useState<History | null>(null);
  const [selection, setSelection] = useState<NodeId[]>([]);
  const [transform, setTransform] = useState<FreeTransform | null>(null);
  const [saved, setSaved] = useState<LayerDocument | null>(null);
  const previewBase = useRef<LayerDocument | null>(null);

  const document = history?.present.document ?? null;

  const validSelection = useMemo(() => (document ? selection.filter((id) => locate(document, id)) : []), [document, selection]);

  const load = useCallback((next: LayerDocument, label: string) => {
    setHistory(createHistory(next, label));
    setSaved(next);
    setSelection([]);
    setTransform(null);
    previewBase.current = null;
  }, []);

  const apply = useCallback((label: string, change: (document: LayerDocument) => LayerDocument) => {
    setHistory((current) => (current ? commit(current, change(current.present.document), label) : current));
  }, []);

  const replace = useCallback((change: (document: LayerDocument) => LayerDocument) => {
    setHistory((current) => (current ? preview(current, change(current.present.document)) : current));
  }, []);

  const beginPreview = useCallback(() => {
    previewBase.current = history?.present.document ?? null;
  }, [history]);

  const updatePreview = useCallback((change: (base: LayerDocument) => LayerDocument) => {
    const base = previewBase.current;
    if (!base) {
      return;
    }
    setHistory((current) => (current ? preview(current, change(base)) : current));
  }, []);

  const endPreview = useCallback((label: string) => {
    const base = previewBase.current;
    previewBase.current = null;
    if (!base) {
      return;
    }
    setHistory((current) => (current ? commitFrom(current, base, current.present.document, label) : current));
  }, []);

  const select = useCallback((ids: NodeId[]) => setSelection(ids), []);

  const beginTransform = useCallback(() => {
    if (!document || validSelection.length !== 1) {
      return false;
    }
    const location = locate(document, validSelection[0]);
    const node = location?.node;
    if (!node || node.kind !== 'layer' || !node.surface || node.locked || location.ancestors.some((ancestor) => ancestor.locked)) {
      return false;
    }
    setTransform(startTransform(node));
    return true;
  }, [document, validSelection]);

  const applyTransform = useCallback(
    (label: string) => {
      if (!transform || !document) {
        setTransform(null);
        return;
      }
      const node = locate(document, transform.id)?.node;
      if (node && node.kind === 'layer' && !isIdentity(transform)) {
        const baked = bakeTransform(node, transform);
        if (baked) {
          apply(label, (current) => replaceLayerPixels(current, node.id, baked.surface, baked.left, baked.top));
        }
      }
      setTransform(null);
    },
    [apply, document, transform],
  );

  return {
    history,
    document,
    selection: validSelection,
    transform,
    dirty: !!document && document !== saved,
    load,
    apply,
    replace,
    beginPreview,
    updatePreview,
    endPreview,
    undo: () => {
      setTransform(null);
      setHistory((current) => (current ? undo(current) : current));
    },
    redo: () => {
      setTransform(null);
      setHistory((current) => (current ? redo(current) : current));
    },
    jump: (index) => {
      setTransform(null);
      setHistory((current) => (current ? jumpTo(current, index) : current));
    },
    select,
    markSaved: setSaved,
    beginTransform,
    updateTransform: setTransform,
    applyTransform,
    cancelTransform: () => setTransform(null),
  };
}
