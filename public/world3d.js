import * as THREE from '/vendor/three.module.js';
import { CITY_BUILDINGS, CITY_PATHS, GAS_LAMPS, gameToWorld } from './world-layout.js';

const PALETTE = [0x5e7779, 0x788276, 0x776d7d, 0x896c58, 0x647184, 0x8a806a, 0x526a65, 0x80676e];
let activeScene = null;

export function createLondonWorld(canvas, options = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    console.warn('The 3D London scene could not start; the illustrated map fallback will be used.', error);
    return null;
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  activeScene = scene;
  const night = new THREE.Color('#07111d');
  scene.background = night;
  scene.fog = new THREE.FogExp2(night, 0.035);

  const camera = new THREE.PerspectiveCamera(52, 1.5, 0.1, 70);
  camera.position.set(0, 12, 15);
  camera.lookAt(0, 0, 0);
  const hemisphere = new THREE.HemisphereLight(0x9bb8dc, 0x171617, 1.45);
  scene.add(hemisphere);
  const moon = new THREE.DirectionalLight(0x9eb7d8, 2.1);
  moon.position.set(-7, 12, 5);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -15; moon.shadow.camera.right = 15;
  moon.shadow.camera.top = 13; moon.shadow.camera.bottom = -13;
  moon.shadow.bias = -0.0005;
  scene.add(moon);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(31, 21),
    new THREE.MeshStandardMaterial({ color: 0x20282e, roughness: 0.34, metalness: 0.19, map: makeCobbleTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.055;
  ground.receiveShadow = true;
  scene.add(ground);

  const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x657178, roughness: 0.26, metalness: 0.22, map: makeCobbleTexture() });
  for (const path of CITY_PATHS) addRoad(path, 1.48, streetMaterial);
  addDistrictEdge();
  CITY_BUILDINGS.forEach((building, index) => addBuilding(building, index));
  addLandmarks();
  GAS_LAMPS.forEach(([x, y], index) => addLamp(x, y, index));

  const rain = makeRain();
  scene.add(rain.points);
  const actors = new Map();
  const markers = new Map();
  let localPlayerId = '';
  let yaw = 0;
  let pitch = 0.24;
  let reducedMotion = Boolean(options.reducedMotion);
  let dragging = false;
  let previousPointer = null;
  let previousTime = performance.now();

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  }

  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas.parentElement);
  window.addEventListener('resize', resize);
  resize();

  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    dragging = true;
    previousPointer = { x: event.clientX, y: event.clientY };
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!dragging || !previousPointer) return;
    const dx = event.clientX - previousPointer.x;
    const dy = event.clientY - previousPointer.y;
    yaw -= dx * 0.006;
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.003, 0.08, 0.62);
    previousPointer = { x: event.clientX, y: event.clientY };
    options.onLook?.();
  });
  const endDrag = () => { dragging = false; previousPointer = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  function makeActor(player) {
    const group = new THREE.Group();
    const seed = hash(player.id);
    const character = player.character === 'girl' ? 'girl' : 'boy';
    const coatColor = character === 'girl'
      ? (player.isMe ? 0x98634f : 0x684a54)
      : (player.isMe ? 0x9f7442 : PALETTE[seed % PALETTE.length]);
    const coat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.9 });
    const coatLight = new THREE.MeshStandardMaterial({ color: new THREE.Color(coatColor).lerp(new THREE.Color(0xc7b996), 0.27), roughness: 0.86 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.78 });
    const hair = new THREE.MeshStandardMaterial({ color: character === 'girl' ? 0x241a19 : 0x33261e, roughness: 0.95 });
    const face = new THREE.MeshStandardMaterial({ color: 0xb89a78, roughness: 0.93 });
    const body = mesh(new THREE.CylinderGeometry(character === 'girl' ? 0.15 : 0.17, character === 'girl' ? 0.25 : 0.24, 0.65, 9), coat, 0, 0.62, 0);
    const scarf = mesh(new THREE.BoxGeometry(character === 'girl' ? 0.28 : 0.22, 0.075, 0.2), coatLight, 0, 0.84, 0.015);
    const head = mesh(new THREE.SphereGeometry(0.125, 12, 10), face, 0, 1.05, 0.018);
    const hairCap = mesh(new THREE.SphereGeometry(character === 'girl' ? 0.145 : 0.12, 10, 8), hair, 0, character === 'girl' ? 1.07 : 1.115, -0.055);
    hairCap.scale.set(character === 'girl' ? 1.1 : 1, character === 'girl' ? 1.35 : 0.52, 0.8);
    const brim = mesh(new THREE.CylinderGeometry(character === 'girl' ? 0.205 : 0.17, character === 'girl' ? 0.205 : 0.17, 0.045, 12), dark, 0, 1.17, 0);
    const crown = mesh(new THREE.CylinderGeometry(0.105, 0.115, 0.18, 9), dark, 0, 1.27, 0);
    const leftLeg = mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 7), dark, -0.09, 0.19, 0);
    const rightLeg = mesh(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 7), dark, 0.09, 0.19, 0);
    const leftArm = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 7), coat, -0.235, 0.65, 0);
    const rightArm = mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 7), coat, 0.235, 0.65, 0);
    const ringColor = player.isMe ? 0xe7bd75 : 0x9ebac2;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.018, 5, 24), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: player.isMe ? 0.9 : 0.42 }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025;
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.29, 16), new THREE.MeshBasicMaterial({ color: 0x020508, transparent: true, opacity: 0.52, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.006;
    group.add(body, scarf, head, hairCap, brim, crown, leftLeg, rightLeg, leftArm, rightArm, ring, shadow);
    if (character === 'girl') {
      for (const side of [-1, 1]) {
        const lock = mesh(new THREE.CylinderGeometry(0.035, 0.048, 0.3, 7), hair, side * 0.112, 0.91, -0.022);
        lock.rotation.z = side * -0.1;
        group.add(lock);
      }
      const hatBand = mesh(new THREE.TorusGeometry(0.127, 0.018, 5, 16), coatLight, 0, 1.24, 0);
      hatBand.rotation.x = Math.PI / 2;
      group.add(hatBand);
    } else {
      const tie = mesh(new THREE.ConeGeometry(0.035, 0.14, 4), coatLight, 0, 0.74, 0.11);
      group.add(tie);
    }
    group.traverse((part) => { if (part.isMesh) { part.castShadow = true; part.receiveShadow = true; } });
    scene.add(group);
    return { group, leftLeg, rightLeg, leftArm, rightArm, moving: false, target: new THREE.Vector3(), incapacitated: false, eliminated: false, character };
  }

  function setState(view) {
    if (!view?.room || !view.me) return;
    localPlayerId = view.me.id;
    const activeIds = new Set();
    for (const player of view.room.players) {
      activeIds.add(player.id);
      const character = player.character === 'girl' ? 'girl' : 'boy';
      let actor = actors.get(player.id);
      if (actor && actor.character !== character) {
        scene.remove(actor.group); disposeObject(actor.group); actors.delete(player.id); actor = null;
      }
      if (!actor) { actor = makeActor(player); actors.set(player.id, actor); }
      actor.target.copy(toVector(player.x, player.y));
      actor.incapacitated = player.incapacitated;
      actor.eliminated = player.eliminated;
      actor.group.visible = !player.eliminated || view.room.phase === 'results';
      actor.moving = actor.group.position.distanceTo(actor.target) > 0.035;
      actor.group.userData.name = player.name;
      actor.group.userData.connected = player.connected;
      actor.group.userData.isMe = player.id === localPlayerId;
    }
    for (const [id, actor] of actors) {
      if (activeIds.has(id)) continue;
      scene.remove(actor.group); disposeObject(actor.group); actors.delete(id);
    }

    const points = view.room.points || [];
    for (const point of points) {
      let marker = markers.get(point.id);
      if (!marker) { marker = makeClueMarker(); markers.set(point.id, marker); scene.add(marker); }
      marker.position.copy(toVector(point.x, point.y, 0.12));
      const active = pointActive(point, view.room);
      marker.visible = active;
      const jammed = view.room.sabotage?.mission === point.mission && view.room.sabotage.until > Date.now();
      marker.userData.material.color.set(jammed ? 0xed6758 : 0xe7bd75);
      marker.userData.material.emissive.set(jammed ? 0x6d1f21 : 0x644117);
    }
  }

  function animate() {
    const now = performance.now();
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    if (!reducedMotion) rain.update(delta);
    const t = now / 1000;
    for (const marker of markers.values()) if (marker.visible) {
      marker.rotation.y = reducedMotion ? 0 : Math.sin(t * 0.7 + marker.userData.seed) * 0.3;
      marker.position.y = reducedMotion ? 0.12 : 0.12 + Math.sin(t * 2.2 + marker.userData.seed) * 0.04;
    }
    for (const actor of actors.values()) {
      const difference = new THREE.Vector3().subVectors(actor.target, actor.group.position);
      const distance = difference.length();
      actor.moving = distance > 0.045;
      if (reducedMotion) actor.group.position.copy(actor.target);
      else actor.group.position.lerp(actor.target, 1 - Math.exp(-delta * 10));
      if (actor.moving) actor.group.rotation.y = Math.atan2(difference.x, difference.z) + Math.PI;
      const gait = !reducedMotion && actor.moving ? Math.sin(t * 10 + actor.group.position.x) * 0.52 : 0;
      actor.leftLeg.rotation.x = gait; actor.rightLeg.rotation.x = -gait;
      actor.leftArm.rotation.x = -gait * 0.55; actor.rightArm.rotation.x = gait * 0.55;
      actor.group.position.y = actor.incapacitated ? 0 : Math.abs(gait) * 0.025;
    }
    const localActor = actors.get(localPlayerId);
    if (localActor) {
      const focus = localActor.group.position;
      const distance = 4.9;
      const horizontal = Math.cos(pitch) * distance;
      camera.position.set(focus.x + Math.sin(yaw) * horizontal, focus.y + 0.65 + Math.sin(pitch) * distance, focus.z + Math.cos(yaw) * horizontal);
      camera.lookAt(focus.x, focus.y + 0.8, focus.z);
    }
    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(animate);

  return {
    setState,
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    resize,
    inputToWorld(dx, dy) {
      const cos = Math.cos(yaw), sin = Math.sin(yaw);
      return { dx: dx * cos + dy * sin, dy: -dx * sin + dy * cos };
    },
    getYaw() { return yaw; },
    projectGame(x, y, height = 0.2) {
      const point = toVector(x, y, height).project(camera);
      return projectToScreen(point);
    },
    projectPlayer(id) {
      const actor = actors.get(id);
      if (!actor) return null;
      const point = actor.group.position.clone().add(new THREE.Vector3(0, 1.48, 0)).project(camera);
      return projectToScreen(point);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      for (const actor of actors.values()) disposeObject(actor.group);
      for (const marker of markers.values()) disposeObject(marker);
      if (activeScene === scene) activeScene = null;
    },
  };

  function projectToScreen(point) {
    return {
      x: (point.x + 1) * 480,
      y: (1 - point.y) * 320,
      visible: point.z > -1 && point.z < 1 && Math.abs(point.x) < 1.2 && Math.abs(point.y) < 1.2,
    };
  }
}

export function createDetectivePreview(canvas, character) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) {
    console.warn('Character preview could not use WebGL.', error);
    return { setActive() {}, dispose() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor(0x07111d, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x07111d, 0.15);
  const camera = new THREE.PerspectiveCamera(30, 0.75, 0.1, 20);
  camera.position.set(0, 1.23, 4.5);
  camera.lookAt(0, 0.86, 0);
  scene.add(new THREE.HemisphereLight(0xa8c2dd, 0x281d19, 2.1));
  const key = new THREE.DirectionalLight(0xffd39b, 3.1);
  key.position.set(-2, 3.5, 4); scene.add(key);
  const rim = new THREE.PointLight(0xa5bed1, 1.6, 8); rim.position.set(2, 2.3, -1); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(1.3, 32), new THREE.MeshStandardMaterial({ color: 0x19232a, roughness: 0.46, metalness: 0.25 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -0.04; scene.add(floor);
  const coat = character === 'girl' ? 0x805448 : 0x725b3e;
  const figure = createDetectiveFigure(character, coat);
  figure.group.position.y = 0;
  scene.add(figure.group);
  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  }
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  observer?.observe(canvas.parentElement);
  window.addEventListener('resize', resize);
  resize();
  let elapsed = 0;
  let reducedMotion = false;
  const render = (_, delta = 0.016) => {
    if (!reducedMotion) elapsed += Math.min(delta, 0.05);
    figure.group.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 0.34) * 0.16;
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(null);
  return {
    setActive(active) { renderer.setAnimationLoop(active ? render : null); },
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    dispose() {
    renderer.setAnimationLoop(null); renderer.dispose(); observer?.disconnect();
    window.removeEventListener('resize', resize); disposeObject(figure.group); disposeObject(floor);
    },
  };
}

function createDetectiveFigure(character, coatColor) {
  const group = new THREE.Group();
  const coat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.88 });
  const trim = new THREE.MeshStandardMaterial({ color: new THREE.Color(coatColor).lerp(new THREE.Color(0xd5bd8b), 0.32), roughness: 0.8 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.8 });
  const hair = new THREE.MeshStandardMaterial({ color: character === 'girl' ? 0x241a19 : 0x33261e, roughness: 0.95 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xb89a78, roughness: 0.93 });
  const female = character === 'girl';
  const add = (geometry, material, x, y, z, scale) => {
    const part = mesh(geometry, material, x, y, z);
    if (scale) part.scale.set(...scale);
    part.castShadow = false;
    group.add(part);
    return part;
  };
  add(new THREE.CylinderGeometry(female ? 0.15 : 0.17, female ? 0.25 : 0.24, 0.65, 9), coat, 0, 0.62, 0);
  add(new THREE.BoxGeometry(female ? 0.28 : 0.22, 0.075, 0.2), trim, 0, 0.84, 0.015);
  add(new THREE.SphereGeometry(0.125, 12, 10), skin, 0, 1.05, 0.018);
  add(new THREE.SphereGeometry(female ? 0.145 : 0.12, 10, 8), hair, 0, female ? 1.07 : 1.115, -0.055, [female ? 1.1 : 1, female ? 1.35 : 0.52, 0.8]);
  const brim = add(new THREE.CylinderGeometry(female ? 0.205 : 0.17, female ? 0.205 : 0.17, 0.045, 12), dark, 0, 1.17, 0);
  brim.rotation.z = female ? -0.055 : 0;
  add(new THREE.CylinderGeometry(0.105, 0.115, 0.18, 9), dark, 0, 1.27, 0);
  add(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 7), dark, -0.09, 0.19, 0);
  add(new THREE.CylinderGeometry(0.065, 0.075, 0.34, 7), dark, 0.09, 0.19, 0);
  add(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 7), coat, -0.235, 0.65, 0);
  add(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 7), coat, 0.235, 0.65, 0);
  if (female) {
    for (const side of [-1, 1]) {
      const lock = add(new THREE.CylinderGeometry(0.035, 0.048, 0.3, 7), hair, side * 0.112, 0.91, -0.022);
      lock.rotation.z = side * -0.1;
    }
    const band = add(new THREE.TorusGeometry(0.127, 0.018, 5, 16), trim, 0, 1.24, 0);
    band.rotation.x = Math.PI / 2;
  } else {
    add(new THREE.ConeGeometry(0.035, 0.14, 4), trim, 0, 0.74, 0.11);
  }
  group.traverse((part) => { if (part.isMesh) { part.castShadow = true; part.receiveShadow = true; } });
  return { group };
}

function makeCobbleTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 512;
  const context = canvas.getContext('2d');
  context.fillStyle = '#59636a'; context.fillRect(0, 0, 512, 512);
  let seed = 71;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 24; row++) for (let col = 0; col < 18; col++) {
    const x = col * 30 + (row % 2) * 15 + 2;
    const y = row * 21 + 2;
    const shade = 59 + Math.floor(random() * 39);
    context.fillStyle = `rgb(${shade},${shade + 7},${shade + 10})`;
    context.beginPath(); context.roundRect(x, y, 27, 18, 4); context.fill();
    context.strokeStyle = 'rgba(10,16,20,.58)'; context.lineWidth = 1; context.stroke();
    if (random() > 0.74) {
      context.fillStyle = 'rgba(219,170,100,.18)';
      context.fillRect(x + random() * 19, y + random() * 10, 4, 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6);
  return texture;
}

function addRoad(path, width, material) {
  for (let index = 1; index < path.length; index++) {
    const a = toVector(path[index - 1][0], path[index - 1][1], 0.008);
    const b = toVector(path[index][0], path[index][1], 0.008);
    const direction = new THREE.Vector2(b.x - a.x, b.z - a.z).normalize();
    const normal = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(width / 2);
    const vertices = [
      a.x + normal.x, a.y, a.z + normal.y,
      b.x + normal.x, b.y, b.z + normal.y,
      a.x - normal.x, a.y, a.z - normal.y,
      b.x + normal.x, b.y, b.z + normal.y,
      b.x - normal.x, b.y, b.z - normal.y,
      a.x - normal.x, a.y, a.z - normal.y,
    ];
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    const road = new THREE.Mesh(geometry, material);
    road.receiveShadow = true; sceneAdd(road);
  }
}

function addDistrictEdge() {
  const river = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 19), new THREE.MeshStandardMaterial({ color: 0x142432, roughness: 0.2, metalness: 0.42 }));
  river.rotation.x = -Math.PI / 2; river.position.set(12.2, -0.045, 0); sceneAdd(river);
  for (let index = 0; index < 7; index++) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 3.1), new THREE.MeshStandardMaterial({ color: 0x746b5b, metalness: 0.7, roughness: 0.32 }));
    rail.position.set(8.2 + (index % 2) * 0.2, 0.02, -1.7 + Math.floor(index / 2) * 0.48); sceneAdd(rail);
  }
}

