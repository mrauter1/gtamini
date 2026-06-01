export type AppScreen = "menu" | "districtSelect" | "districtScene";

export interface DistrictPalette {
  skyTop: string;
  skyBottom: string;
  haze: string;
  accent: string;
  secondaryAccent: string;
  road: string;
  lane: string;
  buildingA: string;
  buildingB: string;
  buildingC: string;
}

export interface WorldPoint {
  x: number;
  z: number;
}

export interface WorldSize {
  width: number;
  depth: number;
}

export interface DistrictSpawnPoint {
  label: string;
  position: WorldPoint;
  facing: number;
}

export type VehicleModelId = "runner" | "courier" | "hauler" | "patrol";

export interface VehicleSpawnPoint {
  id: string;
  label: string;
  model: VehicleModelId;
  position: WorldPoint;
  facing: number;
}

export type MissionPointKind = "hub" | "pickup" | "dropoff";

export interface DistrictMissionPoint {
  id: string;
  label: string;
  kind: MissionPointKind;
  position: WorldPoint;
  note: string;
}

export type LandmarkType =
  | "garage"
  | "billboard"
  | "plaza"
  | "warehouse"
  | "market"
  | "tower"
  | "service"
  | "bridge"
  | "container"
  | "canopy"
  | "motel"
  | "gate"
  | "park";

export interface DistrictLandmark {
  id: string;
  name: string;
  type: LandmarkType;
  position: WorldPoint;
  note: string;
}

export type PointOfInterestKind =
  | "garage"
  | "hub"
  | "warehouse"
  | "parking"
  | "plaza"
  | "park"
  | "service"
  | "market"
  | "yard";

export interface DistrictPointOfInterest {
  id: string;
  name: string;
  kind: PointOfInterestKind;
  position: WorldPoint;
  size: WorldSize;
  note: string;
}

export type DistrictRoadKind = "avenue" | "street" | "alley";
export type RoadOrientation = "horizontal" | "vertical";

export interface DistrictRoad {
  id: string;
  name: string;
  kind: DistrictRoadKind;
  orientation: RoadOrientation;
  center: WorldPoint;
  width: number;
  length: number;
}

export type DistrictZone = "mixed" | "retail" | "residential" | "industrial" | "civic" | "service";
export type FrontageDirection = "north" | "south" | "east" | "west";

export interface DistrictBlock {
  id: string;
  name: string;
  zone: DistrictZone;
  center: WorldPoint;
  size: WorldSize;
  frontage: FrontageDirection;
  density: number;
}

export type DistrictPathKind = "traffic" | "pedestrian" | "patrol";

export interface DistrictPath {
  id: string;
  kind: DistrictPathKind;
  label: string;
  points: WorldPoint[];
  speed: number;
  density: number;
}

export interface DistrictRoute {
  id: string;
  label: string;
  description: string;
  points: WorldPoint[];
}

export interface DistrictPreviewLegendEntry {
  symbol: string;
  label: string;
}

export interface DistrictPreview {
  rows: string[];
  legend: DistrictPreviewLegendEntry[];
}

export interface DistrictDescriptor {
  id: string;
  name: string;
  shortTag: string;
  summary: string;
  visualTheme: string;
  districtNote: string;
  routeFocus: string;
  seed: number;
  palette: DistrictPalette;
  spawnPoint: DistrictSpawnPoint;
  vehicleSpawnPoints: VehicleSpawnPoint[];
  missionPoints: DistrictMissionPoint[];
  roads: DistrictRoad[];
  blocks: DistrictBlock[];
  pointsOfInterest: DistrictPointOfInterest[];
  landmarks: DistrictLandmark[];
  routes: DistrictRoute[];
  paths: DistrictPath[];
  preview: DistrictPreview;
}

export interface SessionOptions {
  showControlHints: boolean;
  reduceMotion: boolean;
}

export interface SessionState {
  mode: "local";
  screen: AppScreen;
  selectedDistrictId: string;
  paused: boolean;
  options: SessionOptions;
  lastSavedAt: string;
}

export interface ShellSceneState {
  screen: AppScreen;
  paused: boolean;
  reduceMotion: boolean;
  district: DistrictDescriptor;
}

export type PlayerMode = "onFoot" | "driving" | "downed";

export type HudMessageTone = "info" | "success" | "warning" | "danger";
export type MissionArchetype = "delivery" | "checkpoint" | "heatEscape";
export type MinimapMarkerKind =
  | "mission"
  | "objective"
  | "checkpoint"
  | "safe"
  | "patrol"
  | "restricted";

export interface HudMessageSnapshot {
  text: string;
  tone: HudMessageTone;
}

export interface MissionOfferSnapshot {
  id: string;
  title: string;
  archetype: MissionArchetype;
  startLabel: string;
  description: string;
  rewardText: string;
}

export interface ActiveMissionSnapshot {
  id: string;
  title: string;
  archetype: MissionArchetype;
  stageLabel: string;
  objective: string;
  detail: string;
  progressLabel: string;
  rewardText: string;
  distance: number | null;
  timerSeconds: number | null;
}

export interface MinimapMarkerSnapshot {
  id: string;
  kind: MinimapMarkerKind;
  label: string;
  position: WorldPoint;
  heading?: number | null;
  radius?: number | null;
  emphasis?: "normal" | "active" | "danger";
}

export interface ShellSceneRuntimeSnapshot {
  playerMode: PlayerMode;
  districtName: string;
  districtTag: string;
  health: number;
  vehicleDurability: number | null;
  speed: number | null;
  activeVehicleLabel: string | null;
  nearbyVehicleLabel: string | null;
  playerPosition: WorldPoint;
  playerHeading: number;
  cash: number;
  score: number;
  xp: number;
  heatLevel: number;
  heatMaxLevel: number;
  heatLabel: string;
  patrolAlert: boolean;
  prompt: string | null;
  status: string;
  message: HudMessageSnapshot;
  activeMission: ActiveMissionSnapshot | null;
  nearbyMissionOffer: MissionOfferSnapshot | null;
  minimapMarkers: MinimapMarkerSnapshot[];
  pointerLockSupported: boolean;
  pointerLockActive: boolean;
  canRespawn: boolean;
  canResetVehicle: boolean;
}
