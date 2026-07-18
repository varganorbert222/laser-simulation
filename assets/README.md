# Binary assets

Large media only — models (`.glb`), audio (`.wav` / `.ogg` / `.mp3`), textures (`.png` / `.jpg` / `.hdr`), etc.

Configuration lives in [`data/`](../data/) (git). Binary files under this tree are gitignored by extension; keep folders with `.gitkeep`.

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
3. Wire semantic ids in `data/manifest.json` (models/skyboxes) or `data/audio/libraries/*.json` (clips).
