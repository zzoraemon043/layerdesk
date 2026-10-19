import { describe, expect, it } from 'vitest';
import { commit, commitFrom, createHistory, historyLimit, jumpTo, preview, redo, undo } from '../src/model/history';
import { testDocument } from './fixtures';

describe('history', () => {
  const first = testDocument([]);
  const second = { ...first, width: 30 };
  const third = { ...first, width: 40 };

  it('undoes and redoes commits', () => {
    let history = createHistory(first, 'open');
    history = commit(history, second, 'a');
    history = commit(history, third, 'b');
    history = undo(history);
    expect(history.present.document).toBe(second);
    history = undo(history);
    expect(history.present.document).toBe(first);
    expect(undo(history)).toBe(history);
    history = redo(history);
    expect(history.present).toMatchObject({ document: second, label: 'a' });
  });

  it('drops the redo stack on a new commit', () => {
    let history = commit(createHistory(first, 'open'), second, 'a');
    history = commit(undo(history), third, 'c');
    expect(history.future).toEqual([]);
    expect(redo(history)).toBe(history);
  });

  it('ignores commits that do not change the document', () => {
    const history = createHistory(first, 'open');
    expect(commit(history, first, 'nothing')).toBe(history);
  });

  it('commits a previewed drag as a single step from its base', () => {
    let history = createHistory(first, 'open');
    history = preview(history, second);
    history = preview(history, third);
    history = commitFrom(history, first, third, 'move');
    expect(history.past.map((entry) => entry.document)).toEqual([first]);
    expect(history.present).toMatchObject({ document: third, label: 'move' });
  });

  it('restores the base when a drag ends without change', () => {
    const history = commitFrom(preview(createHistory(first, 'open'), second), first, first, 'move');
    expect(history.present.document).toBe(first);
    expect(history.past).toEqual([]);
  });

  it('jumps to any entry', () => {
    let history = commit(commit(createHistory(first, 'open'), second, 'a'), third, 'b');
    history = jumpTo(history, 0);
    expect(history.present.document).toBe(first);
    expect(history.future).toHaveLength(2);
  });

  it('keeps a bounded number of steps', () => {
    let history = createHistory(first, 'open');
    for (let index = 0; index < historyLimit + 10; index++) {
      history = commit(history, { ...first, width: index + 100 }, 'step');
    }
    expect(history.past).toHaveLength(historyLimit);
  });
});
