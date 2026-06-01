import { GameAudio } from "./audio/gameAudio";
import { districts, getDistrictById } from "./data/districts";
import { ShellScene } from "./scene/shellScene";
import { createSessionStore } from "./state/session";
import type { DistrictDescriptor, SessionState, ShellSceneRuntimeSnapshot } from "./types";

const store = createSessionStore();

type BlockCityRunDebug = {
  getSnapshot: () => {
    sceneAvailable: boolean;
    session: SessionState;
    runtime: ShellSceneRuntimeSnapshot | null;
    scene: ReturnType<ShellScene["getDebugState"]> | null;
  };
  touch: {
    setMove: (x: number, y: number) => void;
    setDriveButton: (button: "accelerate" | "brake" | "handbrake", active: boolean) => void;
    look: (deltaX: number, deltaY: number) => void;
    interact: () => void;
    ride: () => void;
    respawn: () => void;
    resetRide: () => void;
  };
  debug: {
    setPlayerPosition: (x: number, z: number) => void;
    setActiveVehiclePosition: (x: number, z: number, yaw?: number) => void;
    setVehiclePosition: (vehicleId: string, x: number, z: number, yaw?: number) => void;
  };
};

type TouchDriveButton = "accelerate" | "brake" | "handbrake";

function touchUiPreferred(): boolean {
  const coarsePointer = ["(pointer: coarse)", "(any-pointer: coarse)", "(hover: none)"].some(
    (query) => typeof window.matchMedia === "function" && window.matchMedia(query).matches,
  );
  return coarsePointer || (navigator.maxTouchPoints > 0 && window.innerWidth <= 1024);
}

function touchButtonMarkup(
  label: string,
  attributes: string,
  tone: "hold" | "action" | "utility" = "action",
): string {
  return `<button type="button" class="touch-button touch-button-${tone}" ${attributes}>${label}</button>`;
}

function formatSavedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.valueOf())) {
    return "just now";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function applyPalette(root: HTMLElement, district: DistrictDescriptor): void {
  root.style.setProperty("--sky-top", district.palette.skyTop);
  root.style.setProperty("--sky-bottom", district.palette.skyBottom);
  root.style.setProperty("--sky-haze", district.palette.haze);
  root.style.setProperty("--accent", district.palette.accent);
  root.style.setProperty("--accent-strong", district.palette.secondaryAccent);
  root.style.setProperty("--panel-line", `${district.palette.accent}66`);
}

function toggleMarkup(state: SessionState, option: "showControlHints" | "reduceMotion"): string {
  const checked = state.options[option] ? "checked" : "";
  const label = option === "showControlHints" ? "Show control hints" : "Reduce motion";
  const description =
    option === "showControlHints"
      ? "Keeps keyboard and touch guidance visible across the shell."
      : "Tones down camera drift and traffic animation.";

  return `
    <label class="toggle">
      <input type="checkbox" data-option="${option}" ${checked} />
      <span class="toggle-copy">
        <strong>${label}</strong>
        <small>${description}</small>
      </span>
    </label>
  `;
}

function sceneFallbackMarkup(sceneAvailable: boolean): string {
  if (sceneAvailable) {
    return "";
  }

  return `
    <div class="fallback-note">
      <div class="status-chip">Visual fallback active</div>
      <p>
        WebGL is unavailable in this environment, so the shell is using the static sky backdrop while keeping menu flow
        and local session state online.
      </p>
    </div>
  `;
}

function previewCellClass(symbol: string): string {
  switch (symbol) {
    case "#":
      return "preview-cell preview-block";
    case "|":
      return "preview-cell preview-avenue";
    case "-":
      return "preview-cell preview-street";
    case "=":
      return "preview-cell preview-alley";
    case "g":
      return "preview-cell preview-hub";
    case "m":
      return "preview-cell preview-pickup";
    case "d":
      return "preview-cell preview-dropoff";
    case "w":
      return "preview-cell preview-warehouse";
    case "p":
      return "preview-cell preview-park";
    case "+":
      return "preview-cell preview-poi";
    default:
      return "preview-cell preview-empty";
  }
}

function previewMarkup(district: DistrictDescriptor): string {
  return `
    <div class="preview-shell">
      <div class="preview-grid" aria-label="${district.name} district preview">
        ${district.preview.rows
          .map(
            (row) => `
              <div class="preview-row">
                ${row
                  .split("")
                  .map(
                    (symbol) => `
                      <span class="${previewCellClass(symbol)}" data-symbol="${symbol === "." ? "" : symbol}"></span>
                    `,
                  )
                  .join("")}
              </div>
            `,
          )
          .join("")}
      </div>
      <div class="preview-legend">
        ${district.preview.legend
          .map(
            (entry) => `
              <span><strong>${entry.symbol}</strong>${entry.label}</span>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function landmarkMarkup(district: DistrictDescriptor): string {
  return district.landmarks.map((landmark) => `<span>${landmark.name}</span>`).join("");
}

function districtStatsMarkup(district: DistrictDescriptor): string {
  return `
    <div class="stack-list">
      <div>
        <span class="stack-label">Blocks</span>
        <strong>${district.blocks.length}</strong>
      </div>
      <div>
        <span class="stack-label">Roads</span>
        <strong>${district.roads.length}</strong>
      </div>
      <div>
        <span class="stack-label">Landmarks</span>
        <strong>${district.landmarks.length}</strong>
      </div>
    </div>
  `;
}

function missionMarkup(district: DistrictDescriptor): string {
  return `
    <div class="route-list">
      <div class="route-card">
        <span class="stack-label">Spawn</span>
        <strong>${district.spawnPoint.label}</strong>
      </div>
      <div class="route-card">
        <span class="stack-label">First parked vehicle</span>
        <strong>${district.vehicleSpawnPoints[0]?.label ?? "Unavailable"}</strong>
      </div>
      ${district.missionPoints
        .map(
          (missionPoint) => `
            <div class="route-card">
              <span class="stack-label">${missionPoint.kind}</span>
              <strong>${missionPoint.label}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function runtimeForDistrict(
  runtime: ShellSceneRuntimeSnapshot | null,
  district: DistrictDescriptor,
): ShellSceneRuntimeSnapshot {
  return (
    runtime ?? {
      playerMode: "onFoot",
      districtName: district.name,
      districtTag: district.shortTag,
      health: 100,
      vehicleDurability: null,
      speed: null,
      activeVehicleLabel: null,
      nearbyVehicleLabel: null,
      playerPosition: district.spawnPoint.position,
      playerHeading: district.spawnPoint.facing,
      cash: 0,
      score: 0,
      xp: 0,
      heatLevel: 0,
      heatMaxLevel: 5,
      heatLabel: "Clear",
      patrolAlert: false,
      prompt: "Loading free-roam systems...",
      status: "District runtime is syncing.",
      message: {
        text: "Loading free-roam systems...",
        tone: "info",
      },
      activeMission: null,
      nearbyMissionOffer: null,
      minimapMarkers: [],
      pointerLockSupported: false,
      pointerLockActive: false,
      canRespawn: true,
      canResetVehicle: false,
    }
  );
}

function sceneModeLabel(runtime: ShellSceneRuntimeSnapshot): string {
  if (runtime.playerMode === "driving") {
    return runtime.activeVehicleLabel ? `Driving ${runtime.activeVehicleLabel}` : "Driving";
  }

  if (runtime.playerMode === "downed") {
    return "Respawn queued";
  }

  return runtime.nearbyVehicleLabel ? `On foot near ${runtime.nearbyVehicleLabel}` : "On foot";
}

function meterMarkup(label: string, value: number, max: number, tone: "health" | "durability"): string {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return `
    <div class="meter-card">
      <div class="meter-copy">
        <span class="stack-label">${label}</span>
        <strong>${value}</strong>
      </div>
      <div class="meter-track">
        <span class="meter-fill meter-fill-${tone}" style="width: ${percent}%"></span>
      </div>
    </div>
  `;
}

function speedMarkup(runtime: ShellSceneRuntimeSnapshot): string {
  const speed = runtime.speed ?? 0;
  return `
    <div class="speed-card">
      <span class="stack-label">Speed</span>
      <strong>${speed}</strong>
      <small>km/h</small>
    </div>
  `;
}

function formatDistance(distance: number | null): string {
  if (distance === null || Number.isNaN(distance)) {
    return "Route live";
  }

  return `${Math.max(0, Math.round(distance))} m`;
}

function heatMarkup(runtime: ShellSceneRuntimeSnapshot): string {
  const pips = Array.from({ length: runtime.heatMaxLevel }, (_, index) => {
    const active = index < runtime.heatLevel ? " heat-pip-active" : "";
    return `<span class="heat-pip${active}"></span>`;
  }).join("");

  return `
    <div class="heat-shell">
      <div class="meter-copy">
        <span class="stack-label">Heat</span>
        <strong>${runtime.heatLabel}</strong>
      </div>
      <div class="heat-pips">${pips}</div>
    </div>
  `;
}

function districtBounds(district: DistrictDescriptor): { minX: number; maxX: number; minZ: number; maxZ: number } {
  const points = [
    district.spawnPoint.position,
    ...district.vehicleSpawnPoints.map((entry) => entry.position),
    ...district.missionPoints.map((entry) => entry.position),
    ...district.landmarks.map((entry) => entry.position),
    ...district.pointsOfInterest.map((entry) => entry.position),
  ];

  const roadEdges = district.roads.flatMap((road) =>
    road.orientation === "vertical"
      ? [
          { x: road.center.x - road.width / 2 - 4, z: road.center.z - road.length / 2 - 4 },
          { x: road.center.x + road.width / 2 + 4, z: road.center.z + road.length / 2 + 4 },
        ]
      : [
          { x: road.center.x - road.length / 2 - 4, z: road.center.z - road.width / 2 - 4 },
          { x: road.center.x + road.length / 2 + 4, z: road.center.z + road.width / 2 + 4 },
        ],
  );
  const all = [...points, ...roadEdges];
  const xs = all.map((point) => point.x);
  const zs = all.map((point) => point.z);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs),
  };
}

function minimapMarkup(district: DistrictDescriptor, runtime: ShellSceneRuntimeSnapshot): string {
  const bounds = districtBounds(district);
  const width = Math.max(1, bounds.maxX - bounds.minX);
  const depth = Math.max(1, bounds.maxZ - bounds.minZ);
  const mapX = (x: number): number => ((x - bounds.minX) / width) * 100;
  const mapY = (z: number): number => 100 - ((z - bounds.minZ) / depth) * 100;
  const playerX = mapX(runtime.playerPosition.x);
  const playerY = mapY(runtime.playerPosition.z);
  const headingDegrees = (runtime.playerHeading * 180) / Math.PI;
  const objectiveMarker = runtime.minimapMarkers.find(
    (marker) => marker.emphasis === "active" && marker.kind !== "restricted" && marker.kind !== "patrol",
  );

  return `
    <div class="minimap-shell">
      <svg class="minimap-svg" viewBox="0 0 100 100" aria-label="${district.name} minimap" role="img">
        <rect x="0" y="0" width="100" height="100" rx="8" class="minimap-backdrop" />
        ${district.roads
          .map((road) => {
            const x =
              road.orientation === "vertical" ? mapX(road.center.x - road.width / 2) : mapX(road.center.x - road.length / 2);
            const y =
              road.orientation === "vertical" ? mapY(road.center.z + road.length / 2) : mapY(road.center.z + road.width / 2);
            const roadWidth = road.orientation === "vertical" ? (road.width / width) * 100 : (road.length / width) * 100;
            const roadHeight = road.orientation === "vertical" ? (road.length / depth) * 100 : (road.width / depth) * 100;
            return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${roadWidth.toFixed(2)}" height="${roadHeight.toFixed(2)}" rx="1.2" class="minimap-road minimap-road-${road.kind}"></rect>`;
          })
          .join("")}
        ${runtime.minimapMarkers
          .filter((marker) => marker.kind === "restricted" && marker.radius)
          .map((marker) => {
            const radius = ((marker.radius ?? 0) / Math.max(width, depth)) * 100;
            return `<circle cx="${mapX(marker.position.x).toFixed(2)}" cy="${mapY(marker.position.z).toFixed(2)}" r="${radius.toFixed(2)}" class="minimap-search-zone"></circle>`;
          })
          .join("")}
        ${
          objectiveMarker
            ? `<line x1="${playerX.toFixed(2)}" y1="${playerY.toFixed(2)}" x2="${mapX(objectiveMarker.position.x).toFixed(2)}" y2="${mapY(objectiveMarker.position.z).toFixed(2)}" class="minimap-route-line"></line>`
            : ""
        }
        ${runtime.minimapMarkers
          .filter((marker) => marker.kind !== "restricted")
          .map((marker) => {
            const x = mapX(marker.position.x);
            const y = mapY(marker.position.z);
            if (marker.kind === "patrol") {
              const rotation = (((marker.heading ?? 0) * 180) / Math.PI).toFixed(2);
              return `<polygon points="${(x).toFixed(2)},${(y - 2.4).toFixed(2)} ${(x - 1.8).toFixed(2)},${(y + 1.8).toFixed(2)} ${(x + 1.8).toFixed(2)},${(y + 1.8).toFixed(2)}" transform="rotate(${rotation} ${x.toFixed(2)} ${y.toFixed(2)})" class="minimap-marker minimap-marker-patrol"></polygon>`;
            }

            return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${marker.emphasis === "active" ? "2.4" : "1.6"}" class="minimap-marker minimap-marker-${marker.kind} minimap-emphasis-${marker.emphasis ?? "normal"}"></circle>`;
          })
          .join("")}
        <g transform="translate(${playerX.toFixed(2)} ${playerY.toFixed(2)}) rotate(${headingDegrees.toFixed(2)})">
          <polygon points="0,-3.6 -2.6,3.2 0,1.4 2.6,3.2" class="minimap-player"></polygon>
        </g>
      </svg>
      <div class="minimap-footer">
        <span>${runtime.districtTag}</span>
        <strong>${runtime.patrolAlert ? "Patrols are active" : "Free-roam grid"}</strong>
      </div>
    </div>
  `;
}

function offerLabel(archetype: NonNullable<ShellSceneRuntimeSnapshot["nearbyMissionOffer"]>["archetype"]): string {
  switch (archetype) {
    case "delivery":
      return "Package delivery";
    case "checkpoint":
      return "Checkpoint drive";
    case "heatEscape":
      return "Heat escape";
    default:
      return "Mission";
  }
}

function menuView(state: SessionState, district: DistrictDescriptor, sceneAvailable: boolean): string {
  return `
    <section class="menu-shell panel hero-panel">
      <div class="hero-copy">
        <p class="eyebrow">Browser-only local run</p>
        <h1>Block City Run</h1>
        <p class="hero-summary">
          An original low-poly city action prototype with authored districts, explicit opening routes, and all content
          loading from the static bundle.
        </p>
        <div class="button-row">
          <button class="primary-button" data-action="continue-local">Continue local run</button>
          <button class="secondary-button" data-action="open-districts">Choose district</button>
        </div>
        <p class="local-mode-note">
          Local mode is active. Online crews and multiplayer dispatch are intentionally unavailable in this static build.
        </p>
        ${sceneFallbackMarkup(sceneAvailable)}
      </div>
      <aside class="menu-sidebar panel panel-dark">
        <div class="status-chip">Selected district: ${district.name}</div>
        <p class="sidebar-tag">${district.shortTag}</p>
        <p class="sidebar-copy">${district.summary}</p>
        ${previewMarkup(district)}
        <div class="stack-list">
          <div>
            <span class="stack-label">Route focus</span>
            <strong>${district.routeFocus}</strong>
          </div>
          <div>
            <span class="stack-label">Last saved</span>
            <strong>${formatSavedAt(state.lastSavedAt)}</strong>
          </div>
        </div>
        ${districtStatsMarkup(district)}
        <div class="toggle-grid">
          ${toggleMarkup(state, "showControlHints")}
          ${toggleMarkup(state, "reduceMotion")}
        </div>
      </aside>
    </section>
  `;
}

function districtCard(state: SessionState, district: DistrictDescriptor): string {
  const selected = state.selectedDistrictId === district.id;
  const selectedClass = selected ? " district-card-selected" : "";
  const selectedText = selected ? "Selected" : "Set active";

  return `
    <article class="panel district-card${selectedClass}">
      <div class="district-card-topline">
        <span class="seed-pill">Seed ${district.seed}</span>
        <span class="theme-pill">${district.visualTheme}</span>
      </div>
      <h2>${district.name}</h2>
      <p class="sidebar-tag">${district.shortTag}</p>
      <p>${district.summary}</p>
      <p class="district-note">${district.districtNote}</p>
      ${previewMarkup(district)}
      ${districtStatsMarkup(district)}
      <div class="landmark-list">
        ${landmarkMarkup(district)}
      </div>
      <div class="button-row">
        <button class="secondary-button" data-action="select-district" data-district-id="${district.id}">
          ${selectedText}
        </button>
        <button class="ghost-button" data-action="enter-specific-district" data-district-id="${district.id}">
          Enter district
        </button>
      </div>
    </article>
  `;
}

function districtSelectView(
  state: SessionState,
  district: DistrictDescriptor,
  sceneAvailable: boolean,
): string {
  return `
    <section class="panel selection-shell">
      <div class="selection-header">
        <div>
          <p class="eyebrow">District select</p>
          <h1>Pick the next city slice</h1>
          <p class="hero-summary">
            Every district is local-only in this build and saves the active selection for the next reload.
          </p>
          ${sceneFallbackMarkup(sceneAvailable)}
        </div>
        <div class="button-row">
          <button class="ghost-button" data-action="return-menu">Return to menu</button>
          <button class="primary-button" data-action="enter-district">Enter ${district.name}</button>
        </div>
      </div>
      <div class="district-grid">
        ${districts.map((entry) => districtCard(state, entry)).join("")}
      </div>
    </section>
  `;
}

function controlHints(state: SessionState, runtime: ShellSceneRuntimeSnapshot): string {
  if (!state.options.showControlHints) {
    return "";
  }

  const cameraHint = runtime.pointerLockSupported
    ? runtime.pointerLockActive
      ? "Mouse look locked"
      : "Click scene to lock or drag to orbit"
    : "Click and drag to orbit";
  const primaryHints =
    runtime.playerMode === "driving"
      ? [
          ["WASD / arrows", "Throttle, reverse, and steer"],
          ["Space", "Handbrake and drift-lite turns"],
          ["E", "Exit the active ride"],
          ["X", "Reset the vehicle to a clear lane"],
          ["R", "Respawn at district spawn"],
          ["Mouse", cameraHint],
        ]
      : [
          ["WASD / arrows", "Move on foot through the district"],
          ["Shift", "Hold to run"],
          ["E", runtime.nearbyMissionOffer ? `Start ${runtime.nearbyMissionOffer.title}` : runtime.nearbyVehicleLabel ? `Enter ${runtime.nearbyVehicleLabel}` : "Enter a parked vehicle or start a nearby mission"],
          ["R", "Respawn at district spawn"],
          ["Mouse", cameraHint],
          ["Esc / M / Home", "Pause, change district, or return to menu"],
        ];

  return `
    <section class="panel control-panel hud-card">
      <p class="eyebrow">Desktop controls</p>
      <div class="hint-grid">
        ${primaryHints
          .map(
            ([key, description]) => `
              <div><strong>${key}</strong><span>${description}</span></div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function touchControlsView(
  state: SessionState,
  district: DistrictDescriptor,
  runtime: ShellSceneRuntimeSnapshot | null,
): string {
  if (state.screen !== "districtScene" || state.paused) {
    return "";
  }

  const liveRuntime = runtimeForDistrict(runtime, district);
  const utilityButtons = `
    <div class="touch-top-actions">
      ${touchButtonMarkup("Pause", 'data-touch-tap="pause"', "utility")}
      ${touchButtonMarkup("Districts", 'data-touch-tap="districts"', "utility")}
    </div>
  `;

  if (liveRuntime.playerMode === "downed") {
    return `
      <div class="touch-overlay-shell" data-touch-mode="downed">
        ${utilityButtons}
        <section class="panel touch-downed-shell">
          <p class="eyebrow">Touch respawn</p>
          <strong>Respawn is ready.</strong>
          <p class="scene-status">Reset the run, then keep roaming the same district without a keyboard.</p>
          ${touchButtonMarkup("Respawn", 'data-touch-tap="respawn"', "hold")}
        </section>
      </div>
    `;
  }

  const actionButtons =
    liveRuntime.playerMode === "driving"
      ? `
          ${touchButtonMarkup("Gas", 'data-touch-press="accelerate"', "hold")}
          ${touchButtonMarkup("Brake", 'data-touch-press="brake"', "hold")}
          ${touchButtonMarkup("Drift", 'data-touch-press="handbrake"', "hold")}
          ${touchButtonMarkup("Exit Ride", 'data-touch-tap="ride"')}
          ${touchButtonMarkup("Reset", 'data-touch-tap="reset"')}
        `
      : `
          ${touchButtonMarkup("Ride", 'data-touch-tap="ride"')}
          ${touchButtonMarkup("Action", 'data-touch-tap="interact"')}
          ${touchButtonMarkup("Respawn", 'data-touch-tap="respawn"')}
        `;

  return `
    <div class="touch-overlay-shell" data-touch-mode="${liveRuntime.playerMode}">
      ${utilityButtons}
      <section class="panel touch-joystick-shell">
        <p class="eyebrow">${liveRuntime.playerMode === "driving" ? "Steer" : "Move"}</p>
        <div class="touch-joystick-pad" data-touch-area="move" aria-label="${liveRuntime.playerMode === "driving" ? "Touch steering pad" : "Touch movement pad"}">
          <span class="touch-joystick-thumb" data-touch-thumb="move"></span>
        </div>
      </section>
      <section class="panel touch-look-shell" data-touch-area="look" aria-label="Touch look pad">
        <p class="eyebrow">Look</p>
        <strong>Swipe to orbit the camera</strong>
        <p class="scene-status">Right-side drag keeps the third-person view moving on phones and tablets.</p>
      </section>
      <section class="panel touch-button-stack">
        ${actionButtons}
      </section>
    </div>
  `;
}

function pauseOverlay(state: SessionState): string {
  if (!state.paused) {
    return "";
  }

  return `
    <div class="overlay-backdrop">
      <section class="panel pause-panel">
        <p class="eyebrow">Session paused</p>
        <h2>Keep the shell alive or reroute</h2>
        <p>
          Your selected district and menu options are stored locally. Resume here, swap districts, or drop back to the
          menu without reloading the page.
        </p>
        <div class="button-row">
          <button class="primary-button" data-action="resume">Resume shell</button>
          <button class="secondary-button" data-action="open-districts">Change district</button>
          <button class="ghost-button" data-action="return-menu">Return to menu</button>
        </div>
        <div class="toggle-grid">
          ${toggleMarkup(state, "showControlHints")}
          ${toggleMarkup(state, "reduceMotion")}
        </div>
      </section>
    </div>
  `;
}

function mobileDistrictStatus(runtime: ShellSceneRuntimeSnapshot): string {
  if (runtime.activeMission) {
    return runtime.activeMission.objective;
  }

  if (runtime.playerMode === "downed") {
    return "Respawn is ready. Reset the run and jump back into free roam.";
  }

  if (runtime.playerMode === "driving") {
    return runtime.heatLevel > 0
      ? `${runtime.activeVehicleLabel ?? "Ride"} is hot. Stay mobile and cool the district down.`
      : `${runtime.activeVehicleLabel ?? "Ride"} is rolling. Use the touch pedals and drift button to stay clear.`;
  }

  if (runtime.nearbyMissionOffer) {
    return `${runtime.nearbyMissionOffer.title} is ready at ${runtime.nearbyMissionOffer.startLabel}. Tap Action to launch it.`;
  }

  if (runtime.nearbyVehicleLabel) {
    return `${runtime.nearbyVehicleLabel} is within reach. Tap Ride to step in and start driving.`;
  }

  if (runtime.heatLevel > 0) {
    return "Stay moving, widen the gap, and wait for the heat to cool.";
  }

  return "Move through the district, line up a vehicle, and pick your next contract.";
}

function districtSceneView(
  state: SessionState,
  district: DistrictDescriptor,
  sceneAvailable: boolean,
  runtime: ShellSceneRuntimeSnapshot | null,
  touchUiEnabled: boolean,
): string {
  const liveRuntime = runtimeForDistrict(runtime, district);
  const bannerStatus = touchUiEnabled ? mobileDistrictStatus(liveRuntime) : liveRuntime.status;
  const missionPanel = liveRuntime.activeMission
    ? `
        <p class="eyebrow">${offerLabel(liveRuntime.activeMission.archetype)}</p>
        <h2>${liveRuntime.activeMission.title}</h2>
        <p class="mission-objective">${liveRuntime.activeMission.objective}</p>
        <div class="stack-list mission-stats">
          <div>
            <span class="stack-label">Stage</span>
            <strong>${liveRuntime.activeMission.stageLabel}</strong>
          </div>
          <div>
            <span class="stack-label">Distance</span>
            <strong>${formatDistance(liveRuntime.activeMission.distance)}</strong>
          </div>
          <div>
            <span class="stack-label">Progress</span>
            <strong>${liveRuntime.activeMission.progressLabel}</strong>
          </div>
          <div>
            <span class="stack-label">Reward</span>
            <strong>${liveRuntime.activeMission.rewardText}</strong>
          </div>
        </div>
        <p class="mission-detail">${liveRuntime.activeMission.detail}</p>
        ${liveRuntime.activeMission.timerSeconds !== null ? `<div class="status-chip mission-timer">Timer ${Math.max(0, Math.ceil(liveRuntime.activeMission.timerSeconds))}s</div>` : ""}
      `
    : liveRuntime.nearbyMissionOffer
      ? `
          <p class="eyebrow">${offerLabel(liveRuntime.nearbyMissionOffer.archetype)}</p>
          <h2>${liveRuntime.nearbyMissionOffer.title}</h2>
          <p class="mission-objective">${liveRuntime.nearbyMissionOffer.description}</p>
          <div class="stack-list mission-stats">
            <div>
              <span class="stack-label">Start point</span>
              <strong>${liveRuntime.nearbyMissionOffer.startLabel}</strong>
            </div>
            <div>
              <span class="stack-label">Reward</span>
              <strong>${liveRuntime.nearbyMissionOffer.rewardText}</strong>
            </div>
          </div>
          <p class="mission-detail">${touchUiEnabled ? "Move into the world marker and tap Action to accept the run." : "Walk into the world marker and press <strong>E</strong> to accept the run."}</p>
        `
      : `
          <p class="eyebrow">Mission boards</p>
          <h2>Free-roam contracts are live</h2>
          <p class="mission-objective">Each world marker starts a different repeatable route: delivery, checkpoint drive, or heat escape.</p>
          ${missionMarkup(district)}
        `;

  return `
    <section class="hud-layer gameplay-hud">
      <header class="hud-strip gameplay-strip">
        <div class="panel hud-card district-banner">
          <p class="eyebrow">Local district live</p>
          <h2>${district.name}</h2>
          <p class="scene-status">${bannerStatus}</p>
          <div class="banner-chip-row">
            <span class="status-chip">${sceneModeLabel(liveRuntime)}</span>
            <span class="status-chip">${liveRuntime.pointerLockActive ? "Mouse locked" : "Mouse orbit ready"}</span>
            <span class="status-chip">${liveRuntime.heatLabel}</span>
          </div>
        </div>
        <div class="panel hud-card vitals-shell">
          ${meterMarkup("Health", liveRuntime.health, 100, "health")}
          ${liveRuntime.vehicleDurability !== null ? meterMarkup("Durability", liveRuntime.vehicleDurability, 100, "durability") : ""}
          ${liveRuntime.speed !== null ? speedMarkup(liveRuntime) : ""}
          ${heatMarkup(liveRuntime)}
        </div>
        <div class="panel hud-card reward-shell">
          <div class="stack-list reward-grid">
            <div>
              <span class="stack-label">Cash</span>
              <strong>$${liveRuntime.cash}</strong>
            </div>
            <div>
              <span class="stack-label">Score</span>
              <strong>${liveRuntime.score}</strong>
            </div>
            <div>
              <span class="stack-label">XP</span>
              <strong>${liveRuntime.xp}</strong>
            </div>
          </div>
          <div class="status-chip">${liveRuntime.patrolAlert ? "Patrols converging" : "Session saved locally"}</div>
          <div class="button-row">
            <button class="secondary-button" data-action="toggle-pause">${state.paused ? "Resume" : "Pause"}</button>
            <button class="ghost-button" data-action="open-districts">Districts</button>
          </div>
        </div>
      </header>
      <div class="hud-columns gameplay-columns">
        <section class="panel hud-card prompt-shell">
          <p class="eyebrow">Street feed</p>
          <strong class="prompt-copy prompt-tone-${liveRuntime.message.tone}">${liveRuntime.message.text}</strong>
          <p class="scene-status">${liveRuntime.prompt ?? "Free roam is ready."}</p>
          <div class="stack-list prompt-stats">
            <div>
              <span class="stack-label">Objective distance</span>
              <strong>${formatDistance(liveRuntime.activeMission?.distance ?? null)}</strong>
            </div>
            <div>
              <span class="stack-label">District tag</span>
              <strong>${liveRuntime.districtTag}</strong>
            </div>
          </div>
          <p class="shell-footnote">${district.districtNote}</p>
          ${sceneFallbackMarkup(sceneAvailable)}
        </section>
        <section class="panel hud-card route-shell minimap-card">
          <p class="eyebrow">Minimap</p>
          ${minimapMarkup(district, liveRuntime)}
          <div class="stack-list minimap-summary">
            <div>
              <span class="stack-label">Player</span>
              <strong>${liveRuntime.playerMode === "driving" ? "Vehicle route" : "On foot"}</strong>
            </div>
            <div>
              <span class="stack-label">Pressure</span>
              <strong>${liveRuntime.patrolAlert ? "Search grid active" : "No patrol search"}</strong>
            </div>
          </div>
        </section>
        <section class="panel hud-card mission-shell live-mission-shell">
          ${missionPanel}
        </section>
      </div>
      <section class="panel hud-card feedback-shell">
        <p class="eyebrow">Loop status</p>
        <div class="stack-list feedback-grid">
          <div>
            <span class="stack-label">Respawn</span>
            <strong>${liveRuntime.canRespawn ? "Ready on R" : "Unavailable"}</strong>
          </div>
          <div>
            <span class="stack-label">Vehicle reset</span>
            <strong>${liveRuntime.canResetVehicle ? "Ready on X" : "Not driving"}</strong>
          </div>
          <div>
            <span class="stack-label">Pointer lock</span>
            <strong>${liveRuntime.pointerLockSupported ? "Supported" : "Drag orbit only"}</strong>
          </div>
        </div>
      </section>
      ${controlHints(state, liveRuntime)}
      ${pauseOverlay(state)}
    </section>
  `;
}

function renderUi(
  state: SessionState,
  district: DistrictDescriptor,
  sceneAvailable: boolean,
  runtime: ShellSceneRuntimeSnapshot | null,
  touchUiEnabled: boolean,
): string {
  if (state.screen === "districtSelect") {
    return districtSelectView(state, district, sceneAvailable);
  }

  if (state.screen === "districtScene") {
    return districtSceneView(state, district, sceneAvailable, runtime, touchUiEnabled);
  }

  return menuView(state, district, sceneAvailable);
}

export function mountApp(root: HTMLElement): () => void {
  root.innerHTML = `
    <div class="app-shell">
      <div class="scene-shell">
        <div id="scene-host" class="scene-host"></div>
        <div class="scene-vignette"></div>
      </div>
      <main id="ui-root" class="ui-root"></main>
      <div id="touch-controls-root" class="touch-controls-root"></div>
    </div>
  `;

  const sceneHost = root.querySelector<HTMLElement>("#scene-host");
  const uiRoot = root.querySelector<HTMLElement>("#ui-root");
  const touchControlsRoot = root.querySelector<HTMLElement>("#touch-controls-root");

  if (!sceneHost || !uiRoot || !touchControlsRoot) {
    throw new Error("App shell failed to mount.");
  }

  const initialState = store.getState();
  const initialDistrict = getDistrictById(initialState.selectedDistrictId);
  applyPalette(root, initialDistrict);
  const audio = new GameAudio();

  let scene: ShellScene | null = null;
  let sceneAvailable = true;
  let runtimeSnapshot: ShellSceneRuntimeSnapshot | null = null;
  const debugTarget = window as typeof window & { __blockCityRunDebug?: BlockCityRunDebug };
  const touchUiQueries =
    typeof window.matchMedia === "function"
      ? ["(pointer: coarse)", "(any-pointer: coarse)", "(hover: none)"].map((query) => window.matchMedia(query))
      : [];
  let touchUiEnabled = touchUiPreferred();
  let touchControlsMarkup = "";
  const touchState = {
    movePointerId: null as number | null,
    lookPointerId: null as number | null,
    lookLast: null as { x: number; y: number } | null,
    movePad: null as HTMLElement | null,
    moveThumb: null as HTMLElement | null,
    pressedButtons: new Map<number, { button: TouchDriveButton; element: HTMLElement }>(),
  };

  const setMoveThumb = (x: number, y: number): void => {
    if (!touchState.movePad || !touchState.moveThumb) {
      return;
    }

    const padRect = touchState.movePad.getBoundingClientRect();
    const travel = Math.min(padRect.width, padRect.height) * 0.24;
    touchState.moveThumb.style.transform = `translate(${(x * travel).toFixed(1)}px, ${(y * travel).toFixed(1)}px)`;
  };

  const releaseTouchDriveButton = (pointerId: number): void => {
    const pressed = touchState.pressedButtons.get(pointerId);
    if (!pressed) {
      return;
    }

    scene?.setTouchDriveButton(pressed.button, false);
    pressed.element.classList.remove("touch-button-active");
    touchState.pressedButtons.delete(pointerId);
  };

  const clearTouchControls = (): void => {
    touchState.movePointerId = null;
    touchState.lookPointerId = null;
    touchState.lookLast = null;
    scene?.setTouchMovement(0, 0);
    setMoveThumb(0, 0);
    Array.from(touchState.pressedButtons.keys()).forEach(releaseTouchDriveButton);
  };

  const renderTouchControls = (state: SessionState): void => {
    const district = getDistrictById(state.selectedDistrictId);
    const nextMarkup =
      touchUiEnabled && sceneAvailable && scene
        ? touchControlsView(state, district, runtimeSnapshot)
        : "";
    root.dataset.touchUi = String(touchUiEnabled);
    root.dataset.touchMode =
      nextMarkup && state.screen === "districtScene"
        ? runtimeForDistrict(runtimeSnapshot, district).playerMode
        : "hidden";

    if (nextMarkup === touchControlsMarkup) {
      return;
    }

    clearTouchControls();
    touchControlsMarkup = nextMarkup;
    touchControlsRoot.innerHTML = nextMarkup;
    touchState.movePad = touchControlsRoot.querySelector<HTMLElement>('[data-touch-area="move"]');
    touchState.moveThumb = touchControlsRoot.querySelector<HTMLElement>('[data-touch-thumb="move"]');
    setMoveThumb(0, 0);
  };

  const syncTouchUi = (): void => {
    const nextEnabled = touchUiPreferred();
    if (nextEnabled === touchUiEnabled) {
      renderTouchControls(store.getState());
      return;
    }

    touchUiEnabled = nextEnabled;
    renderView(store.getState());
  };

  const renderView = (state: SessionState): void => {
    const district = getDistrictById(state.selectedDistrictId);
    applyPalette(root, district);
    root.dataset.screen = state.screen;
    root.dataset.paused = String(state.paused);
    uiRoot.innerHTML = renderUi(state, district, sceneAvailable, runtimeSnapshot, touchUiEnabled);
    renderTouchControls(state);
  };

  const syncScene = (state: SessionState): void => {
    const district = getDistrictById(state.selectedDistrictId);
    scene?.update({
      district,
      paused: state.paused,
      reduceMotion: state.options.reduceMotion,
      screen: state.screen,
    });
  };

  const updateView = (state: SessionState): void => {
    renderView(state);
    syncScene(state);
  };

  try {
    scene = new ShellScene(sceneHost, {
      district: initialDistrict,
      paused: initialState.paused,
      reduceMotion: initialState.options.reduceMotion,
      screen: initialState.screen,
    }, (nextRuntime) => {
      runtimeSnapshot = nextRuntime;
      if (store.getState().screen === "districtScene") {
        renderView(store.getState());
      }
    }, audio);
  } catch (error) {
    sceneAvailable = false;
    sceneHost.classList.add("scene-host-fallback");
    console.warn("Scene shell fallback enabled.", error);
  }

  debugTarget.__blockCityRunDebug = {
    getSnapshot: () => ({
      sceneAvailable,
      session: store.getState(),
      runtime: runtimeSnapshot,
      scene: scene?.getDebugState() ?? null,
    }),
    touch: {
      setMove: (x, y) => scene?.setTouchMovement(x, y),
      setDriveButton: (button, active) => scene?.setTouchDriveButton(button, active),
      look: (deltaX, deltaY) => scene?.applyTouchLookDelta(deltaX, deltaY),
      interact: () => scene?.triggerTouchInteract(),
      ride: () => scene?.triggerTouchVehicleAction(),
      respawn: () => scene?.triggerTouchRespawn(),
      resetRide: () => scene?.triggerTouchVehicleReset(),
    },
    debug: {
      setPlayerPosition: (x, z) => scene?.debugSetPlayerPosition({ x, z }),
      setActiveVehiclePosition: (x, z, yaw) => scene?.debugSetControlledVehiclePosition({ x, z }, yaw),
      setVehiclePosition: (vehicleId, x, z, yaw) => scene?.debugSetVehiclePosition(vehicleId, { x, z }, yaw),
    },
  };

  const runUiAction = (action: string | undefined, districtId?: string): void => {
    switch (action) {
      case "continue-local":
        store.setState((state) => ({
          ...state,
          screen: "districtScene",
          paused: false,
        }));
        break;
      case "open-districts":
        store.setState((state) => ({
          ...state,
          screen: "districtSelect",
          paused: false,
        }));
        break;
      case "return-menu":
        store.setState((state) => ({
          ...state,
          screen: "menu",
          paused: false,
        }));
        break;
      case "enter-district":
        store.setState((state) => ({
          ...state,
          screen: "districtScene",
          paused: false,
        }));
        break;
      case "select-district":
        if (!districtId) {
          return;
        }
        store.setState((state) => ({
          ...state,
          selectedDistrictId: districtId,
        }));
        break;
      case "enter-specific-district":
        if (!districtId) {
          return;
        }
        store.setState((state) => ({
          ...state,
          selectedDistrictId: districtId,
          screen: "districtScene",
          paused: false,
        }));
        break;
      case "toggle-pause":
        store.setState((state) => ({
          ...state,
          screen: "districtScene",
          paused: !state.paused,
        }));
        break;
      case "resume":
        store.setState((state) => ({
          ...state,
          paused: false,
          screen: "districtScene",
        }));
        break;
      default:
        break;
    }
  };

  const handleClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const actionNode = target?.closest<HTMLElement>("[data-action]");

    if (!actionNode) {
      return;
    }

    audio.unlock();
    audio.playUiSelect();
    runUiAction(actionNode.dataset.action, actionNode.dataset.districtId);
  };

  const handleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;

    if (!target?.dataset.option) {
      return;
    }

    audio.unlock();
    audio.playUiSelect();
    const option = target.dataset.option;
    if (option !== "showControlHints" && option !== "reduceMotion") {
      return;
    }

    store.setState((state) => ({
      ...state,
      options: {
        ...state.options,
        [option]: target.checked,
      },
    }));
  };

  const updateMoveFromPointer = (event: PointerEvent): void => {
    if (!touchState.movePad) {
      return;
    }

    const rect = touchState.movePad.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.32);
    let moveX = (event.clientX - centerX) / radius;
    let moveY = (event.clientY - centerY) / radius;
    const magnitude = Math.hypot(moveX, moveY);
    if (magnitude > 1) {
      moveX /= magnitude;
      moveY /= magnitude;
    }

    scene?.setTouchMovement(moveX, moveY);
    setMoveThumb(moveX, moveY);
  };

  const handleTouchControlPointerDown = (event: PointerEvent): void => {
    const target = event.target as HTMLElement | null;
    if (!target) {
      return;
    }

    const moveArea = target.closest<HTMLElement>('[data-touch-area="move"]');
    if (moveArea && touchState.movePointerId === null) {
      event.preventDefault();
      audio.unlock();
      touchState.movePointerId = event.pointerId;
      moveArea.setPointerCapture?.(event.pointerId);
      updateMoveFromPointer(event);
      return;
    }

    const lookArea = target.closest<HTMLElement>('[data-touch-area="look"]');
    if (lookArea && touchState.lookPointerId === null) {
      event.preventDefault();
      audio.unlock();
      touchState.lookPointerId = event.pointerId;
      touchState.lookLast = { x: event.clientX, y: event.clientY };
      lookArea.setPointerCapture?.(event.pointerId);
      return;
    }

    const pressButton = target.closest<HTMLElement>("[data-touch-press]");
    const touchPress = pressButton?.dataset.touchPress;
    if (
      pressButton
      && (touchPress === "accelerate" || touchPress === "brake" || touchPress === "handbrake")
      && !touchState.pressedButtons.has(event.pointerId)
    ) {
      event.preventDefault();
      audio.unlock();
      scene?.setTouchDriveButton(touchPress, true);
      pressButton.classList.add("touch-button-active");
      pressButton.setPointerCapture?.(event.pointerId);
      touchState.pressedButtons.set(event.pointerId, {
        button: touchPress,
        element: pressButton,
      });
    }
  };

  const handleTouchControlPointerMove = (event: PointerEvent): void => {
    if (touchState.movePointerId === event.pointerId) {
      event.preventDefault();
      updateMoveFromPointer(event);
      return;
    }

    if (touchState.lookPointerId === event.pointerId && touchState.lookLast) {
      event.preventDefault();
      audio.unlock();
      scene?.applyTouchLookDelta(event.clientX - touchState.lookLast.x, event.clientY - touchState.lookLast.y);
      touchState.lookLast = { x: event.clientX, y: event.clientY };
    }
  };

  const handleTouchControlPointerRelease = (event: PointerEvent): void => {
    if (touchState.movePointerId === event.pointerId) {
      event.preventDefault();
      touchState.movePointerId = null;
      scene?.setTouchMovement(0, 0);
      setMoveThumb(0, 0);
    }

    if (touchState.lookPointerId === event.pointerId) {
      event.preventDefault();
      touchState.lookPointerId = null;
      touchState.lookLast = null;
    }

    releaseTouchDriveButton(event.pointerId);
  };

  const handleTouchControlClick = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    const tapNode = target?.closest<HTMLElement>("[data-touch-tap]");
    if (!tapNode) {
      return;
    }

    event.preventDefault();
    audio.unlock();
    audio.playUiSelect();

    switch (tapNode.dataset.touchTap) {
      case "pause":
        runUiAction("toggle-pause");
        break;
      case "districts":
        runUiAction("open-districts");
        break;
      case "interact":
        scene?.triggerTouchInteract();
        break;
      case "ride":
        scene?.triggerTouchVehicleAction();
        break;
      case "respawn":
        scene?.triggerTouchRespawn();
        break;
      case "reset":
        scene?.triggerTouchVehicleReset();
        break;
      default:
        break;
    }
  };

  const handleKeydown = (event: KeyboardEvent): void => {
    const state = store.getState();

    if (event.key === "Escape" && state.screen === "districtScene") {
      audio.unlock();
      audio.playUiSelect();
      event.preventDefault();
      store.setState({
        ...state,
        paused: !state.paused,
      });
      return;
    }

    if (event.key.toLowerCase() === "m") {
      audio.unlock();
      audio.playUiSelect();
      event.preventDefault();
      store.setState({
        ...state,
        screen: "districtSelect",
        paused: false,
      });
      return;
    }

    if (event.key === "Home") {
      audio.unlock();
      audio.playUiSelect();
      event.preventDefault();
      store.setState({
        ...state,
        screen: "menu",
        paused: false,
      });
    }
  };

  uiRoot.addEventListener("click", handleClick);
  uiRoot.addEventListener("change", handleChange);
  touchControlsRoot.addEventListener("click", handleTouchControlClick);
  touchControlsRoot.addEventListener("pointerdown", handleTouchControlPointerDown);
  touchControlsRoot.addEventListener("pointermove", handleTouchControlPointerMove);
  touchControlsRoot.addEventListener("pointerup", handleTouchControlPointerRelease);
  touchControlsRoot.addEventListener("pointercancel", handleTouchControlPointerRelease);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", syncTouchUi);
  touchUiQueries.forEach((query) => query.addEventListener?.("change", syncTouchUi));

  const unsubscribe = store.subscribe(updateView);
  updateView(initialState);

  return () => {
    unsubscribe();
    clearTouchControls();
    uiRoot.removeEventListener("click", handleClick);
    uiRoot.removeEventListener("change", handleChange);
    touchControlsRoot.removeEventListener("click", handleTouchControlClick);
    touchControlsRoot.removeEventListener("pointerdown", handleTouchControlPointerDown);
    touchControlsRoot.removeEventListener("pointermove", handleTouchControlPointerMove);
    touchControlsRoot.removeEventListener("pointerup", handleTouchControlPointerRelease);
    touchControlsRoot.removeEventListener("pointercancel", handleTouchControlPointerRelease);
    window.removeEventListener("keydown", handleKeydown);
    window.removeEventListener("resize", syncTouchUi);
    touchUiQueries.forEach((query) => query.removeEventListener?.("change", syncTouchUi));
    scene?.dispose();
    delete debugTarget.__blockCityRunDebug;
  };
}