function addBuilding(building, index) {
  const center = toVector(building.x + building.w / 2, building.y + building.h / 2);
  const width = building.w / 40, depth = building.h / 40, height = building.height;
  const hue = [0x352b28, 0x3b302a, 0x292e34, 0x40352d, 0x2e3030][index % 5];
  const wall = new THREE.MeshStandardMaterial({ color: hue, roughness: 0.91, metalness: 0.02 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wall);
  house.position.set(center.x, height / 2, center.z); house.castShadow = true; house.receiveShadow = true; sceneAdd(house);

  const roofHeight = Math.max(0.42, height * 0.26);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofHeight, 4), new THREE.MeshStandardMaterial({ color: 0x1e2228, roughness: 0.82 }));
  roof.rotation.y = Math.PI / 4; roof.position.set(center.x, height + roofHeight / 2 - 0.02, center.z); roof.castShadow = true; sceneAdd(roof);

  const glass = new THREE.MeshStandardMaterial({ color: 0x8e6943, emissive: 0xb46c2b, emissiveIntensity: 0.62, roughness: 0.35 });
  const across = Math.max(1, Math.min(4, Math.floor(width / 0.42)));
  const rows = Math.max(1, Math.min(3, Math.floor(height / 0.58)));
  for (let row = 0; row < rows; row++) for (let col = 0; col < across; col++) {
    const wx = center.x - width * 0.34 + (width * 0.68 * col) / Math.max(1, across - 1);
    const wy = 0.45 + row * Math.min(0.5, height / (rows + 1));
    const windowMesh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.19, 0.025), glass);
    windowMesh.position.set(wx, wy, center.z + depth / 2 + 0.014); sceneAdd(windowMesh);
  }
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.45, 0.12), new THREE.MeshStandardMaterial({ color: 0x211c1b, roughness: 1 }));
  chimney.position.set(center.x + width * 0.22, height + roofHeight * 0.7, center.z - depth * 0.16); sceneAdd(chimney);
}

