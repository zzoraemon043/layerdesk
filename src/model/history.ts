import type { LayerDocument } from './types';

export interface HistoryEntry {
  document: LayerDocument;
  label: string;
}

export interface History {
  past: HistoryEntry[];
  present: HistoryEntry;
  future: HistoryEntry[];
}

export const historyLimit = 200;

export function createHistory(document: LayerDocument, label: string): History {
  return { past: [], present: { document, label }, future: [] };
}

export function commit(history: History, document: LayerDocument, label: string): History {
  if (document === history.present.document) {
    return history;
  }
  const past = [...history.past, history.present].slice(-historyLimit);
  return { past, present: { document, label }, future: [] };
}

export function commitFrom(history: History, base: LayerDocument, document: LayerDocument, label: string): History {
  if (document === base) {
    return { ...history, present: { ...history.present, document: base } };
  }
  const rebased = { ...history, present: { ...history.present, document: base } };
  return commit(rebased, document, label);
}

export function preview(history: History, document: LayerDocument): History {
  return { ...history, present: { ...history.present, document } };
}

export function undo(history: History): History {
  const previous = history.past[history.past.length - 1];
  if (!previous) {
    return history;
  }
  return { past: history.past.slice(0, -1), present: previous, future: [history.present, ...history.future] };
}

export function redo(history: History): History {
  const [next, ...rest] = history.future;
  if (!next) {
    return history;
  }
  return { past: [...history.past, history.present], present: next, future: rest };
}

export function jumpTo(history: History, pastIndex: number): History {
  const entries = [...history.past, history.present, ...history.future];
  const present = entries[pastIndex];
  if (!present) {
    return history;
  }
  return { past: entries.slice(0, pastIndex), present, future: entries.slice(pastIndex + 1) };
}
