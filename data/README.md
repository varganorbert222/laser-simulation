# Runtime data (JSON manifests & config)

Version-controlled configuration served at `/data/` by the Angular build (`angular.json`).

| Path | Purpose |
|------|---------|
| `manifest.json` | Models, skyboxes, textures — paths relative to `/assets` |
| `audio/manifest.json` | Music tracks, music sets, library index |
| `audio/libraries/` | Semantic clip playback rules (volume, cooldown, registry refs) |
| `audio/sfx/registry.json` | Auto-generated SFX file lists (`npm run audio:registry`) |

Binary media (GLB, WAV, PNG, …) live in [`assets/`](../assets/). Drop files there, then wire **ids** in these JSON catalogs. Runtime code must resolve via `studioAssets` — never hardcode asset paths.

Editor catalogs that are not media libraries (`quality`, fixtures labels, demo scenes) stay under `public/catalog/`. User-authored noise volumes and saved scenes use localStorage libraries, not this manifest.
