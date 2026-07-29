# Volumetric Light Studio

InteraktĂ­v 3D fĂ©nylaboratĂłrium: fĂ©nyforrĂˇsok (lĂˇmpa, spot, kollimĂˇlt, lĂ©zer) kĂ¶d/fĂĽst kĂ¶zegben, volumetrikus szĂłrĂˇssal Ă©s Ă©lĹ‘ tudomĂˇnyos kiolvasĂˇsokkal.

## FuttatĂˇs

```bash
npm install
npm start
```

Majd nyisd meg a http://localhost:4200 cĂ­met.

## Tesztek (engine)

```bash
npm run test:engine
```

## Assetek (rogue-leader minta)

| Git | Runtime URL | Tartalom |
|-----|-------------|----------|
| `data/` | `/data` | JSON manifestek (modellek, skyboxok, audio libraryk) |
| `assets/` | `/assets` | BinĂˇrisok (GLB, PNG, WAV/MP3) â€” extensionĂ¶k gitignore-olva |

```
assets/models/{fixtures,props,stage}/
assets/textures/skybox/
assets/audio/music/
assets/audio/sfx/{ambient,ui,fixtures}/
```

SFX hozzĂˇadĂˇs: fĂˇjl â†’ `npm run audio:registry` â†’ clip a `data/audio/libraries/*.json`-ben. Bootkor: `studioAssets.load()`.

## ArchitektĂşra

```
src/engine/           â€” tiszta domain (nincs Angular / Babylon)
  math/               â€” gl-matrix wrapperek + clamp / smoothstep
  physics/
    optics/           â€” radiometria / display / beam / surface / media / atmosphere / scene
    fog/              â€” grid NS atlas + fog presets
    fluid/            â€” SPH vĂ­z, gravity/wind kĂ¶rnyezet
    astro/            â€” SPA napszĂˇmĂ­tĂˇs
  ecs/                â€” World, components/, systems/, schedule
  render/             â€” pack DTO + quality + contract/ (GPU slotok, GLSL snippetek)
  editor/             â€” viewport gizmo math, editable vec3 view-modellek
  commands/, hierarchy/, selection/, save/, scene/, runtime/, assets/, noise/
src/adapters/babylon/ â€” FramePresenter: mesh / lights / fog / water / postfx / volumetrics / gizmos
src/platform/         â€” kliens persistence (JSON save/load; jĂ¶vĹ‘beli API DTO)
src/app/              â€” Angular UI + editor services + LocalizationService
  shared/editor/      â€” shell / layout / settings / sections / fields
```

RĂ©tegszabĂˇlyok:

- **math** â†’ csak `gl-matrix`
- **physics/optics** â†’ math; nincs GLSL, nincs World mutĂˇciĂł (alcsoportok: atmosphere, display, beam, surface, media, scene)
- **ecs** â†’ math + physics tĂ­pusok/normalize
- **render/contract** â†’ GPU szerzĹ‘dĂ©s (slot caps + shader parity); adapter innen importĂˇlja a GLSL-t
- **adapters** â†’ `@engine` / `@engine/render/contract` (nem deep `physics/optics`)
- **app** â†’ `@engine`, `@platform`, facade/host

Runtime:

- **StudioRuntime** futtatja a tick-et: `Schedule` (`worldTransform` â†’ `gather`) â†’ presenter `sync`/`render` (present a schedule-on kĂ­vĂĽl, adapter felelĹ‘ssĂ©g).
- **EditorFacade** vĂ©kony delegĂˇlĂł; a mutĂˇciĂłk domain editor service-ekben vannak (`patchSelectedComponents` helperrel).
- Nincs HTTP backend most â€” a `platform/persistence` a jĂ¶vĹ‘beli API szerzĹ‘dĂ©s helye.

Path aliasok (`tsconfig.json` / vitest): `@engine`, `@adapters/*`, `@platform/*`, `@app/*`.

