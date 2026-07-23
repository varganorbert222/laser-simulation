export interface Selectable {
  selected: boolean;
}

/** Eye-toggle in outliner — hide mesh helpers in viewport. */
export interface ViewportHidden {
  hidden: boolean;
}

/** Protect scene root from accidental delete. */
export interface EditorFlags {
  locked?: boolean;
  isSceneRoot?: boolean;
}
