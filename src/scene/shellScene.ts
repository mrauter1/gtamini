import * as THREE from "three";
import { GameAudio } from "../audio/gameAudio";
import type {
  ActiveMissionSnapshot,
  AppScreen,
  DistrictBlock,
  DistrictDescriptor,
  DistrictLandmark,
  DistrictMissionPoint,
  HudMessageTone,
  MinimapMarkerSnapshot,
  MissionArchetype,
  MissionOfferSnapshot,
  DistrictPath,
  DistrictPointOfInterest,
  DistrictRoad,
  DistrictZone,
  FrontageDirection,
  PlayerMode,
  ShellSceneState,
  ShellSceneRuntimeSnapshot,
  VehicleModelId,
  VehicleSpawnPoint,
  WorldPoint,
  WorldSize,
} from "../types";

interface StaticCollider {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  label: string;
}

interface CollisionHit {
  normalX: number;
  normalZ: number;
  depth: number;
}

interface VehicleBounds {
  halfWidth: number;
  halfLength: number;
  radius: number;
}

interface ParkedVehicleActor {
  id: string;
  label: string;
  model: VehicleModelId;
  mesh: THREE.Group;
  spawn: VehicleSpawnPoint;
  position: THREE.Vector3;
  yaw: number;
  bounds: VehicleBounds;
  durability: number;
  speed: number;
  destroyed: boolean;
}

interface TrafficVehicleActor {
  mesh: THREE.Group;
  path: DistrictPath;
  progress: number;
  speed: number;
  baseSpeed: number;
  bounds: VehicleBounds;
  position: THREE.Vector3;
  angle: number;
  stunTimer: number;
  knockback: THREE.Vector2;
  flashTimer: number;
}

interface PedestrianActor {
  mesh: THREE.Group;
  path: DistrictPath;
  progress: number;
  speed: number;
  strideOffset: number;
  position: THREE.Vector3;
  angle: number;
  radius: number;
  stunTimer: number;
  knockback: THREE.Vector2;
}

interface MissionMarkerActor {
  point: DistrictMissionPoint;
  mesh: THREE.Group;
}

interface DistrictActorBundle {
  player: THREE.Group;
  parkedVehicles: ParkedVehicleActor[];
  trafficVehicles: TrafficVehicleActor[];
  pedestrians: PedestrianActor[];
  markers: MissionMarkerActor[];
}

interface StaticDistrictGeometry {
  group: THREE.Group;
  colliders: StaticCollider[];
}

interface DistrictBuildResult extends StaticDistrictGeometry, DistrictActorBundle {}

interface GameplayRuntimeState {
  mode: PlayerMode;
  health: number;
  playerPosition: THREE.Vector3;
  playerYaw: number;
  playerBob: number;
  inVehicleId: string | null;
  downedTimer: number;
  invulnerabilityTimer: number;
  interactableVehicleId: string | null;
  message: string;
  messageTimer: number;
  messageTone: HudMessageTone;
  cash: number;
  score: number;
  xp: number;
  heat: number;
  heatDecayDelay: number;
  heatSearchCenter: THREE.Vector3 | null;
  heatSearchRadius: number;
  heatHiddenTimer: number;
  nearbyMissionOfferId: string | null;
  activeMission: MissionRuntimeState | null;
}

type InteractableTarget =
  | {
      kind: "vehicle";
      id: string;
      label: string;
      distance: number;
    }
  | {
      kind: "mission";
      id: string;
      label: string;
      distance: number;
    };

interface MissionReward {
  cash: number;
  score: number;
  xp: number;
}

interface MissionTemplate {
  id: "parcel-run" | "circuit-dash" | "heat-break";
  title: string;
  archetype: MissionArchetype;
  startPointId: string;
  description: string;
  reward: MissionReward;
  timerSeconds?: number;
}

interface MissionCheckpoint {
  id: string;
  label: string;
  position: WorldPoint;
  radius: number;
}

interface DeliveryMissionState {
  id: "parcel-run";
  title: string;
  archetype: "delivery";
  reward: MissionReward;
  startPoint: DistrictMissionPoint;
  targetPoint: DistrictMissionPoint;
  bonusTimer: number;
}

interface CheckpointMissionState {
  id: "circuit-dash";
  title: string;
  archetype: "checkpoint";
  reward: MissionReward;
  checkpoints: MissionCheckpoint[];
  currentCheckpointIndex: number;
  timerRemaining: number;
  startedDriving: boolean;
}

interface HeatEscapeMissionState {
  id: "heat-break";
  title: string;
  archetype: "heatEscape";
  reward: MissionReward;
  safePoint: DistrictMissionPoint;
  timerRemaining: number;
  clearTimerRemaining: number;
  clearTimerTarget: number;
  targetHeat: number;
}

type MissionRuntimeState = DeliveryMissionState | CheckpointMissionState | HeatEscapeMissionState;

const sharedGeometries = {
  wheel: new THREE.CylinderGeometry(0.38, 0.38, 0.34, 10),
};

sharedGeometries.wheel.rotateZ(Math.PI / 2);

const storefrontNames = [
  "Moon Mart",
  "Parcel Club",
  "Axle Fix",
  "Sun Jolt",
  "Glow Deli",
  "Harbor Nook",
  "Copper Wash",
  "Blockline",
  "Shift Cafe",
  "Garden Press",
  "Sky Rack",
  "Night Room",
];

const MAX_HEAT_LEVEL = 5;
const HEAT_SEARCH_RADIUS = 28;

function rewardText(reward: MissionReward): string {
  return `$${reward.cash} • ${reward.score} score • ${reward.xp} XP`;
}

function vectorToWorldPoint(vector: THREE.Vector3): WorldPoint {
  return {
    x: Number(vector.x.toFixed(2)),
    z: Number(vector.z.toFixed(2)),
  };
}

function pointDistanceToVector(point: WorldPoint, vector: THREE.Vector3): number {
  return Math.hypot(point.x - vector.x, point.z - vector.z);
}

function formatTimer(value: number): string {
  const totalSeconds = Math.max(0, Math.ceil(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

function hex(color: string): number {
  return Number.parseInt(color.slice(1), 16);
}

function mixColor(a: string, b: string, alpha: number): number {
  const colorA = new THREE.Color(a);
  const colorB = new THREE.Color(b);
  return colorA.lerp(colorB, alpha).getHex();
}

function seededValue(seed: number, x: number, z: number, salt = 0): number {
  const raw = Math.sin(seed * 0.13 + x * 12.9898 + z * 78.233 + salt * 32.123) * 43758.5453;
  return raw - Math.floor(raw);
}

function pointToVector(point: WorldPoint, y = 0): THREE.Vector3 {
  return new THREE.Vector3(point.x, y, point.z);
}

function distance2d(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function angleDelta(current: number, target: number): number {
  return wrapAngle(target - current);
}

function dampAngle(current: number, target: number, factor: number): number {
  return current + angleDelta(current, target) * factor;
}

function vehicleBoundsFor(model: VehicleModelId): VehicleBounds {
  switch (model) {
    case "courier":
      return { halfWidth: 1.55, halfLength: 2.8, radius: 1.82 };
    case "hauler":
      return { halfWidth: 1.5, halfLength: 3.15, radius: 1.96 };
    case "patrol":
      return { halfWidth: 1.45, halfLength: 2.65, radius: 1.76 };
    case "runner":
    default:
      return { halfWidth: 1.45, halfLength: 2.55, radius: 1.72 };
  }
}

function colliderFromCenter(center: WorldPoint, size: WorldSize, label: string, padding = 0): StaticCollider {
  return {
    minX: center.x - size.width / 2 - padding,
    maxX: center.x + size.width / 2 + padding,
    minZ: center.z - size.depth / 2 - padding,
    maxZ: center.z + size.depth / 2 + padding,
    label,
  };
}

function clampToAabb(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveCircleAgainstCollider(x: number, z: number, radius: number, collider: StaticCollider): CollisionHit | null {
  const closestX = clampToAabb(x, collider.minX, collider.maxX);
  const closestZ = clampToAabb(z, collider.minZ, collider.maxZ);
  const deltaX = x - closestX;
  const deltaZ = z - closestZ;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  if (distanceSq > 0) {
    const distance = Math.sqrt(distanceSq);
    if (distance >= radius) {
      return null;
    }

    return {
      normalX: deltaX / distance,
      normalZ: deltaZ / distance,
      depth: radius - distance,
    };
  }

  const pushes = [
    { normalX: -1, normalZ: 0, depth: radius + (x - collider.minX) },
    { normalX: 1, normalZ: 0, depth: radius + (collider.maxX - x) },
    { normalX: 0, normalZ: -1, depth: radius + (z - collider.minZ) },
    { normalX: 0, normalZ: 1, depth: radius + (collider.maxZ - z) },
  ];

  return pushes.reduce((smallest, candidate) => (candidate.depth < smallest.depth ? candidate : smallest));
}

function resolveCirclePair(
  ax: number,
  az: number,
  aRadius: number,
  bx: number,
  bz: number,
  bRadius: number,
): CollisionHit | null {
  const deltaX = ax - bx;
  const deltaZ = az - bz;
  const minimumDistance = aRadius + bRadius;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;

  if (distanceSq >= minimumDistance * minimumDistance) {
    return null;
  }

  if (distanceSq <= 0.0001) {
    return {
      normalX: 0,
      normalZ: 1,
      depth: minimumDistance,
    };
  }

  const distance = Math.sqrt(distanceSq);
  return {
    normalX: deltaX / distance,
    normalZ: deltaZ / distance,
    depth: minimumDistance - distance,
  };
}

function disposeGroup(group: THREE.Object3D): void {
  group.traverse((child: THREE.Object3D) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }

    const material = mesh.material;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    materials.forEach((entry) => {
      const map = (entry as THREE.MeshStandardMaterial | THREE.MeshBasicMaterial).map;
      if (map) {
        map.dispose();
      }
      entry.dispose();
    });
  });
}

function createMaterial(color: number, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: emissive === 0x000000 ? 0 : 0.3,
    flatShading: true,
  });
}

function makeBox(
  size: [number, number, number],
  position: [number, number, number],
  color: number,
  emissive = 0x000000,
): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), createMaterial(color, emissive));
  mesh.position.set(position[0], position[1], position[2]);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function createLabelTexture(text: string, foreground: string, background: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context unavailable.");
  }

  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = foreground;
  context.font = "700 60px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSignPanel(
  label: string,
  width: number,
  height: number,
  background: string,
  foreground: string,
): THREE.Group {
  const group = new THREE.Group();
  const texture = createLabelTexture(label, foreground, background);
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      side: THREE.DoubleSide,
      transparent: false,
    }),
  );
  plane.castShadow = true;
  group.add(plane);
  group.add(makeBox([width + 0.18, height + 0.18, 0.14], [0, 0, -0.08], 0x201811));
  return group;
}

function setFacingPosition(
  target: THREE.Object3D,
  frontage: FrontageDirection,
  halfWidth: number,
  halfDepth: number,
  y: number,
  inset = 0.24,
): void {
  switch (frontage) {
    case "north":
      target.position.set(0, y, halfDepth + inset);
      target.rotation.y = Math.PI;
      break;
    case "south":
      target.position.set(0, y, -halfDepth - inset);
      target.rotation.y = 0;
      break;
    case "east":
      target.position.set(halfWidth + inset, y, 0);
      target.rotation.y = -Math.PI / 2;
      break;
    case "west":
      target.position.set(-halfWidth - inset, y, 0);
      target.rotation.y = Math.PI / 2;
      break;
  }
}

function addWheels(group: THREE.Group, offsets: Array<[number, number, number]>): void {
  const wheelMaterial = createMaterial(0x171717);
  offsets.forEach(([x, y, z]) => {
    const wheel = new THREE.Mesh(sharedGeometries.wheel, wheelMaterial);
    wheel.position.set(x, y, z);
    wheel.castShadow = true;
    wheel.receiveShadow = true;
    group.add(wheel);

    const hub = makeBox([0.1, 0.1, 0.1], [x, y, z], 0x7b7b7b);
    group.add(hub);
  });
}

function createRunnerVehicle(bodyColor: number, accentColor: number): THREE.Group {
  const car = new THREE.Group();
  car.add(makeBox([2.6, 0.8, 4.8], [0, 0.8, 0], bodyColor));
  car.add(makeBox([2.1, 0.72, 2.15], [0, 1.5, -0.15], mixColor("#dde7f0", "#263443", 0.7)));
  car.add(makeBox([2.2, 0.18, 1.2], [0, 1.1, 0.9], accentColor));
  car.add(makeBox([2.75, 0.2, 0.32], [0, 0.42, 2.42], 0x131313));
  car.add(makeBox([2.75, 0.2, 0.32], [0, 0.42, -2.42], 0x131313));
  car.add(makeBox([0.42, 0.18, 0.14], [-0.9, 0.95, 2.46], 0xf8f1bf));
  car.add(makeBox([0.42, 0.18, 0.14], [0.9, 0.95, 2.46], 0xf8f1bf));
  car.add(makeBox([0.42, 0.18, 0.14], [-0.9, 0.8, -2.46], 0xdd4e44));
  car.add(makeBox([0.42, 0.18, 0.14], [0.9, 0.8, -2.46], 0xdd4e44));
  addWheels(car, [
    [-1.18, 0.38, 1.65],
    [1.18, 0.38, 1.65],
    [-1.18, 0.38, -1.65],
    [1.18, 0.38, -1.65],
  ]);
  return car;
}

function createCourierVehicle(bodyColor: number, accentColor: number): THREE.Group {
  const van = new THREE.Group();
  van.add(makeBox([2.8, 1.2, 5.1], [0, 1.15, 0], bodyColor));
  van.add(makeBox([2.4, 0.88, 1.9], [0, 2.08, 1.05], mixColor("#f4f4f4", "#243141", 0.72)));
  van.add(makeBox([2.4, 0.32, 2.2], [0, 1.65, -0.25], accentColor));
  van.add(makeBox([2.95, 0.22, 0.32], [0, 0.52, 2.56], 0x131313));
  van.add(makeBox([2.95, 0.22, 0.32], [0, 0.52, -2.56], 0x131313));
  van.add(makeBox([0.48, 0.18, 0.14], [-0.98, 1.2, 2.62], 0xf8f1bf));
  van.add(makeBox([0.48, 0.18, 0.14], [0.98, 1.2, 2.62], 0xf8f1bf));
  van.add(makeBox([0.48, 0.18, 0.14], [-0.98, 1.0, -2.62], 0xdd4e44));
  van.add(makeBox([0.48, 0.18, 0.14], [0.98, 1.0, -2.62], 0xdd4e44));
  addWheels(van, [
    [-1.24, 0.42, 1.7],
    [1.24, 0.42, 1.7],
    [-1.24, 0.42, -1.7],
    [1.24, 0.42, -1.7],
  ]);
  return van;
}

function createHaulerVehicle(bodyColor: number, accentColor: number): THREE.Group {
  const truck = new THREE.Group();
  truck.add(makeBox([2.5, 0.95, 2.2], [0, 1.0, 1.15], bodyColor));
  truck.add(makeBox([2.15, 0.8, 1.1], [0, 1.72, 1.35], mixColor("#edf3f8", "#344351", 0.7)));
  truck.add(makeBox([2.75, 0.72, 3], [0, 0.92, -1.35], mixColor("#494949", "#101010", 0.28)));
  truck.add(makeBox([2.55, 0.22, 0.28], [0, 1.34, -2.84], accentColor));
  truck.add(makeBox([2.75, 0.22, 0.32], [0, 0.46, 2.3], 0x131313));
  truck.add(makeBox([2.75, 0.22, 0.32], [0, 0.46, -2.82], 0x131313));
  truck.add(makeBox([0.44, 0.18, 0.14], [-0.88, 1.08, 2.28], 0xf8f1bf));
  truck.add(makeBox([0.44, 0.18, 0.14], [0.88, 1.08, 2.28], 0xf8f1bf));
  truck.add(makeBox([0.44, 0.18, 0.14], [-0.88, 0.88, -2.82], 0xdd4e44));
  truck.add(makeBox([0.44, 0.18, 0.14], [0.88, 0.88, -2.82], 0xdd4e44));
  addWheels(truck, [
    [-1.18, 0.42, 1.28],
    [1.18, 0.42, 1.28],
    [-1.18, 0.42, -1.12],
    [1.18, 0.42, -1.12],
    [-1.18, 0.42, -2.35],
    [1.18, 0.42, -2.35],
  ]);
  return truck;
}