function addLandmarks() {
  const brick = new THREE.MeshStandardMaterial({ color: 0x57342b, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x4b5054, roughness: 0.88 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.8 });
  // Yard gate and clock-lit police facade.
  addArch(182, 126, 1.45, 1.6, stone, roof);
  // Baker Street's narrow townhouse and brass number plate.
  const baker = new THREE.Mesh(new THREE.BoxGeometry(0.86, 1.7, 0.82), brick);
  baker.position.copy(toVector(523, 126, 0.85)); baker.castShadow = true; baker.receiveShadow = true; sceneAdd(baker);
  const bakerRoof = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.52, 4), roof);
  bakerRoof.position.set(baker.position.x, 1.96, baker.position.z); bakerRoof.rotation.y = Math.PI / 4; sceneAdd(bakerRoof);
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.025), new THREE.MeshStandardMaterial({ color: 0xc5a45e, emissive: 0x5c3e14, emissiveIntensity: 0.32, metalness: 0.7 }));
  plaque.position.set(baker.position.x, 0.97, baker.position.z + 0.43); sceneAdd(plaque);
  // Iron-and-glass station canopy beside the rails.
  addStationCanopy(810, 336);
  // Blackthorn's gate remains visible at the final reunion point.
  const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x25292c, metalness: 0.64, roughness: 0.43 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.45, 0.18), stone);
    post.position.copy(toVector(480 + side * 0.72 * 40, 555, 0.72)); post.castShadow = true; sceneAdd(post);
  }
  const gateTop = new THREE.Mesh(new THREE.BoxGeometry(1.68, 0.12, 0.12), gateMaterial);
  gateTop.position.copy(toVector(480, 555, 1.48)); sceneAdd(gateTop);
  for (let index = -3; index <= 3; index++) {
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 5), gateMaterial);
    bar.position.copy(toVector(480 + index * 8, 555, 0.92)); sceneAdd(bar);
  }
}

