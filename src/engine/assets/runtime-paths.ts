/** HTTP paths for runtime-loaded data (repo `data/`) and binaries (`assets/`). */
export const ASSETS_BASE_URL = '/assets';

export const DATA_BASE_URL = '/data';

export const RuntimePaths = {
  assetsBase: ASSETS_BASE_URL,
  dataBase: DATA_BASE_URL,
  assetManifest: `${DATA_BASE_URL}/manifest.json`,
  audioManifest: `${DATA_BASE_URL}/audio/manifest.json`,
  audioConfigBase: `${DATA_BASE_URL}/audio`,
} as const;

/** Join base + relative path into a clean absolute URL path. */
export function resolveAssetUrl(relativePath: string, baseUrl: string = ASSETS_BASE_URL): string {
  const base = baseUrl.replace(/\/+$/, '');
  const rel = relativePath.replace(/^\/+/, '');
  return `${base}/${rel}`;
}
