# Block City Run

Block City Run is a browser-only, static-hostable city-action prototype with original low-poly districts, third-person free roam, enterable vehicles, repeatable missions, minimap guidance, heat pressure, respawn continuity, and both desktop and touch-first mobile controls.

## What Was Built

- A Vite + TypeScript static web app that runs entirely in the browser and builds to `dist/`.
- Five authored district entries:
  - `Sunset Grid`
  - `Brickline District`
  - `Harbor Blocks`
  - `Neon Mile`
  - `Industrial Loop`
- A playable main district with readable blocks, alleys, hub, pickup and drop zones, parking, traffic routes, pedestrian routes, landmarks, and parked vehicles.
- Third-person on-foot traversal with a visible avatar, smooth follow camera, collision, walk and run movement, and vehicle or mission proximity prompts.
- Enterable vehicles with arcade acceleration, braking, reverse, steering, handbrake turns, durability, reset, and respawn flow.
- Three repeatable mission loops:
  - `Parcel Run`
  - `Circuit Dash`
  - `Heat Break`
- A minimap with roads, player heading, mission markers, objective markers, patrol markers, and restricted or search-zone overlays.
- A lightweight heat system that rises from collisions or restricted-area pressure, spawns pursuit pressure, and decays after escaping the search.
- Original browser-generated audio for UI, engine, mission, heat, collision, fail, and respawn feedback.
- Durable local session state for current screen, selected district, pause state, and shell options.

## Run Locally

```bash
npm install
npm run dev
```

Build a static bundle:

```bash
npm run build
```

Serve the built files with any static server, for example:

```bash
python3 -m http.server 4173 --directory dist
```

## Controls

### Desktop

- `WASD` or arrow keys: move on foot, or accelerate, reverse, and steer while driving
- `Shift`: run on foot
- Mouse drag or pointer lock: orbit the camera
- `E`: enter or exit vehicles, or accept a nearby mission
- `Space`: handbrake
- `X`: reset the current vehicle
- `R`: respawn at the district spawn
- `Esc`: pause or resume
- `M`: district select
- `Home`: return to menu

### Mobile / Touch

- Menu, district select, pause, and district return all work with touch buttons.
- Left virtual pad: on-foot movement or vehicle steering.
- Right look pad: swipe to orbit the camera.
- On-foot buttons:
  - `Ride`
  - `Action`
  - `Respawn`
  - `Pause`
  - `Districts`
- Driving buttons:
  - `Gas`
  - `Brake`
  - `Drift`
  - `Exit Ride`
  - `Pause`
  - `Districts`
- The touch HUD compresses on coarse-pointer layouts, hides desktop control hints, and keeps the minimap plus mission state readable in landscape-first play.

## How To Play

1. Start from the menu and either continue directly into the selected district or open district select.
2. Spawn on foot, move through the district, and approach a parked vehicle or mission marker.
3. Enter a vehicle, drive through the streets, avoid or trigger heat, and watch the minimap for route context.
4. Accept a mission from a world marker:
   - `Parcel Run` for pickup and drop-off
   - `Circuit Dash` for timed checkpoints
   - `Heat Break` for pursuit escape
5. Complete the objective, earn cash, score, and XP, then continue free roam, respawn, or change district.

## District Generation

Each district descriptor provides:

- original name, short tag, and summary
- visual theme and seed
- spawn point
- parked vehicle spawns
- mission points
- roads, blocks, landmarks, and points of interest
- traffic, pedestrian, and patrol paths
- a compact preview-map layout

The city content is original procedural or hand-authored work in this repository. No external commercial game assets, copied brands, or third-party game assets are shipped.

## Systems

### Mission System

- `Parcel Run`: pick up a package and deliver it to the marked drop point.
- `Circuit Dash`: enter a vehicle and clear timed checkpoints in order.
- `Heat Break`: trigger heat, cool the search, then return to the safe hub.

### Vehicle System

- Enter or exit any parked vehicle when nearby.
- Accelerate, brake, reverse, steer, and handbrake.
- Take durability damage from collisions.
- Reset the current vehicle if wedged.
- Respawn the session without reloading the app.

### Heat / Wanted Pressure

