# Audio catalogs

Binary files: `assets/audio/`. Clip rules: this folder (`/data/audio/`).

## Layout

```
data/audio/
  manifest.json           # music + library index
  libraries/
    sfx.json              # one-shots / loops (fixtures, interactions)
    ambient.json          # room hum, wind, atmosphere loops
    ui.json               # editor / HUD clicks
  sfx/registry.json       # npm run audio:registry

assets/audio/
  music/
  sfx/ambient/
  sfx/ui/
  sfx/fixtures/
```

## Adding a sound

1. Drop `.wav` (preferred) / `.ogg` / `.mp3` into `assets/audio/sfx/<folder>/`.
2. `npm run audio:registry`
3. Add a clip in the matching library with `"registry": "<folder>/<stem>"` (or inline `"files"`).
4. Play by semantic clip id from app/engine code.
