/** Hierarchy UI event types — kept out of Angular components for facade imports. */

export type HierarchyContextAction =
  | 'add'
  | 'addSmoke'
  | 'addSun'
  | 'rename'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'duplicate'
  | 'delete';

export type HierarchySelectEvent = {
  id: string;
  mode: 'replace' | 'toggle' | 'range';
};
