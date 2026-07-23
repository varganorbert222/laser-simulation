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
src/engine/           — tiszta domain (nincs Angular / Babylon)
  math/               — gl-matrix wrapperek + clamp / smoothstep
  physics/optics/     — szimulációs „fizika”: radiometria, közeg, BRDF (TS)
  ecs/                — World, components/, systems/, schedule
  render/             — pack DTO + quality + contract/ (GPU slotok, GLSL snippetek)
  editor/             — viewport gizmo math, editable vec3 view-modellek
  commands/, hierarchy/, selection/, save/, scene/, runtime/, assets/, noise/
src/adapters/babylon/ — FramePresenter: mesh / lights / postfx / volumetrics
src/platform/         — kliens persistence (JSON save/load; jövőbeli API DTO)
src/app/              — Angular UI + editor services + LocalizationService
```

Rétegszabályok:

- **math** → csak `gl-matrix`
- **physics/optics** → math; nincs GLSL, nincs World mutáció
- **ecs** → math + physics típusok/normalize
- **render/contract** → GPU szerződés (slot caps + shader parity); adapter innen importálja a GLSL-t
- **adapters** → `@engine` / `@engine/render/contract` (nem deep `physics/optics`)
- **app** → `@engine`, `@platform`, facade/host

Runtime:

- **StudioRuntime** futtatja a tick-et: `Schedule` (`worldTransform` → `gather`) → presenter `sync`/`render` (present a schedule-on kívül, adapter felelősség).
- **EditorFacade** vékony delegáló; a mutációk domain editor service-ekben vannak (`patchSelectedComponents` helperrel).
- Nincs HTTP backend most — a `platform/persistence` a jövőbeli API szerződés helye.

Path aliasok (`tsconfig.json` / vitest): `@engine`, `@adapters/*`, `@platform/*`, `@app/*`.