function createVehicle(model: VehicleModelId, district: DistrictDescriptor, variantIndex = 0): THREE.Group {
  const palette = [
    mixColor(district.palette.accent, "#222222", 0.35),
    mixColor(district.palette.secondaryAccent, "#222222", 0.28),
    mixColor(district.palette.buildingC, "#111111", 0.16),
    mixColor(district.palette.buildingB, "#111111", 0.1),
  ];
  const accent = mixColor(district.palette.skyBottom, district.palette.accent, 0.4);

  if (model === "courier") {
    return createCourierVehicle(palette[variantIndex % palette.length], accent);
  }

  if (model === "hauler") {
    return createHaulerVehicle(palette[variantIndex % palette.length], mixColor(district.palette.secondaryAccent, "#111111", 0.2));
  }

  if (model === "patrol") {
    const patrol = createRunnerVehicle(0x253245, district.palette.accent ? hex(district.palette.accent) : accent);
    patrol.add(makeBox([2.2, 0.12, 0.16], [0, 1.2, 2.08], 0xffffff));
    patrol.add(makeBox([0.62, 0.16, 0.42], [0, 1.95, -0.25], 0x7ed7ff));
    patrol.add(makeBox([0.3, 0.12, 0.42], [-0.16, 1.95, -0.25], 0xf84545));
    patrol.add(makeBox([0.3, 0.12, 0.42], [0.16, 1.95, -0.25], 0x53b5ff));
    return patrol;
  }

  return createRunnerVehicle(palette[variantIndex % palette.length], accent);
}

function createPalm(position: [number, number, number], accent: string): THREE.Group {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.26, 4.8, 6), createMaterial(0x765536));
  trunk.position.set(position[0], 2.4, position[2]);
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const leafMaterial = createMaterial(hex(accent));
  for (let index = 0; index < 5; index += 1) {
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.14, 2.8), leafMaterial);
    leaf.position.set(position[0], 4.95, position[2]);
    leaf.rotation.y = (Math.PI * 2 * index) / 5;
    leaf.rotation.x = -0.45;
    leaf.position.x += Math.cos(leaf.rotation.y) * 1.18;
    leaf.position.z += Math.sin(leaf.rotation.y) * 1.18;
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }

  return group;
}

function createBench(): THREE.Group {
  const bench = new THREE.Group();
  bench.add(makeBox([1.8, 0.12, 0.45], [0, 0.72, 0], 0x6d4b2e));
  bench.add(makeBox([1.8, 0.12, 0.18], [0, 1.12, -0.16], 0x6d4b2e));
  bench.add(makeBox([0.12, 0.72, 0.12], [-0.68, 0.36, 0], 0x353535));
  bench.add(makeBox([0.12, 0.72, 0.12], [0.68, 0.36, 0], 0x353535));
  return bench;
}

function createCrateStack(color: number, levels = 2): THREE.Group {
  const group = new THREE.Group();
  for (let level = 0; level < levels; level += 1) {
    const width = 1.8 - level * 0.2;
    group.add(makeBox([width, 0.9, width], [0, 0.45 + level * 0.9, 0], color));
  }
  return group;
}

function createFence(sizeX: number, sizeZ: number, color: number): THREE.Group {
  const group = new THREE.Group();
  const postGeometry = new THREE.BoxGeometry(0.16, 1.2, 0.16);
  const railGeometryX = new THREE.BoxGeometry(sizeX, 0.08, 0.08);
  const railGeometryZ = new THREE.BoxGeometry(0.08, 0.08, sizeZ);
  const material = createMaterial(color);

  const addPost = (x: number, z: number): void => {
    const post = new THREE.Mesh(postGeometry, material);
    post.position.set(x, 0.6, z);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
  };

  addPost(-sizeX / 2, -sizeZ / 2);
  addPost(sizeX / 2, -sizeZ / 2);
  addPost(-sizeX / 2, sizeZ / 2);
  addPost(sizeX / 2, sizeZ / 2);

  [
    [0, 0.84, -sizeZ / 2, railGeometryX],
    [0, 0.84, sizeZ / 2, railGeometryX],
    [-sizeX / 2, 0.84, 0, railGeometryZ],
    [sizeX / 2, 0.84, 0, railGeometryZ],
  ].forEach(([x, y, z, geometry]) => {
    const rail = new THREE.Mesh(geometry as THREE.BufferGeometry, material);
    rail.position.set(x as number, y as number, z as number);
    rail.castShadow = true;
    rail.receiveShadow = true;
    group.add(rail);
  });

  return group;
}

function createHumanoid(
  skinColor: number,
  shirtColor: number,
  pantsColor: number,
  accessoryColor: number,
  hat = false,
): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([0.46, 0.46, 0.46], [0, 1.95, 0], skinColor));
  group.add(makeBox([0.68, 0.82, 0.34], [0, 1.28, 0], shirtColor));
  group.add(makeBox([0.2, 0.72, 0.2], [-0.28, 1.25, 0], skinColor));
  group.add(makeBox([0.2, 0.72, 0.2], [0.28, 1.25, 0], skinColor));
  group.add(makeBox([0.24, 0.88, 0.24], [-0.16, 0.44, 0], pantsColor));
  group.add(makeBox([0.24, 0.88, 0.24], [0.16, 0.44, 0], pantsColor));
  group.add(makeBox([0.28, 0.12, 0.42], [-0.16, 0.02, 0.04], 0x141414));
  group.add(makeBox([0.28, 0.12, 0.42], [0.16, 0.02, 0.04], 0x141414));
  group.add(makeBox([0.16, 0.28, 0.16], [0, 1.2, 0.2], accessoryColor));

  if (hat) {
    group.add(makeBox([0.56, 0.14, 0.56], [0, 2.25, 0], accessoryColor));
    group.add(makeBox([0.32, 0.18, 0.32], [0, 2.4, 0], accessoryColor));
  } else {
    group.add(makeBox([0.5, 0.18, 0.5], [0, 2.18, 0], accessoryColor));
  }

  return group;
}

function createPlayerAvatar(district: DistrictDescriptor): THREE.Group {
  const player = createHumanoid(0xe2b184, hex(district.palette.accent), 0x243444, hex(district.palette.secondaryAccent), true);
  player.add(makeBox([0.26, 0.26, 0.12], [0.18, 1.2, 0.24], 0xffffff));
  return player;
}

function createPedestrianAvatar(district: DistrictDescriptor, index: number): THREE.Group {
  const skinTones = [0xe7be98, 0xcd9a74, 0x9b6847];
  const shirts = [
    mixColor(district.palette.secondaryAccent, "#ffffff", 0.25),
    mixColor(district.palette.accent, "#111111", 0.25),
    mixColor(district.palette.buildingC, "#ffffff", 0.15),
  ];
  const pants = [0x293241, 0x3a2c2a, 0x34463b];
  return createHumanoid(
    skinTones[index % skinTones.length],
    shirts[index % shirts.length],
    pants[index % pants.length],
    mixColor(district.palette.buildingB, "#111111", 0.2),
    index % 3 === 0,
  );
}

function createMissionMarker(point: DistrictMissionPoint, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  const baseColor =
    point.kind === "pickup"
      ? hex(district.palette.accent)
      : point.kind === "dropoff"
        ? hex(district.palette.secondaryAccent)
        : mixColor(district.palette.skyBottom, "#ffffff", 0.22);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.18, 8, 24), createMaterial(baseColor, baseColor));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.24;
  group.add(ring);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 2.4, 8), createMaterial(baseColor, baseColor));
  stem.position.y = 1.3;
  group.add(stem);

  const tip = makeBox([0.8, 0.8, 0.8], [0, 2.9, 0], baseColor, baseColor);
  tip.rotation.set(Math.PI / 4, Math.PI / 4, 0);
  group.add(tip);

  group.position.copy(pointToVector(point.position, 0));
  return group;
}

function createObjectiveMarker(color: number, radius: number, height: number, detail = 0): THREE.Group {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.14, 8, 28), createMaterial(color, color));
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.24;
  group.add(ring);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.14, height, 8), createMaterial(color, color));
  stem.position.y = height * 0.5 + 0.24;
  group.add(stem);

  const top = makeBox([0.74, 0.74, 0.74], [0, height + 0.9, 0], color, color);
  top.rotation.set(Math.PI / 4, Math.PI / 4, 0);
  group.add(top);

  if (detail > 0) {
    for (let index = 0; index < detail; index += 1) {
      const flare = makeBox([0.18, 0.18, 0.86], [0, height + 0.2 + index * 0.34, 0], 0xffffff, color);
      flare.rotation.y = (Math.PI / Math.max(detail, 1)) * index;
      group.add(flare);
    }
  }

  return group;
}

function addRoadMarkings(group: THREE.Group, road: DistrictRoad, district: DistrictDescriptor): void {
  if (road.kind === "alley") {
    return;
  }

  const dashLength = road.kind === "avenue" ? 3.4 : 2.4;
  const dashGap = road.kind === "avenue" ? 6.2 : 5.2;
  const laneOffsets = road.kind === "avenue" ? [-road.width * 0.16, road.width * 0.16] : [0];
  const dashGeometry =
    road.orientation === "vertical"
      ? new THREE.BoxGeometry(0.22, 0.04, dashLength)
      : new THREE.BoxGeometry(dashLength, 0.04, 0.22);
  const laneMaterial = createMaterial(hex(district.palette.lane));

  for (let progress = -road.length / 2 + 5; progress <= road.length / 2 - 5; progress += dashGap) {
    laneOffsets.forEach((offset) => {
      const dash = new THREE.Mesh(dashGeometry, laneMaterial);
      if (road.orientation === "vertical") {
        dash.position.set(road.center.x + offset, 0.11, road.center.z + progress);
      } else {
        dash.position.set(road.center.x + progress, 0.11, road.center.z + offset);
      }
      dash.receiveShadow = true;
      group.add(dash);
    });
  }
}

function createRoadMesh(road: DistrictRoad, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  const roadSize =
    road.orientation === "vertical" ? [road.width, 0.14, road.length] : [road.length, 0.14, road.width];
  const roadMesh = makeBox(
    roadSize as [number, number, number],
    [road.center.x, 0.07, road.center.z],
    hex(district.palette.road),
  );
  group.add(roadMesh);

  const sidewalkColor = mixColor(district.palette.haze, "#ffffff", 0.18);
  if (road.orientation === "vertical") {
    group.add(
      makeBox([0.72, 0.16, road.length], [road.center.x - road.width / 2 - 0.36, 0.08, road.center.z], sidewalkColor),
    );
    group.add(
      makeBox([0.72, 0.16, road.length], [road.center.x + road.width / 2 + 0.36, 0.08, road.center.z], sidewalkColor),
    );
  } else {
    group.add(
      makeBox([road.length, 0.16, 0.72], [road.center.x, 0.08, road.center.z - road.width / 2 - 0.36], sidewalkColor),
    );
    group.add(
      makeBox([road.length, 0.16, 0.72], [road.center.x, 0.08, road.center.z + road.width / 2 + 0.36], sidewalkColor),
    );
  }

  addRoadMarkings(group, road, district);
  return group;
}

function buildingHeightForZone(zone: DistrictZone, seed: number): number {
  switch (zone) {
    case "retail":
      return 7 + seed * 5;
    case "residential":
      return 11 + seed * 10;
    case "industrial":
      return 8 + seed * 7;
    case "service":
      return 6 + seed * 4;
    case "civic":
      return 5 + seed * 3;
    default:
      return 9 + seed * 9;
  }
}

function chooseStorefrontName(district: DistrictDescriptor, block: DistrictBlock, index: number): string {
  const selection = Math.floor(seededValue(district.seed, block.center.x, block.center.z, index) * storefrontNames.length);
  return storefrontNames[selection];
}

function createBuildingLot(
  district: DistrictDescriptor,
  block: DistrictBlock,
  width: number,
  depth: number,
  height: number,
  signLabel: string | null,
  colorIndex: number,
): THREE.Group {
  const group = new THREE.Group();
  const palette = [district.palette.buildingA, district.palette.buildingB, district.palette.buildingC];
  const bodyColor = hex(palette[colorIndex % palette.length]);

  group.add(makeBox([width, height, depth], [0, height / 2, 0], bodyColor));

  const roofColor = mixColor(palette[colorIndex % palette.length], "#ffffff", 0.18);
  group.add(makeBox([width * 0.74, 0.36, depth * 0.74], [0, height + 0.18, 0], roofColor));

  if (block.zone === "industrial" || block.zone === "service") {
    group.add(makeBox([width * 0.32, 1.1, depth * 0.18], [0, height + 0.72, 0], mixColor(district.palette.road, "#999999", 0.42)));
  } else {
    group.add(makeBox([width * 0.22, 0.82, depth * 0.22], [0, height + 0.52, 0], mixColor(district.palette.secondaryAccent, "#ffffff", 0.32)));
  }

  const windowColor = mixColor(district.palette.skyBottom, district.palette.road, 0.24);
  for (let row = 0; row < Math.max(1, Math.floor(height / 4)); row += 1) {
    const windowStrip = makeBox([width * 0.7, 0.2, 0.08], [0, 1.5 + row * 2.2, depth / 2 + 0.05], windowColor);
    group.add(windowStrip);
  }

  if (signLabel) {
    const awningColor = mixColor(district.palette.accent, "#111111", 0.14);
    const awning = makeBox([Math.min(width * 0.8, 6), 0.2, 0.9], [0, Math.min(height * 0.48, 4.1), depth / 2 + 0.42], awningColor);
    group.add(awning);
    const sign = createSignPanel(signLabel, Math.min(width * 0.78, 6), 1.1, district.palette.accent, "#20150f");
    setFacingPosition(sign, "north", width / 2, depth / 2, Math.min(height * 0.68, height - 0.8));
    sign.position.z -= 0.08;
    group.add(sign);
  }

  return group;
}

