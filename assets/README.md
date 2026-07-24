# Binary assets

Large media only — models (`.glb`), audio (`.wav` / `.ogg` / `.mp3`), textures (`.png` / `.jpg` / `.hdr`), etc.

Configuration lives in [`data/`](../data/) (git). Binary files under this tree are gitignored by extension; keep folders with `.gitkeep`.

**Rule:** application code never hardcodes `/assets/...` paths. Always register an id in `data/manifest.json` (or audio manifests) and resolve via `studioAssets`.

## Expected layout

```
assets/
  models/
    fixtures/<id>/…
    props/<id>/…
    stage/<id>/…
  textures/
    skybox/<id>/…
  audio/
    music/…
    sfx/
      ambient/…
      ui/…
      fixtures/…
```

URL rule: every relative path in `data/` manifests resolves as `/assets/<path>`.

## Adding content

1. Drop binaries into the matching folder above.
2. For SFX: `npm run audio:registry` → updates `data/audio/sfx/registry.json`.
3. Wire semantic ids in `data/manifest.json`:
   - `models` — GLB fixtures / props / stage
   - `skyboxes` — photodome (equirect) or cubemap (6 faces)
   - `textures` — 2D maps (night sky, moon, future surface maps)
4. Or wire clips in `data/audio/libraries/*.json`.
5. Pick the id in the Asset Catalog UI / Render settings / EnvironmentPiece.catalogId.
