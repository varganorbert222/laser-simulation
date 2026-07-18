import { resolveAssetUrl } from './runtime-paths';
import type {
  AudioClipDef,
  AudioLibraryDef,
  AudioManifest,
  ResolvedAudioClip,
  SfxRegistry,
} from './audio-types';
import { resolveRegistryClip } from './sfx-registry';

function resolveClipFiles(
  def: AudioClipDef,
  libraryBasePath: string,
  registry: SfxRegistry | null,
): { basePath: string; files: string[] } | null {
  if (def.registry) {
    const resolved = resolveRegistryClip(registry, def.registry);
    if (resolved) return resolved;
    console.warn(`[Audio] missing registry group: ${def.registry}`);
    return null;
  }
  if (def.files?.length) {
    return { basePath: libraryBasePath, files: def.files };
  }
  return null;
}

export async function loadAudioManifest(url: string): Promise<AudioManifest> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load audio manifest: ${url}`);
  const json = (await res.json()) as Partial<AudioManifest>;
  return {
    version: json.version,
    music: json.music ?? {},
    libraries: json.libraries,
    musicSets: json.musicSets,
  };
}

/**
 * Load library JSON files + resolve clip file lists (registry or inline).
 * Returns semantic clip id → resolved URLs under `/assets`.
 */
export async function loadAudioLibraries(
  manifest: AudioManifest,
  configBaseUrl: string,
  assetsBaseUrl: string,
  registry: SfxRegistry | null,
): Promise<{
  libraries: Map<string, AudioLibraryDef>;
  clips: Map<string, ResolvedAudioClip>;
}> {
  const libraries = new Map<string, AudioLibraryDef>();
  const clips = new Map<string, ResolvedAudioClip>();
  if (!manifest.libraries) return { libraries, clips };

  const base = configBaseUrl.replace(/\/+$/, '');

  for (const [libraryKey, relativePath] of Object.entries(manifest.libraries)) {
    try {
      const url = `${base}/${relativePath.replace(/^\/+/, '')}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const library = (await res.json()) as AudioLibraryDef;
      library.id = library.id || libraryKey;
      libraries.set(library.id, library);

      const registerClip = (clipKey: string, clipDef: AudioClipDef): void => {
        const resolved = resolveClipFiles(clipDef, library.basePath, registry);
        if (!resolved) return;
        const urls = resolved.files.map((file) =>
          resolveAssetUrl(`${resolved.basePath}/${file}`, assetsBaseUrl),
        );
        clips.set(clipKey, {
          id: clipKey,
          category: library.category,
          urls,
          def: { ...clipDef, files: resolved.files },
        });
      };

      for (const [clipKey, clipDef] of Object.entries(library.clips)) {
        registerClip(clipKey, clipDef);
      }

      if (library.aliases) {
        for (const [alias, clipKey] of Object.entries(library.aliases)) {
          const def = library.clips[clipKey];
          if (def) registerClip(alias, def);
        }
      }
    } catch (err) {
      console.warn(`[Audio] library load failed: ${libraryKey}`, err);
    }
  }

  return { libraries, clips };
}