function createBlockGroup(block: DistrictBlock, district: DistrictDescriptor): StaticDistrictGeometry {
  const group = new THREE.Group();
  const colliders: StaticCollider[] = [];
  const padColor = mixColor(district.palette.haze, "#ffffff", 0.2);
  const slab = makeBox([block.size.width + 3, 0.28, block.size.depth + 3], [block.center.x, 0.14, block.center.z], padColor);
  group.add(slab);

  const alongWidth = block.frontage === "north" || block.frontage === "south";
  const count = Math.max(block.density, 1);
  const span = alongWidth ? block.size.width : block.size.depth;
  const lotSize = span / count;

  for (let index = 0; index < count; index += 1) {
    const lotSeed = seededValue(district.seed, block.center.x + index * 3, block.center.z - index * 5, index);
    const height = buildingHeightForZone(block.zone, lotSeed);
    const primaryWidth = alongWidth ? Math.max(5.2, lotSize - 2) : Math.max(6, block.size.width * (block.zone === "industrial" ? 0.72 : 0.58));
    const primaryDepth = alongWidth ? Math.max(6, block.size.depth * (block.zone === "industrial" ? 0.72 : 0.56)) : Math.max(5.2, lotSize - 2);
    const lot = createBuildingLot(
      district,
      block,
      primaryWidth,
      primaryDepth,
      height,
      block.zone === "retail" || block.zone === "service" || block.zone === "mixed"
        ? chooseStorefrontName(district, block, index)
        : null,
      index,
    );

    const along = -span / 2 + lotSize * (index + 0.5);
    let worldX = block.center.x;
    let worldZ = block.center.z;

    if (alongWidth) {
      worldX += along;
      worldZ += block.frontage === "north" ? block.size.depth * 0.16 : -block.size.depth * 0.16;
    } else {
      worldZ += along;
      worldX += block.frontage === "east" ? block.size.width * 0.16 : -block.size.width * 0.16;
    }

    lot.position.set(worldX, 0, worldZ);
    let colliderWidth = primaryWidth;
    let colliderDepth = primaryDepth;
    if (block.frontage === "south") {
      lot.rotation.y = Math.PI;
    }
    if (block.frontage === "east") {
      lot.rotation.y = Math.PI / 2;
      colliderWidth = primaryDepth;
      colliderDepth = primaryWidth;
    }
    if (block.frontage === "west") {
      lot.rotation.y = -Math.PI / 2;
      colliderWidth = primaryDepth;
      colliderDepth = primaryWidth;
    }

    group.add(lot);
    colliders.push(
      colliderFromCenter(
        { x: worldX, z: worldZ },
        { width: colliderWidth, depth: colliderDepth },
        `${block.name} building`,
        0.2,
      ),
    );
  }

  return { group, colliders };
}

function createGaragePoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([poi.size.width, 4.6, poi.size.depth], [0, 2.3, 0], mixColor(district.palette.buildingA, "#111111", 0.1)));
  group.add(makeBox([poi.size.width * 0.64, 2.4, 0.3], [0, 1.3, poi.size.depth / 2 + 0.18], 0x222222));
  const sign = createSignPanel(poi.name, Math.min(poi.size.width * 0.7, 7), 1.2, district.palette.secondaryAccent, "#20150f");
  sign.position.set(0, 4.2, poi.size.depth / 2 + 0.3);
  sign.rotation.y = Math.PI;
  group.add(sign);
  return group;
}

function createMarketPoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  const building = createBuildingLot(
    district,
    {
      id: poi.id,
      name: poi.name,
      zone: "retail",
      center: { x: 0, z: 0 },
      size: poi.size,
      frontage: "north",
      density: 2,
    },
    poi.size.width * 0.46,
    poi.size.depth * 0.6,
    7.2,
    poi.name,
    1,
  );
  building.position.set(0, 0, 0);
  group.add(building);
  return group;
}

function createWarehousePoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  const color = mixColor(district.palette.buildingB, "#101010", 0.18);
  group.add(makeBox([poi.size.width, 7.2, poi.size.depth], [0, 3.6, 0], color));
  group.add(makeBox([poi.size.width * 0.24, 2.8, 0.28], [-poi.size.width * 0.22, 1.5, poi.size.depth / 2 + 0.16], 0x1e1e1e));
  group.add(makeBox([poi.size.width * 0.24, 2.8, 0.28], [poi.size.width * 0.22, 1.5, poi.size.depth / 2 + 0.16], 0x1e1e1e));
  group.add(makeBox([poi.size.width * 0.72, 0.38, poi.size.depth * 0.2], [0, 7.4, 0], mixColor(district.palette.secondaryAccent, "#ffffff", 0.2)));
  return group;
}

function createParkingPoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([poi.size.width, 0.14, poi.size.depth], [0, 0.07, 0], hex(district.palette.road)));
  for (let offset = -poi.size.width / 2 + 2.4; offset <= poi.size.width / 2 - 2.4; offset += 3.2) {
    group.add(makeBox([0.14, 0.04, poi.size.depth - 1.8], [offset, 0.1, 0], hex(district.palette.lane)));
  }
  group.add(createFence(poi.size.width + 0.8, poi.size.depth + 0.8, 0x474747));
  return group;
}

function createPlazaPoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  const baseColor = mixColor(district.palette.skyBottom, district.palette.haze, 0.24);
  group.add(makeBox([poi.size.width, 0.2, poi.size.depth], [0, 0.1, 0], baseColor));
  group.add(makeBox([2.4, 0.5, 2.4], [0, 0.25, 0], hex(district.palette.accent)));
  group.add(makeBox([1.2, 1.6, 1.2], [0, 1.2, 0], mixColor(district.palette.secondaryAccent, "#ffffff", 0.28)));
  const benchA = createBench();
  benchA.position.set(-3.2, 0, -2.8);
  const benchB = createBench();
  benchB.position.set(3.2, 0, 2.8);
  benchB.rotation.y = Math.PI;
  group.add(benchA, benchB);
  group.add(createPalm([-4.8, 0, 4.2], district.palette.secondaryAccent));
  group.add(createPalm([4.8, 0, -4.2], district.palette.secondaryAccent));
  return group;
}

function createParkPoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([poi.size.width, 0.18, poi.size.depth], [0, 0.09, 0], mixColor(district.palette.secondaryAccent, "#2e3c2c", 0.55)));
  const bench = createBench();
  bench.position.set(0, 0, 0);
  group.add(bench);
  group.add(createPalm([-poi.size.width * 0.26, 0, -poi.size.depth * 0.2], district.palette.secondaryAccent));
  group.add(createPalm([poi.size.width * 0.24, 0, poi.size.depth * 0.2], district.palette.secondaryAccent));
  return group;
}

function createServicePoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([poi.size.width * 0.82, 0.22, poi.size.depth * 0.58], [0, 3.2, 0], hex(district.palette.secondaryAccent)));
  group.add(makeBox([poi.size.width * 0.18, 3.1, poi.size.depth * 0.18], [-poi.size.width * 0.3, 1.55, 0], 0x333333));
  group.add(makeBox([poi.size.width * 0.18, 3.1, poi.size.depth * 0.18], [poi.size.width * 0.3, 1.55, 0], 0x333333));
  group.add(makeBox([poi.size.width * 0.2, 1.4, poi.size.depth * 0.18], [-1.6, 0.72, 0], mixColor(district.palette.accent, "#ffffff", 0.22)));
  group.add(makeBox([poi.size.width * 0.2, 1.4, poi.size.depth * 0.18], [1.6, 0.72, 0], mixColor(district.palette.accent, "#ffffff", 0.22)));
  const kiosk = makeBox([poi.size.width * 0.34, 3.2, poi.size.depth * 0.34], [0, 1.6, -poi.size.depth * 0.22], mixColor(district.palette.buildingC, "#111111", 0.12));
  group.add(kiosk);
  const sign = createSignPanel(poi.name, Math.min(poi.size.width * 0.6, 6), 1.1, district.palette.accent, "#1d140f");
  sign.position.set(0, 4.1, poi.size.depth * 0.2);
  group.add(sign);
  return group;
}

function createYardPoi(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.add(makeBox([poi.size.width, 0.18, poi.size.depth], [0, 0.09, 0], mixColor(district.palette.road, district.palette.haze, 0.12)));
  group.add(createFence(poi.size.width + 0.8, poi.size.depth + 0.8, 0x474747));
  const crateA = createCrateStack(mixColor(district.palette.buildingC, "#111111", 0.16), 2);
  crateA.position.set(-3, 0, -2);
  const crateB = createCrateStack(mixColor(district.palette.buildingB, "#111111", 0.16), 3);
  crateB.position.set(3, 0, 2);
  group.add(crateA, crateB);
  return group;
}

function createPointOfInterest(poi: DistrictPointOfInterest, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pointToVector(poi.position, 0));

  switch (poi.kind) {
    case "garage":
      group.add(createGaragePoi(poi, district));
      break;
    case "warehouse":
      group.add(createWarehousePoi(poi, district));
      break;
    case "parking":
      group.add(createParkingPoi(poi, district));
      break;
    case "plaza":
      group.add(createPlazaPoi(poi, district));
      break;
    case "park":
      group.add(createParkPoi(poi, district));
      break;
    case "service":
      group.add(createServicePoi(poi, district));
      break;
    case "yard":
      group.add(createYardPoi(poi, district));
      break;
    case "hub":
      group.add(createGaragePoi(poi, district));
      break;
    case "market":
    default:
      group.add(createMarketPoi(poi, district));
      break;
  }

  return group;
}

function collidersForPointOfInterest(poi: DistrictPointOfInterest): StaticCollider[] {
  switch (poi.kind) {
    case "garage":
    case "hub":
      return [colliderFromCenter(poi.position, poi.size, `${poi.name} structure`, 0.15)];
    case "market":
      return [
        colliderFromCenter(
          poi.position,
          { width: poi.size.width * 0.5, depth: poi.size.depth * 0.64 },
          `${poi.name} storefront`,
          0.1,
        ),
      ];
    case "warehouse":
      return [colliderFromCenter(poi.position, poi.size, `${poi.name} warehouse`, 0.18)];
    case "service":
      return [
        colliderFromCenter(
          { x: poi.position.x, z: poi.position.z - poi.size.depth * 0.22 },
          { width: poi.size.width * 0.38, depth: poi.size.depth * 0.38 },
          `${poi.name} kiosk`,
          0.08,
        ),
      ];
    default:
      return [];
  }
}

function createWaterTower(color: number): THREE.Group {
  const tower = new THREE.Group();
  tower.add(makeBox([0.18, 6.4, 0.18], [-1, 3.2, -1], 0x404040));
  tower.add(makeBox([0.18, 6.4, 0.18], [1, 3.2, -1], 0x404040));
  tower.add(makeBox([0.18, 6.4, 0.18], [-1, 3.2, 1], 0x404040));
  tower.add(makeBox([0.18, 6.4, 0.18], [1, 3.2, 1], 0x404040));
  const tank = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.3, 3.2, 8), createMaterial(color));
  tank.position.y = 8;
  tank.castShadow = true;
  tank.receiveShadow = true;
  tower.add(tank);
  return tower;
}

function createLandmark(landmark: DistrictLandmark, district: DistrictDescriptor): THREE.Group {
  const group = new THREE.Group();
  group.position.copy(pointToVector(landmark.position, 0));

  switch (landmark.type) {
    case "billboard": {
      group.add(makeBox([0.4, 9, 0.4], [0, 4.5, 0], 0x4b3222));
      const board = createSignPanel(landmark.name, 8, 3.2, district.palette.accent, "#20150f");
      board.position.set(0, 9.4, 0.28);
      board.rotation.y = Math.PI;
      group.add(board);
      break;
    }
    case "tower":
      group.add(createWaterTower(mixColor(district.palette.secondaryAccent, "#cccccc", 0.22)));
      break;
    case "bridge":
      group.add(makeBox([8, 0.36, 3.6], [0, 3.2, 0], mixColor(district.palette.buildingB, "#111111", 0.16)));
      group.add(makeBox([0.22, 3.2, 0.22], [-3.5, 1.6, 0], 0x4a4a4a));
      group.add(makeBox([0.22, 3.2, 0.22], [3.5, 1.6, 0], 0x4a4a4a));
      break;
    case "container": {
      const stackA = createCrateStack(mixColor(district.palette.accent, "#22384a", 0.38), 2);
      stackA.position.set(-1.8, 0, -0.8);
      const stackB = createCrateStack(mixColor(district.palette.secondaryAccent, "#43311a", 0.25), 3);
      stackB.position.set(1.8, 0, 0.8);
      group.add(stackA, stackB);
      break;
    }
    case "service":
      group.add(makeBox([0.48, 6.4, 0.48], [0, 3.2, 0], 0x444444));
      {
        const sign = createSignPanel(landmark.name, 5, 1.2, district.palette.secondaryAccent, "#1f150e");
        sign.position.set(0, 6.8, 0.3);
        sign.rotation.y = Math.PI;
        group.add(sign);
      }
      break;
    case "market":
      {
        const sign = createSignPanel(landmark.name, 5.4, 1.2, district.palette.accent, "#1f150e");
        sign.position.set(0, 3.6, 0);
        group.add(sign);
        group.add(makeBox([0.22, 3.2, 0.22], [0, 1.6, 0], 0x443a30));
      }
      break;
    case "garage":
      group.add(makeBox([4.6, 3.2, 4.2], [0, 1.6, 0], mixColor(district.palette.buildingA, "#111111", 0.1)));
      {
        const sign = createSignPanel(landmark.name, 4.8, 1.1, district.palette.secondaryAccent, "#1d140f");
        sign.position.set(0, 3.3, 2.25);
        group.add(sign);
      }
      break;
    case "warehouse":
      group.add(makeBox([6, 4.8, 5.2], [0, 2.4, 0], mixColor(district.palette.buildingB, "#111111", 0.18)));
      group.add(makeBox([4.2, 0.3, 1.2], [0, 5.1, 0], mixColor(district.palette.secondaryAccent, "#ffffff", 0.2)));
      break;
    case "canopy":
      group.add(makeBox([7.2, 0.22, 3], [0, 3.2, 0], hex(district.palette.accent)));
      group.add(makeBox([0.24, 3.1, 0.24], [-3, 1.55, 0], 0x343434));
      group.add(makeBox([0.24, 3.1, 0.24], [3, 1.55, 0], 0x343434));
      break;
    case "motel":
      group.add(makeBox([5.8, 3.6, 5.2], [0, 1.8, 0], mixColor(district.palette.buildingC, "#111111", 0.12)));
      group.add(makeBox([0.22, 5.2, 0.22], [3.6, 2.6, 0], 0x3a3a3a));
      {
        const sign = createSignPanel(landmark.name, 3.6, 1.1, district.palette.accent, "#1f150e");
        sign.position.set(3.6, 5.6, 0.2);
        sign.rotation.y = -Math.PI / 2;
        group.add(sign);
      }
      break;
    case "gate":
      group.add(makeBox([6, 0.28, 0.4], [0, 2.8, 0], mixColor(district.palette.secondaryAccent, "#ffffff", 0.15)));
      group.add(makeBox([0.28, 3, 0.28], [-3, 1.5, 0], 0x404040));
      group.add(makeBox([0.28, 3, 0.28], [3, 1.5, 0], 0x404040));
      {
        const sign = createSignPanel(landmark.name, 4.4, 1.05, district.palette.secondaryAccent, "#1d140f");
        sign.position.set(0, 4.1, 0.22);
        group.add(sign);
      }
      break;
    case "park":
      group.add(
        createParkPoi(
          {
            id: landmark.id,
            name: landmark.name,
            kind: "park",
            position: { ...landmark.position },
            size: { width: 8, depth: 6 },
            note: landmark.note,
          },
          district,
        ),
      );
      break;
    case "plaza":
    default:
      group.add(
        createPlazaPoi(
          {
            id: landmark.id,
            name: landmark.name,
            kind: "plaza",
            position: { ...landmark.position },
            size: { width: 8, depth: 6 },
            note: landmark.note,
          },
          district,
        ),
      );
      break;
  }

  return group;
}

function samplePath(points: WorldPoint[], progress: number): { position: WorldPoint; angle: number } {
  const normalized = ((progress % 1) + 1) % 1;
  let totalLength = 0;
  const segments: Array<{ from: WorldPoint; to: WorldPoint; length: number }> = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = distance2d(from, to);
    if (length > 0) {
      segments.push({ from, to, length });
      totalLength += length;
    }
  }

  const targetDistance = normalized * totalLength;
  let traversed = 0;

  for (const segment of segments) {
    if (traversed + segment.length >= targetDistance) {
      const local = (targetDistance - traversed) / segment.length;
      const x = THREE.MathUtils.lerp(segment.from.x, segment.to.x, local);
      const z = THREE.MathUtils.lerp(segment.from.z, segment.to.z, local);
      return {
        position: { x, z },
        angle: Math.atan2(segment.to.x - segment.from.x, segment.to.z - segment.from.z),
      };
    }
    traversed += segment.length;
  }

  const last = segments[segments.length - 1];
  return {
    position: last ? last.to : points[0],
    angle: last ? Math.atan2(last.to.x - last.from.x, last.to.z - last.from.z) : 0,
  };
}

