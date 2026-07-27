import type { ComponentMap, ComponentName, EntityId } from '../ecs/components';
import { USER_ADDABLE_COMPONENTS } from '../ecs/components';
import type { World } from '../ecs/world';

export type FieldState<T> =
  | { kind: 'equal'; value: T }
  | { kind: 'mixed' };

export function fieldState<T>(
  values: readonly T[],
  equals: (a: T, b: T) => boolean = (a, b) => Object.is(a, b),
): FieldState<T> {
  if (values.length === 0) return { kind: 'mixed' };
  const first = values[0]!;
  for (let i = 1; i < values.length; i++) {
    if (!equals(first, values[i]!)) return { kind: 'mixed' };
  }
  return { kind: 'equal', value: first };
}

export function fieldStateJson<T>(values: readonly T[]): FieldState<T> {
  return fieldState(values, (a, b) => JSON.stringify(a) === JSON.stringify(b));
}

const ALL_COMPONENTS: readonly ComponentName[] = [
  'Name',
  'Parent',
  'SiblingOrder',
  'Transform',
  'WorldXform',
  'FixtureRef',
  'EnvironmentPiece',
  'SurfaceMaterial',
  'LightEmitter',
  'MediaVolume',
  'SmokeEmitter',
  'FogVolume',
  'FluidVolume',
  'Selectable',
  'ViewportHidden',
  'EditorFlags',
];

/** Component names present on every selected entity. */
export function sharedComponents(world: World, ids: readonly EntityId[]): ComponentName[] {
  if (ids.length === 0) return [];
  return ALL_COMPONENTS.filter((name) => ids.every((id) => world.has(id, name)));
}

/** User-facing components shared by all selected entities (inspector order). */
export function sharedUserComponents(
  world: World,
  ids: readonly EntityId[],
): ComponentName[] {
  const shared = new Set(sharedComponents(world, ids));
  const order: ComponentName[] = [
    'Name',
    'Transform',
    ...USER_ADDABLE_COMPONENTS,
    'SmokeEmitter',
    'ViewportHidden',
    'EditorFlags',
  ];
  return order.filter((c) => shared.has(c));
}

export function selectionHasComponent(
  world: World,
  ids: readonly EntityId[],
  name: ComponentName,
): boolean {
  return ids.length > 0 && ids.every((id) => world.has(id, name));
}

export function collectComponentValues<C extends ComponentName>(
  world: World,
  ids: readonly EntityId[],
  name: C,
): ComponentMap[C][] {
  const out: ComponentMap[C][] = [];
  for (const id of ids) {
    const v = world.get(id, name);
    if (v !== undefined) out.push(structuredClone(v));
  }
  return out;
}
