export interface Command {
  readonly label: string;
  execute(): void;
  undo(): void;
}

export class CommandStack {
  private readonly undoStack: Command[] = [];
  private readonly redoStack: Command[] = [];

  constructor(private readonly maxDepth = 100) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null;
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null;
  }

  run(command: Command): void {
    command.execute();
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  /** Push an already-applied mutation (e.g. gizmo drag finished). */
  pushApplied(command: Command): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) this.undoStack.shift();
    this.redoStack.length = 0;
  }

  undo(): boolean {
    const cmd = this.undoStack.pop();
    if (!cmd) return false;
    cmd.undo();
    this.redoStack.push(cmd);
    return true;
  }

  redo(): boolean {
    const cmd = this.redoStack.pop();
    if (!cmd) return false;
    cmd.execute();
    this.undoStack.push(cmd);
    return true;
  }

  clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}

export function snapshotCommand<T>(
  label: string,
  before: T,
  after: T,
  apply: (value: T) => void,
): Command {
  return {
    label,
    execute: () => apply(after),
    undo: () => apply(before),
  };
}