function addArch(x, y, width, height, wall, roof) {
  const center = toVector(x, y);
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.24, height, 0.34), wall);
    pillar.position.set(center.x + side * width / 2, height / 2, center.z); pillar.castShadow = true; sceneAdd(pillar);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.22, 0.26, 0.38), roof);
  beam.position.set(center.x, height - 0.06, center.z); beam.castShadow = true; sceneAdd(beam);
  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.07, 16), new THREE.MeshStandardMaterial({ color: 0xc59a51, emissive: 0x8a5b1d, emissiveIntensity: 0.8 }));
  clock.rotation.x = Math.PI / 2; clock.position.set(center.x, height - 0.07, center.z + 0.23); sceneAdd(clock);
}

function addStationCanopy(x, y) {
  const center = toVector(x, y);
  const iron = new THREE.MeshStandardMaterial({ color: 0x292e31, metalness: 0.72, roughness: 0.42 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x5b5342, emissive: 0x5f421e, emissiveIntensity: 0.4, transparent: true, opacity: 0.78 });
  const roof = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.08, 1.3), glass);
  roof.position.set(center.x, 2.15, center.z); roof.castShadow = true; sceneAdd(roof);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 2.1, 7), iron);
    post.position.set(center.x + sx * 1.15, 1.05, center.z + sz * 0.56); post.castShadow = true; sceneAdd(post);
  }
}

