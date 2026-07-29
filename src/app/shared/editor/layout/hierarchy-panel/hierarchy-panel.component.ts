import {
  Component,
  EventEmitter,
  HostListener,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';
import {
  createHierarchyOutlinerState,
  flattenOutlinerHierarchy,
  seedExpandedHierarchyNodes,
  toggleNodeViewportVisibility,
  type HierarchyNode,
  type HierarchyOutlinerRow,
  type HierarchyOutlinerState,
  type HierarchyReorderEvent,
} from '@engine';
import type {
  HierarchyContextAction,
  HierarchySelectEvent,
} from '../../../../core/editor/hierarchy.types';

export type { HierarchyContextAction, HierarchySelectEvent };

@Component({
  selector: 'app-hierarchy-panel',
  standalone: true,
  templateUrl: './hierarchy-panel.component.html',
  styleUrl: './hierarchy-panel.component.scss',
})
export class HierarchyPanelComponent implements OnChanges {
  @Input() nodes: HierarchyNode[] = [];
  @Input() selectedId: string | null = null;
  @Input() selectedIds: string[] = [];
  @Input() editable = true;
  @Input() worldHidden: (id: string) => boolean = () => false;
  @Input() resetKey: string | number = 0;
  @Input() clipboardReady = false;
  @Input() canUndo = false;
  @Input() canRedo = false;
  @Input() undoLabel: string | null = null;
  @Input() redoLabel: string | null = null;

  @Output() nodeSelect = new EventEmitter<HierarchySelectEvent>();
  @Output() nodeReorder = new EventEmitter<HierarchyReorderEvent>();
  @Output() visibilityChange = new EventEmitter<{ id: string; visible: boolean }>();
  @Output() addAtRoot = new EventEmitter<void>();
  @Output() addSmokeAtRoot = new EventEmitter<void>();
  @Output() addSunAtRoot = new EventEmitter<void>();
  @Output() addBelow = new EventEmitter<string>();
  @Output() removeNode = new EventEmitter<string>();
  @Output() contextAction = new EventEmitter<{
    action: HierarchyContextAction;
    nodeId: string;
  }>();
  @Output() undo = new EventEmitter<void>();
  @Output() redo = new EventEmitter<void>();

  rows: HierarchyOutlinerRow[] = [];
  outlinerState: HierarchyOutlinerState = createHierarchyOutlinerState();
  dropHintId = '';
  dropHintPosition: HierarchyReorderEvent['position'] | '' = '';
  contextMenu: { x: number; y: number; node: HierarchyNode } | null = null;
  private dragSourceId = '';
  private selectedIdSet = new Set<string>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['selectedIds'] || changes['selectedId']) {
      this.selectedIdSet = new Set(
        this.selectedIds.length ? this.selectedIds : this.selectedId ? [this.selectedId] : [],
      );
    }
    if (changes['nodes'] || changes['resetKey']) {
      const prevExpanded = new Set(this.outlinerState.expanded);
      this.outlinerState = createHierarchyOutlinerState();
      if (prevExpanded.size) {
        this.outlinerState.expanded = prevExpanded;
      } else {
        seedExpandedHierarchyNodes(this.nodes, this.outlinerState.expanded);
      }
      this.rebuildRows();
    } else {
      this.rebuildRows();
    }
  }

  isNodeSelected(id: string): boolean {
    return this.selectedIdSet.has(id);
  }

  trackRow = (_: number, row: HierarchyOutlinerRow) => row.node.id;

  toggleExpanded(nodeId: string, event: MouseEvent): void {
    event.stopPropagation();
    if (this.outlinerState.expanded.has(nodeId)) {
      this.outlinerState.expanded.delete(nodeId);
    } else {
      this.outlinerState.expanded.add(nodeId);
    }
    this.rebuildRows();
  }

  isExpanded(nodeId: string): boolean {
    return this.outlinerState.expanded.has(nodeId);
  }

  onNodeClick(node: HierarchyNode, event: MouseEvent): void {
    this.contextMenu = null;
    if (event.shiftKey) {
      this.nodeSelect.emit({ id: node.id, mode: 'range' });
    } else if (event.ctrlKey || event.metaKey) {
      this.nodeSelect.emit({ id: node.id, mode: 'toggle' });
    } else {
      this.nodeSelect.emit({ id: node.id, mode: 'replace' });
    }
  }

  onVisibilityClick(row: HierarchyOutlinerRow, event: MouseEvent): void {
    event.stopPropagation();
    const visible = toggleNodeViewportVisibility(
      row.node,
      this.outlinerState,
      this.worldHidden,
    );
    this.rebuildRows();
    this.visibilityChange.emit({ id: row.node.id, visible });
  }

  onAddRoot(event: MouseEvent): void {
    event.stopPropagation();
    this.addAtRoot.emit();
  }

  onAddSmokeRoot(event: MouseEvent): void {
    event.stopPropagation();
    this.addSmokeAtRoot.emit();
  }

  onAddSunRoot(event: MouseEvent): void {
    event.stopPropagation();
    this.addSunAtRoot.emit();
  }

  onAddBelow(node: HierarchyNode, event: MouseEvent): void {
    event.stopPropagation();
    this.addBelow.emit(node.id);
  }

  onRemove(node: HierarchyNode, event: MouseEvent): void {
    event.stopPropagation();
    if (node.locked) return;
    this.removeNode.emit(node.id);
  }

  onRowContextMenu(row: HierarchyOutlinerRow, event: MouseEvent): void {
    if (!this.editable) return;
    event.preventDefault();
    event.stopPropagation();
    if (!this.isNodeSelected(row.node.id)) {
      this.nodeSelect.emit({ id: row.node.id, mode: 'replace' });
    }
    this.contextMenu = { x: event.clientX, y: event.clientY, node: row.node };
  }

  onContextPick(action: HierarchyContextAction): void {
    if (!this.contextMenu) return;
    const nodeId = this.contextMenu.node.id;
    this.contextMenu = null;
    this.contextAction.emit({ action, nodeId });
  }

  canCopyNode(node: HierarchyNode): boolean {
    return !node.locked;
  }

  canCutNode(node: HierarchyNode): boolean {
    return !node.locked;
  }

  canPasteIntoNode(node: HierarchyNode): boolean {
    return this.clipboardReady;
  }

  canRemoveNode(node: HierarchyNode): boolean {
    return !node.locked;
  }

  canDrag(row: HierarchyOutlinerRow): boolean {
    return this.editable && !row.node.locked;
  }

  onDragStart(row: HierarchyOutlinerRow, event: DragEvent): void {
    if (!this.canDrag(row)) {
      event.preventDefault();
      return;
    }
    this.dragSourceId = row.node.id;
    event.dataTransfer?.setData('text/plain', row.node.id);
    event.dataTransfer!.effectAllowed = 'move';
  }

  onDragOver(row: HierarchyOutlinerRow, event: DragEvent): void {
    if (!this.editable || !this.dragSourceId || this.dragSourceId === row.node.id) return;
    event.preventDefault();
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    let position: HierarchyReorderEvent['position'] = 'inside';
    if (y < 0.25) position = 'before';
    else if (y > 0.75) position = 'after';
    this.dropHintId = row.node.id;
    this.dropHintPosition = position;
  }

  onDragLeave(): void {
    this.dropHintId = '';
    this.dropHintPosition = '';
  }

  onDrop(row: HierarchyOutlinerRow, event: DragEvent): void {
    event.preventDefault();
    const sourceId = this.dragSourceId || event.dataTransfer?.getData('text/plain');
    const position = this.dropHintPosition || 'inside';
    this.dropHintId = '';
    this.dropHintPosition = '';
    this.dragSourceId = '';
    if (!sourceId || sourceId === row.node.id) return;
    // Multi-drag: if source is in selection, reorder all selected roots.
    const sources =
      this.selectedIdSet.has(sourceId) && this.selectedIdSet.size > 1
        ? [...this.selectedIdSet]
        : [sourceId];
    for (const sid of sources) {
      if (sid === row.node.id) continue;
      this.nodeReorder.emit({
        sourceId: sid,
        targetId: row.node.id,
        position,
      });
    }
  }

  onDragEnd(): void {
    this.dragSourceId = '';
    this.dropHintId = '';
    this.dropHintPosition = '';
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.contextMenu = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.contextMenu = null;
  }

  kindIcon(kind: string): string {
    switch (kind) {
      case 'scene':
        return '◈';
      case 'light':
        return '☀';
      case 'media':
        return '☁';
      case 'smoke':
        return '💨';
      case 'environment':
        return '▦';
      case 'empty':
        return '○';
      default:
        return '•';
    }
  }

  private rebuildRows(): void {
    this.rows = flattenOutlinerHierarchy(this.nodes, this.outlinerState, this.worldHidden);
  }
}
