import type { SerializedWorld } from '@engine';
import { deserializeWorld, serializeWorld, type World } from '@engine';

/** Scene document DTO — shared contract for client I/O and future HTTP API. */
export type SceneDocument = SerializedWorld;

export function worldToDocument(world: World): SceneDocument {
  return JSON.parse(serializeWorld(world)) as SceneDocument;
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
  downloadTextFile(filename, serializeWorld(world));
}