function nearestPathProgress(points: WorldPoint[], position: THREE.Vector3): number {
  let totalLength = 0;
  const segments: Array<{ from: WorldPoint; to: WorldPoint; length: number; startLength: number }> = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    const length = distance2d(from, to);
    if (length <= 0) {
      continue;
    }

    segments.push({ from, to, length, startLength: totalLength });
    totalLength += length;
  }

  if (totalLength <= 0) {
    return 0;
  }

  let bestProgress = 0;
  let bestDistance = Number.POSITIVE_INFINITY;

  segments.forEach((segment) => {
    const deltaX = segment.to.x - segment.from.x;
    const deltaZ = segment.to.z - segment.from.z;
    const projection =
      ((position.x - segment.from.x) * deltaX + (position.z - segment.from.z) * deltaZ) / (segment.length * segment.length);
    const clamped = THREE.MathUtils.clamp(projection, 0, 1);
    const sampleX = segment.from.x + deltaX * clamped;
    const sampleZ = segment.from.z + deltaZ * clamped;
    const distance = Math.hypot(position.x - sampleX, position.z - sampleZ);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestProgress = (segment.startLength + segment.length * clamped) / totalLength;
    }
  });

  return bestProgress;
}

function createDistrictActors(
  group: THREE.Group,
  district: DistrictDescriptor,
): DistrictActorBundle {
  const trafficVehicles: TrafficVehicleActor[] = [];
  const parkedVehicles: ParkedVehicleActor[] = [];
  const pedestrians: PedestrianActor[] = [];
  const markers = district.missionPoints.map((point) => {
    const marker = createMissionMarker(point, district);
    group.add(marker);
    return { point, mesh: marker };
  });

  const player = createPlayerAvatar(district);
  player.position.copy(pointToVector(district.spawnPoint.position, 0.02));
  player.rotation.y = district.spawnPoint.facing;
  group.add(player);

  district.vehicleSpawnPoints.forEach((spawn, index) => {
    const vehicle = createVehicle(spawn.model, district, index + 1);
    vehicle.position.copy(pointToVector(spawn.position, 0.02));
    vehicle.rotation.y = spawn.facing;
    group.add(vehicle);
    parkedVehicles.push({
      id: spawn.id,
      label: spawn.label,
      model: spawn.model,
      mesh: vehicle,
      spawn,
      position: vehicle.position,
      yaw: spawn.facing,
      bounds: vehicleBoundsFor(spawn.model),
      durability: 100,
      speed: 0,
      destroyed: false,
    });
  });

  district.paths.forEach((path, pathIndex) => {
    if (path.kind === "pedestrian") {
      for (let index = 0; index < path.density; index += 1) {
        const walker = createPedestrianAvatar(district, index + pathIndex);
        group.add(walker);
        const progress = index / path.density;
        const sample = samplePath(path.points, progress);
        walker.position.copy(pointToVector(sample.position, 0.02));
        walker.rotation.y = sample.angle;
        pedestrians.push({
          mesh: walker,
          path,
          progress,
          speed: 0.006 * path.speed,
          strideOffset: index * 0.8,
          position: walker.position,
          angle: sample.angle,
          radius: 0.42,
          stunTimer: 0,
          knockback: new THREE.Vector2(),
        });
      }
      return;
    }

    for (let index = 0; index < path.density; index += 1) {
      const model: VehicleModelId = path.kind === "patrol" ? "patrol" : (["runner", "courier", "hauler"] as const)[(index + pathIndex) % 3];
      const vehicle = createVehicle(model, district, index + pathIndex);
      group.add(vehicle);
      const progress = index / path.density;
      const sample = samplePath(path.points, progress);
      vehicle.position.copy(pointToVector(sample.position, 0.02));
      vehicle.rotation.y = sample.angle;
      trafficVehicles.push({
        mesh: vehicle,
        path,
        progress,
        speed: 0.0048 * path.speed,
        baseSpeed: 0.0048 * path.speed,
        bounds: vehicleBoundsFor(model),
        position: vehicle.position,
        angle: sample.angle,
        stunTimer: 0,
        knockback: new THREE.Vector2(),
        flashTimer: 0,
      });
    }
  });

  return { player, parkedVehicles, trafficVehicles, pedestrians, markers };
}

function createDistrictGroup(district: DistrictDescriptor): DistrictBuildResult {
  const group = new THREE.Group();
  const colliders: StaticCollider[] = [];
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(120, 56),
    createMaterial(mixColor(district.palette.haze, "#111111", 0.45)),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  district.roads.forEach((road) => {
    group.add(createRoadMesh(road, district));
  });

  district.blocks.forEach((block) => {
    const result = createBlockGroup(block, district);
    group.add(result.group);
    colliders.push(...result.colliders);
  });

  district.pointsOfInterest.forEach((poi) => {
    group.add(createPointOfInterest(poi, district));
    colliders.push(...collidersForPointOfInterest(poi));
  });

  district.landmarks.forEach((landmark) => {
    group.add(createLandmark(landmark, district));
  });

  const skyline = new THREE.Group();
  for (let index = 0; index < 10; index += 1) {
    const x = -86 + index * 18;
    const height = 18 + seededValue(district.seed, x, 99, index) * 28;
    skyline.add(
      makeBox(
        [8 + seededValue(district.seed, x, 11, index) * 4, height, 8 + seededValue(district.seed, x, 17, index) * 4],
        [x, height / 2, -82 - seededValue(district.seed, x, 31, index) * 10],
        mixColor(district.palette.buildingA, "#202020", 0.4),
      ),
    );
  }
  group.add(skyline);

  const roadLights = [
    { x: -34, z: -18 },
    { x: 0, z: -18 },
    { x: 34, z: -18 },
    { x: -34, z: 24 },
    { x: 0, z: 24 },
    { x: 34, z: 24 },
  ];
  roadLights.forEach((lightPoint) => {
    const pole = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 6.8, 6), createMaterial(0x3a332a));
    shaft.position.y = 3.4;
    shaft.castShadow = true;
    shaft.receiveShadow = true;
    pole.add(shaft);
    pole.add(makeBox([2.2, 0.12, 0.12], [1.1, 6.6, 0], 0x3a332a));
    pole.add(makeBox([0.36, 0.22, 0.36], [2.16, 6.42, 0], 0xf8cf8a));
    pole.position.copy(pointToVector(lightPoint, 0));
    group.add(pole);
  });

  return {
    group,
    colliders,
    ...createDistrictActors(group, district),
  };
}

function cameraPoseFor(screen: AppScreen, paused: boolean): { position: THREE.Vector3; target: THREE.Vector3 } {
  if (screen === "menu") {
    return {
      position: new THREE.Vector3(-74, 54, 82),
      target: new THREE.Vector3(-6, 7, -4),
    };
  }

  if (screen === "districtSelect") {
    return {
      position: new THREE.Vector3(-48, 48, 64),
      target: new THREE.Vector3(0, 6, 0),
    };
  }

  return paused
    ? {
        position: new THREE.Vector3(26, 34, 54),
        target: new THREE.Vector3(2, 6, 0),
      }
    : {
        position: new THREE.Vector3(18, 28, 46),
        target: new THREE.Vector3(0, 5, -4),
      };
}

function findMissionPoint(district: DistrictDescriptor, kind: DistrictMissionPoint["kind"]): DistrictMissionPoint {
  return district.missionPoints.find((point) => point.kind === kind) ?? district.missionPoints[0];
}

function buildCheckpointPath(district: DistrictDescriptor): MissionCheckpoint[] {
  const hub = findMissionPoint(district, "hub");
  const pickup = findMissionPoint(district, "pickup");
  const dropoff = findMissionPoint(district, "dropoff");

  return [
    {
      id: `${district.id}-checkpoint-1`,
      label: "Checkpoint 1",
      position: pickup.position,
      radius: 5.2,
    },
    {
      id: `${district.id}-checkpoint-2`,
      label: "Checkpoint 2",
      position: dropoff.position,
      radius: 5.4,
    },
    {
      id: `${district.id}-checkpoint-3`,
      label: "Checkpoint 3",
      position: hub.position,
      radius: 5.2,
    },
  ];
}

function buildMissionTemplates(district: DistrictDescriptor): MissionTemplate[] {
  return [
    {
      id: "parcel-run",
      title: "Parcel Run",
      archetype: "delivery",
      startPointId: findMissionPoint(district, "pickup").id,
      description: "Pick up a package at the courier marker and carry it to the marked drop.",
      reward: {
        cash: 220,
        score: 180,
        xp: 40,
      },
      timerSeconds: 48,
    },
    {
      id: "circuit-dash",
      title: "Circuit Dash",
      archetype: "checkpoint",
      startPointId: findMissionPoint(district, "hub").id,
      description: "Grab a ride, beat the route timer, and clear every checkpoint in order.",
      reward: {
        cash: 260,
        score: 220,
        xp: 55,
      },
      timerSeconds: 65,
    },
    {
      id: "heat-break",
      title: "Heat Break",
      archetype: "heatEscape",
      startPointId: findMissionPoint(district, "dropoff").id,
      description: "Trigger patrol pressure, shake the search zone, and make it back to the safe hub.",
      reward: {
        cash: 320,
        score: 280,
        xp: 70,
      },
      timerSeconds: 78,
    },
  ];
}

function createGameplayState(district: DistrictDescriptor): GameplayRuntimeState {
  return {
    mode: "onFoot",
    health: 100,
    playerPosition: pointToVector(district.spawnPoint.position, 0.02),
    playerYaw: district.spawnPoint.facing,
    playerBob: 0,
    inVehicleId: null,
    downedTimer: 0,
    invulnerabilityTimer: 0,
    interactableVehicleId: null,
    message: "Walk to a parked ride and press E to enter.",
    messageTimer: 3,
    messageTone: "info",
    cash: 0,
    score: 0,
    xp: 0,
    heat: 0,
    heatDecayDelay: 0,
    heatSearchCenter: null,
    heatSearchRadius: HEAT_SEARCH_RADIUS,
    heatHiddenTimer: 0,
    nearbyMissionOfferId: null,
    activeMission: null,
  };
}

