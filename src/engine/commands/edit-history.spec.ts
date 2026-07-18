import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditHistory, editorUndoShortcut } from './edit-history';
import { CommandStack, snapshotCommand } from './stack';

describe('EditHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('coalesces continuous edits into one undo step', () => {
    let value = 0;
    const history = new EditHistory();

    history.coalesceSnapshot({
      key: 'n',
      label: 'Number',
      before: 0,
      after: 1,
      apply: (v) => {
        value = v as number;
      },
    });
    history.coalesceSnapshot({
      key: 'n',
      label: 'Number',
      before: 1,
      after: 5,
      apply: (v) => {
        value = v as number;
      },
    });
    history.coalesceSnapshot({
      key: 'n',
      label: 'Number',
      before: 5,
      after: 10,
      apply: (v) => {
        value = v as number;
      },
    });

    expect(value).toBe(10);
    expect(history.canUndo).toBe(true);

    vi.advanceTimersByTime(500);
    expect(history.canUndo).toBe(true);

    history.undo();
    expect(value).toBe(0);
    history.redo();
    expect(value).toBe(10);
  });

  it('flushes pending coalesce before a discrete command', () => {
    let value = 0;
    const history = new EditHistory();
    history.coalesceSnapshot({
      key: 'n',
      label: 'Number',
      before: 0,
      after: 3,
      apply: (v) => {
        value = v as number;
      },
    });
    history.run(
      snapshotCommand('Set', 3, 9, (v) => {
        value = v;
      }),
    );
    expect(value).toBe(9);
    history.undo();
    expect(value).toBe(3);
    history.undo();
    expect(value).toBe(0);
  });

  it('skips equal snapshots', () => {
    const history = new EditHistory();
    let value = 1;
    history.coalesceSnapshot({
      key: 'n',
      label: 'Number',
      before: 1,
      after: 1,
      apply: (v) => {
        value = v as number;
      },
    });
    vi.advanceTimersByTime(500);
    expect(history.canUndo).toBe(false);
    expect(value).toBe(1);
  });
});

describe('editorUndoShortcut', () => {
  it('maps ctrl/cmd z y', () => {
    const body = { tagName: 'DIV', isContentEditable: false } as HTMLElement;
    expect(
      editorUndoShortcut({
        key: 'z',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: body,
      } as unknown as KeyboardEvent),
    ).toBe('undo');
    expect(
      editorUndoShortcut({
        key: 'y',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: body,
      } as unknown as KeyboardEvent),
    ).toBe('redo');
  });

  it('ignores typing targets', () => {
    const input = { tagName: 'INPUT', isContentEditable: false } as HTMLElement;
    expect(
      editorUndoShortcut({
        key: 'z',
        ctrlKey: true,
        metaKey: false,
        altKey: false,
        shiftKey: false,
        target: input,
      } as unknown as KeyboardEvent),
    ).toBeNull();
  });
});

describe('CommandStack', () => {
  it('clears redo on new run', () => {
    let v = 0;
    const stack = new CommandStack();
    stack.run(snapshotCommand('a', 0, 1, (x) => (v = x)));
    stack.undo();
    expect(v).toBe(0);
    stack.run(snapshotCommand('b', 0, 2, (x) => (v = x)));
    expect(stack.canRedo).toBe(false);
    expect(v).toBe(2);
  });
});