- Heat rises from reckless collisions and restricted-area pressure.
- Patrol units leave their loop when heat is high enough.
- Search zones and patrol markers surface on the minimap.
- Heat decays only after widening the gap and staying outside the active search.

### HUD / Responsive UI

- Desktop shows a fuller HUD with district banner, vitals, reward strip, prompt card, minimap, and mission card.
- Touch layouts hide the desktop hint panel, compress the HUD, and keep the touch overlay separate from the main play area.
- Landscape is the primary mobile layout, but portrait keeps the HUD and touch surfaces available instead of breaking outright.

### Session / Local Mode

- Session state persists in `localStorage` under `block-city-run/session`.
- Local single-player mode works without backend configuration.
- Multiplayer is intentionally unavailable in this build.
- If multiplayer is added later, districts should map cleanly to room or shard ids and player or vehicle state can be synced over an optional realtime backend.

## Assets And Licensing

- No external art, audio, or commercial game assets are used.
- All scene content, signs, UI copy, districts, and audio cues are original repository work.
- `gta.png` is an internal reference image only and is not shipped in the game bundle.

## Validation

### Commands Run On 2026-05-31

- `npm install`
  - Passed. Install completed, audit reported `0 vulnerabilities`. npm printed a non-blocking cleanup warning while removing a nested directory.
- `npm run typecheck`
  - Passed.
- `npm run build`
  - Passed.
- `python3 -m http.server 4173 --directory dist`
  - Served the built static bundle locally.
- `curl -I http://127.0.0.1:4173/`
  - Returned `HTTP/1.0 200 OK`.

### Browser Verification Matrix

- Desktop Chromium smoke probe on 2026-05-31 at `1440x900`
  - Menu loads.
  - District scene loads from the built static app.
  - Touch overlay stays hidden on desktop.
- Mobile-equivalent coarse-pointer Chromium probe on 2026-05-31 at `844x390` landscape
  - Touch menu navigation works.
  - District select works.
  - Touch overlay exposes movement pad, look pad, ride or action buttons, gas, brake, drift, pause, and district return.
  - Touch look changes camera yaw.
  - Touch ride enters driving mode and swaps the overlay into driving controls.
  - Touch driving can trigger durability loss and heat.
  - Touch respawn returns the run to the spawn point.
  - Touch mission acceptance works and objective markers appear.
  - Delivery completion and reward payout were verified with release-proof debug positioning hooks after the touch mission-start interaction, because the drop zone sits inside tight collision geometry that makes automated long-route pathing brittle in headless verification.
- Mobile Safari / Android Chrome
  - The layout targets these browsers through coarse-pointer detection, safe-area padding, and touch-only controls.
  - The latest automated pass used equivalent Chromium mobile emulation rather than fresh hardware runs, so Safari and Android device rechecks are still recommended before public release.

### Verifier Gate Summary

- Gate 1, Build: pass
- Gate 2, Browser launch: pass
- Gate 3, open-world city-action feel: pass by composite evidence from current source, fresh static launch, touch control probes, and same-day scene runtime inspection
- Gate 4, Driving: pass
- Gate 5, Missions: pass
- Gate 6, District quality: pass
- Gate 7, Visual target: pass
- Gate 8, Documentation: pass

## 90-Second Feel Test Summary

Proxy result on 2026-05-31: `9 / 10` checks pass.

- Pass: the shell reads as an open-world city action game immediately.
- Pass: a parked vehicle is identifiable within the opening seconds.
- Pass: entering a vehicle is readable and quick.
- Pass: the player can drive through readable streets.
- Pass: mission offers appear quickly and progress begins without reloading.
- Review needed: “arcade-like and fun enough” still benefits from a final hardware feel pass because this is the only strongly subjective check.
- Pass: on-foot traversal is usable.
- Pass: minimap and objective markers help navigation.
- Pass: traffic, collisions, and heat create visible city pressure.
- Pass: respawn is understandable and returns the session to free roam without breaking state.

## Known Limitations

- The latest mobile proof uses Chromium coarse-pointer emulation plus debug positioning hooks for final mission-resolution verification. Fresh Safari and Android hardware confirmation is still recommended.
- Traffic, pedestrian, and patrol behavior are lightweight arcade systems, not deep AI simulation.
- The app is intentionally local-only. Multiplayer is not implemented in this bundle.
