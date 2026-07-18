/** Semantic categories for audio libraries (mixer-group style). */
export type AudioLibraryCategory = 'sfx' | 'music' | 'ambient' | 'ui';

export interface MusicEntry {
  path: string;
  loop: boolean;
  volume: number;
}

export interface AudioClipDef {
  /** Filenames relative to the library basePath (or registry group path). */
  files?: string[];
  /** Reference into data/audio/sfx/registry.json → groups. */
  registry?: string;
  volume?: number;
  volumeRange?: [number, number];
  pitchRange?: [number, number];
  cooldownMs?: number;
  maxVoices?: number;
  loop?: boolean;
  /** When false, plays as stereo (UI). Defaults to spatial for non-ui libraries. */
  spatial?: boolean;
}

export interface SfxRegistryGroup {
  basePath: string;
  files: string[];
}

export interface SfxRegistry {
  version?: number;
  preferredFormats?: string[];
  generatedAt?: string;
  groups: Record<string, SfxRegistryGroup>;
}

export interface AudioLibraryDef {
  id: string;
  category: AudioLibraryCategory;
  basePath: string;
  clips: Record<string, AudioClipDef>;
  aliases?: Record<string, string>;
}

export interface MusicLayerDef {
  id: string;
  role: 'calm' | 'combat' | 'tension';
  volume?: number;
}

export interface MusicSetDef {
  layers: MusicLayerDef[];
  crossfadeMs?: number;
  attackThreshold?: number;
  releaseThreshold?: number;
  smoothing?: number;
}

export interface AudioManifest {
  version?: number;
  music: Record<string, MusicEntry>;
  libraries?: Record<string, string>;
  musicSets?: Record<string, MusicSetDef>;
}

/** Clip ready for playback — files resolved to `/assets/...` URLs. */
export interface ResolvedAudioClip {
  id: string;
  category: AudioLibraryCategory;
  urls: string[];
  def: AudioClipDef;
}