export class ShellScene {
  private readonly container: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly clock = new THREE.Clock();
  private readonly sun: THREE.Mesh;
  private readonly ambientLight: THREE.AmbientLight;
  private readonly sunLight: THREE.DirectionalLight;
  private districtRoot: THREE.Group | null = null;
  private readonly runtimeListener?: (snapshot: ShellSceneRuntimeSnapshot) => void;
  private readonly pointerLockSupported: boolean;
  private readonly keyDownHandler: (event: KeyboardEvent) => void;
  private readonly keyUpHandler: (event: KeyboardEvent) => void;
  private readonly pointerDownHandler: (event: PointerEvent) => void;
  private readonly pointerMoveHandler: (event: PointerEvent) => void;
  private readonly pointerUpHandler: () => void;
  private readonly pointerLockChangeHandler: () => void;
  private staticColliders: StaticCollider[] = [];
  private parkedVehicles: ParkedVehicleActor[] = [];
  private trafficVehicles: TrafficVehicleActor[] = [];
  private pedestrians: PedestrianActor[] = [];
  private missionMarkers: MissionMarkerActor[] = [];
  private objectiveMarkers: THREE.Group[] = [];
  private playerMesh: THREE.Group | null = null;
  private frame = 0;
  private state: ShellSceneState;
  private gameplay: GameplayRuntimeState;
  private missionTemplates: MissionTemplate[] = [];
  private activeInteraction: InteractableTarget | null = null;
  private readonly audio?: GameAudio;
  private cameraYaw: number;
  private cameraPitch = 0.38;
  private cameraLookIdle = 0;
  private dragOrbitActive = false;
  private lastPointer: { x: number; y: number } | null = null;
  private runtimeSignature = "";
  private lastRuntimeEmit = 0;
  private readonly input = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    run: false,
    handbrake: false,
  };
  private readonly touchInput = {
    moveX: 0,
    moveY: 0,
    accelerate: false,
    brake: false,
    handbrake: false,
  };
  private readonly resizeHandler: () => void;

  constructor(
    container: HTMLElement,
    initialState: ShellSceneState,
    onRuntimeUpdate?: (snapshot: ShellSceneRuntimeSnapshot) => void,
    audio?: GameAudio,
  ) {
    this.container = container;
    this.state = initialState;
    this.runtimeListener = onRuntimeUpdate;
    this.audio = audio;
    this.gameplay = createGameplayState(initialState.district);
    this.cameraYaw = initialState.district.spawnPoint.facing;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(hex(initialState.district.palette.haze), 62, 178);

    this.camera = new THREE.PerspectiveCamera(44, 1, 0.1, 260);
    const pose = cameraPoseFor(initialState.screen, initialState.paused);
    this.camera.position.copy(pose.position);
    this.camera.lookAt(pose.target);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.className = "scene-canvas";
    this.container.appendChild(this.renderer.domElement);
    this.pointerLockSupported = typeof this.renderer.domElement.requestPointerLock === "function";

    this.ambientLight = new THREE.AmbientLight(0xffd6b4, 2.4);
    this.scene.add(this.ambientLight);

    this.sunLight = new THREE.DirectionalLight(0xffc57a, 2.45);
    this.sunLight.position.set(-34, 48, 24);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.setScalar(1024);
    this.sunLight.shadow.camera.left = -90;
    this.sunLight.shadow.camera.right = 90;
    this.sunLight.shadow.camera.top = 90;
    this.sunLight.shadow.camera.bottom = -90;
    this.scene.add(this.sunLight);

    this.sun = new THREE.Mesh(
      new THREE.SphereGeometry(6.4, 24, 24),
      new THREE.MeshBasicMaterial({
        color: hex(initialState.district.palette.accent),
      }),
    );
    this.sun.position.set(-68, 40, -94);
    this.scene.add(this.sun);

    const hemisphere = new THREE.HemisphereLight(
      hex(initialState.district.palette.skyTop),
      hex(initialState.district.palette.road),
      1.5,
    );
    this.scene.add(hemisphere);

    this.rebuildDistrict(initialState.district);
    this.resizeHandler = () => this.resize();
    this.keyDownHandler = (event) => this.handleKeyDown(event);
    this.keyUpHandler = (event) => this.handleKeyUp(event);
    this.pointerDownHandler = (event) => this.handlePointerDown(event);
    this.pointerMoveHandler = (event) => this.handlePointerMove(event);
    this.pointerUpHandler = () => this.handlePointerUp();
    this.pointerLockChangeHandler = () => this.emitRuntimeUpdate(true);
    window.addEventListener("resize", this.resizeHandler);
    window.addEventListener("keydown", this.keyDownHandler);
    window.addEventListener("keyup", this.keyUpHandler);
    this.renderer.domElement.addEventListener("pointerdown", this.pointerDownHandler);
    window.addEventListener("pointermove", this.pointerMoveHandler);
    window.addEventListener("pointerup", this.pointerUpHandler);
    document.addEventListener("pointerlockchange", this.pointerLockChangeHandler);
    this.resize();
    this.animate = this.animate.bind(this);
    this.emitRuntimeUpdate(true);
    this.frame = window.requestAnimationFrame(this.animate);
  }

  update(nextState: ShellSceneState): void {
    const districtChanged = nextState.district.id !== this.state.district.id;
    this.state = nextState;

    if (districtChanged) {
      this.rebuildDistrict(nextState.district);
    }

    if (nextState.screen !== "districtScene" || nextState.paused) {
      this.releasePointerLock();
      this.dragOrbitActive = false;
      this.resetTouchInput();
    }

    this.scene.fog = new THREE.Fog(hex(nextState.district.palette.haze), 62, 178);
    this.ambientLight.color.set(nextState.district.palette.skyBottom);
    this.sunLight.color.set(nextState.district.palette.accent);
    (this.sun.material as THREE.MeshBasicMaterial).color.set(nextState.district.palette.accent);
    this.emitRuntimeUpdate(true);
  }

  dispose(): void {
    window.removeEventListener("resize", this.resizeHandler);
    window.removeEventListener("keydown", this.keyDownHandler);
    window.removeEventListener("keyup", this.keyUpHandler);
    window.removeEventListener("pointermove", this.pointerMoveHandler);
    window.removeEventListener("pointerup", this.pointerUpHandler);
    document.removeEventListener("pointerlockchange", this.pointerLockChangeHandler);
    this.renderer.domElement.removeEventListener("pointerdown", this.pointerDownHandler);
    this.releasePointerLock();
    this.resetTouchInput();
    window.cancelAnimationFrame(this.frame);
    if (this.districtRoot) {
      disposeGroup(this.districtRoot);
      this.scene.remove(this.districtRoot);
    }
    this.renderer.dispose();
    this.container.removeChild(this.renderer.domElement);
  }

  private rebuildDistrict(district: DistrictDescriptor): void {
    if (this.districtRoot) {
      disposeGroup(this.districtRoot);
      this.scene.remove(this.districtRoot);
      this.staticColliders = [];
      this.parkedVehicles = [];
      this.trafficVehicles = [];
      this.pedestrians = [];
      this.missionMarkers = [];
      this.objectiveMarkers = [];
      this.playerMesh = null;
    }

    this.gameplay = createGameplayState(district);
    this.activeInteraction = null;
    this.missionTemplates = buildMissionTemplates(district);
    this.cameraYaw = district.spawnPoint.facing;
    this.cameraPitch = 0.38;
    const { group, colliders, player, parkedVehicles, trafficVehicles, pedestrians, markers } = createDistrictGroup(district);
    this.districtRoot = group;
    this.staticColliders = colliders;
    this.playerMesh = player;
    this.parkedVehicles = parkedVehicles;
    this.trafficVehicles = trafficVehicles;
    this.pedestrians = pedestrians;
    this.missionMarkers = markers;
    this.scene.add(group);
    this.syncPlayerMesh();
    this.syncParkedVehicles();
    this.refreshObjectiveMarkers();
    this.audio?.resetHeatAlertMemory();
  }

  private resize(): void {
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    this.camera.aspect = width / Math.max(height, 1);
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private animate(): void {
    const delta = Math.min(this.clock.getDelta(), 0.05);
    const elapsed = this.clock.elapsedTime;
    const districtPaused = this.state.screen === "districtScene" && this.state.paused;
    const ambientMotionFactor = districtPaused ? 0 : this.state.reduceMotion ? 0.42 : 1;

    this.sun.position.y = 40 + Math.sin(elapsed * 0.12) * 1.4;
    this.updateAmbientActors(delta, elapsed, ambientMotionFactor);
    if (this.state.screen === "districtScene" && !this.state.paused) {
      this.advanceGameplay(delta);
    }
    this.updateMissionMarkers(elapsed, ambientMotionFactor);
    this.updateCamera(delta, elapsed);
    this.emitRuntimeUpdate(false);
    this.renderer.render(this.scene, this.camera);
    this.frame = window.requestAnimationFrame(this.animate);
  }

  private handleKeyDown(event: KeyboardEvent): void {
    if (this.state.screen !== "districtScene") {
      return;
    }

    if (event.target instanceof HTMLInputElement) {
      return;
    }

    this.audio?.unlock();

    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.input.forward = true;
        event.preventDefault();
        break;
      case "KeyS":
      case "ArrowDown":
        this.input.backward = true;
        event.preventDefault();
        break;
      case "KeyA":
      case "ArrowLeft":
        this.input.left = true;
        event.preventDefault();
        break;
      case "KeyD":
      case "ArrowRight":
        this.input.right = true;
        event.preventDefault();
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.input.run = true;
        event.preventDefault();
        break;
      case "Space":
        this.input.handbrake = true;
        event.preventDefault();
        break;
      case "KeyE":
        event.preventDefault();
        if (!event.repeat) {
          if (this.gameplay.mode === "driving") {
            this.exitVehicle();
          } else if (this.gameplay.mode === "onFoot") {
            this.handleOnFootInteract();
          }
        }
        break;
      case "KeyR":
        event.preventDefault();
        if (!event.repeat) {
          this.respawnPlayer(this.gameplay.mode === "downed" ? "Respawned at district start." : "Run reset to district spawn.");
        }
        break;
      case "KeyX":
        if (!event.repeat && this.gameplay.mode === "driving") {
          event.preventDefault();
          const controlled = this.controlledVehicle();
          if (controlled) {
            this.resetVehicle(controlled);
          }
        }
        break;
      default:
        break;
    }
  }

  private handleKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case "KeyW":
      case "ArrowUp":
        this.input.forward = false;
        break;
      case "KeyS":
      case "ArrowDown":
        this.input.backward = false;
        break;
      case "KeyA":
      case "ArrowLeft":
        this.input.left = false;
        break;
      case "KeyD":
      case "ArrowRight":
        this.input.right = false;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        this.input.run = false;
        break;
      case "Space":
        this.input.handbrake = false;
        break;
      default:
        break;
    }
  }

  private handlePointerDown(event: PointerEvent): void {
    if (this.state.screen !== "districtScene" || this.state.paused) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    this.audio?.unlock();
    this.dragOrbitActive = true;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (this.pointerLockSupported && document.pointerLockElement !== this.renderer.domElement) {
      void this.renderer.domElement.requestPointerLock();
    }
  }

  private handlePointerMove(event: PointerEvent): void {
    if (this.state.screen !== "districtScene" || this.state.paused) {
      return;
    }

    if (document.pointerLockElement === this.renderer.domElement) {
      this.applyLookDelta(event.movementX, event.movementY);
      return;
    }

    if (!this.dragOrbitActive || !this.lastPointer) {
      return;
    }

    const deltaX = event.clientX - this.lastPointer.x;
    const deltaY = event.clientY - this.lastPointer.y;
    this.lastPointer = { x: event.clientX, y: event.clientY };
    this.applyLookDelta(deltaX, deltaY);
  }

  private handlePointerUp(): void {
    if (document.pointerLockElement !== this.renderer.domElement) {
      this.dragOrbitActive = false;
      this.lastPointer = null;
    }
  }

  setTouchMovement(x: number, y: number): void {
    this.touchInput.moveX = THREE.MathUtils.clamp(x, -1, 1);
    this.touchInput.moveY = THREE.MathUtils.clamp(y, -1, 1);
  }

  setTouchDriveButton(button: "accelerate" | "brake" | "handbrake", active: boolean): void {
    this.touchInput[button] = active;
  }

  applyTouchLookDelta(deltaX: number, deltaY: number): void {
    if (this.state.screen !== "districtScene" || this.state.paused) {
      return;
    }

    this.audio?.unlock();
    this.applyLookDelta(deltaX, deltaY);
  }

  triggerTouchInteract(): void {
    if (this.state.screen !== "districtScene" || this.state.paused || this.gameplay.mode !== "onFoot") {
      return;
    }

    this.audio?.unlock();
    if (this.gameplay.nearbyMissionOfferId) {
      this.startMissionById(this.gameplay.nearbyMissionOfferId as MissionTemplate["id"]);
      return;
    }

    this.handleOnFootInteract();
  }

  triggerTouchVehicleAction(): void {
    if (this.state.screen !== "districtScene" || this.state.paused || this.gameplay.mode === "downed") {
      return;
    }

    this.audio?.unlock();
    if (this.gameplay.mode === "driving") {
      this.exitVehicle();
      return;
    }

    if (this.gameplay.interactableVehicleId) {
      this.enterVehicle(this.gameplay.interactableVehicleId);
    }
  }

  triggerTouchRespawn(): void {
    if (this.state.screen !== "districtScene") {
      return;
    }

    this.audio?.unlock();
    this.respawnPlayer(this.gameplay.mode === "downed" ? "Respawned at district start." : "Run reset to district spawn.");
  }

  triggerTouchVehicleReset(): void {
    if (this.state.screen !== "districtScene" || this.state.paused || this.gameplay.mode !== "driving") {
      return;
    }

    const vehicle = this.controlledVehicle();
    if (!vehicle) {
      return;
    }

    this.audio?.unlock();
    this.resetVehicle(vehicle);
  }

  debugSetPlayerPosition(position: WorldPoint): void {
    if (this.gameplay.mode !== "onFoot") {
      this.gameplay.mode = "onFoot";
      this.gameplay.inVehicleId = null;
    }

    this.gameplay.playerPosition.set(position.x, 0.02, position.z);
    this.resolvePlayerWorldCollisions();
    this.updateInteractionTargets();
    this.syncPlayerMesh();
    this.emitRuntimeUpdate(true);
  }

  debugSetControlledVehiclePosition(position: WorldPoint, yaw?: number): void {
    const vehicle = this.controlledVehicle();
    if (!vehicle) {
      return;
    }

    vehicle.position.set(position.x, 0.02, position.z);
    vehicle.yaw = yaw ?? vehicle.yaw;
    vehicle.speed = 0;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.yaw;
    this.updateInteractionTargets();
    this.emitRuntimeUpdate(true);
  }

  debugSetVehiclePosition(vehicleId: string, position: WorldPoint, yaw?: number): void {
    const vehicle = this.parkedVehicles.find((entry) => entry.id === vehicleId);
    if (!vehicle) {
      return;
    }

    vehicle.position.set(position.x, 0.02, position.z);
    vehicle.yaw = yaw ?? vehicle.yaw;
    vehicle.speed = 0;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.yaw;
    this.updateInteractionTargets();
    this.emitRuntimeUpdate(true);
  }

  private applyLookDelta(deltaX: number, deltaY: number): void {
    this.cameraYaw = wrapAngle(this.cameraYaw + deltaX * 0.0048);
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - deltaY * 0.0036, 0.16, 0.76);
    this.cameraLookIdle = 0;
  }

  private resetTouchInput(): void {
    this.touchInput.moveX = 0;
    this.touchInput.moveY = 0;
    this.touchInput.accelerate = false;
    this.touchInput.brake = false;
    this.touchInput.handbrake = false;
  }

  private advanceGameplay(delta: number): void {
    this.cameraLookIdle += delta;
    this.gameplay.messageTimer = Math.max(0, this.gameplay.messageTimer - delta);
    this.gameplay.invulnerabilityTimer = Math.max(0, this.gameplay.invulnerabilityTimer - delta);
    this.gameplay.heatDecayDelay = Math.max(0, this.gameplay.heatDecayDelay - delta);

    if (this.gameplay.mode === "downed") {
      this.gameplay.downedTimer = Math.max(0, this.gameplay.downedTimer - delta);
      if (this.gameplay.downedTimer === 0) {
        this.respawnPlayer("Respawned at district start.");
      }
      this.syncPlayerMesh();
      this.updateEngineAudio();
      return;
    }

    if (this.gameplay.mode === "driving") {
      const vehicle = this.controlledVehicle();
      if (!vehicle) {
        this.respawnPlayer("Ride lost. Respawned at district start.");
        return;
      }

      this.updateVehicleControl(vehicle, delta);
    } else {
      this.updateOnFootControl(delta);
      this.resolvePlayerTrafficContacts();
      this.resolvePlayerPedestrianContacts();
    }

    this.updateDistrictPressure(delta);
    this.updateMissionFlow(delta);
    this.updateInteractionTargets();
    this.syncPlayerMesh();
    this.updateEngineAudio();
  }

  private updateOnFootControl(delta: number): void {
    const touchForwardAxis = Math.abs(this.touchInput.moveY) > 0.12 ? -this.touchInput.moveY : 0;
    const touchStrafeAxis = Math.abs(this.touchInput.moveX) > 0.12 ? this.touchInput.moveX : 0;
    const forwardAxis = THREE.MathUtils.clamp(
      (this.input.forward ? 1 : 0) - (this.input.backward ? 1 : 0) + touchForwardAxis,
      -1,
      1,
    );
    const strafeAxis = THREE.MathUtils.clamp(
      (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0) + touchStrafeAxis,
      -1,
      1,
    );
    let moveX = 0;
    let moveZ = 0;
    const magnitude = Math.hypot(forwardAxis, strafeAxis);

    if (magnitude > 0) {
      const forward = new THREE.Vector2(Math.sin(this.cameraYaw), Math.cos(this.cameraYaw));
      const right = new THREE.Vector2(Math.cos(this.cameraYaw), -Math.sin(this.cameraYaw));
      moveX = (forward.x * forwardAxis + right.x * strafeAxis) / magnitude;
      moveZ = (forward.y * forwardAxis + right.y * strafeAxis) / magnitude;
      const keyboardActive = this.input.forward || this.input.backward || this.input.left || this.input.right;
      const touchMagnitude = Math.min(1, Math.hypot(touchForwardAxis, touchStrafeAxis));
      const speed = keyboardActive
        ? this.input.run
          ? 10.2
          : 6.4
        : THREE.MathUtils.lerp(4.2, 10.2, touchMagnitude);
      this.gameplay.playerPosition.x += moveX * speed * delta;
      this.gameplay.playerPosition.z += moveZ * speed * delta;
      this.resolvePlayerWorldCollisions();
      this.gameplay.playerYaw = dampAngle(this.gameplay.playerYaw, Math.atan2(moveX, moveZ), Math.min(1, delta * 10));
      this.gameplay.playerBob = Math.min(1, this.gameplay.playerBob + delta * 6.5);
    } else {
      this.gameplay.playerBob = Math.max(0, this.gameplay.playerBob - delta * 5);
    }

  }

  private updateVehicleControl(vehicle: ParkedVehicleActor, delta: number): void {
    const touchForward = this.touchInput.moveY < -0.55 ? 1 : 0;
    const touchReverse = this.touchInput.moveY > 0.55 ? 1 : 0;
    const accelerate = this.input.forward || this.touchInput.accelerate || touchForward ? 1 : 0;
    const reverse = this.input.backward || this.touchInput.brake || touchReverse ? 1 : 0;
    const touchSteer = Math.abs(this.touchInput.moveX) > 0.16 ? this.touchInput.moveX : 0;
    const steer = THREE.MathUtils.clamp(
      (this.input.right ? 1 : 0) - (this.input.left ? 1 : 0) + touchSteer,
      -1,
      1,
    );
    const forwardAccel = 28;
    const reverseAccel = 16;
    const brakePower = 34;
    const handbrakeActive = this.input.handbrake || this.touchInput.handbrake;
    const rollDrag = handbrakeActive ? 4.8 : 2.6;
    const maxForward = 31;
    const maxReverse = -12;

    if (accelerate) {
      vehicle.speed += forwardAccel * delta;
    } else if (reverse) {
      if (vehicle.speed > 1.2) {
        vehicle.speed -= brakePower * delta;
      } else {
        vehicle.speed -= reverseAccel * delta;
      }
    } else {
      const decay = Math.max(0, 1 - rollDrag * delta);
      vehicle.speed *= decay;
      if (Math.abs(vehicle.speed) < 0.08) {
        vehicle.speed = 0;
      }
    }

    vehicle.speed = THREE.MathUtils.clamp(vehicle.speed, maxReverse, maxForward);

    if (steer !== 0 && Math.abs(vehicle.speed) > 0.2) {
      const speedRatio = THREE.MathUtils.clamp(Math.abs(vehicle.speed) / maxForward, 0, 1);
      let turnRate = THREE.MathUtils.lerp(2.8, 1.1, speedRatio);
      if (handbrakeActive) {
        turnRate *= 1.55;
      }
      vehicle.yaw = wrapAngle(vehicle.yaw + steer * turnRate * delta * (vehicle.speed >= 0 ? 1 : -0.75));
    }

    if (handbrakeActive && Math.abs(vehicle.speed) > 8) {
      vehicle.speed *= Math.max(0.78, 1 - delta * 1.1);
    }

    vehicle.position.x += Math.sin(vehicle.yaw) * vehicle.speed * delta;
    vehicle.position.z += Math.cos(vehicle.yaw) * vehicle.speed * delta;

    this.resolveVehicleStaticCollisions(vehicle);
    this.resolveVehicleDynamicCollisions(vehicle);
    this.resolveVehiclePedestrianCollisions(vehicle);

    if (vehicle.durability <= 0 && !vehicle.destroyed) {
      vehicle.destroyed = true;
      this.beginDownedState("Ride wrecked. Respawn inbound.");
    }

    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.yaw;
  }

  private resolveVehicleStaticCollisions(vehicle: ParkedVehicleActor): void {
    let impacted = false;
    for (let pass = 0; pass < 3; pass += 1) {
      let collidedThisPass = false;
      for (const collider of this.staticColliders) {
        const hit = resolveCircleAgainstCollider(vehicle.position.x, vehicle.position.z, vehicle.bounds.radius, collider);
        if (!hit) {
          continue;
        }

        vehicle.position.x += hit.normalX * hit.depth;
        vehicle.position.z += hit.normalZ * hit.depth;
        vehicle.speed *= -0.2;
        vehicle.yaw = wrapAngle(vehicle.yaw + (hit.normalX * 0.12 - hit.normalZ * 0.12));
        impacted = true;
        collidedThisPass = true;
        this.damageVehicle(vehicle, 5 + Math.abs(vehicle.speed) * 0.7, `Bumped ${collider.label}.`);
        this.addHeat(0.18, undefined, vehicle.position, true);
      }
      if (!collidedThisPass) {
        break;
      }
    }

    if (impacted) {
      vehicle.mesh.position.copy(vehicle.position);
    }
  }

  private resolveVehicleDynamicCollisions(vehicle: ParkedVehicleActor): void {
    for (const other of this.parkedVehicles) {
      if (other.id === vehicle.id) {
        continue;
      }

      const hit = resolveCirclePair(
        vehicle.position.x,
        vehicle.position.z,
        vehicle.bounds.radius,
        other.position.x,
        other.position.z,
        other.bounds.radius,
      );
      if (!hit) {
        continue;
      }

      vehicle.position.x += hit.normalX * hit.depth;
      vehicle.position.z += hit.normalZ * hit.depth;
      other.position.x -= hit.normalX * hit.depth * 0.24;
      other.position.z -= hit.normalZ * hit.depth * 0.24;
      vehicle.speed *= -0.16;
      this.damageVehicle(vehicle, 6, `Clipped ${other.label}.`);
      this.addHeat(0.26, undefined, vehicle.position, true);
      other.mesh.position.copy(other.position);
    }

    for (const actor of this.trafficVehicles) {
      const hit = resolveCirclePair(
        vehicle.position.x,
        vehicle.position.z,
        vehicle.bounds.radius,
        actor.position.x,
        actor.position.z,
        actor.bounds.radius,
      );
      if (!hit) {
        continue;
      }

      vehicle.position.x += hit.normalX * hit.depth;
      vehicle.position.z += hit.normalZ * hit.depth;
      vehicle.speed *= 0.52;
      this.damageVehicle(vehicle, 7.5, actor.path.kind === "patrol" ? "Hit a patrol car." : "Hit traffic.");
      this.addHeat(actor.path.kind === "patrol" ? 1.2 : 0.8, undefined, vehicle.position, true);
      actor.stunTimer = 0.42;
      actor.flashTimer = 0.28;
      actor.knockback.set(-hit.normalX * 9, -hit.normalZ * 9);
    }
  }

  private resolveVehiclePedestrianCollisions(vehicle: ParkedVehicleActor): void {
    for (const actor of this.pedestrians) {
      const hit = resolveCirclePair(
        vehicle.position.x,
        vehicle.position.z,
        vehicle.bounds.radius,
        actor.position.x,
        actor.position.z,
        actor.radius,
      );
      if (!hit) {
        continue;
      }

      vehicle.position.x += hit.normalX * hit.depth * 0.22;
      vehicle.position.z += hit.normalZ * hit.depth * 0.22;
      vehicle.speed *= 0.86;
      this.damageVehicle(vehicle, 2.2, "Crowd contact slowed the ride.");
      this.addHeat(0.55, undefined, vehicle.position, true);
      actor.stunTimer = 0.7;
      actor.knockback.set(-hit.normalX * 7, -hit.normalZ * 7);
    }
  }

  private resolvePlayerWorldCollisions(): void {
    for (let pass = 0; pass < 3; pass += 1) {
      let collidedThisPass = false;
      for (const collider of this.staticColliders) {
        const hit = resolveCircleAgainstCollider(this.gameplay.playerPosition.x, this.gameplay.playerPosition.z, 0.42, collider);
        if (!hit) {
          continue;
        }

        this.gameplay.playerPosition.x += hit.normalX * hit.depth;
        this.gameplay.playerPosition.z += hit.normalZ * hit.depth;
        collidedThisPass = true;
      }

      for (const vehicle of this.parkedVehicles) {
        const hit = resolveCirclePair(
          this.gameplay.playerPosition.x,
          this.gameplay.playerPosition.z,
          0.42,
          vehicle.position.x,
          vehicle.position.z,
          vehicle.bounds.radius - 0.45,
        );
        if (!hit) {
          continue;
        }

        this.gameplay.playerPosition.x += hit.normalX * hit.depth;
        this.gameplay.playerPosition.z += hit.normalZ * hit.depth;
        collidedThisPass = true;
      }

      if (!collidedThisPass) {
        break;
      }
    }
  }

  private resolvePlayerTrafficContacts(): void {
    if (this.gameplay.invulnerabilityTimer > 0) {
      return;
    }

    for (const actor of this.trafficVehicles) {
      const hit = resolveCirclePair(
        this.gameplay.playerPosition.x,
        this.gameplay.playerPosition.z,
        0.42,
        actor.position.x,
        actor.position.z,
        actor.bounds.radius,
      );
      if (!hit) {
        continue;
      }

      this.gameplay.playerPosition.x += hit.normalX * hit.depth * 1.25;
      this.gameplay.playerPosition.z += hit.normalZ * hit.depth * 1.25;
      actor.stunTimer = 0.28;
      actor.knockback.set(-hit.normalX * 4.6, -hit.normalZ * 4.6);
      this.applyPlayerDamage(actor.path.kind === "patrol" ? 24 : 18, "Traffic hit. Respawn if pressure stacks.");
      this.addHeat(actor.path.kind === "patrol" ? 1.05 : 0.48, undefined, this.gameplay.playerPosition, true);
      break;
    }
  }

  private resolvePlayerPedestrianContacts(): void {
    for (const actor of this.pedestrians) {
      const hit = resolveCirclePair(
        this.gameplay.playerPosition.x,
        this.gameplay.playerPosition.z,
        0.42,
        actor.position.x,
        actor.position.z,
        actor.radius,
      );
      if (!hit) {
        continue;
      }

      this.gameplay.playerPosition.x += hit.normalX * hit.depth * 0.5;
      this.gameplay.playerPosition.z += hit.normalZ * hit.depth * 0.5;
      actor.stunTimer = Math.max(actor.stunTimer, 0.2);
      actor.knockback.set(-hit.normalX * 1.8, -hit.normalZ * 1.8);
    }
  }

  private updateInteractionTargets(): void {
    if (this.gameplay.mode !== "onFoot") {
      this.gameplay.interactableVehicleId = null;
      this.gameplay.nearbyMissionOfferId = null;
      this.activeInteraction = null;
      return;
    }

    let bestVehicle: ParkedVehicleActor | null = null;
    let bestVehicleDistance = Infinity;
    for (const vehicle of this.parkedVehicles) {
      if (vehicle.destroyed) {
        continue;
      }

      const distance = this.gameplay.playerPosition.distanceTo(vehicle.position);
      if (distance < 4.2 && distance < bestVehicleDistance) {
        bestVehicle = vehicle;
        bestVehicleDistance = distance;
      }
    }

    let bestMission: { template: MissionTemplate; distance: number } | null = null;
    if (!this.gameplay.activeMission) {
      for (const template of this.missionTemplates) {
        const point = this.missionPointById(template.startPointId);
        const distance = pointDistanceToVector(point.position, this.gameplay.playerPosition);
        if (distance < 5.6 && (!bestMission || distance < bestMission.distance)) {
          bestMission = { template, distance };
        }
      }
    }

    this.gameplay.interactableVehicleId = bestVehicle?.id ?? null;
    const missionCandidate = bestMission;
    this.gameplay.nearbyMissionOfferId = missionCandidate ? missionCandidate.template.id : null;

    if (missionCandidate && (!bestVehicle || missionCandidate.distance <= bestVehicleDistance + 0.2)) {
      this.activeInteraction = {
        kind: "mission",
        id: missionCandidate.template.id,
        label: missionCandidate.template.title,
        distance: missionCandidate.distance,
      };
      return;
    }

    this.activeInteraction = bestVehicle
      ? {
          kind: "vehicle",
          id: bestVehicle.id,
          label: bestVehicle.label,
          distance: bestVehicleDistance,
        }
      : null;
  }

  private handleOnFootInteract(): void {
    if (!this.activeInteraction) {
      return;
    }

    if (this.activeInteraction.kind === "mission") {
      this.startMissionById(this.activeInteraction.id as MissionTemplate["id"]);
      return;
    }

    this.enterVehicle(this.activeInteraction.id);
  }

  private missionPointById(id: string): DistrictMissionPoint {
    return this.state.district.missionPoints.find((point) => point.id === id) ?? this.state.district.missionPoints[0];
  }

  private missionTemplateById(id: MissionTemplate["id"]): MissionTemplate | null {
    return this.missionTemplates.find((template) => template.id === id) ?? null;
  }

  private startMissionById(id: MissionTemplate["id"]): void {
    if (this.gameplay.activeMission) {
      return;
    }

    const template = this.missionTemplateById(id);
    if (!template) {
      return;
    }

    switch (template.id) {
      case "parcel-run": {
        const startPoint = this.missionPointById(template.startPointId);
        const targetPoint = findMissionPoint(this.state.district, "dropoff");
        this.gameplay.activeMission = {
          id: template.id,
          title: template.title,
          archetype: "delivery",
          reward: template.reward,
          startPoint,
          targetPoint,
          bonusTimer: template.timerSeconds ?? 48,
        };
        this.setMessage(`Package secured at ${startPoint.label}. Deliver it to ${targetPoint.label}.`, 2.3, "info");
        break;
      }
      case "circuit-dash":
        this.gameplay.activeMission = {
          id: template.id,
          title: template.title,
          archetype: "checkpoint",
          reward: template.reward,
          checkpoints: buildCheckpointPath(this.state.district),
          currentCheckpointIndex: 0,
          timerRemaining: template.timerSeconds ?? 65,
          startedDriving: this.gameplay.mode === "driving",
        };
        this.setMessage("Checkpoint route loaded. Grab a ride and hit the first gate.", 2.3, "info");
        break;
      case "heat-break": {
        const safePoint = findMissionPoint(this.state.district, "hub");
        this.gameplay.activeMission = {
          id: template.id,
          title: template.title,
          archetype: "heatEscape",
          reward: template.reward,
          safePoint,
          timerRemaining: template.timerSeconds ?? 78,
          clearTimerRemaining: 6,
          clearTimerTarget: 6,
          targetHeat: 3.2,
        };
        this.addHeat(3.2, "Patrols are converging. Break line of sight and make it back to the hub.", this.controlledPosition(), true);
        this.setMessage("Heat spike triggered. Shake the patrol and return to the safe hub.", 2.5, "warning");
        break;
      }
      default:
        return;
    }

    this.audio?.playMissionPickup();
    this.activeInteraction = null;
    this.gameplay.nearbyMissionOfferId = null;
    this.refreshObjectiveMarkers();
  }

  private enterVehicle(vehicleId: string): void {
    const vehicle = this.parkedVehicles.find((entry) => entry.id === vehicleId && !entry.destroyed);
    if (!vehicle) {
      return;
    }

    this.gameplay.mode = "driving";
    this.gameplay.inVehicleId = vehicle.id;
    this.gameplay.interactableVehicleId = null;
    this.setMessage(`Entered ${vehicle.label}.`, 1.8);
    this.cameraLookIdle = 0;
    this.syncPlayerMesh();
  }

  private exitVehicle(): void {
    const vehicle = this.controlledVehicle();
    if (!vehicle) {
      return;
    }

    const right = new THREE.Vector2(Math.cos(vehicle.yaw), -Math.sin(vehicle.yaw));
    const candidateOffsets = [2.4, -2.4, 3.2];
    let placed = false;

    for (const offset of candidateOffsets) {
      const x = vehicle.position.x + right.x * offset;
      const z = vehicle.position.z + right.y * offset;
      if (this.positionIsClear(x, z, 0.42, vehicle.id)) {
        this.gameplay.playerPosition.set(x, 0.02, z);
        placed = true;
        break;
      }
    }

    if (!placed) {
      this.gameplay.playerPosition.set(vehicle.position.x - right.x * 2.8, 0.02, vehicle.position.z - right.y * 2.8);
    }

    this.gameplay.playerYaw = vehicle.yaw;
    this.gameplay.mode = "onFoot";
    this.gameplay.inVehicleId = null;
    this.setMessage(`Exited ${vehicle.label}.`, 1.4);
    this.resolvePlayerWorldCollisions();
    this.updateInteractionTargets();
    this.syncPlayerMesh();
  }

  private controlledVehicle(): ParkedVehicleActor | null {
    if (!this.gameplay.inVehicleId) {
      return null;
    }

    return this.parkedVehicles.find((vehicle) => vehicle.id === this.gameplay.inVehicleId) ?? null;
  }

  private controlledPosition(): THREE.Vector3 {
    return this.controlledVehicle()?.position ?? this.gameplay.playerPosition;
  }

  private heatLevel(): number {
    if (this.gameplay.heat <= 0.05) {
      return 0;
    }

    return Math.min(MAX_HEAT_LEVEL, Math.ceil(this.gameplay.heat));
  }

  private patrolAlertActive(): boolean {
    return this.heatLevel() >= 2 || this.gameplay.activeMission?.id === "heat-break";
  }

  private nearestPatrolDistance(): number {
    const origin = this.controlledPosition();
    let bestDistance = Number.POSITIVE_INFINITY;

    this.trafficVehicles.forEach((actor) => {
      if (actor.path.kind !== "patrol") {
        return;
      }

      bestDistance = Math.min(bestDistance, actor.position.distanceTo(origin));
    });

    return bestDistance;
  }

  private updateDistrictPressure(delta: number): void {
    const dropoff = findMissionPoint(this.state.district, "dropoff");
    const restrictedCenter = pointToVector(dropoff.position, 0.02);
    const position = this.controlledPosition();
    const insideRestricted = position.distanceTo(restrictedCenter) < 16;
    if (insideRestricted) {
      this.addHeat(delta * 0.45, undefined, restrictedCenter, true);
    }

    const patrolDistance = this.nearestPatrolDistance();
    const outsideSearch =
      !this.gameplay.heatSearchCenter || position.distanceTo(this.gameplay.heatSearchCenter) > this.gameplay.heatSearchRadius + 4;

    if (this.gameplay.heat > 0) {
      if (outsideSearch && patrolDistance > 18) {
        this.gameplay.heatHiddenTimer += delta;
      } else {
        this.gameplay.heatHiddenTimer = 0;
      }
    } else {
      this.gameplay.heatHiddenTimer = 0;
    }

    if (this.gameplay.heat > 0 && this.gameplay.heatDecayDelay === 0 && this.gameplay.heatHiddenTimer > 1.2) {
      this.gameplay.heat = Math.max(0, this.gameplay.heat - delta * 0.44);
      if (this.gameplay.heat === 0) {
        this.gameplay.heatSearchCenter = null;
        this.gameplay.heatSearchRadius = HEAT_SEARCH_RADIUS;
      }
    }
  }

  private updateMissionFlow(delta: number): void {
    const mission = this.gameplay.activeMission;
    if (!mission) {
      return;
    }

    switch (mission.id) {
      case "parcel-run": {
        mission.bonusTimer = Math.max(0, mission.bonusTimer - delta);
        const vehicle = this.controlledVehicle();
        const distance = pointDistanceToVector(mission.targetPoint.position, this.controlledPosition());
        if (distance < 6.2 && (!vehicle || Math.abs(vehicle.speed) < 6.5)) {
          const bonusActive = mission.bonusTimer > 0;
          this.completeMission(
            bonusActive
              ? `Parcel Run complete. Fast route bonus banked at ${mission.targetPoint.label}.`
              : `Parcel Run complete at ${mission.targetPoint.label}.`,
            bonusActive ? { cash: 80, score: 60, xp: 12 } : undefined,
          );
        }
        break;
      }
      case "circuit-dash": {
        mission.timerRemaining = Math.max(0, mission.timerRemaining - delta);
        if (mission.timerRemaining === 0) {
          this.failMission("Circuit Dash failed. The route timer expired.");
          return;
        }

        if (this.gameplay.mode === "driving") {
          mission.startedDriving = true;
          const checkpoint = mission.checkpoints[mission.currentCheckpointIndex];
          if (checkpoint && pointDistanceToVector(checkpoint.position, this.controlledPosition()) <= checkpoint.radius) {
            mission.currentCheckpointIndex += 1;
            this.audio?.playMissionPickup();
            if (mission.currentCheckpointIndex >= mission.checkpoints.length) {
              this.completeMission("Circuit Dash complete. The boulevard loop is clean.");
              return;
            }

            this.setMessage(`${checkpoint.label} cleared. Next gate is live.`, 1.6, "info");
            this.refreshObjectiveMarkers();
          }
        }
        break;
      }
      case "heat-break": {
        mission.timerRemaining = Math.max(0, mission.timerRemaining - delta);
        if (mission.timerRemaining === 0) {
          this.failMission("Heat Break failed. Patrol pressure held too long.");
          return;
        }

        const position = this.controlledPosition();
        const patrolDistance = this.nearestPatrolDistance();
        const outsideSearch =
          !this.gameplay.heatSearchCenter || position.distanceTo(this.gameplay.heatSearchCenter) > this.gameplay.heatSearchRadius + 4;
        const previouslyCooling = mission.clearTimerRemaining === 0;

        if (this.heatLevel() <= 1 && outsideSearch && patrolDistance > 20) {
          mission.clearTimerRemaining = Math.max(0, mission.clearTimerRemaining - delta);
        } else {
          mission.clearTimerRemaining = Math.min(mission.clearTimerTarget, mission.clearTimerRemaining + delta * 0.55);
        }

        if (!previouslyCooling && mission.clearTimerRemaining === 0) {
          this.setMessage("Patrol contact is cold. Slide into the safe hub to cash out.", 2, "success");
        }

        const safeDistance = pointDistanceToVector(mission.safePoint.position, position);
        const vehicle = this.controlledVehicle();
        if (mission.clearTimerRemaining === 0 && safeDistance < 6.4 && (!vehicle || Math.abs(vehicle.speed) < 8)) {
          this.completeMission("Heat Break complete. The search grid lost you.");
        }
        break;
      }
      default:
        break;
    }
  }

  private awardReward(reward: MissionReward): void {
    this.gameplay.cash += reward.cash;
    this.gameplay.score += reward.score;
    this.gameplay.xp += reward.xp;
  }

  private completeMission(message: string, bonusReward?: MissionReward): void {
    const mission = this.gameplay.activeMission;
    if (!mission) {
      return;
    }

    this.awardReward(mission.reward);
    if (bonusReward) {
      this.awardReward(bonusReward);
    }

    this.gameplay.activeMission = null;
    this.setMessage(message, 2.8, "success");
    this.audio?.playMissionComplete();
    this.refreshObjectiveMarkers();
  }

  private failMission(reason: string): void {
    if (!this.gameplay.activeMission) {
      return;
    }

    this.gameplay.activeMission = null;
    this.setMessage(reason, 2.4, "danger");
    this.audio?.playFail();
    this.refreshObjectiveMarkers();
  }

  private addHeat(
    amount: number,
    message?: string,
    center?: THREE.Vector3 | WorldPoint,
    silent = false,
  ): void {
    const previousLevel = this.heatLevel();
    const anchor =
      center instanceof THREE.Vector3
        ? center.clone()
        : center
          ? pointToVector(center, 0.02)
          : this.controlledPosition().clone();

    this.gameplay.heat = THREE.MathUtils.clamp(this.gameplay.heat + amount, 0, MAX_HEAT_LEVEL);
    this.gameplay.heatDecayDelay = Math.max(this.gameplay.heatDecayDelay, 4.2);
    this.gameplay.heatSearchCenter = anchor;
    this.gameplay.heatSearchRadius = HEAT_SEARCH_RADIUS + this.heatLevel() * 2.8;
    const nextLevel = this.heatLevel();

    if (!silent && message) {
      this.setMessage(message, 1.8, "warning");
    }

    if (nextLevel > previousLevel) {
      this.audio?.playHeatAlert(nextLevel);
      if (!silent && !message) {
        this.setMessage("Heat is rising. Patrol pressure is building.", 1.8, "warning");
      }
    }
  }

  private updateEngineAudio(): void {
    const vehicle = this.controlledVehicle();
    this.audio?.updateEngine({
      active: Boolean(vehicle) && this.state.screen === "districtScene",
      speedRatio: vehicle ? THREE.MathUtils.clamp(Math.abs(vehicle.speed) / 31, 0, 1) : 0,
      throttle: this.input.forward ? 1 : this.input.backward ? 0.45 : 0,
      paused: this.state.paused || this.state.screen !== "districtScene",
    });
  }

  private refreshObjectiveMarkers(): void {
    if (!this.districtRoot) {
      return;
    }

    this.objectiveMarkers.forEach((marker) => {
      disposeGroup(marker);
      this.districtRoot?.remove(marker);
    });
    this.objectiveMarkers = [];

    const mission = this.gameplay.activeMission;
    if (!mission) {
      return;
    }

    const addMarker = (marker: THREE.Group, point: WorldPoint): void => {
      marker.position.copy(pointToVector(point, 0));
      this.districtRoot?.add(marker);
      this.objectiveMarkers.push(marker);
    };

    switch (mission.id) {
      case "parcel-run":
        addMarker(createObjectiveMarker(hex(this.state.district.palette.secondaryAccent), 1.8, 3.2, 2), mission.targetPoint.position);
        break;
      case "circuit-dash":
        mission.checkpoints.forEach((checkpoint, index) => {
          if (index < mission.currentCheckpointIndex) {
            return;
          }

          addMarker(
            createObjectiveMarker(
              index === mission.currentCheckpointIndex ? hex(this.state.district.palette.accent) : mixColor(this.state.district.palette.accent, "#ffffff", 0.3),
              index === mission.currentCheckpointIndex ? 1.9 : 1.5,
              index === mission.currentCheckpointIndex ? 3.6 : 2.8,
              index === mission.currentCheckpointIndex ? 2 : 1,
            ),
            checkpoint.position,
          );
        });
        break;
      case "heat-break":
        addMarker(createObjectiveMarker(hex(this.state.district.palette.accent), 2, 3.2, 2), mission.safePoint.position);
        break;
      default:
        break;
    }
  }

  private damageVehicle(vehicle: ParkedVehicleActor, amount: number, message: string): void {
    vehicle.durability = Math.max(0, vehicle.durability - amount);
    this.setMessage(message, 1.2, "warning");
    this.audio?.playCollision(0.55 + amount * 0.025);
  }

  private applyPlayerDamage(amount: number, message: string): void {
    this.gameplay.health = Math.max(0, this.gameplay.health - amount);
    this.gameplay.invulnerabilityTimer = 1;
    this.setMessage(message, 1.4, "danger");
    if (this.gameplay.health <= 0) {
      this.beginDownedState("Runner down. Respawn inbound.");
    }
  }

  private beginDownedState(message: string): void {
    const missionDropped = Boolean(this.gameplay.activeMission);
    if (this.gameplay.activeMission) {
      this.gameplay.activeMission = null;
      this.refreshObjectiveMarkers();
      this.audio?.playFail();
    }

    this.gameplay.mode = "downed";
    this.gameplay.health = 0;
    this.gameplay.downedTimer = 1.5;
    const vehicle = this.controlledVehicle();
    if (vehicle) {
      vehicle.speed = 0;
      if (vehicle.destroyed) {
        this.resetVehicleToSpawn(vehicle);
      }
    }
    this.gameplay.inVehicleId = null;
    this.gameplay.interactableVehicleId = null;
    this.gameplay.nearbyMissionOfferId = null;
    this.activeInteraction = null;
    this.setMessage(missionDropped ? `Mission failed. ${message}` : message, 1.5, "danger");
    this.syncPlayerMesh();
  }

  private respawnPlayer(message: string): void {
    const preservedRewards = {
      cash: this.gameplay.cash,
      score: this.gameplay.score,
      xp: this.gameplay.xp,
    };
    const missionReset = this.gameplay.activeMission ? " Active mission dropped back into free roam." : "";
    if (this.gameplay.activeMission) {
      this.audio?.playFail();
    }
    const spawn = this.state.district.spawnPoint;
    this.gameplay = {
      ...createGameplayState(this.state.district),
      ...preservedRewards,
      message: `${message}${missionReset}`,
      messageTimer: 2,
      messageTone: "warning",
      playerPosition: pointToVector(spawn.position, 0.02),
      playerYaw: spawn.facing,
    };
    this.refreshObjectiveMarkers();
    this.audio?.playRespawn();
    this.syncPlayerMesh();
    this.emitRuntimeUpdate(true);
  }

  private resetVehicle(vehicle: ParkedVehicleActor): void {
    const placement = this.nearestRoadPlacement(vehicle.position, vehicle.yaw);
    vehicle.position.copy(placement.position);
    vehicle.yaw = placement.yaw;
    vehicle.speed = 0;
    vehicle.durability = Math.max(vehicle.durability, 42);
    vehicle.destroyed = false;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.yaw;
    this.setMessage("Vehicle reset to the nearest clear lane.", 1.6, "info");
  }

  private resetVehicleToSpawn(vehicle: ParkedVehicleActor): void {
    vehicle.position.copy(pointToVector(vehicle.spawn.position, 0.02));
    vehicle.yaw = vehicle.spawn.facing;
    vehicle.speed = 0;
    vehicle.durability = 100;
    vehicle.destroyed = false;
    vehicle.mesh.position.copy(vehicle.position);
    vehicle.mesh.rotation.y = vehicle.yaw;
  }

  private nearestRoadPlacement(position: THREE.Vector3, currentYaw: number): { position: THREE.Vector3; yaw: number } {
    let bestPlacement = {
      position: pointToVector(this.state.district.spawnPoint.position, 0.02),
      yaw: this.state.district.spawnPoint.facing,
      distance: Number.POSITIVE_INFINITY,
    };

    this.state.district.roads.forEach((road) => {
      if (road.orientation === "vertical") {
        const laneOffset = position.x < road.center.x ? -road.width * 0.18 : road.width * 0.18;
        const candidate = new THREE.Vector3(
          road.center.x + laneOffset,
          0.02,
          clampToAabb(position.z, road.center.z - road.length / 2 + 6, road.center.z + road.length / 2 - 6),
        );
        const yawChoices = [0, Math.PI];
        const yaw = Math.abs(angleDelta(currentYaw, yawChoices[0])) < Math.abs(angleDelta(currentYaw, yawChoices[1]))
          ? yawChoices[0]
          : yawChoices[1];
        const distance = candidate.distanceTo(position);
        if (distance < bestPlacement.distance) {
          bestPlacement = { position: candidate, yaw, distance };
        }
        return;
      }

      const laneOffset = position.z < road.center.z ? -road.width * 0.18 : road.width * 0.18;
      const candidate = new THREE.Vector3(
        clampToAabb(position.x, road.center.x - road.length / 2 + 6, road.center.x + road.length / 2 - 6),
        0.02,
        road.center.z + laneOffset,
      );
      const yawChoices = [Math.PI / 2, -Math.PI / 2];
      const yaw = Math.abs(angleDelta(currentYaw, yawChoices[0])) < Math.abs(angleDelta(currentYaw, yawChoices[1]))
        ? yawChoices[0]
        : yawChoices[1];
      const distance = candidate.distanceTo(position);
      if (distance < bestPlacement.distance) {
        bestPlacement = { position: candidate, yaw, distance };
      }
    });

    return { position: bestPlacement.position, yaw: bestPlacement.yaw };
  }

  private positionIsClear(x: number, z: number, radius: number, ignoreVehicleId?: string): boolean {
    for (const collider of this.staticColliders) {
      if (resolveCircleAgainstCollider(x, z, radius, collider)) {
        return false;
      }
    }

    for (const vehicle of this.parkedVehicles) {
      if (vehicle.id === ignoreVehicleId) {
        continue;
      }

      if (resolveCirclePair(x, z, radius, vehicle.position.x, vehicle.position.z, vehicle.bounds.radius)) {
        return false;
      }
    }

    return true;
  }

  private syncPlayerMesh(): void {
    if (!this.playerMesh) {
      return;
    }

    if (this.gameplay.mode !== "onFoot") {
      this.playerMesh.visible = false;
      return;
    }

    this.playerMesh.visible = true;
    const bobHeight = this.gameplay.playerBob > 0 ? Math.abs(Math.sin(this.clock.elapsedTime * 7.4)) * 0.08 : 0;
    this.playerMesh.position.set(this.gameplay.playerPosition.x, 0.02 + bobHeight, this.gameplay.playerPosition.z);
    this.playerMesh.rotation.y = this.gameplay.playerYaw;
  }

  private syncParkedVehicles(): void {
    this.parkedVehicles.forEach((vehicle) => {
      vehicle.mesh.position.copy(vehicle.position);
      vehicle.mesh.rotation.y = vehicle.yaw;
    });
  }

  private updateAmbientActors(delta: number, elapsed: number, motionFactor: number): void {
    const patrolAlert = this.patrolAlertActive();
    const patrolTarget = this.gameplay.heatSearchCenter ?? this.controlledPosition();
    this.trafficVehicles.forEach((actor) => {
      actor.flashTimer = Math.max(0, actor.flashTimer - delta);
      if (actor.stunTimer > 0) {
        actor.stunTimer = Math.max(0, actor.stunTimer - delta);
        actor.position.x += actor.knockback.x * delta;
        actor.position.z += actor.knockback.y * delta;
        actor.knockback.multiplyScalar(Math.max(0, 1 - delta * 4.4));
      } else if (actor.path.kind === "patrol" && patrolAlert) {
        const desiredAngle = Math.atan2(patrolTarget.x - actor.position.x, patrolTarget.z - actor.position.z);
        actor.angle = dampAngle(actor.angle, desiredAngle, Math.min(1, delta * 3.2));
        const chaseSpeed = (10.5 + this.heatLevel() * 1.8) * motionFactor;
        actor.position.x += Math.sin(actor.angle) * chaseSpeed * delta;
        actor.position.z += Math.cos(actor.angle) * chaseSpeed * delta;
        actor.progress = nearestPathProgress(actor.path.points, actor.position);
        actor.flashTimer = Math.max(actor.flashTimer, 0.12);
      } else {
        actor.speed = actor.baseSpeed;
        if (actor.path.kind === "patrol") {
          actor.progress = nearestPathProgress(actor.path.points, actor.position);
        }
        actor.progress += delta * actor.speed * motionFactor;
        const sample = samplePath(actor.path.points, actor.progress);
        actor.position.set(sample.position.x, 0.02, sample.position.z);
        actor.angle = actor.path.kind === "patrol" ? dampAngle(actor.angle, sample.angle, Math.min(1, delta * 4.2)) : sample.angle;
      }

      actor.mesh.position.copy(actor.position);
      actor.mesh.rotation.y = actor.angle;
      const flashScale = actor.flashTimer > 0 ? 1 + actor.flashTimer * 0.22 : 1;
      actor.mesh.scale.setScalar(flashScale);
    });

    this.pedestrians.forEach((actor) => {
      if (actor.stunTimer > 0) {
        actor.stunTimer = Math.max(0, actor.stunTimer - delta);
        actor.position.x += actor.knockback.x * delta;
        actor.position.z += actor.knockback.y * delta;
        actor.knockback.multiplyScalar(Math.max(0, 1 - delta * 5));
      } else {
        actor.progress += delta * actor.speed * motionFactor;
        const sample = samplePath(actor.path.points, actor.progress);
        actor.position.set(sample.position.x, 0.02, sample.position.z);
        actor.angle = sample.angle;
      }

      actor.mesh.position.set(
        actor.position.x,
        0.02 + Math.abs(Math.sin(elapsed * 5.6 + actor.strideOffset)) * 0.06,
        actor.position.z,
      );
      actor.mesh.rotation.y = actor.angle;
    });
  }

  private updateMissionMarkers(elapsed: number, motionFactor: number): void {
    this.missionMarkers.forEach((marker, index) => {
      marker.mesh.rotation.y += 0.014 * motionFactor;
      const pulse = 1 + Math.sin(elapsed * 2.4 + index) * 0.06;
      marker.mesh.scale.setScalar(pulse);
    });

    this.objectiveMarkers.forEach((marker, index) => {
      marker.rotation.y += 0.018 * motionFactor;
      const pulse = 1 + Math.sin(elapsed * 3 + index * 0.7) * 0.08;
      marker.scale.setScalar(pulse);
    });
  }

  private updateCamera(delta: number, elapsed: number): void {
    if (this.state.screen !== "districtScene") {
      const pose = cameraPoseFor(this.state.screen, this.state.paused);
      const orbit = this.state.reduceMotion ? 0 : Math.sin(elapsed * 0.16) * 2.4;
      const drift = this.state.screen === "menu" ? 1.4 : 0.8;
      this.camera.position.lerp(
        new THREE.Vector3(
          pose.position.x + orbit * drift,
          pose.position.y + Math.sin(elapsed * 0.13) * 0.9 * drift,
          pose.position.z + Math.cos(elapsed * 0.18) * 1.8 * drift,
        ),
        0.04,
      );
      this.camera.lookAt(pose.target);
      return;
    }

    const controlled = this.controlledVehicle();
    const target =
      this.gameplay.mode === "driving" && controlled
        ? new THREE.Vector3(controlled.position.x, 2.1, controlled.position.z)
        : new THREE.Vector3(this.gameplay.playerPosition.x, 1.5, this.gameplay.playerPosition.z);
    const distance = this.gameplay.mode === "driving" ? 10.8 : 7.2;
    const shoulder = this.gameplay.mode === "driving" ? 0.7 : 0.28;

    if (controlled && this.cameraLookIdle > 1.15) {
      this.cameraYaw = dampAngle(this.cameraYaw, controlled.yaw, Math.min(1, delta * 2.8));
    }

    const forward = new THREE.Vector3(Math.sin(this.cameraYaw), 0, Math.cos(this.cameraYaw));
    const right = new THREE.Vector3(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));
    const groundDistance = Math.cos(this.cameraPitch) * distance;
    const desired = target
      .clone()
      .sub(forward.multiplyScalar(groundDistance))
      .add(right.multiplyScalar(shoulder));
    desired.y = target.y + Math.sin(this.cameraPitch) * distance + (this.gameplay.mode === "driving" ? 2.6 : 1.35);

    const smoothing = this.state.paused ? 0.08 : Math.min(0.16, delta * 6.4);
    this.camera.position.lerp(desired, smoothing);
    this.camera.lookAt(target.clone().add(right.multiplyScalar(0.18)));
  }

  private isPointerLocked(): boolean {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private releasePointerLock(): void {
    if (document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
  }

  private setMessage(message: string, duration: number, tone: HudMessageTone = "info"): void {
    this.gameplay.message = message;
    this.gameplay.messageTimer = duration;
    this.gameplay.messageTone = tone;
  }

  private activeMissionSnapshot(): ActiveMissionSnapshot | null {
    const mission = this.gameplay.activeMission;
    if (!mission) {
      return null;
    }

    switch (mission.id) {
      case "parcel-run":
        return {
          id: mission.id,
          title: mission.title,
          archetype: mission.archetype,
          stageLabel: "Package delivery",
          objective: `Deliver the package to ${mission.targetPoint.label}.`,
          detail:
            mission.bonusTimer > 0
              ? `Bonus clock: ${formatTimer(mission.bonusTimer)}`
              : "Bonus window closed. Finish the route clean.",
          progressLabel: "Package onboard",
          rewardText: rewardText(mission.reward),
          distance: pointDistanceToVector(mission.targetPoint.position, this.controlledPosition()),
          timerSeconds: mission.bonusTimer > 0 ? mission.bonusTimer : null,
        };
      case "circuit-dash": {
        const checkpoint = mission.checkpoints[mission.currentCheckpointIndex];
        return {
          id: mission.id,
          title: mission.title,
          archetype: mission.archetype,
          stageLabel: "Checkpoint drive",
          objective: checkpoint
            ? `${checkpoint.label} is live. Clear every gate before the timer hits zero.`
            : "Route complete.",
          detail: mission.startedDriving ? "Stay in motion and cut the cleanest line through the streets." : "Enter a vehicle to start the timed route.",
          progressLabel: `${mission.currentCheckpointIndex} / ${mission.checkpoints.length} gates`,
          rewardText: rewardText(mission.reward),
          distance: checkpoint ? pointDistanceToVector(checkpoint.position, this.controlledPosition()) : 0,
          timerSeconds: mission.timerRemaining,
        };
      }
      case "heat-break":
        return {
          id: mission.id,
          title: mission.title,
          archetype: mission.archetype,
          stageLabel: "Heat escape",
          objective:
            mission.clearTimerRemaining > 0
              ? "Lose patrol pressure and wait for the grid to cool."
              : `Reach ${mission.safePoint.label} to close the run.`,
          detail:
            mission.clearTimerRemaining > 0
              ? `Cool-off timer: ${mission.clearTimerRemaining.toFixed(1)}s`
              : "The route is cold. Slide into the safe hub.",
          progressLabel:
            mission.clearTimerRemaining > 0
              ? `Heat ${this.heatLevel()} / ${MAX_HEAT_LEVEL}`
              : "Safe route unlocked",
          rewardText: rewardText(mission.reward),
          distance: pointDistanceToVector(mission.safePoint.position, this.controlledPosition()),
          timerSeconds: mission.timerRemaining,
        };
      default:
        return null;
    }
  }

  private nearbyMissionOfferSnapshot(): MissionOfferSnapshot | null {
    const missionId = this.gameplay.nearbyMissionOfferId as MissionTemplate["id"] | null;
    if (!missionId) {
      return null;
    }

    const template = this.missionTemplateById(missionId);
    if (!template) {
      return null;
    }

    const point = this.missionPointById(template.startPointId);
    return {
      id: template.id,
      title: template.title,
      archetype: template.archetype,
      startLabel: point.label,
      description: template.description,
      rewardText: rewardText(template.reward),
    };
  }

  private buildMinimapMarkers(): MinimapMarkerSnapshot[] {
    const markers: MinimapMarkerSnapshot[] = this.state.district.missionPoints.map((point) => ({
      id: point.id,
      kind: "mission",
      label: point.label,
      position: point.position,
      emphasis: "normal",
    }));

    const mission = this.gameplay.activeMission;
    if (mission?.id === "parcel-run") {
      markers.push({
        id: `${mission.id}-objective`,
        kind: "objective",
        label: mission.targetPoint.label,
        position: mission.targetPoint.position,
        emphasis: "active",
      });
    } else if (mission?.id === "circuit-dash") {
      const checkpoint = mission.checkpoints[mission.currentCheckpointIndex];
      if (checkpoint) {
        markers.push({
          id: checkpoint.id,
          kind: "checkpoint",
          label: checkpoint.label,
          position: checkpoint.position,
          emphasis: "active",
        });
      }
    } else if (mission?.id === "heat-break") {
      markers.push({
        id: `${mission.id}-safe`,
        kind: "safe",
        label: mission.safePoint.label,
        position: mission.safePoint.position,
        emphasis: mission.clearTimerRemaining === 0 ? "active" : "normal",
      });
    }

    if (this.gameplay.heatSearchCenter) {
      markers.push({
        id: "search-zone",
        kind: "restricted",
        label: "Search zone",
        position: vectorToWorldPoint(this.gameplay.heatSearchCenter),
        radius: this.gameplay.heatSearchRadius,
        emphasis: "danger",
      });
    }

    if (this.heatLevel() > 0) {
      this.trafficVehicles
        .filter((actor) => actor.path.kind === "patrol")
        .forEach((actor, index) => {
          markers.push({
            id: `patrol-${index}`,
            kind: "patrol",
            label: actor.path.label,
            position: vectorToWorldPoint(actor.position),
            heading: actor.angle,
            emphasis: "danger",
          });
        });
    }

    return markers;
  }

  private buildRuntimeSnapshot(): ShellSceneRuntimeSnapshot {
    const vehicle = this.controlledVehicle();
    const nearbyVehicle = this.gameplay.interactableVehicleId
      ? this.parkedVehicles.find((entry) => entry.id === this.gameplay.interactableVehicleId) ?? null
      : null;
    const nearbyMissionOffer = this.nearbyMissionOfferSnapshot();
    const activeMission = this.activeMissionSnapshot();
    const heatLevel = this.heatLevel();
    const prompt =
      this.gameplay.mode === "downed"
        ? "R Respawn at district start"
        : this.gameplay.mode === "driving"
          ? `E Exit ${vehicle?.label ?? "vehicle"} • Space handbrake • X reset ride`
          : nearbyMissionOffer
            ? `E Start ${nearbyMissionOffer.title} • ${nearbyMissionOffer.rewardText}`
          : nearbyVehicle
            ? `E Enter ${nearbyVehicle.label}`
            : "WASD or arrows move • Shift run • Click and drag or lock the mouse to orbit";
    const status =
      this.gameplay.messageTimer > 0
        ? this.gameplay.message
        : this.gameplay.mode === "downed"
          ? "Respawn queued. Press R to restart the run immediately."
          : activeMission
            ? activeMission.objective
          : this.gameplay.mode === "driving"
            ? heatLevel > 0
              ? `${vehicle?.label ?? "Ride"} is hot. Stay mobile and bleed the heat off.`
              : `${vehicle?.label ?? "Ride"} active. Space handbrake, X reset if wedged.`
            : nearbyMissionOffer
              ? `Mission offer ready at ${nearbyMissionOffer.startLabel}: ${nearbyMissionOffer.title}.`
            : nearbyVehicle
              ? `Parked ride in reach: ${nearbyVehicle.label}.`
              : heatLevel > 0
                ? "Stay hidden, widen the gap, and wait for the heat to cool."
                : "On foot. Run the sidewalks, orbit the camera, and line up your first ride.";

    return {
      playerMode: this.gameplay.mode,
      districtName: this.state.district.name,
      districtTag: this.state.district.shortTag,
      health: Math.round(this.gameplay.health),
      vehicleDurability: vehicle ? Math.round(vehicle.durability) : null,
      speed: vehicle ? Math.round(Math.abs(vehicle.speed) * 3.6) : null,
      activeVehicleLabel: vehicle?.label ?? null,
      nearbyVehicleLabel: nearbyVehicle?.label ?? null,
      playerPosition: vectorToWorldPoint(this.controlledPosition()),
      playerHeading: this.gameplay.mode === "driving" && vehicle ? vehicle.yaw : this.gameplay.playerYaw,
      cash: Math.round(this.gameplay.cash),
      score: Math.round(this.gameplay.score),
      xp: Math.round(this.gameplay.xp),
      heatLevel,
      heatMaxLevel: MAX_HEAT_LEVEL,
      heatLabel: heatLevel === 0 ? "Clear" : `${"★".repeat(heatLevel)} Heat`,
      patrolAlert: this.patrolAlertActive(),
      prompt,
      status,
      message: {
        text: this.gameplay.message,
        tone: this.gameplay.messageTone,
      },
      activeMission,
      nearbyMissionOffer,
      minimapMarkers: this.buildMinimapMarkers(),
      pointerLockSupported: this.pointerLockSupported,
      pointerLockActive: this.isPointerLocked(),
      canRespawn: true,
      canResetVehicle: Boolean(vehicle),
    };
  }

  private emitRuntimeUpdate(force: boolean): void {
    if (!this.runtimeListener) {
      return;
    }

    const snapshot = this.buildRuntimeSnapshot();
    const signature = JSON.stringify(snapshot);
    const now = performance.now();
    if (!force && signature === this.runtimeSignature && now - this.lastRuntimeEmit < 180) {
      return;
    }

    this.runtimeSignature = signature;
    this.lastRuntimeEmit = now;
    this.runtimeListener(snapshot);
  }

  getDebugState(): {
    runtime: ShellSceneRuntimeSnapshot;
    player: { x: number; z: number; yaw: number };
    camera: { yaw: number; pitch: number };
    parkedVehicles: Array<{
      id: string;
      label: string;
      model: VehicleModelId;
      x: number;
      z: number;
      yaw: number;
      durability: number;
      speed: number;
      destroyed: boolean;
    }>;
    trafficVehicles: Array<{
      kind: DistrictPath["kind"];
      label: string;
      x: number;
      z: number;
      yaw: number;
      speed: number;
    }>;
    pedestrians: Array<{
      label: string;
      x: number;
      z: number;
      yaw: number;
      speed: number;
      stunned: boolean;
    }>;
  } {
    return {
      runtime: this.buildRuntimeSnapshot(),
      player: {
        x: Number(this.gameplay.playerPosition.x.toFixed(2)),
        z: Number(this.gameplay.playerPosition.z.toFixed(2)),
        yaw: Number(this.gameplay.playerYaw.toFixed(4)),
      },
      camera: {
        yaw: Number(this.cameraYaw.toFixed(4)),
        pitch: Number(this.cameraPitch.toFixed(4)),
      },
      parkedVehicles: this.parkedVehicles.map((vehicle) => ({
        id: vehicle.id,
        label: vehicle.label,
        model: vehicle.model,
        x: Number(vehicle.position.x.toFixed(2)),
        z: Number(vehicle.position.z.toFixed(2)),
        yaw: Number(vehicle.yaw.toFixed(4)),
        durability: Math.round(vehicle.durability),
        speed: Number(vehicle.speed.toFixed(2)),
        destroyed: vehicle.destroyed,
      })),
      trafficVehicles: this.trafficVehicles.map((vehicle) => ({
        kind: vehicle.path.kind,
        label: vehicle.path.label,
        x: Number(vehicle.position.x.toFixed(2)),
        z: Number(vehicle.position.z.toFixed(2)),
        yaw: Number(vehicle.angle.toFixed(4)),
        speed: Number(vehicle.speed.toFixed(4)),
      })),
      pedestrians: this.pedestrians.map((pedestrian) => ({
        label: pedestrian.path.label,
        x: Number(pedestrian.position.x.toFixed(2)),
        z: Number(pedestrian.position.z.toFixed(2)),
        yaw: Number(pedestrian.angle.toFixed(4)),
        speed: Number(pedestrian.speed.toFixed(4)),
        stunned: pedestrian.stunTimer > 0,
      })),
    };
  }
}
