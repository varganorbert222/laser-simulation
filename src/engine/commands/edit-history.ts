import { type Command, CommandStack, snapshotCommand } from './stack';

const COALESCE_MS = 400;

interface PendingCoalesce<T = unknown> {
  key: string;
  label: string;
  before: T;
  after: T;
  apply: (value: T) => void;
}

/**
 * Editor command history with rogue-leader-style coalescing for continuous
 * inspector edits (sliders). Discrete edits flush pending coalesce first.
 */
export class EditHistory {
  private readonly stack = new CommandStack();
  private pending: PendingCoalesce | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private applying = false;

  constructor(private readonly onChange?: () => void) {}

  get canUndo(): boolean {
    return this.stack.canUndo || this.pending !== null;
  }

  get canRedo(): boolean {
    return this.stack.canRedo;
  }

  get undoLabel(): string | null {
    if (this.pending) return this.pending.label;
    return this.stack.undoLabel;
  }

  get redoLabel(): string | null {
    return this.stack.redoLabel;
  }

  /** True while undo/redo is restoring state — callers should not push. */
  get isApplying(): boolean {
    return this.applying;
  }

  run(command: Command): void {
    if (this.applying) {
      command.execute();
      return;
    }
    this.flushPending();
    this.stack.run(command);
    this.onChange?.();
  }

  pushApplied(command: Command): void {
    if (this.applying) return;
    this.flushPending();
    this.stack.pushApplied(command);
    this.onChange?.();
  }

  /**
   * Continuous edit: keep one history entry for a key until idle.
   * `before` is used only when starting a new coalesce group.
   */
  coalesceSnapshot<T>(opts: {
    key: string;
    label: string;
    before: T;
    after: T;
    apply: (value: T) => void;
  }): void {
    if (this.applying) {
      opts.apply(opts.after);
      this.onChange?.();
      return;
    }

    if (this.pending && this.pending.key !== opts.key) {
      this.flushPending();
    }

    if (!this.pending) {
      this.pending = {
        key: opts.key,
        label: opts.label,
        before: structuredClone(opts.before),
        after: structuredClone(opts.after),
        apply: opts.apply as (value: unknown) => void,
      };
    } else {
      this.pending.after = structuredClone(opts.after);
      this.pending.label = opts.label;
    }

    opts.apply(opts.after);
    this.scheduleFlush();
    this.onChange?.();
  }

  flushPending(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const p = this.pending;
    this.pending = null;
    if (!p) return;
    if (snapshotsEqual(p.before, p.after)) {
      this.onChange?.();
      return;
    }
    this.stack.pushApplied(snapshotCommand(p.label, p.before, p.after, p.apply));
    this.onChange?.();
  }

  cancelPending(): void {
    if (this.timer != null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }

  undo(): boolean {
    this.flushPending();
    this.applying = true;
    try {
      const ok = this.stack.undo();
      this.onChange?.();
      return ok;
    } finally {
      this.applying = false;
    }
  }

  redo(): boolean {
    this.cancelPending();
    this.applying = true;
    try {
      const ok = this.stack.redo();
      this.onChange?.();
      return ok;
    } finally {
      this.applying = false;
    }
  }

  clear(): void {
    this.cancelPending();
    this.stack.clear();
    this.onChange?.();
  }

  private scheduleFlush(): void {
    if (this.timer != null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushPending();
    }, COALESCE_MS);
  }
}

function snapshotsEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Hotkey helpers — match rogue-leader dev editor behaviour. */
function shouldHandleEditorUndoKey(event: KeyboardEvent): boolean {
  const target = event.target;
  if (!target || typeof target !== 'object') return true;
  const el = target as HTMLElement;
  if (el.isContentEditable) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
  return true;
}

export function editorUndoShortcut(event: KeyboardEvent): 'undo' | 'redo' | null {
  if (!shouldHandleEditorUndoKey(event)) return null;
  if (!(event.ctrlKey || event.metaKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z' && !event.shiftKey) return 'undo';
  if (key === 'y' || (key === 'z' && event.shiftKey)) return 'redo';
  return null;
}
