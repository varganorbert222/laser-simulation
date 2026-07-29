import type { SerializedWorld } from '@engine';
import {
  createDefaultGlobalSunVolumetrics,
  createQuality,
  deserializeWorld,
  serializeWorld,
  type World,
} from '@engine';

/** Scene document DTO — shared contract for client I/O and future HTTP API. */
export type SceneDocument = SerializedWorld;

/**
 * Drop project-level graphics from a scene document so Quality / GlobalSun
 * are not authored per scene (Unity/Unreal-style project settings).
 * Atmosphere civil time stays; render look is overlaid from prefs on load.
 */
export function stripGlobalGraphicsFromSceneDocument(doc: SceneDocument): SceneDocument {
  return {
    ...doc,
    resources: {
      ...doc.resources,
      Quality: createQuality('medium'),
      GlobalSunVolumetrics: createDefaultGlobalSunVolumetrics(),
    },
  };
}

export function worldToDocument(world: World): SceneDocument {
  const raw = JSON.parse(serializeWorld(world)) as SceneDocument;
  return stripGlobalGraphicsFromSceneDocument(raw);
}

export function documentToWorld(doc: SceneDocument | string): World {
  const json = typeof doc === 'string' ? doc : JSON.stringify(doc);
  return deserializeWorld(json);
}

function downloadTextFile(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function downloadSceneJson(world: World, filename = 'light-studio-scene.json'): void {
  const doc = worldToDocument(world);
  downloadTextFile(filename, JSON.stringify(doc, null, 2));
}