function addLamp(x, y, index) {
  const location = toVector(x, y);
  const iron = new THREE.MeshStandardMaterial({ color: 0x171c20, metalness: 0.74, roughness: 0.38 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.18, 7), iron);
  post.position.set(location.x, 0.59, location.z); post.castShadow = true; sceneAdd(post);
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), new THREE.MeshStandardMaterial({ color: 0xd7a75f, emissive: 0xffa640, emissiveIntensity: 1.9, roughness: 0.3 }));
  lantern.position.set(location.x, 1.25, location.z); sceneAdd(lantern);
  const light = new THREE.PointLight(0xffb75f, 1.15, 3.7, 2);
  light.position.set(location.x, 1.28, location.z); sceneAdd(light);
  if (index % 3 === 0) {
    const pool = new THREE.Mesh(new THREE.CircleGeometry(0.7, 20), new THREE.MeshBasicMaterial({ color: 0xd89b4a, transparent: true, opacity: 0.09, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2; pool.position.set(location.x, 0.008, location.z); sceneAdd(pool);
  }
}

function makeClueMarker() {
  const group = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({ color: 0xe7bd75, emissive: 0x644117, emissiveIntensity: 1.5, metalness: 0.35, roughness: 0.36 });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), material);
  core.position.y = 0.16; core.castShadow = true; group.add(core);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.018, 5, 24), new THREE.MeshBasicMaterial({ color: 0xf1c984, transparent: true, opacity: 0.76 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.035; group.add(ring);
  group.userData.material = material; group.userData.seed = Math.random() * Math.PI * 2;
  return group;
}

function makeRain() {
  const count = 850;
  const positions = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    positions[index * 3] = Math.random() * 29 - 14.5;
    positions[index * 3 + 1] = Math.random() * 8;
    positions[index * 3 + 2] = Math.random() * 20 - 10;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xb7c4d1, size: 0.025, transparent: true, opacity: 0.47, depthWrite: false, sizeAttenuation: true });
  const points = new THREE.Points(geometry, material);
  return {
    points,
    update(delta) {
      const data = geometry.attributes.position.array;
      for (let index = 0; index < count; index++) {
        data[index * 3 + 1] -= delta * 8.5;
        data[index * 3] += delta * 1.25;
        if (data[index * 3 + 1] < 0) {
          data[index * 3 + 1] = 7 + Math.random() * 2;
          data[index * 3] = Math.random() * 29 - 14.5;
          data[index * 3 + 2] = Math.random() * 20 - 10;
        }
      }
      geometry.attributes.position.needsUpdate = true;
    },
  };
}

function mesh(geometry, material, x, y, z) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true;
  return object;
}

function sceneAdd(object) {
  activeScene?.add(object);
}

function toVector(x, y, height = 0) {
  const point = gameToWorld(x, y, height);
  return new THREE.Vector3(point.x, point.y, point.z);
}

function pointActive(point, room) {
  if (point.mission === 'letter') return !room.missions.letter.done && !room.missions.letter.parts[point.part];
  if (point.mission === 'cipher') return room.missions.letter.done && !room.missions.cipher.done;
  if (point.mission === 'telegraph') return room.missions.cipher.done && !room.missions.telegraph.done && !room.missions.telegraph.parts[point.part];
  return point.mission === 'reunion' && room.phase === 'reunion';
}

function hash(value) {
  let result = 0;
  for (let index = 0; index < value.length; index++) result = (result * 31 + value.charCodeAt(index)) >>> 0;
  return result;
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  });
}
