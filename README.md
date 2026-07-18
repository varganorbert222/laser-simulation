# Volumetric Light Studio

Interaktív 3D fénylaboratórium: fényforrások (lámpa, spot, kollimált, lézer) köd/füst közegben, volumetrikus szórással és élő tudományos kiolvasásokkal.

## Futtatás

```bash
npm install
npm start
```

Majd nyisd meg a http://localhost:4200 címet.

## Tesztek (engine)

```bash
npm run test:engine
```

## Assetek (rogue-leader minta)

| Git | Runtime URL | Tartalom |
|-----|-------------|----------|
| `data/` | `/data` | JSON manifestek (modellek, skyboxok, audio libraryk) |
| `assets/` | `/assets` | Binárisok (GLB, PNG, WAV/MP3) — extensionök gitignore-olva |

```
assets/models/{fixtures,props,stage}/
assets/textures/skybox/
assets/audio/music/
assets/audio/sfx/{ambient,ui,fixtures}/
```

SFX hozzáadás: fájl → `npm run audio:registry` → clip a `data/audio/libraries/*.json`-ben. Bootkor: `studioAssets.load()`.

## Architektúra

```
src/engine/      — tiszta domain: ECS, Schedule/StudioRuntime, optika, commands, gl-matrix math
src/adapters/    — Babylon presenter (mesh / lights / postfx / volumetrics)
src/platform/    — kliens persistence szeam (JSON save/load; jövőbeli API DTO)
src/app/         — Angular UI + editor domain services
```

- **Engine** nem függ Angularról és Babylonról (math: `gl-matrix`).
- **StudioRuntime** futtatja a tick-et (`Schedule` → presenter sync/render).
- **EditorFacade** vékony delegáló; a mutációk domain service-ekben vannak.
- Nincs HTTP backend most — a `platform/persistence` a jövőbeli API szerződés helye.
