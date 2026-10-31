import * as THREE from '/vendor/three.module.js';
import { CITY_BUILDINGS, CITY_PATHS, GAS_LAMPS, gameToWorld } from './world-layout.js';
import { playClueProximityShimmer } from './ambient-audio.js';

const PALETTE = [0x5e7779, 0x788276, 0x776d7d, 0x896c58, 0x647184, 0x8a806a, 0x526a65, 0x80676e];
let activeScene = null;
let sharedBrickMaps = null;
let sharedGlowMap = null;
let sharedMistMap = null;
let sharedWoodTexture = null;
let gasLampObjects = [];
let cameraBlockers = [];
let chimneyFlues = [];
let hangingSigns = [];
let mansionInteractions = { books: [] };
let mansionState = {
  gateOpen: false,
  clockHour: 12,
  clockSolved: false,
  selectedBooks: [],
  librarySolved: false,
  secretDoorOpen: false,
  thiefRevealed: false,
};

function makeLampGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const context = canvas.getContext('2d');
  const grad = context.createRadialGradient(64, 64, 1, 64, 64, 62);
  grad.addColorStop(0, 'rgba(255, 240, 180, 1)');
  grad.addColorStop(0.2, 'rgba(248, 192, 108, 0.75)');
  grad.addColorStop(0.5, 'rgba(215, 120, 45, 0.22)');
  grad.addColorStop(0.85, 'rgba(160, 70, 20, 0.05)');
  grad.addColorStop(1, 'rgba(120, 40, 10, 0)');
  context.fillStyle = grad;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getLampGlowMap() {
  if (!sharedGlowMap) sharedGlowMap = makeLampGlowTexture();
  return sharedGlowMap;
}

function makeMistTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(64, 64, 4, 64, 64, 62);
  grad.addColorStop(0, 'rgba(165, 195, 225, 0.24)');
  grad.addColorStop(0.35, 'rgba(135, 170, 200, 0.15)');
  grad.addColorStop(0.7, 'rgba(100, 140, 175, 0.05)');
  grad.addColorStop(1, 'rgba(80, 110, 140, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function getMistMap() {
  if (!sharedMistMap) sharedMistMap = makeMistTexture();
  return sharedMistMap;
}

let sharedUnionJackTexture = null;
let sharedClockTexture = null;

function makeUnionJackTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  
  // Field: Deep Navy Blue
  ctx.fillStyle = '#00247d';
  ctx.fillRect(0, 0, 256, 160);

  // White saltire (St Andrew)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 32;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(256, 160);
  ctx.moveTo(256, 0); ctx.lineTo(0, 160);
  ctx.stroke();

  // Red saltire (St Patrick)
  ctx.strokeStyle = '#cf142b';
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(0, 0); ctx.lineTo(256, 160);
  ctx.moveTo(256, 0); ctx.lineTo(0, 160);
  ctx.stroke();

  // White cross border (St George)
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(106, 0, 44, 160);
  ctx.fillRect(0, 58, 256, 44);

  // Red central cross (St George)
  ctx.fillStyle = '#cf142b';
  ctx.fillRect(116, 0, 24, 160);
  ctx.fillRect(0, 68, 256, 24);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeClockTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = '#f8f4e6';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#2b1d0c';
  ctx.lineWidth = 5;
  ctx.stroke();

  ctx.fillStyle = '#1c150c';
  ctx.font = 'bold 15px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  numerals.forEach((num, i) => {
    const angle = (i * Math.PI / 6) - Math.PI / 2;
    const x = 64 + Math.cos(angle) * 44;
    const y = 64 + Math.sin(angle) * 44;
    ctx.fillText(num, x, y);
  });

  // Hands (set to 9:15)
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(64, 64); ctx.lineTo(64, 32);
  ctx.moveTo(64, 64); ctx.lineTo(92, 64);
  ctx.stroke();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeWoodTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#423326'; ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#32261c';
  for (let i = 0; i < 128; i += 16) {
    ctx.fillRect(0, i, 128, 2);
  }
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(78, 59, 43, 0.35)' : 'rgba(26, 19, 14, 0.35)';
    ctx.fillRect(x, y, Math.random() * 24 + 6, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

  function createNameplateTexture(name, isMe) {
    const canvas = document.createElement('canvas');
    canvas.width = 384;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');

    // Background Victorian card
    ctx.fillStyle = isMe ? 'rgba(14, 22, 32, 0.88)' : 'rgba(8, 12, 18, 0.82)';
    ctx.beginPath();
    ctx.roundRect(10, 12, 364, 72, 36);
    ctx.fill();

    // Antique gold border
    ctx.strokeStyle = isMe ? '#d4af37' : '#8a9ba8';
    ctx.lineWidth = isMe ? 3.5 : 2.0;
    ctx.stroke();

    // Name text
    ctx.font = 'bold 26px "Cinzel", "Georgia", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isMe ? '#f3e5ab' : '#d2dbe2';
    ctx.shadowColor = 'rgba(0,0,0,0.85)';
    ctx.shadowBlur = 6;
    
    const display = isMe ? `${name} (You)` : name;
    ctx.fillText(display, 192, 48);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  export function normalizeCharacterId(character) {
    const c = String(character || 'boy').toLowerCase();
    if (c === 'watson') return 'watson';
    if (c === 'girl' || c === 'detective') return 'girl';
    if (c === 'journalist') return 'journalist';
    if (c === 'officer') return 'officer';
    return 'sherlock'; // 'boy' or 'sherlock'
  }

  function createVictorianDetectiveCharacter(player, coatColorOverride = null) {
    const group = new THREE.Group();
    const charId = normalizeCharacterId(player?.character);
    const charKey = String(player?.character || 'boy').toLowerCase();
    const name = player?.name || (charId === 'girl' ? 'Irene Adler' : (charId === 'watson' ? 'Dr. Watson' : (charId === 'journalist' ? 'Langdale Pike' : (charId === 'officer' ? 'Insp. Lestrade' : 'Sherlock Holmes'))));
    const isMe = Boolean(player?.isMe);
    const isWatson = charId === 'watson';
    const isGirl = charId === 'girl';
    const isJournalist = charId === 'journalist';
    const isOfficer = charId === 'officer';
    const isSherlock = charId === 'sherlock';
    // STRICT THIEF PRIVACY: Appearance is NEVER altered by hidden role before server reveal
    const isRevealedCulprit = player?.revealedRole === 'culprit' || Boolean(player?.captured) || charKey === 'culprit';

    // Character-specific Victorian palette & anatomical proportions
    let coatColor, capeColor, vestColor, cravatColor, hatColor, bootColor, hairColor, skinColor, trouserColor, trimColor;
    let heightScale = 1.0;
    let shoulderWidth = 0.25;
    let torsoWidth = 0.21;

    if (coatColorOverride !== null) {
      coatColor = coatColorOverride;
      capeColor = new THREE.Color(coatColor).multiplyScalar(0.78).getHex();
      vestColor = 0x2e353f;
      cravatColor = 0xd8cbb4;
      hatColor = 0x181e26;
      bootColor = 0x111316;
      trouserColor = 0x1d2228;
      hairColor = 0x1a1512;
      skinColor = 0xd4b89e;
      trimColor = 0xd4af37;
    } else if (isWatson) {
      // Dr. John Watson — warm heathered tweed brown, houndstooth vest, crimson bowtie, black bowler (Image 8)
      coatColor = 0x4e4136;
      capeColor = 0x3c3026;
      vestColor = 0x5a4838;
      cravatColor = 0x992424; // Crimson spotted bowtie
      hatColor = 0x161514;
      bootColor = 0x1c1511;
      trouserColor = 0x44372e;
      hairColor = 0x38281d;
      skinColor = 0xcea98d;
      trimColor = 0xcca462;
      heightScale = 0.98;
      shoulderWidth = 0.27;
      torsoWidth = 0.23;
    } else if (isGirl) {
      // Irene Adler — tailored emerald green velvet coatdress, gold double buttons, cameo (Image 2)
      coatColor = 0x1b432a;
      capeColor = 0x13301e;
      vestColor = 0x224e33;
      cravatColor = 0xf4f7fa; // High white lace collar with cameo
      hatColor = 0x142b1d;
      bootColor = 0x18120e;
      trouserColor = 0x1a3a26;
      hairColor = 0x464a50; // Distinguished ash-grey / charcoal pompadour
      skinColor = 0xe4c7b5;
      trimColor = 0xd4af37;
      heightScale = 0.97;
      shoulderWidth = 0.22;
      torsoWidth = 0.18;
    } else if (isJournalist) {
      // Langdale Pike — deep wine / maroon frock coat, charcoal shawl lapels, tweed vest (Images 1 & 7)
      coatColor = 0x4a1824;
      capeColor = 0x24272c; // Charcoal collar/shawl facing
      vestColor = 0x343135; // Charcoal patterned waistcoat
      cravatColor = 0x501826; // Wine silk cravat
      hatColor = 0x24272c;
      bootColor = 0x191614;
      trouserColor = 0x2c3038; // Tailored grey trousers
      hairColor = 0x221c18; // Dark swept-back hair with sideburns
      skinColor = 0xd0b196;
      trimColor = 0xd4af37;
      heightScale = 1.00;
      shoulderWidth = 0.25;
      torsoWidth = 0.21;
    } else if (isOfficer) {
      // Inspector Lestrade — Scotland Yard navy uniform, custodian helmet, silver badge
      coatColor = 0x152238;
      capeColor = 0x0f1828;
      vestColor = 0x1a2840;
      cravatColor = 0xdbe2ea;
      hatColor = 0x121b2d;
      bootColor = 0x0e1014;
      trouserColor = 0x131d2e;
      hairColor = 0x28221e;
      skinColor = 0xc8a488;
      trimColor = 0xd8dee8;
      heightScale = 0.99;
      shoulderWidth = 0.27;
      torsoWidth = 0.23;
    } else {
      // Sherlock Holmes — tailored charcoal navy, Inverness capelet, deerstalker
      coatColor = isMe ? 0x1c2738 : 0x243042;
      capeColor = isMe ? 0x141d2a : 0x1a2432;
      vestColor = 0x2b3646;
      cravatColor = 0xded4c2;
      hatColor = 0x17202c;
      bootColor = 0x101317;
      trouserColor = 0x1e2530;
      hairColor = 0x1a1512;
      skinColor = 0xd6bda6;
      trimColor = 0xd4af37;
      heightScale = 1.02;
      shoulderWidth = 0.26;
      torsoWidth = 0.21;
    }

    // Material definitions with authentic Victorian textile physics
    const matCoat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: isGirl ? 0.68 : 0.86, metalness: isGirl ? 0.12 : 0.05 });
    const matCape = new THREE.MeshStandardMaterial({ color: capeColor, roughness: isGirl ? 0.65 : 0.85, metalness: isGirl ? 0.14 : 0.04 });
    const matVest = new THREE.MeshStandardMaterial({ color: vestColor, roughness: 0.78, metalness: 0.08 });
    const matShirt = new THREE.MeshStandardMaterial({ color: 0xf0f3f6, roughness: 0.85, metalness: 0.02 });
    const matCravat = new THREE.MeshStandardMaterial({ color: cravatColor, roughness: 0.62, metalness: 0.12 });
    const matTrousers = new THREE.MeshStandardMaterial({ color: trouserColor, roughness: 0.88, metalness: 0.04 });
    const matLeather = new THREE.MeshStandardMaterial({ color: bootColor, roughness: 0.32, metalness: 0.18 });
    const matGold = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.22, metalness: 0.85 });
    const matSilver = new THREE.MeshStandardMaterial({ color: 0xd0d8e2, roughness: 0.20, metalness: 0.88 });
    const matSkin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.78, metalness: 0.0 });
    const matHair = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.92, metalness: 0.02 });
    const matHat = new THREE.MeshStandardMaterial({ color: hatColor, roughness: 0.82, metalness: 0.06 });
    const matGloves = new THREE.MeshStandardMaterial({ color: 0x15181c, roughness: 0.36, metalness: 0.15 });
    const matGlass = new THREE.MeshStandardMaterial({ color: 0xcbe3f5, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.45 });

    // 1. Pelvis Root Node
    const pelvis = new THREE.Group();
    pelvis.position.y = 0.88 * heightScale;
    group.add(pelvis);

    // 2. Torso Node
    const torsoGroup = new THREE.Group();
    pelvis.add(torsoGroup);

    // Layered upper body: Torso, Waistcoat & Tailored Coat
    const torso = mesh(new THREE.CylinderGeometry(torsoWidth * 0.92, torsoWidth * 0.98, 0.52 * heightScale, 12), matCoat, 0, 0.26 * heightScale, 0);
    torsoGroup.add(torso);

    const vest = mesh(new THREE.BoxGeometry(torsoWidth * 0.84, 0.40 * heightScale, 0.07), matVest, 0, 0.22 * heightScale, 0.165);
    torsoGroup.add(vest);

    // Standing wing collar shirt
    const shirtCollar = mesh(new THREE.BoxGeometry(0.12, 0.09 * heightScale, 0.04), matShirt, 0, 0.44 * heightScale, 0.15);
    torsoGroup.add(shirtCollar);

    // Pocket watch chain: arched torus looping from pocket to center button
    const watchChain = mesh(new THREE.TorusGeometry(0.085, 0.007, 4, 18, Math.PI * 0.92), isOfficer ? matSilver : matGold, 0.015, 0.17 * heightScale, 0.202);
    watchChain.rotation.z = Math.PI * 0.06;
    torsoGroup.add(watchChain);

    // Tailored 3D Peaked Lapels with depth
    for (const side of [-1, 1]) {
      const lapel = mesh(new THREE.BoxGeometry(0.068, 0.36 * heightScale, 0.038), matCape, side * (torsoWidth * 0.52), 0.27 * heightScale, 0.185);
      lapel.rotation.z = side * -0.11;
      torsoGroup.add(lapel);
    }

    // Double-breasted button studs
    const btnMat = isOfficer ? matSilver : matGold;
    for (const y of [0.12, 0.21, 0.30]) {
      const btnL = mesh(new THREE.SphereGeometry(0.013, 6, 5), btnMat, -0.035, y * heightScale, 0.202);
      const btnR = mesh(new THREE.SphereGeometry(0.013, 6, 5), btnMat, 0.035, y * heightScale, 0.202);
      torsoGroup.add(btnL, btnR);
    }

    // Cravat / Ascot with Tie Pin or Cameo Brooch
    if (isGirl) {
      // Irene Adler: Cameo brooch at high lace throat (Reference Image 2)
      const cameoBezel = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.01, 12), matGold, 0, 0.44 * heightScale, 0.178);
      cameoBezel.rotation.x = Math.PI / 2;
      const cameoStone = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 12), new THREE.MeshStandardMaterial({ color: 0xc85a18, roughness: 0.35, metalness: 0.1 }), 0, 0.44 * heightScale, 0.181);
      cameoStone.rotation.x = Math.PI / 2;
      torsoGroup.add(cameoBezel, cameoStone);

      // Cross-body leather bandolier strap across chest (Reference Image 2)
      const bandolier = mesh(new THREE.BoxGeometry(0.042, 0.58 * heightScale, 0.015), matLeather, -0.02, 0.28 * heightScale, 0.182);
      bandolier.rotation.z = 0.55;
      const bandolierBuckle = mesh(new THREE.BoxGeometry(0.048, 0.03, 0.018), matGold, -0.02, 0.28 * heightScale, 0.19);
      bandolierBuckle.rotation.z = 0.55;
      torsoGroup.add(bandolier, bandolierBuckle);

      // Antique gold pocket watch / medallion dangling on delicate waist chain (Reference Image 2)
      const waistWatch = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 12), matGold, 0.12, 0.06 * heightScale, 0.18);
      waistWatch.rotation.x = Math.PI / 2;
      torsoGroup.add(waistWatch);
    } else if (isWatson) {
      // Dr. Watson: Crimson red spotted bowtie (Reference Image 8)
      const bowKnot = mesh(new THREE.BoxGeometry(0.032, 0.032, 0.024), new THREE.MeshStandardMaterial({ color: 0x992424, roughness: 0.6 }), 0, 0.43 * heightScale, 0.185);
      const bowL = mesh(new THREE.BoxGeometry(0.052, 0.034, 0.016), new THREE.MeshStandardMaterial({ color: 0x992424, roughness: 0.6 }), -0.040, 0.43 * heightScale, 0.182);
      bowL.rotation.z = 0.22;
      const bowR = mesh(new THREE.BoxGeometry(0.052, 0.034, 0.016), new THREE.MeshStandardMaterial({ color: 0x992424, roughness: 0.6 }), 0.040, 0.43 * heightScale, 0.182);
      bowR.rotation.z = -0.22;
      torsoGroup.add(bowKnot, bowL, bowR);
    } else {
      const cravat = mesh(new THREE.BoxGeometry(0.10, 0.14 * heightScale, 0.04), matCravat, 0, 0.43 * heightScale, 0.165);
      const tiePin = mesh(new THREE.SphereGeometry(0.008, 6, 5), btnMat, 0, 0.40 * heightScale, 0.186);
      torsoGroup.add(cravat, tiePin);
    }

    // Character-Specific Outerwear:
    let capeletGroup = new THREE.Group();
    if (isSherlock) {
      // Signature Inverness double shoulder capelet
      capeletGroup.position.set(0, 0.48 * heightScale, 0);
      const capeMantleUpper = mesh(new THREE.CylinderGeometry(shoulderWidth * 0.95, shoulderWidth * 1.55, 0.26 * heightScale, 16, 1, true), matCape, 0, -0.12 * heightScale, 0);
      const capeMantleLower = mesh(new THREE.CylinderGeometry(shoulderWidth * 1.25, shoulderWidth * 1.72, 0.20 * heightScale, 16, 1, true), matCape, 0, -0.22 * heightScale, 0);
      const collarHigh = mesh(new THREE.CylinderGeometry(0.14, 0.17, 0.10 * heightScale, 12), matCoat, 0, 0.04 * heightScale, 0);
      capeletGroup.add(capeMantleUpper, capeMantleLower, collarHigh);
      torsoGroup.add(capeletGroup);
    } else if (isGirl) {
      // Irene Adler: Puffed leg-of-mutton shoulder caps
      for (const side of [-1, 1]) {
        const shoulderPuff = mesh(new THREE.SphereGeometry(0.082, 12, 10), matCoat, side * (shoulderWidth + 0.015), 0.45 * heightScale, 0.02);
        shoulderPuff.scale.set(0.95, 1.25, 0.88);
        torsoGroup.add(shoulderPuff);
      }
    } else if (isOfficer) {
      // Inspector Lestrade: Scotland Yard shoulder epaulets, duty belt & silver badge
      for (const side of [-1, 1]) {
        const epaulet = mesh(new THREE.BoxGeometry(0.09, 0.02, 0.06), matCape, side * (shoulderWidth - 0.02), 0.50 * heightScale, 0.02);
        const pip = mesh(new THREE.SphereGeometry(0.008, 6, 5), matSilver, side * (shoulderWidth - 0.02), 0.515 * heightScale, 0.02);
        torsoGroup.add(epaulet, pip);
      }
      // Scotland Yard Inspector silver star badge on left chest
      const yardStar = mesh(new THREE.BoxGeometry(0.045, 0.045, 0.012), matSilver, -0.11, 0.36 * heightScale, 0.185);
      yardStar.rotation.z = Math.PI / 4;
      torsoGroup.add(yardStar);
      // Police duty belt & brass buckle
      const policeBelt = mesh(new THREE.CylinderGeometry(torsoWidth * 0.99, torsoWidth * 1.01, 0.065 * heightScale, 14), matLeather, 0, 0.04 * heightScale, 0);
      const policeBuckle = mesh(new THREE.BoxGeometry(0.065, 0.05, 0.015), matGold, 0, 0.04 * heightScale, 0.198);
      torsoGroup.add(policeBelt, policeBuckle);
      // Whistle chain looping to collar
      const whistleChain = mesh(new THREE.TorusGeometry(0.06, 0.005, 4, 14, Math.PI * 0.7), matSilver, -0.06, 0.40 * heightScale, 0.182);
      whistleChain.rotation.x = Math.PI * 0.15;
      torsoGroup.add(whistleChain);
    } else if (isWatson) {
      // Dr. Watson: Cross-body leather medical satchel strap
      const satchelStrap = mesh(new THREE.BoxGeometry(0.045, 0.62 * heightScale, 0.018), matLeather, 0.02, 0.28 * heightScale, 0.18);
      satchelStrap.rotation.z = -0.58;
      torsoGroup.add(satchelStrap);
      // Doctor's leather medicine bag at hip
      const medicalBag = mesh(new THREE.BoxGeometry(0.12, 0.16 * heightScale, 0.20), matLeather, -0.22, 0.06 * heightScale, 0.02);
      const bagBuckle = mesh(new THREE.BoxGeometry(0.025, 0.025, 0.01), matGold, -0.22, 0.06 * heightScale, 0.125);
      torsoGroup.add(medicalBag, bagBuckle);
    } else if (isJournalist) {
      // Langdale Pike: Wide contrast charcoal shawl lapels (Reference Images 1 & 7)
      for (const side of [-1, 1]) {
        const shawlLapel = mesh(new THREE.BoxGeometry(0.065, 0.38 * heightScale, 0.03), new THREE.MeshStandardMaterial({ color: 0x24272c, roughness: 0.85 }), side * 0.10, 0.30 * heightScale, 0.18);
        shawlLapel.rotation.z = side * -0.12;
        torsoGroup.add(shawlLapel);
      }
      // Dispatch courier satchel strap & bag
      const courierStrap = mesh(new THREE.BoxGeometry(0.042, 0.62 * heightScale, 0.018), matLeather, -0.02, 0.28 * heightScale, 0.18);
      courierStrap.rotation.z = 0.58;
      torsoGroup.add(courierStrap);
      const dispatchBag = mesh(new THREE.BoxGeometry(0.13, 0.17 * heightScale, 0.21), matLeather, 0.22, 0.06 * heightScale, 0.02);
      torsoGroup.add(dispatchBag);
      // Rolled London broadsheet newspaper tucked under arm
      const newspaper = mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.28, 8), matShirt, -0.21, 0.26 * heightScale, 0.02);
      newspaper.rotation.x = Math.PI / 2;
      torsoGroup.add(newspaper);
    }

    // 3. Neck & Sculpted Head
    const neck = new THREE.Group();
    neck.position.set(0, 0.52 * heightScale, 0);
    torsoGroup.add(neck);

    const neckCollarMesh = mesh(new THREE.CylinderGeometry(0.075, 0.088, 0.10 * heightScale, 10), matSkin, 0, 0.04 * heightScale, 0);
    neck.add(neckCollarMesh);

    // Anatomical Sculpted Head (Cranium, Jawline, Cheeks)
    const headMesh = mesh(new THREE.SphereGeometry(0.118, 16, 14), matSkin, 0, 0.13 * heightScale, 0.018);
    headMesh.scale.set(0.92, 1.15, 0.98);
    neck.add(headMesh);

    // Chin & Chiseled Jawline
    const jawMesh = mesh(new THREE.BoxGeometry(isWatson || isOfficer ? 0.088 : 0.074, 0.055, 0.065), matSkin, 0, 0.045 * heightScale, 0.06);
    neck.add(jawMesh);

    // Sculpted 3D Nose Bridge & Tip
    const nose = mesh(new THREE.ConeGeometry(0.022, 0.062, 4), matSkin, 0, 0.11 * heightScale, 0.145);
    nose.rotation.x = Math.PI * 0.55;
    neck.add(nose);

    // Eyes: Eye sockets, white sclera, dark irises, and brows
    for (const side of [-1, 1]) {
      const eyeWhite = mesh(new THREE.SphereGeometry(0.016, 8, 6), matShirt, side * 0.046, 0.135 * heightScale, 0.118);
      const eyeIris = mesh(new THREE.SphereGeometry(0.009, 6, 6), new THREE.MeshBasicMaterial({ color: 0x1a2430 }), side * 0.046, 0.135 * heightScale, 0.132);
      const brow = mesh(new THREE.BoxGeometry(0.038, 0.010, 0.016), matHair, side * 0.046, 0.155 * heightScale, 0.128);
      brow.rotation.z = side * -0.08;
      neck.add(eyeWhite, eyeIris, brow);

      // Curved Ear Helices on Left and Right
      const ear = mesh(new THREE.TorusGeometry(0.024, 0.007, 4, 10, Math.PI), matSkin, side * 0.114, 0.12 * heightScale, -0.01);
      ear.rotation.y = side * Math.PI * 0.5;
      ear.rotation.z = -Math.PI * 0.15;
      neck.add(ear);
    }

    // Sculpted Lips
    const lips = mesh(new THREE.BoxGeometry(0.042, 0.012, 0.015), isGirl ? new THREE.MeshStandardMaterial({ color: 0x9e243a, roughness: 0.6 }) : matSkin, 0, 0.065 * heightScale, 0.132);
    neck.add(lips);

    // Distinct Character Hair Sculpt & Facial Features:
    if (isWatson) {
      // Dr. Watson: Parted brown hair + iconic Victorian military walrus moustache
      const hairMesh = mesh(new THREE.SphereGeometry(0.124, 12, 10), matHair, 0, 0.15 * heightScale, -0.038);
      hairMesh.scale.set(1.02, 1.05, 1.08);
      neck.add(hairMesh);
      // Bushy walrus moustache across upper lip
      const moustacheL = mesh(new THREE.TorusGeometry(0.028, 0.010, 5, 10, Math.PI * 0.8), matHair, -0.026, 0.082 * heightScale, 0.144);
      moustacheL.rotation.z = -0.35;
      const moustacheR = mesh(new THREE.TorusGeometry(0.028, 0.010, 5, 10, Math.PI * 0.8), matHair, 0.026, 0.082 * heightScale, 0.144);
      moustacheR.rotation.z = Math.PI + 0.35;
      neck.add(moustacheL, moustacheR);
    } else if (isGirl) {
      // Irene Adler: Elegant Gibson Girl swept-up pompadour chignon updo
      const pompadourRoll = mesh(new THREE.SphereGeometry(0.126, 14, 12), matHair, 0, 0.17 * heightScale, -0.02);
      pompadourRoll.scale.set(1.08, 1.25, 1.15);
      const chignonBun = mesh(new THREE.SphereGeometry(0.075, 12, 10), matHair, 0, 0.18 * heightScale, -0.12);
      neck.add(pompadourRoll, chignonBun);
      for (const side of [-1, 1]) {
        const sideCurl = mesh(new THREE.CylinderGeometry(0.018, 0.025, 0.18 * heightScale, 8), matHair, side * 0.108, 0.07 * heightScale, 0.01);
        sideCurl.rotation.z = side * -0.12;
        neck.add(sideCurl);
      }
    } else if (isJournalist) {
      // Langdale Pike: Tousled hair + wireframe reading spectacles on nose
      const hairMesh = mesh(new THREE.SphereGeometry(0.125, 12, 10), matHair, 0, 0.15 * heightScale, -0.035);
      hairMesh.scale.set(1.03, 1.05, 1.1);
      neck.add(hairMesh);
      // Wireframe spectacles resting on nose bridge
      for (const side of [-1, 1]) {
        const specRim = mesh(new THREE.TorusGeometry(0.021, 0.0035, 4, 16), matGold, side * 0.046, 0.135 * heightScale, 0.148);
        neck.add(specRim);
      }
      const specBridge = mesh(new THREE.BoxGeometry(0.035, 0.005, 0.005), matGold, 0, 0.138 * heightScale, 0.152);
      neck.add(specBridge);
    } else if (isOfficer) {
      // Inspector Lestrade: Peppered hair + Victorian police muttonchops
      const hairMesh = mesh(new THREE.SphereGeometry(0.122, 12, 10), matHair, 0, 0.15 * heightScale, -0.038);
      hairMesh.scale.set(1.02, 1.04, 1.08);
      neck.add(hairMesh);
      for (const side of [-1, 1]) {
        const chops = mesh(new THREE.BoxGeometry(0.028, 0.11 * heightScale, 0.05), matHair, side * 0.105, 0.09 * heightScale, 0.04);
        neck.add(chops);
      }
    } else {
      // Sherlock Holmes: Slicked-back side-parted Victorian hair
      const hairMesh = mesh(new THREE.SphereGeometry(0.122, 14, 12), matHair, 0, 0.15 * heightScale, -0.042);
      hairMesh.scale.set(1.01, 1.06, 1.12);
      neck.add(hairMesh);
      for (const side of [-1, 1]) {
        const sideburn = mesh(new THREE.BoxGeometry(0.022, 0.07 * heightScale, 0.035), matHair, side * 0.105, 0.10 * heightScale, 0.03);
        neck.add(sideburn);
      }
    }

    // 4. Character-Specific Victorian Headwear
    const hatGroup = new THREE.Group();
    hatGroup.position.set(0, 0.20 * heightScale, 0);
    neck.add(hatGroup);

    if (isWatson) {
      // Hard-felt Victorian Bowler Hat (Derby)
      const domeCrown = mesh(new THREE.SphereGeometry(0.142, 14, 12), matHat, 0, 0.07 * heightScale, 0.005);
      domeCrown.scale.set(1.0, 0.88, 1.15);
      const brim = mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.022, 20), matHat, 0, 0.02 * heightScale, 0.005);
      const grosgrainBand = mesh(new THREE.CylinderGeometry(0.146, 0.146, 0.030, 20), matCoat, 0, 0.045 * heightScale, 0.005);
      hatGroup.add(domeCrown, brim, grosgrainBand);
    } else if (isGirl) {
      // Irene Adler: Velvet Picture Bonnet with Ostrich Feather Plume
      const bonnetCrown = mesh(new THREE.CylinderGeometry(0.125, 0.138, 0.10 * heightScale, 16), matHat, 0, 0.06 * heightScale, 0);
      const bonnetBrim = mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.020, 20), matHat, 0, 0.015 * heightScale, 0);
      bonnetBrim.rotation.z = -0.06;
      const velvetRibbon = mesh(new THREE.TorusGeometry(0.134, 0.015, 6, 20), matCape, 0, 0.035 * heightScale, 0);
      velvetRibbon.rotation.x = Math.PI / 2;
      // Elegant trailing ostrich feather plume
      const featherPlume = mesh(new THREE.CylinderGeometry(0.015, 0.045, 0.26 * heightScale, 8), new THREE.MeshStandardMaterial({ color: 0x8c2842, roughness: 0.8 }), 0.12, 0.14 * heightScale, -0.06);
      featherPlume.rotation.z = 0.52;
      featherPlume.rotation.x = -0.35;
      hatGroup.add(bonnetCrown, bonnetBrim, velvetRibbon, featherPlume);
    } else if (isJournalist) {
      // Langdale Pike: Victorian 8-Panel Tweed Newsboy Cap (Baker Boy)
      const newsboyCrown = mesh(new THREE.CylinderGeometry(0.19, 0.14, 0.065 * heightScale, 14), matHat, 0, 0.045 * heightScale, 0.025);
      newsboyCrown.rotation.x = 0.14;
      const capButton = mesh(new THREE.SphereGeometry(0.015, 6, 6), matCoat, 0, 0.082 * heightScale, 0.035);
      const leatherPeak = mesh(new THREE.CylinderGeometry(0.185, 0.185, 0.018, 14, 1, false, Math.PI * 0.75, Math.PI * 1.5), matLeather, 0, 0.018 * heightScale, -0.055);
      leatherPeak.rotation.x = 0.24;
      hatGroup.add(newsboyCrown, capButton, leatherPeak);
    } else if (isOfficer) {
      // Inspector Lestrade: Scotland Yard Custodian Helmet (London Bobby Helmet)
      const helmetDome = mesh(new THREE.CylinderGeometry(0.155, 0.138, 0.18 * heightScale, 16), matHat, 0, 0.10 * heightScale, -0.01);
      helmetDome.rotation.x = -0.05;
      const helmetCrestRose = mesh(new THREE.SphereGeometry(0.024, 8, 8), matSilver, 0, 0.20 * heightScale, -0.015);
      const helmetVisor = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.024, 16, 1, false, Math.PI * 0.75, Math.PI * 1.5), matLeather, 0, 0.02 * heightScale, -0.065);
      helmetVisor.rotation.x = 0.28;
      // Silver 8-pointed Scotland Yard Brunswick Star badge on front
      const starBadge = mesh(new THREE.BoxGeometry(0.05, 0.055, 0.015), matSilver, 0, 0.11 * heightScale, -0.155);
      hatGroup.add(helmetDome, helmetCrestRose, helmetVisor, starBadge);
    } else {
      // Sherlock Holmes: Authentic Deerstalker with Dual Visors & Tied Earflaps
      const capCrown = mesh(new THREE.SphereGeometry(0.148, 14, 12), matHat, 0, 0.065 * heightScale, 0.005);
      capCrown.scale.set(0.96, 0.85, 1.18);
      const frontVisor = mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.022, 14, 1, false, Math.PI * 0.78, Math.PI * 1.44), matHat, 0, 0.02 * heightScale, -0.065);
      frontVisor.rotation.x = 0.24;
      const rearVisor = mesh(new THREE.CylinderGeometry(0.195, 0.195, 0.022, 14, 1, false, -Math.PI * 0.22, Math.PI * 1.44), matHat, 0, 0.02 * heightScale, 0.065);
      rearVisor.rotation.x = -0.24;
      const flapL = mesh(new THREE.BoxGeometry(0.032, 0.12 * heightScale, 0.14), matHat, -0.135, 0.08 * heightScale, 0); flapL.rotation.z = -0.16;
      const flapR = mesh(new THREE.BoxGeometry(0.032, 0.12 * heightScale, 0.14), matHat, 0.135, 0.08 * heightScale, 0); flapR.rotation.z = 0.16;
      const ribbonBow = mesh(new THREE.BoxGeometry(0.09, 0.024, 0.048), matCape, 0, 0.155 * heightScale, 0);
      hatGroup.add(capCrown, frontVisor, rearVisor, flapL, flapR, ribbonBow);
    }

    // 5. Articulated Arms, Hands & Distinct Props
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-shoulderWidth, 0.44 * heightScale, 0.02);
    torsoGroup.add(leftShoulder);
    const leftUpperArm = mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.32 * heightScale, 8), matCoat, 0, -0.15 * heightScale, 0);
    leftShoulder.add(leftUpperArm);
    const leftElbow = new THREE.Group();
    leftElbow.position.set(0, -0.30 * heightScale, 0);
    leftShoulder.add(leftElbow);
    const leftForearm = mesh(new THREE.CylinderGeometry(0.054, 0.066, 0.28 * heightScale, 8), matCoat, 0, -0.12 * heightScale, 0);
    const leftCuff = mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.05, 8), matCape, 0, -0.22 * heightScale, 0);
    leftElbow.add(leftForearm, leftCuff);
    // Left Hand: Palm with articulated thumb and fingers
    const leftHand = mesh(new THREE.BoxGeometry(0.065, 0.08, 0.045), matGloves, 0, -0.27 * heightScale, 0);
    const leftThumb = mesh(new THREE.BoxGeometry(0.022, 0.045, 0.025), matGloves, 0.032, -0.25 * heightScale, 0.015);
    leftElbow.add(leftHand, leftThumb);

    // Right Arm:
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(shoulderWidth, 0.44 * heightScale, 0.02);
    torsoGroup.add(rightShoulder);
    const rightUpperArm = mesh(new THREE.CylinderGeometry(0.062, 0.072, 0.32 * heightScale, 8), matCoat, 0, -0.15 * heightScale, 0);
    rightShoulder.add(rightUpperArm);
    const rightElbow = new THREE.Group();
    rightElbow.position.set(0, -0.30 * heightScale, 0);
    rightShoulder.add(rightElbow);
    const rightForearm = mesh(new THREE.CylinderGeometry(0.054, 0.066, 0.28 * heightScale, 8), matCoat, 0, -0.12 * heightScale, 0);
    const rightCuff = mesh(new THREE.CylinderGeometry(0.062, 0.068, 0.05, 8), matCape, 0, -0.22 * heightScale, 0);
    rightElbow.add(rightForearm, rightCuff);
    // Right Hand:
    const rightHand = mesh(new THREE.BoxGeometry(0.065, 0.08, 0.045), matGloves, 0, -0.27 * heightScale, 0);
    const rightThumb = mesh(new THREE.BoxGeometry(0.022, 0.045, 0.025), matGloves, -0.032, -0.25 * heightScale, 0.015);
    rightElbow.add(rightHand, rightThumb);

    // Props:
    // Left Hand Vintage Detective Lantern
    const lanternBrass = mesh(new THREE.CylinderGeometry(0.038, 0.046, 0.12, 8), matGold, 0, -0.38 * heightScale, 0.04);
    const lanternGlass = mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.07, 8), new THREE.MeshBasicMaterial({ color: 0xffd988 }), 0, -0.38 * heightScale, 0.04);
    leftElbow.add(lanternBrass, lanternGlass);

    let detectiveLight = null;
    if (isMe) {
      detectiveLight = new THREE.PointLight(0xffbe6b, 1.4, 4.8, 2);
      detectiveLight.position.set(0, -0.38 * heightScale, 0.06);
      leftElbow.add(detectiveLight);
    }

    // Right Hand Signature Props:
    if (isSherlock) {
      // Sherlock's Brass Magnifying Glass with transparent refractive lens!
      const magnifyingHandle = mesh(new THREE.CylinderGeometry(0.010, 0.013, 0.13, 8), matGold, 0, -0.35 * heightScale, 0.05);
      magnifyingHandle.rotation.x = Math.PI / 4;
      const magnifyingRim = mesh(new THREE.TorusGeometry(0.052, 0.007, 6, 20), matGold, 0, -0.42 * heightScale, 0.10);
      magnifyingRim.rotation.x = Math.PI / 4;
      const magnifyingLens = mesh(new THREE.CylinderGeometry(0.048, 0.048, 0.005, 20), matGlass, 0, -0.42 * heightScale, 0.10);
      magnifyingLens.rotation.x = Math.PI / 4;
      rightElbow.add(magnifyingHandle, magnifyingRim, magnifyingLens);

      // Sherlock's Briar Pipe in left hand
      const pipeStem = mesh(new THREE.CylinderGeometry(0.006, 0.008, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x3d2516, roughness: 0.6 }), 0.02, -0.30 * heightScale, 0.05);
      pipeStem.rotation.x = Math.PI / 3;
      const pipeBowl = mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.035, 8), new THREE.MeshStandardMaterial({ color: 0x4a2a18, roughness: 0.5, metalness: 0.1 }), 0.02, -0.27 * heightScale, 0.08);
      leftElbow.add(pipeStem, pipeBowl);
    } else if (isWatson) {
      // Dr. Watson's Service Webley Revolver
      const webleyFrame = mesh(new THREE.BoxGeometry(0.022, 0.045, 0.075), matLeather, 0, -0.32 * heightScale, 0.05);
      const webleyCylinder = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.032, 8), new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.85, roughness: 0.3 }), 0, -0.32 * heightScale, 0.05);
      webleyCylinder.rotation.x = Math.PI / 2;
      const webleyBarrel = mesh(new THREE.CylinderGeometry(0.008, 0.009, 0.085, 6), new THREE.MeshStandardMaterial({ color: 0x22262a, metalness: 0.85, roughness: 0.3 }), 0, -0.31 * heightScale, 0.10);
      webleyBarrel.rotation.x = Math.PI / 2;
      rightElbow.add(webleyFrame, webleyCylinder, webleyBarrel);
    } else if (isGirl) {
      // Irene Adler: Sleek brass magnifying glass / loupe
      const magnifyingHandle = mesh(new THREE.CylinderGeometry(0.009, 0.011, 0.11, 8), matGold, 0, -0.33 * heightScale, 0.05);
      magnifyingHandle.rotation.x = Math.PI / 4;
      const magnifyingRim = mesh(new THREE.TorusGeometry(0.046, 0.006, 6, 20), matGold, 0, -0.39 * heightScale, 0.09);
      magnifyingRim.rotation.x = Math.PI / 4;
      const magnifyingLens = mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.005, 20), matGlass, 0, -0.39 * heightScale, 0.09);
      magnifyingLens.rotation.x = Math.PI / 4;
      rightElbow.add(magnifyingHandle, magnifyingRim, magnifyingLens);

      // Elegant velvet reticule purse with gold chain
      const reticulePouch = mesh(new THREE.SphereGeometry(0.055, 10, 8), matCape, 0, -0.36 * heightScale, 0.02);
      const reticuleClasp = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.02), matGold, 0, -0.30 * heightScale, 0.02);
      rightElbow.add(reticulePouch, reticuleClasp);
    }

    // 6. Lower Garments: Dynamic Coat Skirt / Victorian Bustle Skirt
    const coatSkirtLeft = new THREE.Group();
    coatSkirtLeft.position.set(-0.10, 0, 0);
    pelvis.add(coatSkirtLeft);
    const skirtLeftMesh = mesh(
      new THREE.CylinderGeometry(torsoWidth * 0.90, torsoWidth * 1.25, 0.54 * heightScale, 10, 1, true, -Math.PI * 0.5, Math.PI),
      matCoat,
      0,
      -0.26 * heightScale,
      0
    );
    coatSkirtLeft.add(skirtLeftMesh);

    const coatSkirtRight = new THREE.Group();
    coatSkirtRight.position.set(0.10, 0, 0);
    pelvis.add(coatSkirtRight);
    const skirtRightMesh = mesh(
      new THREE.CylinderGeometry(torsoWidth * 0.90, torsoWidth * 1.25, 0.54 * heightScale, 10, 1, true, Math.PI * 0.5, Math.PI),
      matCoat,
      0,
      -0.26 * heightScale,
      0
    );
    coatSkirtRight.add(skirtRightMesh);

    if (isGirl) {
      // Irene Adler: Flared slit coatdress skirt with horizontal buckled straps (Reference Image 2)
      for (let s = 0; s < 4; s++) {
        const strapY = -0.08 * heightScale - s * (0.09 * heightScale);
        const slitStrap = mesh(new THREE.BoxGeometry(0.09, 0.018, 0.012), matLeather, 0.12, strapY, 0.155);
        const slitBuckle = mesh(new THREE.BoxGeometry(0.024, 0.022, 0.016), matGold, 0.14, strapY, 0.16);
        pelvis.add(slitStrap, slitBuckle);
      }
    }

    // 7. Articulated Legs & Victorian Leather Boots
    const leftHip = new THREE.Group();
    leftHip.position.set(-0.11, 0, 0);
    pelvis.add(leftHip);
    const leftThigh = mesh(new THREE.CylinderGeometry(0.075, 0.082, 0.42 * heightScale, 8), matTrousers, 0, -0.21 * heightScale, 0);
    leftHip.add(leftThigh);
    const leftKnee = new THREE.Group();
    leftKnee.position.set(0, -0.42 * heightScale, 0);
    leftHip.add(leftKnee);
    const leftCalf = mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.38 * heightScale, 8), matLeather, 0, -0.19 * heightScale, 0);
    leftKnee.add(leftCalf);
    // Boot: Vamp, sole, chiseled toe & raised heel block
    const leftBoot = mesh(new THREE.BoxGeometry(0.10, 0.09, 0.21), matLeather, 0, -0.40 * heightScale, 0.04);
    const leftHeel = mesh(new THREE.BoxGeometry(0.095, 0.03, 0.06), matLeather, 0, -0.44 * heightScale, -0.04);
    leftKnee.add(leftBoot, leftHeel);

    const rightHip = new THREE.Group();
    rightHip.position.set(0.11, 0, 0);
    pelvis.add(rightHip);
    const rightThigh = mesh(new THREE.CylinderGeometry(0.075, 0.082, 0.42 * heightScale, 8), matTrousers, 0, -0.21 * heightScale, 0);
    rightHip.add(rightThigh);
    const rightKnee = new THREE.Group();
    rightKnee.position.set(0, -0.42 * heightScale, 0);
    rightHip.add(rightKnee);
    const rightCalf = mesh(new THREE.CylinderGeometry(0.068, 0.075, 0.38 * heightScale, 8), matLeather, 0, -0.19 * heightScale, 0);
    rightKnee.add(rightCalf);
    const rightBoot = mesh(new THREE.BoxGeometry(0.10, 0.09, 0.21), matLeather, 0, -0.40 * heightScale, 0.04);
    const rightHeel = mesh(new THREE.BoxGeometry(0.095, 0.03, 0.06), matLeather, 0, -0.44 * heightScale, -0.04);
    rightKnee.add(rightBoot, rightHeel);

    // 8. Ground Selection Halo & Ambient Shadow
    const ringColor = isMe ? 0xe7bd75 : (isWatson ? 0xa8c0d8 : 0xbf9b75);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.36, 0.016, 5, 24),
      new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: isMe ? 0.9 : 0.45 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.02;
    group.add(ring);

    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.42, 18),
      new THREE.MeshBasicMaterial({ color: 0x020508, transparent: true, opacity: 0.65, depthWrite: false })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.006;
    group.add(shadow);

    // 9. Overhead Nameplate
    const nameplateTexture = createNameplateTexture(name, isMe);
    const nameplateMat = new THREE.SpriteMaterial({ map: nameplateTexture, transparent: true, depthWrite: false });
    const nameplate = new THREE.Sprite(nameplateMat);
    nameplate.position.set(0, 2.22 * heightScale, 0);
    nameplate.scale.set(1.4, 0.35, 1.0);
    group.add(nameplate);

    // 10. Upgraded AAA Animation System
    let gaitPhase = 0;
    let currentSpeed = 0;

    function updateAnimation(delta, speed, isSprinting, isInvestigating, time, turnRate = 0, isInteracting = false, isCaptured = false) {
      currentSpeed = THREE.MathUtils.lerp(currentSpeed, speed, 1 - Math.exp(-delta * 12));
      const isMoving = currentSpeed > 0.035;

      if (isCaptured) {
        // CAPTURE / RESTRAINT STATE: Head bowed down, arms pinned behind back
        pelvis.position.y = THREE.MathUtils.lerp(pelvis.position.y, (0.86 * heightScale), delta * 8);
        torsoGroup.rotation.x = THREE.MathUtils.lerp(torsoGroup.rotation.x, 0.18, delta * 8);
        torsoGroup.rotation.y = THREE.MathUtils.lerp(torsoGroup.rotation.y, 0, delta * 8);
        torsoGroup.rotation.z = THREE.MathUtils.lerp(torsoGroup.rotation.z, 0, delta * 8);
        neck.rotation.x = THREE.MathUtils.lerp(neck.rotation.x, 0.35, delta * 8);
        neck.rotation.y = THREE.MathUtils.lerp(neck.rotation.y, 0, delta * 8);

        // Arms bound behind back
        leftShoulder.rotation.x = THREE.MathUtils.lerp(leftShoulder.rotation.x, 0.42, delta * 8);
        leftShoulder.rotation.z = THREE.MathUtils.lerp(leftShoulder.rotation.z, -0.15, delta * 8);
        leftElbow.rotation.x = THREE.MathUtils.lerp(leftElbow.rotation.x, 0.65, delta * 8);

        rightShoulder.rotation.x = THREE.MathUtils.lerp(rightShoulder.rotation.x, 0.42, delta * 8);
        rightShoulder.rotation.z = THREE.MathUtils.lerp(rightShoulder.rotation.z, 0.15, delta * 8);
        rightElbow.rotation.x = THREE.MathUtils.lerp(rightElbow.rotation.x, 0.65, delta * 8);

        leftHip.rotation.x = THREE.MathUtils.lerp(leftHip.rotation.x, 0, delta * 8);
        rightHip.rotation.x = THREE.MathUtils.lerp(rightHip.rotation.x, 0, delta * 8);
        leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, 0, delta * 8);
        rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, 0, delta * 8);
        coatSkirtLeft.rotation.x = THREE.MathUtils.lerp(coatSkirtLeft.rotation.x, 0, delta * 8);
        coatSkirtRight.rotation.x = THREE.MathUtils.lerp(coatSkirtRight.rotation.x, 0, delta * 8);
      } else if (isMoving) {
        // WALK / SPRINT MOVEMENT STATE:
        const freq = isSprinting ? 15.2 : 9.2;
        gaitPhase += delta * freq;
        const stride = isSprinting ? 0.94 : 0.55;
        const legSwing = Math.sin(gaitPhase) * stride;

        // Contrapposto: Hips & pelvis twist counter to shoulders
        pelvis.rotation.y = -legSwing * 0.12;
        torsoGroup.rotation.y = legSwing * 0.14;

        // Legs: Hip swing, knee flexion & foot contact
        leftHip.rotation.x = legSwing;
        rightHip.rotation.x = -legSwing;

        leftKnee.rotation.x = Math.max(0, -legSwing) * (isSprinting ? 1.12 : 0.65);
        rightKnee.rotation.x = Math.max(0, legSwing) * (isSprinting ? 1.12 : 0.65);

        // Arms: Pendulum swing counter to legs with articulated elbows
        leftShoulder.rotation.x = -legSwing * (isSprinting ? 0.95 : 0.72);
        leftShoulder.rotation.z = 0.12;
        leftElbow.rotation.x = isSprinting ? -0.44 : -0.16;

        if (isInvestigating) {
          // Raising magnifying glass / inspection tool
          rightShoulder.rotation.x = -1.24;
          rightShoulder.rotation.z = -0.16;
          rightElbow.rotation.x = -0.68;
        } else if (isInteracting) {
          // Reaching hand out to inspect/interact
          rightShoulder.rotation.x = -1.05;
          rightShoulder.rotation.z = 0.05;
          rightElbow.rotation.x = -0.35;
        } else {
          rightShoulder.rotation.x = legSwing * (isSprinting ? 0.95 : 0.72);
          rightShoulder.rotation.z = -0.12;
          rightElbow.rotation.x = isSprinting ? -0.44 : -0.16;
        }

        // Dynamic Coat Skirt Physics: Flares back with speed and drag
        const baseFlare = isSprinting ? 0.48 : 0.22;
        coatSkirtLeft.rotation.x = baseFlare + Math.abs(legSwing) * 0.18 + currentSpeed * 0.15;
        coatSkirtRight.rotation.x = baseFlare + Math.abs(legSwing) * 0.18 + currentSpeed * 0.15;
        coatSkirtLeft.rotation.z = isSprinting ? -0.12 : -0.05;
        coatSkirtRight.rotation.z = isSprinting ? 0.12 : 0.05;

        // Capelet inertia
        if (capeletGroup) {
          capeletGroup.rotation.x = (isSprinting ? 0.34 : 0.15) + Math.sin(gaitPhase * 2) * 0.05;
        }

        // Pelvis vertical oscillation (bobbing)
        pelvis.position.y = (0.88 * heightScale) + Math.abs(Math.sin(gaitPhase)) * (isSprinting ? 0.048 : 0.026);

        // Torso forward lean and bank during turns
        torsoGroup.rotation.x = isSprinting ? 0.26 : 0.08;
        torsoGroup.rotation.z = -turnRate * 0.20;
        neck.rotation.x = isInvestigating ? 0.20 : -torsoGroup.rotation.x * 0.55;
        neck.rotation.y = turnRate * 0.18;
      } else {
        // IDLE STATE: Natural breathing, gentle weight shifting, and observant head scanning
        const breath = Math.sin(time * 2.2);
        const weightShift = Math.sin(time * 0.85);

        pelvis.position.y = (0.88 * heightScale) + breath * 0.010;
        pelvis.position.x = weightShift * 0.012;
        pelvis.rotation.z = weightShift * 0.014;
        pelvis.rotation.y = 0;

        torsoGroup.rotation.x = isInvestigating ? 0.20 : (isInteracting ? 0.10 : breath * 0.016);
        torsoGroup.rotation.y = 0;
        torsoGroup.rotation.z = -weightShift * 0.012;

        if (capeletGroup) capeletGroup.rotation.x = breath * 0.02;

        // Inquisitive head scanning
        neck.rotation.y = Math.sin(time * 0.7) * 0.09;
        neck.rotation.x = isInvestigating ? 0.24 : 0;

        // Return limbs smoothly to rest
        leftHip.rotation.x = THREE.MathUtils.lerp(leftHip.rotation.x, 0, delta * 8);
        rightHip.rotation.x = THREE.MathUtils.lerp(rightHip.rotation.x, 0, delta * 8);
        leftKnee.rotation.x = THREE.MathUtils.lerp(leftKnee.rotation.x, 0, delta * 8);
        rightKnee.rotation.x = THREE.MathUtils.lerp(rightKnee.rotation.x, 0, delta * 8);
        coatSkirtLeft.rotation.x = THREE.MathUtils.lerp(coatSkirtLeft.rotation.x, 0, delta * 8);
        coatSkirtRight.rotation.x = THREE.MathUtils.lerp(coatSkirtRight.rotation.x, 0, delta * 8);
        coatSkirtLeft.rotation.z = THREE.MathUtils.lerp(coatSkirtLeft.rotation.z, 0, delta * 8);
        coatSkirtRight.rotation.z = THREE.MathUtils.lerp(coatSkirtRight.rotation.z, 0, delta * 8);

        leftShoulder.rotation.x = THREE.MathUtils.lerp(leftShoulder.rotation.x, 0, delta * 8);
        leftShoulder.rotation.z = 0.08;
        leftElbow.rotation.x = THREE.MathUtils.lerp(leftElbow.rotation.x, -0.08, delta * 8);

        if (isInvestigating) {
          rightShoulder.rotation.x = THREE.MathUtils.lerp(rightShoulder.rotation.x, -1.28, delta * 8);
          rightShoulder.rotation.z = -0.16;
          rightElbow.rotation.x = THREE.MathUtils.lerp(rightElbow.rotation.x, -0.68, delta * 8);
        } else if (isInteracting) {
          rightShoulder.rotation.x = THREE.MathUtils.lerp(rightShoulder.rotation.x, -1.05, delta * 8);
          rightShoulder.rotation.z = 0.05;
          rightElbow.rotation.x = THREE.MathUtils.lerp(rightElbow.rotation.x, -0.35, delta * 8);
        } else {
          rightShoulder.rotation.x = THREE.MathUtils.lerp(rightShoulder.rotation.x, 0, delta * 8);
          rightShoulder.rotation.z = -0.08;
          rightElbow.rotation.x = THREE.MathUtils.lerp(rightElbow.rotation.x, -0.08, delta * 8);
        }
      }
    }

    return {
      group,
      updateAnimation,
      detectiveLight,
      nameplate,
      fadeGroup: (opacity) => {
        group.traverse((child) => {
          if (child.isMesh && child.material) {
            if (opacity < 0.98) {
              child.material.transparent = true;
              child.material.opacity = opacity;
            } else {
              child.material.transparent = false;
              child.material.opacity = 1.0;
            }
          }
        });
      },
    };
  }


export function createLondonWorld(canvas, options = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    console.warn('The 3D London scene could not start; the illustrated map fallback will be used.', error);
    return null;
  }

  const reducedDeviceQuality = Boolean(window.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedDeviceQuality ? 1.1 : 1.5));
  renderer.shadowMap.enabled = !reducedDeviceQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  activeScene = scene;
  const night = new THREE.Color(0x0c1520);
  scene.background = night;
  scene.fog = new THREE.FogExp2(new THREE.Color(0x0e1824), 0.024);

  const isMobileDevice = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  const cameraFov = isMobileDevice ? 58 : 54;
  const camera = new THREE.PerspectiveCamera(cameraFov, 1.5, 0.1, 90);
  camera.position.set(0, 12, 15);
  camera.lookAt(0, 0, 0);
  const hemisphere = new THREE.HemisphereLight(0x8faec7, 0x1c1714, 1.85);
  scene.add(hemisphere);
  const moon = new THREE.DirectionalLight(0xa5c4e8, 2.2);
  moon.position.set(-8, 14, 6);
  moon.castShadow = !reducedDeviceQuality;
  moon.shadow.mapSize.set(1024, 1024);
  moon.shadow.camera.left = -15; moon.shadow.camera.right = 15;
  moon.shadow.camera.top = 13; moon.shadow.camera.bottom = -13;
  moon.shadow.bias = -0.0005;
  scene.add(moon);
  cameraBlockers = [];
  const cameraRay = new THREE.Raycaster();

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(54, 40),
    new THREE.MeshStandardMaterial({ color: 0x202830, roughness: 0.65, metalness: 0.12, map: makeCobbleTexture() }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.055;
  ground.receiveShadow = true;
  scene.add(ground);

  const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x58646c, roughness: 0.35, metalness: 0.28, map: makeCobbleTexture() });
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x6e685c, roughness: 0.88, metalness: 0.02 });
  const pavementMaterial = new THREE.MeshStandardMaterial({ color: 0x363d42, roughness: 0.9, metalness: 0.02 });
  const puddleMaterial = new THREE.MeshStandardMaterial({ color: 0x22323e, roughness: 0.08, metalness: 0.88, transparent: true, opacity: 0.42, depthWrite: false });
  const puddleGlintMaterial = new THREE.MeshBasicMaterial({ color: 0xe0b270, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide });
  for (const path of CITY_PATHS) addRoad(path, 2.45, streetMaterial, curbMaterial, pavementMaterial);
  addStreetPuddles(CITY_PATHS, puddleMaterial, puddleGlintMaterial);
  addDistrictEdge();
  chimneyFlues = [];
  hangingSigns = [];
  CITY_BUILDINGS.forEach((building, index) => addBuilding(building, index));
  addLandmarks();
  GAS_LAMPS.forEach(([x, y], index) => addLamp(x, y, index));
  addStreetProps();

  // Chimney smoke particles drifting into London night sky
  const chimneySmoke = createChimneySmoke(chimneyFlues);
  if (chimneySmoke) scene.add(chimneySmoke);

  // Ground-level rolling mist discs along street crossroads & Thames
  const groundMist = createGroundMist();
  scene.add(groundMist);

  // Distant Victorian London skyline & gothic towers framing horizon
  addDistantSkyline();

  // Celestial Victorian full moon and soft night halo
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xd9e5f0, transparent: true, opacity: 0.88, depthWrite: false })
  );
  moonDisc.position.set(-14, 20, -18);
  moonDisc.lookAt(0, 5, 0);
  scene.add(moonDisc);

  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(4.2, 24),
    new THREE.MeshBasicMaterial({ color: 0x7a99b8, transparent: true, opacity: 0.22, depthWrite: false })
  );
  moonHalo.position.set(-14, 20, -17.9);
  moonHalo.lookAt(0, 5, 0);
  scene.add(moonHalo);

  const rain = makeRain(reducedDeviceQuality ? 260 : 850);
  scene.add(rain.points);

  // Floating 3D Gold Objective Beacon matching Panel 2 art reference
  const beaconGroup = new THREE.Group();
  const beaconMat = new THREE.MeshStandardMaterial({
    color: 0xffd700,
    emissive: 0x996515,
    emissiveIntensity: 0.9,
    metalness: 0.85,
    roughness: 0.2,
  });
  const beaconDiamond = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), beaconMat);
  beaconDiamond.position.y = 1.35;
  beaconGroup.add(beaconDiamond);

  const beaconGroundRing = new THREE.Mesh(
    new THREE.RingGeometry(0.38, 0.46, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd700, transparent: true, opacity: 0.75, side: THREE.DoubleSide, depthWrite: false })
  );
  beaconGroundRing.rotation.x = -Math.PI / 2;
  beaconGroundRing.position.y = 0.025;
  beaconGroup.add(beaconGroundRing);

  const beaconLight = new THREE.PointLight(0xffbe60, 1.8, 6.0, 2);
  beaconLight.position.y = 1.35;
  beaconGroup.add(beaconLight);

  beaconGroup.position.set(0, 0, 5.88); // Default: Blackthorn Estate Gate
  scene.add(beaconGroup);

  const actors = new Map();
  const markers = new Map();
  let localPlayerId = '';
  let yaw = 0;
  let pitch = 0.29;
  let reducedMotion = Boolean(options.reducedMotion);
  let lookSensitivity = Number(options.lookSensitivity) || 1.0;
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
    yaw -= dx * 0.006 * lookSensitivity;
    pitch = THREE.MathUtils.clamp(pitch + dy * 0.003 * lookSensitivity, 0.08, 0.62);
    previousPointer = { x: event.clientX, y: event.clientY };
    options.onLook?.();
  });
  const endDrag = () => { dragging = false; previousPointer = null; };
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);

  function makeActor(player) {
    const charData = createVictorianDetectiveCharacter(player);
    scene.add(charData.group);
    return {
      group: charData.group,
      charData,
      moving: false,
      target: new THREE.Vector3(),
      incapacitated: false,
      eliminated: false,
      character: normalizeCharacterId(player.character),
      isSprinting: false,
      isInvestigating: false
    };
  }

  function setState(view) {
    if (!view?.room || !view.me) return;
    currentRoomState = view.room;
    localPlayerId = view.me.id;
    const activeIds = new Set();
    for (const player of view.room.players) {
      activeIds.add(player.id);
      const character = normalizeCharacterId(player.character);
      let actor = actors.get(player.id);
      if (actor && actor.character !== character) {
        scene.remove(actor.group); disposeObject(actor.group); actors.delete(player.id); actor = null;
      }
      if (!actor) { actor = makeActor(player); actors.set(player.id, actor); }
      actor.target.copy(toVector(player.x, player.y));
      actor.incapacitated = player.incapacitated;
      actor.eliminated = player.eliminated;
      actor.isCulprit = player.revealedRole === 'culprit' || Boolean(player.captured) || (currentRoomState.phase === 'capture' && player.revealedRole === 'culprit');
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
      if (!marker) { marker = makeClueMarker(point.category, point.id); markers.set(point.id, marker); scene.add(marker); }
      marker.position.copy(toVector(point.x, point.y, marker.userData.baseY != null ? marker.userData.baseY : 0.08));
      const active = pointActive(point, view.room);
      marker.visible = active;
      const jammed = view.room.sabotage?.mission === point.mission && view.room.sabotage.until > Date.now();
      if (marker.userData.material && marker.userData.isPedestal) {
        marker.userData.material.color.set(jammed ? 0xed6758 : 0xe7bd75);
        marker.userData.material.emissive.set(jammed ? 0x6d1f21 : 0x644117);
      }
    }
  }

  let currentRoomState = null;
  const discoveryEffects = [];
  const footstepRipples = [];
  let footstepTimer = 0;

  function spawnFootstepRipple(x, z, isSprinting, isThiefChase) {
    if (reducedMotion || footstepRipples.length > 28) return;
    const ringGeo = new THREE.RingGeometry(0.04, 0.08, 16);
    const ringMat = new THREE.MeshBasicMaterial({
      color: isThiefChase ? 0xcc4433 : 0xa6c2d8,
      transparent: true,
      opacity: isThiefChase ? 0.65 : 0.32,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const rippleMesh = new THREE.Mesh(ringGeo, ringMat);
    rippleMesh.rotation.x = -Math.PI / 2;
    rippleMesh.position.set(x, 0.008, z);
    scene.add(rippleMesh);
    footstepRipples.push({
      mesh: rippleMesh,
      start: performance.now(),
      duration: isThiefChase ? 750 : 520,
      maxScale: isSprinting ? 2.4 : 1.7,
      isThiefChase,
    });
  }

  function playDiscoveryEffect(x, y) {
    const worldVec = toVector(x, y, 0.05);
    const fxGroup = new THREE.Group();
    fxGroup.position.copy(worldVec);

    // 1. Expanding golden ripple ring
    const ringGeo = new THREE.RingGeometry(0.18, 0.28, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xffd978,
      transparent: true,
      opacity: 0.95,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const ringMesh = new THREE.Mesh(ringGeo, ringMat);
    ringMesh.rotation.x = -Math.PI / 2;
    fxGroup.add(ringMesh);

    // 2. Inner golden Victorian compass star
    const starGeo = new THREE.RingGeometry(0.04, 0.16, 8);
    const starMat = new THREE.MeshBasicMaterial({
      color: 0xfff0aa,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const starMesh = new THREE.Mesh(starGeo, starMat);
    starMesh.rotation.x = -Math.PI / 2;
    fxGroup.add(starMesh);

    // 3. Upward ascending golden sparkle particles
    const sparkleCount = 14;
    const sparkleGeo = new THREE.BufferGeometry();
    const sparklePos = new Float32Array(sparkleCount * 3);
    const sparkleVel = [];
    for (let i = 0; i < sparkleCount; i++) {
      const angle = (i / sparkleCount) * Math.PI * 2 + Math.random() * 0.4;
      const dist = 0.12 + Math.random() * 0.25;
      sparklePos[i * 3] = Math.cos(angle) * dist;
      sparklePos[i * 3 + 1] = 0.05 + Math.random() * 0.1;
      sparklePos[i * 3 + 2] = Math.sin(angle) * dist;
      sparkleVel.push({
        vx: Math.cos(angle) * 0.35,
        vy: 0.8 + Math.random() * 0.9,
        vz: Math.sin(angle) * 0.35,
      });
    }
    sparkleGeo.setAttribute('position', new THREE.BufferAttribute(sparklePos, 3));
    const sparkleMat = new THREE.PointsMaterial({
      color: 0xffeb88,
      size: 0.055,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const sparkles = new THREE.Points(sparkleGeo, sparkleMat);
    fxGroup.add(sparkles);

    // 4. Soft golden point light flash that briefly illuminates surroundings
    const flashLight = new THREE.PointLight(0xffbe60, 2.2, 3.8, 2);
    flashLight.position.y = 0.45;
    fxGroup.add(flashLight);

    scene.add(fxGroup);

    discoveryEffects.push({
      group: fxGroup,
      ring: ringMesh,
      star: starMesh,
      sparkles,
      sparkleGeo,
      sparkleMat,
      sparkleVel,
      flashLight,
      start: performance.now(),
      duration: 1400,
      update(p, dt) {
        const easeOut = 1 - Math.pow(1 - p, 2);
        const scale = 1 + easeOut * 4.8;
        ringMesh.scale.set(scale, scale, scale);
        ringMesh.material.opacity = (1 - p) * 0.9;

        starMesh.rotation.z += dt * 3.5;
        const starScale = 1 + easeOut * 2.2;
        starMesh.scale.set(starScale, starScale, starScale);
        starMesh.material.opacity = (1 - p) * 0.8;

        const posArr = sparkleGeo.attributes.position.array;
        for (let i = 0; i < sparkleCount; i++) {
          posArr[i * 3] += sparkleVel[i].vx * dt;
          posArr[i * 3 + 1] += sparkleVel[i].vy * dt;
          posArr[i * 3 + 2] += sparkleVel[i].vz * dt;
        }
        sparkleGeo.attributes.position.needsUpdate = true;
        sparkleMat.opacity = Math.max(0, (1 - p * 1.1));

        flashLight.intensity = Math.max(0, (1 - p * 1.4) * 2.2);
      },
    });
  }

  function animate() {
    const now = performance.now();
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;
    if (!reducedMotion) {
      rain.update(delta);
      const t = now / 1000;
      for (const lamp of gasLampObjects) {
        const flicker = Math.sin(t * 8.5 + lamp.seed) * 0.045 + Math.sin(t * 22 + lamp.seed * 2.3) * 0.02;
        if (lamp.light) lamp.light.intensity = lamp.baseIntensity * (1 + flicker);
        if (lamp.glow) lamp.glow.scale.setScalar(lamp.baseScale * (1 + flicker * 0.8));
      }
      if (groundMist) {
        for (const disc of groundMist.children) {
          disc.position.x = disc.userData.baseX + Math.sin(t * 0.35 + disc.userData.phase) * 0.35;
          disc.position.z = disc.userData.baseZ + Math.cos(t * 0.25 + disc.userData.phase) * 0.25;
          disc.material.opacity = disc.userData.baseOpacity + Math.sin(t * 0.7 + disc.userData.phase) * 0.035;
        }
      }
      if (chimneySmoke) {
        for (const puff of chimneySmoke.children) {
          puff.userData.progress += delta * puff.userData.speed;
          if (puff.userData.progress >= 1) {
            puff.userData.progress = 0;
            puff.position.copy(puff.userData.origin);
            puff.scale.setScalar(puff.userData.baseScale);
            puff.material.opacity = puff.userData.baseOpacity;
          } else {
            const prog = puff.userData.progress;
            puff.position.y = puff.userData.origin.y + prog * 1.1;
            puff.position.x = puff.userData.origin.x + Math.sin(t * 1.2 + puff.userData.phase) * 0.12 + prog * 0.22;
            puff.position.z = puff.userData.origin.z + Math.cos(t * 1.0 + puff.userData.phase) * 0.08;
            puff.scale.setScalar(puff.userData.baseScale * (1 + prog * 2.4));
            puff.material.opacity = puff.userData.baseOpacity * (1 - prog);
          }
        }
      }
      for (const sign of hangingSigns) {
        sign.rotation.z = Math.sin(t * 1.8 + sign.userData.phase) * 0.045;
      }
    }
    const t = now / 1000;
    const localActor = actors.get(localPlayerId);
    const localPos = localActor ? localActor.group.position : null;

    for (const marker of markers.values()) if (marker.visible) {
      if (marker.userData.cloth) {
        marker.userData.cloth.rotation.z = Math.sin(t * 3.5 + marker.userData.seed) * 0.1;
      }
      if (marker.userData.ring && localPos) {
        const d = localPos.distanceTo(marker.position);
        const inRange = d < 1.45;
        if (inRange) {
          if (!marker.userData.inProximity) {
            marker.userData.inProximity = true;
            try { playClueProximityShimmer(); } catch {}
          }
          marker.userData.ring.material.opacity = Math.min(0.85, marker.userData.ring.material.opacity + delta * 2.5);
          marker.userData.ring.scale.setScalar(1 + Math.sin(t * 4.5) * 0.06);
        } else {
          marker.userData.inProximity = false;
          marker.userData.ring.material.opacity = Math.max(0.12, marker.userData.ring.material.opacity - delta * 1.5);
          marker.userData.ring.scale.set(1, 1, 1);
        }
      }
      if (marker.userData.isPedestal) {
        marker.rotation.y = reducedMotion ? 0 : Math.sin(t * 0.7 + marker.userData.seed) * 0.3;
        marker.position.y = reducedMotion ? 0.12 : 0.12 + Math.sin(t * 2.2 + marker.userData.seed) * 0.04;
      }
    }

    // Dynamic lighting & atmospheric fog based on game phase
    if (scene.fog) {
      const isChase = currentRoomState?.phase === 'capture';
      const isReunionReady = currentRoomState?.phase === 'reunion' && currentRoomState?.reunionReady;
      const targetFogDensity = isChase ? 0.034 : (isReunionReady ? 0.022 : 0.026);
      scene.fog.density = THREE.MathUtils.lerp(scene.fog.density, targetFogDensity, delta * 3);

      const targetMoonColor = isChase ? new THREE.Color(0xd49b6a) : new THREE.Color(0xa5c4e8);
      moon.color.lerp(targetMoonColor, delta * 3);
      moon.intensity = isChase ? 2.6 : 2.2;
    }

    for (let i = discoveryEffects.length - 1; i >= 0; i--) {
      const fx = discoveryEffects[i];
      const progress = (now - fx.start) / fx.duration;
      if (progress >= 1) {
        scene.remove(fx.group);
        disposeObject(fx.group);
        discoveryEffects.splice(i, 1);
      } else {
        fx.update?.(progress, delta);
      }
    }

    // Cobblestone footstep ripples update
    for (let i = footstepRipples.length - 1; i >= 0; i--) {
      const rip = footstepRipples[i];
      const p = (now - rip.start) / rip.duration;
      if (p >= 1) {
        scene.remove(rip.mesh);
        rip.mesh.geometry?.dispose();
        rip.mesh.material?.dispose();
        footstepRipples.splice(i, 1);
      } else {
        const s = 1 + (1 - Math.pow(1 - p, 2)) * rip.maxScale;
        rip.mesh.scale.set(s, s, s);
        rip.mesh.material.opacity = (1 - p) * (rip.isThiefChase ? 0.6 : 0.3);
      }
    }

    for (const actor of actors.values()) {
      const difference = new THREE.Vector3().subVectors(actor.target, actor.group.position);
      const distance = difference.length();
      actor.moving = distance > 0.035;
      const speed = distance / Math.max(delta, 0.001);
      actor.isSprinting = speed > 3.8;

      if (reducedMotion) {
        actor.group.position.copy(actor.target);
      } else {
        actor.group.position.lerp(actor.target, 1 - Math.exp(-delta * 12));
      }

      let turnRate = 0;
      if (actor.moving) {
        const targetRotY = Math.atan2(difference.x, difference.z);
        let diff = targetRotY - actor.group.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        actor.group.rotation.y += diff * (1 - Math.exp(-delta * 14));
        turnRate = THREE.MathUtils.clamp(diff * 2.8, -1, 1);

        if (!reducedMotion) {
          footstepTimer += delta;
          const interval = actor.isSprinting ? 0.16 : 0.28;
          if (footstepTimer >= interval) {
            footstepTimer = 0;
            const isThiefInChase = (currentRoomState?.phase === 'capture') && (actor.isCulprit || actor.character === 'culprit');
            spawnFootstepRipple(actor.group.position.x, actor.group.position.z, actor.isSprinting, isThiefInChase);
          }
        }
      }

      const isCaptured = Boolean(actor.incapacitated || (actor.isCulprit && (currentRoomState?.captured || currentRoomState?.phase === 'results')));
      actor.charData?.updateAnimation?.(delta, speed, actor.isSprinting, actor.isInvestigating, t, turnRate, actor.isInteracting, isCaptured);
      actor.group.position.y = actor.incapacitated ? 0 : 0;
    }

    if (localActor) {
      const focus = localActor.group.position;
      const isIndoor = focus.z > 4.5 && Math.abs(focus.x) < 4.8;
      const isReunionCinematic = currentRoomState?.phase === 'reunion' && currentRoomState?.reunionReady;
      
      // Spacious third-person adventure framing (matching "Vanilla Far Camera" - Reference Image 6)
      const targetDist = isReunionCinematic ? 4.2 : (isIndoor ? 3.0 : 5.25);

      // Centered framing with subtle offset so player character never obstructs the forward avenue
      const shoulderX = 0.16;
      const lateral = new THREE.Vector3(Math.cos(yaw) * shoulderX, 0, -Math.sin(yaw) * shoulderX);
      const camOrigin = focus.clone().add(new THREE.Vector3(0, 1.82, 0)).add(lateral);
      const lookAt = focus.clone().add(new THREE.Vector3(0, 1.22, 0)).addScaledVector(lateral, 0.25);

      const horizontalDist = Math.cos(pitch) * targetDist;
      const desiredPos = new THREE.Vector3(
        camOrigin.x + Math.sin(yaw) * horizontalDist,
        camOrigin.y + Math.sin(pitch) * targetDist,
        camOrigin.z + Math.cos(yaw) * horizontalDist
      );

      // Raycast against solid building hulls only to prevent camera occlusion
      const camDir = desiredPos.clone().sub(camOrigin).normalize();
      cameraRay.set(camOrigin, camDir);
      const hit = cameraRay.intersectObjects(cameraBlockers, false)[0];
      const actualDist = hit ? Math.max(2.2, hit.distance - 0.28) : targetDist;
      const finalPos = camOrigin.addScaledVector(camDir, actualDist);

      camera.position.lerp(finalPos, 1 - Math.exp(-delta * 12));
      camera.lookAt(lookAt);

      // Proximity character fading when camera is pressed against tight walls
      if (localActor.charData?.fadeGroup) {
        const proximityAlpha = THREE.MathUtils.clamp((actualDist - 1.8) / 0.8, 0.35, 1.0);
        localActor.charData.fadeGroup(proximityAlpha);
      }
    }

    // Floating 3D Gold Objective Beacon animation
    if (beaconGroup && beaconGroup.visible && !reducedMotion) {
      beaconDiamond.rotation.y += delta * 1.8;
      beaconDiamond.position.y = 1.35 + Math.sin(t * 3.0) * 0.08;
      beaconGroundRing.scale.setScalar(1 + Math.sin(t * 2.5) * 0.08);
    }

    // Grandfather clock pendulum swing animation
    if (mansionInteractions.pendulum && !reducedMotion) {
      mansionInteractions.pendulum.rotation.z = Math.sin(t * 2.6) * 0.16;
    }

    // Blackthorn wrought-iron estate gates swing animation
    if (mansionInteractions.gateLeft && mansionInteractions.gateRight) {
      const targetAngle = mansionState.gateOpen ? Math.PI * 0.45 : 0;
      mansionInteractions.gateLeft.rotation.y = THREE.MathUtils.lerp(
        mansionInteractions.gateLeft.rotation.y,
        targetAngle,
        1 - Math.exp(-delta * 5)
      );
      mansionInteractions.gateRight.rotation.y = THREE.MathUtils.lerp(
        mansionInteractions.gateRight.rotation.y,
        -targetAngle,
        1 - Math.exp(-delta * 5)
      );
    }

    renderer.render(scene, camera);
  }
  renderer.setAnimationLoop(animate);

  return {
    setState,
    setReducedMotion(value) { reducedMotion = Boolean(value); },
    setLookSensitivity(val) {
      lookSensitivity = Math.max(0.2, Math.min(3.0, Number(val) || 1.0));
    },
    setGraphicsQuality(level) {
      if (level === 'low') {
        renderer.setPixelRatio(0.85);
        renderer.shadowMap.enabled = false;
        moon.castShadow = false;
      } else if (level === 'medium') {
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = true;
        moon.castShadow = true;
      } else {
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.shadowMap.enabled = true;
        moon.castShadow = true;
      }
      resize();
    },
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
    setBeaconTarget(x, y) {
      const pos = toVector(x, y);
      beaconGroup.position.set(pos.x, 0, pos.z);
      beaconGroup.visible = true;
    },
    setBeaconVisible(visible) {
      beaconGroup.visible = Boolean(visible);
    },
    getBeaconPosition() {
      return beaconGroup.position;
    },
    setMansionState(state) {
      if (!state) return;
      Object.assign(mansionState, state);
      if (state.clockHour !== undefined && mansionInteractions.clockHourHand) {
        mansionInteractions.clockHourHand.rotation.z = -(state.clockHour / 12) * Math.PI * 2;
      }
      if (state.secretDoorOpen !== undefined && mansionInteractions.secretDoor) {
        const manorX = toVector(480, 555).x;
        mansionInteractions.secretDoor.position.x = manorX + (state.secretDoorOpen ? 2.2 : 0);
      }
      if (state.selectedBooks && Array.isArray(state.selectedBooks) && mansionInteractions.books) {
        mansionInteractions.books.forEach((book, idx) => {
          const isSel = state.selectedBooks.includes(idx + 1);
          book.position.x = isSel ? 0.08 : 0;
          if (book.material) {
            book.material.map = makeLibraryBookTexture(['I', 'II', 'III', 'IV', 'V'][idx], isSel);
            book.material.needsUpdate = true;
          }
        });
      }
      if (state.basementSolved && mansionInteractions.cryptexLight) {
        mansionInteractions.cryptexLight.color.setHex(0x55ff77);
      }
      if (state.basementSymbols && Array.isArray(state.basementSymbols) && mansionInteractions.cryptexRings) {
        const symbolMap = { sun: 0, moon: 1, star: 2, key: 3, hourglass: 4, eye: 5 };
        state.basementSymbols.forEach((sym, idx) => {
          if (mansionInteractions.cryptexRings[idx]) {
            const rotIdx = symbolMap[sym] || 0;
            mansionInteractions.cryptexRings[idx].rotation.y = (rotIdx / 6) * Math.PI * 2;
          }
        });
      }
    },
    playDiscoveryEffect(x, y) {
      playDiscoveryEffect(x, y);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      for (const actor of actors.values()) disposeObject(actor.group);
      for (const marker of markers.values()) disposeObject(marker);
      gasLampObjects = [];
      if (groundMist) disposeObject(groundMist);
      if (chimneySmoke) disposeObject(chimneySmoke);
      hangingSigns = [];
      chimneyFlues = [];
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

  const camera = new THREE.PerspectiveCamera(32, 0.75, 0.1, 20);
  camera.position.set(0, 1.12, 4.2);
  camera.lookAt(0, 0.92, 0);

  scene.add(new THREE.HemisphereLight(0xa8c2dd, 0x281d19, 2.1));
  const key = new THREE.DirectionalLight(0xffd39b, 3.2);
  key.position.set(-2, 3.5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8899aa, 1.2);
  fill.position.set(2.5, 2, 3);
  scene.add(fill);
  const rim = new THREE.PointLight(0xa5bed1, 1.8, 8);
  rim.position.set(2, 2.3, -1);
  scene.add(rim);

  const pedestalGroup = new THREE.Group();
  const plinth = new THREE.Mesh(
    new THREE.CylinderGeometry(1.2, 1.26, 0.08, 36),
    new THREE.MeshStandardMaterial({ color: 0x221510, roughness: 0.55, metalness: 0.15 })
  );
  plinth.position.y = -0.04;
  pedestalGroup.add(plinth);
  const brassRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.21, 0.022, 12, 36),
    new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.35, metalness: 0.85 })
  );
  brassRing.rotation.x = Math.PI / 2;
  brassRing.position.y = -0.01;
  pedestalGroup.add(brassRing);
  scene.add(pedestalGroup);

  const charNameMap = {
    sherlock: 'Sherlock Holmes',
    watson: 'Dr. John Watson',
    girl: 'Irene Adler',
    journalist: 'Langdale Pike',
    officer: 'Inspector Lestrade',
  };
  const normChar = normalizeCharacterId(character);
  const displayName = charNameMap[normChar] || 'Sherlock Holmes';

  const detectiveChar = createVictorianDetectiveCharacter({
    character: normChar,
    isMe: true,
    name: displayName,
  });
  detectiveChar.group.position.y = 0;
  if (detectiveChar.nameplate) detectiveChar.nameplate.visible = false;
  scene.add(detectiveChar.group);

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
    detectiveChar.group.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * 0.34) * 0.22;
    detectiveChar.updateAnimation(delta, 0, false, false, elapsed, 0);
    renderer.render(scene, camera);
  };
  renderer.setAnimationLoop(null);

  return {
    setActive(active) {
      renderer.setAnimationLoop(active ? render : null);
    },
    setReducedMotion(value) {
      reducedMotion = Boolean(value);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      disposeObject(detectiveChar.group);
      disposeObject(pedestalGroup);
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
  context.fillStyle = '#22282e';
  context.fillRect(0, 0, 512, 512);
  let seed = 71;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = 0; row < 24; row++) for (let col = 0; col < 18; col++) {
    const x = col * 30 + (row % 2) * 15 + 2;
    const y = row * 21 + 2;
    const baseTone = 64 + Math.floor(random() * 32);
    const r = baseTone + Math.floor(random() * 8) - 4;
    const g = baseTone + 8 + Math.floor(random() * 6);
    const b = baseTone + 14 + Math.floor(random() * 8);

    context.fillStyle = `rgb(${r},${g},${b})`;
    context.beginPath(); context.roundRect(x, y, 27, 18, 4); context.fill();

    context.strokeStyle = 'rgba(12, 16, 22, 0.75)';
    context.lineWidth = 1.2;
    context.stroke();

    context.fillStyle = 'rgba(215, 230, 245, 0.12)';
    context.fillRect(x + 3, y + 2, 21, 3);

    if (random() > 0.72) {
      context.fillStyle = 'rgba(244, 180, 94, 0.22)';
      context.fillRect(x + random() * 16 + 2, y + random() * 8 + 2, 6, 2.5);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(8, 6);
  return texture;
}

function makeBrickMaps() {
  const colorCanvas = document.createElement('canvas');
  const heightCanvas = document.createElement('canvas');
  colorCanvas.width = heightCanvas.width = 256;
  colorCanvas.height = heightCanvas.height = 256;
  const colorContext = colorCanvas.getContext('2d');
  const heightContext = heightCanvas.getContext('2d');
  colorContext.fillStyle = '#4b403a'; colorContext.fillRect(0, 0, 256, 256);
  heightContext.fillStyle = '#202020'; heightContext.fillRect(0, 0, 256, 256);
  let seed = 1847;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let row = -1; row < 12; row++) {
    const y = row * 23;
    const offset = row % 2 ? -24 : 0;
    for (let col = -1; col < 7; col++) {
      const x = col * 52 + offset;
      const shade = 104 + Math.floor(random() * 38);
      const red = shade + Math.floor(random() * 8);
      const green = shade - 18;
      const blue = shade - 33;
      colorContext.fillStyle = `rgb(${red},${green},${blue})`;
      colorContext.fillRect(x + 1, y + 1, 49, 20);
      colorContext.fillStyle = 'rgba(224,202,174,.08)';
      colorContext.fillRect(x + 3, y + 2, 44, 1);
      heightContext.fillStyle = `rgb(${185 + Math.floor(random() * 46)},${185 + Math.floor(random() * 46)},${185 + Math.floor(random() * 46)})`;
      heightContext.fillRect(x + 1, y + 1, 49, 20);
      if (random() > .72) {
        colorContext.fillStyle = 'rgba(29,31,30,.14)';
        colorContext.fillRect(x + 5 + random() * 32, y + 5 + random() * 10, 8 + random() * 9, 1 + random() * 3);
      }
    }
  }
  const color = new THREE.CanvasTexture(colorCanvas);
  color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = color.wrapT = THREE.RepeatWrapping;
  color.repeat.set(1.8, 1.5);
  const height = new THREE.CanvasTexture(heightCanvas);
  height.wrapS = height.wrapT = THREE.RepeatWrapping;
  height.repeat.copy(color.repeat);
  return { color, height };
}

function makeSignTexture(text, subtext = '') {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = '#141c1a'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = '#c9a45c'; context.lineWidth = 6; context.strokeRect(8, 8, 496, 112);
  context.strokeStyle = 'rgba(235, 205, 145, 0.45)'; context.lineWidth = 2; context.strokeRect(16, 16, 480, 96);
  context.fillStyle = '#f4d389';
  if (subtext) {
    context.font = '700 38px Georgia, serif';
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, 256, 48, 460);
    context.fillStyle = '#c9a45c';
    context.font = '600 21px Georgia, serif';
    context.fillText(subtext, 256, 88, 460);
  } else {
    context.font = `700 ${text.length > 10 ? 44 : 58}px Georgia, serif`;
    context.textAlign = 'center'; context.textBaseline = 'middle';
    context.fillText(text, 256, 64, 460);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makePortraitTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 768;
  const ctx = canvas.getContext('2d');

  const bgGrad = ctx.createRadialGradient(256, 320, 40, 256, 384, 400);
  bgGrad.addColorStop(0, '#362b20');
  bgGrad.addColorStop(0.5, '#1e1a17');
  bgGrad.addColorStop(1, '#0c0b0a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, 512, 768);

  ctx.strokeStyle = 'rgba(212, 175, 55, 0.4)';
  ctx.lineWidth = 4;
  ctx.strokeRect(18, 18, 476, 732);

  // Figure of Edward Blackthorn (Victorian Art Thief)
  ctx.fillStyle = '#121418';
  ctx.beginPath();
  ctx.moveTo(120, 768);
  ctx.quadraticCurveTo(180, 480, 256, 470);
  ctx.quadraticCurveTo(332, 480, 392, 768);
  ctx.fill();

  ctx.fillStyle = '#e8dcc8';
  ctx.beginPath();
  ctx.moveTo(235, 470);
  ctx.lineTo(277, 470);
  ctx.lineTo(265, 550);
  ctx.lineTo(247, 550);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#d4af37';
  ctx.beginPath();
  ctx.arc(256, 505, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#c5a382';
  ctx.beginPath();
  ctx.ellipse(256, 360, 58, 76, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = 'rgba(70, 45, 30, 0.35)';
  ctx.beginPath();
  ctx.ellipse(256, 410, 42, 24, 0, 0, Math.PI);
  ctx.fill();

  ctx.fillStyle = '#221915';
  ctx.beginPath();
  ctx.moveTo(226, 388);
  ctx.quadraticCurveTo(256, 376, 286, 388);
  ctx.quadraticCurveTo(256, 404, 226, 388);
  ctx.fill();

  ctx.fillStyle = '#161210';
  ctx.beginPath();
  ctx.arc(234, 345, 6, 0, Math.PI * 2);
  ctx.arc(278, 345, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(236, 343, 2, 0, Math.PI * 2);
  ctx.arc(280, 343, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#181310';
  ctx.beginPath();
  ctx.ellipse(256, 305, 66, 40, 0, 0, Math.PI * 2);
  ctx.fill();

  // Top hat
  ctx.fillStyle = '#0a0c0e';
  ctx.beginPath();
  ctx.ellipse(256, 308, 92, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(182, 130, 148, 175);
  ctx.fillStyle = '#8a6e38';
  ctx.fillRect(182, 280, 148, 25);

  ctx.fillStyle = 'rgba(10, 8, 6, 0.88)';
  ctx.fillRect(36, 680, 440, 58);
  ctx.strokeStyle = '#c9a45c';
  ctx.lineWidth = 2;
  ctx.strokeRect(36, 680, 440, 58);

  ctx.fillStyle = '#f4d389';
  ctx.font = '700 24px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('EDWARD BLACKTHORN', 256, 700);

  ctx.fillStyle = '#c9a45c';
  ctx.font = 'italic 16px Georgia, serif';
  ctx.fillText('THE LONDON ART THIEF · 1895', 256, 722);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeClockDialTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512; canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const grad = ctx.createRadialGradient(256, 256, 20, 256, 256, 250);
  grad.addColorStop(0, '#f9ecd0');
  grad.addColorStop(0.7, '#ebd3a7');
  grad.addColorStop(1, '#c29d68');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(256, 256, 250, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#5a3d1c';
  ctx.lineWidth = 14;
  ctx.stroke();

  ctx.strokeStyle = '#8a6432';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(256, 256, 236, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(256, 256, 170, 0, Math.PI * 2);
  ctx.stroke();

  const numerals = ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
  ctx.fillStyle = '#1c140d';
  ctx.font = 'bold 44px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 - 90) * (Math.PI / 180);
    const x = 256 + Math.cos(angle) * 202;
    const y = 256 + Math.sin(angle) * 202;
    ctx.fillText(numerals[i], x, y);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = '#3d2814';
  for (let i = 0; i < 60; i++) {
    const angle = i * 6 * (Math.PI / 180);
    const innerR = (i % 5 === 0) ? 228 : 236;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(angle) * innerR, 256 + Math.sin(angle) * innerR);
    ctx.lineTo(256 + Math.cos(angle) * 242, 256 + Math.sin(angle) * 242);
    ctx.stroke();
  }

  ctx.fillStyle = '#7a5426';
  ctx.beginPath();
  ctx.arc(256, 256, 24, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function makeLibraryBookTexture(numeral, isSelected = false) {
  const canvas = document.createElement('canvas');
  canvas.width = 128; canvas.height = 512;
  const ctx = canvas.getContext('2d');

  const tones = { 'I': '#4a1e1e', 'II': '#1e3828', 'III': '#1e284a', 'IV': '#422818', 'V': '#381c3c' };
  const baseColor = tones[numeral] || '#382218';
  ctx.fillStyle = isSelected ? '#5a3d1a' : baseColor;
  ctx.fillRect(0, 0, 128, 512);

  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let i = 0; i < 512; i += 8) {
    ctx.fillRect(0, i, 128, 2);
  }

  ctx.fillStyle = isSelected ? '#ffe082' : '#c9a45c';
  for (const y of [38, 48, 454, 464]) {
    ctx.fillRect(12, y, 104, 3);
  }

  ctx.strokeStyle = isSelected ? '#ffea00' : 'rgba(212, 175, 55, 0.6)';
  ctx.lineWidth = isSelected ? 4 : 2;
  ctx.strokeRect(18, 190, 92, 132);

  ctx.fillStyle = isSelected ? '#ffffff' : '#f5d77f';
  ctx.font = 'bold 64px Georgia, serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(numeral, 64, 256);

  if (isSelected) {
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, 120, 504);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function addIronRailing(x1, z1, x2, z2, height = 0.45) {
  const iron = new THREE.MeshStandardMaterial({ color: 0x181c20, metalness: 0.8, roughness: 0.35 });
  const start = new THREE.Vector3(x1, 0, z1);
  const end = new THREE.Vector3(x2, 0, z2);
  const diff = new THREE.Vector3().subVectors(end, start);
  const len = diff.length();
  if (len < 0.2) return;
  const angle = Math.atan2(diff.x, diff.z);
  const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);

  const group = new THREE.Group();
  group.position.set(mid.x, 0, mid.z);
  group.rotation.y = angle;

  const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.024, len), iron);
  topRail.position.set(0, height, 0);
  const btmRail = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, len), iron);
  btmRail.position.set(0, 0.06, 0);
  group.add(topRail, btmRail);

  const picketsCount = Math.max(2, Math.floor(len / 0.14));
  for (let i = 0; i <= picketsCount; i++) {
    const pz = -len / 2 + (len * i) / picketsCount;
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, height, 5), iron);
    bar.position.set(0, height / 2, pz);
    const spear = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.06, 4), iron);
    spear.position.set(0, height + 0.03, pz);
    spear.rotation.y = Math.PI / 4;
    group.add(bar, spear);
  }

  const newelsCount = Math.max(2, Math.ceil(len / 1.5) + 1);
  for (let i = 0; i < newelsCount; i++) {
    const nz = -len / 2 + (len * i) / (newelsCount - 1);
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, height + 0.06, 0.05), iron);
    post.position.set(0, (height + 0.06) / 2, nz);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), iron);
    cap.position.set(0, height + 0.08, nz);
    group.add(post, cap);
  }

  group.traverse((c) => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; } });
  sceneAdd(group);
}

function createGroundMist() {
  const group = new THREE.Group();
  const mistMat = new THREE.MeshBasicMaterial({
    map: getMistMap(),
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });

  const mistCoords = [
    [182, 145], [315, 235], [498, 160], [660, 235], [804, 355],
    [690, 450], [480, 555], [300, 414], [476, 342], [238, 184],
    [576, 197], [744, 304], [566, 491], [205, 402]
  ];

  mistCoords.forEach(([gx, gy], i) => {
    const pos = toVector(gx, gy);
    const size = 2.4 + (i % 3) * 0.6;
    const disc = new THREE.Mesh(new THREE.CircleGeometry(size, 16), mistMat.clone());
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(pos.x + (i % 2 === 0 ? 0.3 : -0.3), 0.06 + (i % 3) * 0.03, pos.z);
    disc.userData = {
      baseX: disc.position.x,
      baseZ: disc.position.z,
      phase: i * 0.7,
      baseOpacity: 0.16 + (i % 3) * 0.03,
    };
    group.add(disc);
  });

  return group;
}

function createChimneySmoke(flues) {
  if (!flues || flues.length === 0) return null;
  const group = new THREE.Group();
  const smokeMat = new THREE.MeshBasicMaterial({
    map: getMistMap(),
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const selectedFlues = flues.slice(0, 18);
  selectedFlues.forEach((pos, i) => {
    for (let p = 0; p < 2; p++) {
      const puff = new THREE.Mesh(new THREE.CircleGeometry(0.18, 10), smokeMat.clone());
      puff.rotation.x = -Math.PI / 4;
      puff.userData = {
        origin: pos.clone(),
        progress: (p * 0.5 + (i * 0.13)) % 1,
        speed: 0.18 + (i % 3) * 0.05,
        baseScale: 0.22,
        baseOpacity: 0.16,
        phase: i * 0.9 + p * 1.5,
      };
      puff.position.copy(pos);
      group.add(puff);
    }
  });
  return group;
}

function addDistantSkyline() {
  const darkSkyline = new THREE.MeshStandardMaterial({
    color: 0x101620,
    roughness: 0.95,
    metalness: 0.05,
  });
  const darkRoof = new THREE.MeshStandardMaterial({
    color: 0x090d14,
    roughness: 0.9,
  });

  // 1. Big Ben / Westminster Palace Clock Tower in distance
  const tower = createClockTower();
  tower.scale.set(0.65, 0.65, 0.65);
  tower.position.set(-18, 0, -22);
  sceneAdd(tower);

  // 2. St. Paul's Cathedral dome silhouette in east skyline
  const stPauls = new THREE.Group();
  const domeBase = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 5.2, 16), darkSkyline);
  domeBase.position.y = 2.6;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.3, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), darkRoof);
  dome.position.y = 5.2;
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 1.8, 8), darkSkyline);
  lantern.position.y = 7.8;
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.8, 0.12), darkSkyline);
  cross.position.y = 9.0;
  stPauls.add(domeBase, dome, lantern, cross);
  stPauls.position.set(19, 0, -20);
  sceneAdd(stPauls);

  // 3. Gothic Spires & Victorian Roof Silhouettes framing the northern horizon
  for (let x = -24; x <= 24; x += 4.8) {
    if (Math.abs(x - (-18)) < 4 || Math.abs(x - 19) < 4) continue;
    const bldgGroup = new THREE.Group();
    const bh = 5.5 + Math.abs(Math.sin(x * 12)) * 3.5;
    const bw = 3.8, bd = 3.2;
    const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), darkSkyline);
    bldg.position.set(0, bh / 2, 0);
    const roof = new THREE.Mesh(makeGableRoof(bw + 0.1, bd + 0.1, 1.4), darkRoof);
    roof.position.set(0, bh, 0);
    bldgGroup.add(bldg, roof);

    if (Math.abs(x) % 3 === 0) {
      const spire = new THREE.Mesh(new THREE.ConeGeometry(0.6, 3.8, 4), darkRoof);
      spire.position.set(0, bh + 1.9, 0);
      spire.rotation.y = Math.PI / 4;
      bldgGroup.add(spire);
    }
    bldgGroup.position.set(x, 0, -23 - Math.abs(x * 0.15));
    sceneAdd(bldgGroup);
  }
}

function addRoad(path, width, material, curbMaterial, pavementMaterial) {
  addRoadBand(path, width, 0, 0.008, material);
  const curbW = 0.12;
  const walkW = 0.82;
  for (const side of [-1, 1]) {
    const curbCenter = side * (width / 2 + curbW / 2);
    const walkCenter = side * (width / 2 + curbW + walkW / 2);
    addRoadBand(path, curbW, curbCenter, 0.045, curbMaterial);
    addRoadBand(path, walkW, walkCenter, 0.018, pavementMaterial);
  }
}

// Mitered continuous strips prevent gaps at street bends and keep the curb and
// pavement tied to the same route geometry as the road surface.
function addRoadBand(path, width, centerOffset, y, material) {
  if (path.length < 2) return;
  const centers = path.map(([x, z]) => toVector(x, z, y));
  const normals = [];
  for (let index = 0; index < centers.length - 1; index++) {
    const direction = new THREE.Vector3().subVectors(centers[index + 1], centers[index]).setY(0).normalize();
    normals.push(new THREE.Vector3(-direction.z, 0, direction.x));
  }
  const positions = [];
  for (let index = 0; index < centers.length; index++) {
    const isEnd = index === 0 || index === centers.length - 1;
    const miter = isEnd
      ? normals[index === 0 ? 0 : normals.length - 1].clone()
      : normals[index - 1].clone().add(normals[index]).normalize();
    const reference = normals[index === 0 ? 0 : Math.min(index, normals.length - 1)];
    const scale = isEnd ? 1 : Math.min(2.2, 1 / Math.max(0.45, Math.abs(miter.dot(reference))));
    miter.multiplyScalar(scale);
    const left = centerOffset + width / 2;
    const right = centerOffset - width / 2;
    positions.push(
      centers[index].x + miter.x * left, y, centers[index].z + miter.z * left,
      centers[index].x + miter.x * right, y, centers[index].z + miter.z * right,
    );
  }
  const indices = [];
  for (let index = 0; index < centers.length - 1; index++) {
    const a = index * 2, b = a + 2;
    indices.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const strip = new THREE.Mesh(geometry, material);
  strip.receiveShadow = true;
  sceneAdd(strip);
}

function addStreetPuddles(paths, puddleMaterial, glintMaterial) {
  let seed = 1891;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (const path of paths) for (let index = 1; index < path.length; index++) {
    const start = toVector(path[index - 1][0], path[index - 1][1]);
    const end = toVector(path[index][0], path[index][1]);
    const direction = new THREE.Vector2(end.x - start.x, end.z - start.z).normalize();
    const side = new THREE.Vector2(-direction.y, direction.x);
    for (const t of [0.28, 0.68]) {
      const spread = (random() - 0.5) * 0.82;
      const x = THREE.MathUtils.lerp(start.x, end.x, t) + side.x * spread;
      const z = THREE.MathUtils.lerp(start.z, end.z, t) + side.y * spread;
      const radius = 0.22 + random() * 0.3;
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(1, 20), puddleMaterial);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(x, 0.014, z);
      puddle.scale.set(radius * 1.5, radius * 0.58, 1);
      sceneAdd(puddle);
      if (random() > 0.38) {
        const glint = new THREE.Mesh(new THREE.CircleGeometry(1, 16), glintMaterial);
        glint.rotation.x = -Math.PI / 2;
        glint.position.set(x - 0.04, 0.015, z + 0.015);
        glint.scale.set(radius * 0.74, 0.018 + radius * 0.06, 1);
        sceneAdd(glint);
      }
    }
  }
}

function makeGableRoof(width, depth, peakHeight) {
  const halfW = width / 2, halfD = depth / 2;
  const vertices = [
    -halfW, 0, -halfD,  halfW, 0, -halfD,  -halfW, peakHeight, 0,
    -halfW, peakHeight, 0,  halfW, 0, -halfD,  halfW, peakHeight, 0,
    -halfW, 0, halfD,  -halfW, peakHeight, 0,  halfW, 0, halfD,
    -halfW, peakHeight, 0,  halfW, peakHeight, 0,  halfW, 0, halfD,
    -halfW, 0, -halfD,  -halfW, 0, halfD,  -halfW, peakHeight, 0,
    halfW, 0, -halfD,  halfW, peakHeight, 0,  halfW, 0, halfD,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function addDistrictEdge() {
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(4.2, 22),
    new THREE.MeshStandardMaterial({ color: 0x0c1822, roughness: 0.12, metalness: 0.68 })
  );
  river.rotation.x = -Math.PI / 2;
  river.position.set(12.6, -0.045, 0);
  sceneAdd(river);

  // Granite Embankment Quay Wall
  const quayWall = new THREE.Mesh(
    new THREE.BoxGeometry(0.55, 0.45, 21),
    new THREE.MeshStandardMaterial({ color: 0x363a40, roughness: 0.92, metalness: 0.08 })
  );
  quayWall.position.set(10.55, 0.18, 0);
  quayWall.castShadow = true;
  quayWall.receiveShadow = true;
  sceneAdd(quayWall);

  // Victorian Wrought-Iron Spearhead Railing along the river wall
  addIronRailing(10.6, -10.2, 10.6, 10.2, 0.48);

  // Wooden wharf mooring pilings and rope ties along river
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x2e2319, roughness: 0.95 });
  for (let z = -9; z <= 9; z += 3.2) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 1.2, 8), woodMat);
    post.position.set(11.2, 0.35, z);
    post.castShadow = true;
    sceneAdd(post);

    const rope = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.022, 5, 12), new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.9 }));
    rope.rotation.x = Math.PI / 2;
    rope.position.set(11.2, 0.72, z);
    sceneAdd(rope);
  }

  // Steel railway tracks with wooden cross-ties
  const railMat = new THREE.MeshStandardMaterial({ color: 0x7a848c, metalness: 0.85, roughness: 0.28 });
  const sleeperMat = new THREE.MeshStandardMaterial({ color: 0x332820, roughness: 0.92 });
  for (let z = -6.5; z <= 6.5; z += 0.45) {
    const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.04, 0.18), sleeperMat);
    sleeper.position.set(8.4, 0.015, z);
    sleeper.receiveShadow = true;
    sceneAdd(sleeper);
  }
  for (const trackX of [8.18, 8.62]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 13.5), railMat);
    rail.position.set(trackX, 0.045, 0);
    rail.castShadow = true;
    sceneAdd(rail);
  }
}

function addBuilding(building, index) {
  const centerX = building.x + building.w / 2;
  const centerY = building.y + building.h / 2;
  const center = toVector(centerX, centerY);
  const width = building.w / 40, depth = building.h / 40, height = building.height;
  const hue = [0x392b29, 0x46352c, 0x292f38, 0x44332a, 0x303438][index % 5];
  sharedBrickMaps ||= makeBrickMaps();
  const wall = new THREE.MeshStandardMaterial({ color: new THREE.Color(hue).lerp(new THREE.Color(0xc7b99d), 0.27), roughness: 0.96, metalness: 0.01, map: sharedBrickMaps.color, bumpMap: sharedBrickMaps.height, bumpScale: 0.018 });
  const house = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), wall);
  house.position.set(center.x, height / 2, center.z); house.castShadow = true; house.receiveShadow = true; sceneAdd(house);
  cameraBlockers.push(house);

  const roofHeight = Math.max(0.55, height * 0.24);
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x252b30, roughness: 0.9, metalness: 0.02, side: THREE.DoubleSide });
  const roof = new THREE.Mesh(makeGableRoof(width + 0.12, depth + 0.12, roofHeight), roofMat);
  roof.position.set(center.x, height, center.z); roof.castShadow = true; roof.receiveShadow = true; sceneAdd(roof);

  const facing = nearestStreetFacing(centerX, centerY);
  const facade = new THREE.Group();
  facade.position.set(center.x, 0, center.z);
  facade.rotation.y = facing.rotation;
  sceneAdd(facade);
  const facadeWidth = facing.sideX ? depth : width;
  const facadeDepth = facing.sideX ? width : depth;
  const facadeZ = facadeDepth / 2 + 0.035;

  const glass = new THREE.MeshStandardMaterial({
    color: 0xa17a4f,
    emissive: 0xa4511d,
    emissiveIntensity: index % 4 === 0 ? 0.72 : 0.36,
    roughness: 0.5,
    metalness: 0.04,
  });
  const frame = new THREE.MeshStandardMaterial({ color: 0x252321, roughness: 0.84 });
  const sill = new THREE.MeshStandardMaterial({ color: 0x777067, roughness: 0.93 });
  const pipeMat = new THREE.MeshStandardMaterial({ color: 0x181c20, metalness: 0.75, roughness: 0.4 });
  const quoinMat = new THREE.MeshStandardMaterial({ color: 0x766f65, roughness: 0.88 });

  // 1. Victorian Corner Ashlar Stone Quoins along building front edges
  for (let qy = 0.14; qy < height - 0.18; qy += 0.22) {
    const isLong = Math.round(qy / 0.22) % 2 === 0;
    const qw = isLong ? 0.085 : 0.052;
    for (const side of [-1, 1]) {
      const quoin = new THREE.Mesh(new THREE.BoxGeometry(qw, 0.18, 0.032), quoinMat);
      quoin.position.set(side * (facadeWidth / 2 - qw / 2), qy, facadeZ + 0.012);
      facade.add(quoin);
    }
  }

  // 2. Cast-iron Rainwater Downpipe with Ornamental Hopper Head
  const downpipe = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, height - 0.18, 6), pipeMat);
  downpipe.position.set(facadeWidth / 2 - 0.03, height / 2, facadeZ + 0.03);
  facade.add(downpipe);
  const hopper = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.08, 4), pipeMat);
  hopper.rotation.y = Math.PI / 4;
  hopper.position.set(facadeWidth / 2 - 0.03, height - 0.08, facadeZ + 0.03);
  facade.add(hopper);

  // 3. Ground Floor: Commercial Victorian Shopfront vs Residential Townhouse
  const isShop = (index % 3 === 0);
  if (isShop) {
    const shopColors = [0x192820, 0x271a15, 0x16202c, 0x2b2218];
    const shopMat = new THREE.MeshStandardMaterial({ color: shopColors[(index / 3) % shopColors.length], roughness: 0.72 });
    const shopWinW = Math.min(0.68, facadeWidth * 0.48);
    const shopWinH = Math.min(0.72, height * 0.38);

    // Large bay shop display window
    const shopDisplay = new THREE.Mesh(new THREE.BoxGeometry(shopWinW, shopWinH, 0.09), new THREE.MeshStandardMaterial({
      color: 0xffdb99, emissive: 0xc86a1a, emissiveIntensity: 0.65, roughness: 0.35, metalness: 0.05,
    }));
    shopDisplay.position.set(-facadeWidth * 0.2, shopWinH / 2 + 0.08, facadeZ + 0.05);
    facade.add(shopDisplay);

    const winSurround = new THREE.Mesh(new THREE.BoxGeometry(shopWinW + 0.06, shopWinH + 0.06, 0.07), shopMat);
    winSurround.position.set(-facadeWidth * 0.2, shopWinH / 2 + 0.08, facadeZ + 0.03);
    facade.add(winSurround);

    // Striped Fabric Shop Awning projecting over sidewalk (Image 9)
    const awningW = Math.min(facadeWidth * 0.92, width - 0.08);
    const awningDepth = 0.44;
    const awningColors = [0x1e4620, 0x1b2d4b, 0x5a1820, 0x483216];
    const awningMat = new THREE.MeshStandardMaterial({
      color: awningColors[(index / 3) % awningColors.length],
      roughness: 0.85,
      side: THREE.DoubleSide
    });
    const awning = new THREE.Mesh(new THREE.PlaneGeometry(awningW, awningDepth), awningMat);
    awning.rotation.x = Math.PI / 2 + 0.35;
    awning.position.set(0, shopWinH + 0.12, facadeZ + awningDepth * 0.38);
    facade.add(awning);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.4, 4), pipeMat);
      strut.rotation.x = Math.PI / 4;
      strut.position.set(side * (awningW * 0.46), shopWinH - 0.02, facadeZ + 0.18);
      facade.add(strut);
    }

    // Fascia board
    const fasciaW = Math.min(facadeWidth * 0.94, width - 0.05);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(fasciaW, 0.2, 0.06), shopMat);
    fascia.position.set(0, shopWinH + 0.24, facadeZ + 0.045);
    facade.add(fascia);

    // Trade sign text
    const shopList = [
      ['H. APOTHECARY', 'CHEMIST & DRUGGIST'],
      ['F. W. WATCHMAKER', 'CHRONOMETERS & CLOCKS'],
      ['J. TOBACCONIST', 'FINE HAVANA PIPES & LEAF'],
      ['G. TAILOR & DRAPER', 'GENTLEMEN\'S FINE SUITS'],
      ['E. BOOKBINDER', 'RARE TOMES & FOLIOS'],
      ['BOOT & SHOEMAKER', 'BESPOKE HANDCRAFTED'],
      ['WINE & SPIRITS', 'PORTS, SHERRY & BRANDY'],
      ['THE STRAND PRINTER', 'ENGRAVINGS & BROADSIDES'],
    ];
    const shopData = shopList[(index / 3) % shopList.length];
    const fasciaSign = new THREE.Mesh(new THREE.PlaneGeometry(fasciaW * 0.92, 0.15), new THREE.MeshBasicMaterial({
      map: makeSignTexture(shopData[0], shopData[1]), toneMapped: false,
    }));
    fasciaSign.position.set(0, shopWinH + 0.24, facadeZ + 0.078);
    facade.add(fasciaSign);

    // Projecting iron bracket with hanging double-sided trade sign
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.36), pipeMat);
    bracket.position.set(-facadeWidth * 0.38, shopWinH + 0.24, facadeZ + 0.18);
    facade.add(bracket);

    const signPivot = new THREE.Group();
    signPivot.position.set(-facadeWidth * 0.38, shopWinH + 0.23, facadeZ + 0.32);
    const hangingSign = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.26), shopMat);
    hangingSign.position.set(0, -0.11, 0);
    signPivot.add(hangingSign);
    const signDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.2), new THREE.MeshBasicMaterial({
      map: makeSignTexture(shopData[0]), toneMapped: false,
    }));
    signDecal.rotation.y = Math.PI / 2;
    signDecal.position.set(0.012, -0.11, 0);
    signPivot.add(signDecal);
    signPivot.userData = { phase: index * 1.4 };
    facade.add(signPivot);
    hangingSigns.push(signPivot);

    // Shop door
    const sDoorH = Math.min(0.85, height * 0.36);
    const sDoorW = Math.min(0.38, facadeWidth * 0.26);
    const sDoor = new THREE.Mesh(new THREE.BoxGeometry(sDoorW, sDoorH, 0.05), shopMat);
    sDoor.position.set(facadeWidth * 0.25, sDoorH / 2 + 0.04, facadeZ + 0.025);
    facade.add(sDoor);
    const sGlass = new THREE.Mesh(new THREE.BoxGeometry(sDoorW * 0.7, sDoorH * 0.42, 0.06), new THREE.MeshStandardMaterial({
      color: 0xffd896, emissive: 0xb85c15, emissiveIntensity: 0.5, roughness: 0.3,
    }));
    sGlass.position.set(facadeWidth * 0.25, sDoorH * 0.68, facadeZ + 0.025);
    facade.add(sGlass);
  } else {
    // Residential Townhouse door
    const doorWidth = Math.min(0.38, facadeWidth * 0.22);
    const doorHeight = Math.min(0.85, height * 0.36);
    const door = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.07), new THREE.MeshStandardMaterial({ color: 0x221812, roughness: 0.82 }));
    door.position.set(0, doorHeight / 2 + 0.045, facadeZ + 0.02); facade.add(door);
    const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.13, 0.07, 0.11), sill);
    doorLintel.position.set(0, doorHeight + 0.09, facadeZ + 0.025); facade.add(doorLintel);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd6b46f, metalness: 0.65, roughness: 0.34, emissive: 0x32230e }));
    handle.position.set(doorWidth * 0.31, doorHeight * 0.53, facadeZ + 0.068); facade.add(handle);
    const threshold = new THREE.Mesh(new THREE.BoxGeometry(doorWidth + 0.18, 0.06, 0.19), sill);
    threshold.position.set(0, 0.03, facadeZ + 0.11); facade.add(threshold);

    // Arched Fanlight above door
    const fanlight = new THREE.Mesh(new THREE.CircleGeometry(doorWidth * 0.48, 12, 0, Math.PI), new THREE.MeshStandardMaterial({
      color: 0xffd188, emissive: 0xd97524, emissiveIntensity: 0.85, roughness: 0.3,
    }));
    fanlight.position.set(0, doorHeight + 0.05, facadeZ + 0.032);
    facade.add(fanlight);

    // Projecting Victorian 3-Sided Canted Bay Window on floor 1 for townhouses
    if (index % 3 === 1 && height > 2.6 && facadeWidth > 1.2) {
      const bayW = Math.min(0.82, facadeWidth * 0.52);
      const bayH = 0.62;
      const bayY = doorHeight + 0.52;
      const bayCenter = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.56, bayH, 0.18), new THREE.MeshStandardMaterial({
        color: 0xffe4ab, emissive: 0xd97524, emissiveIntensity: 0.72, roughness: 0.3,
      }));
      bayCenter.position.set(0, bayY, facadeZ + 0.09);
      facade.add(bayCenter);
      
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.28, bayH, 0.04), new THREE.MeshStandardMaterial({
          color: 0xffe4ab, emissive: 0xd97524, emissiveIntensity: 0.65, roughness: 0.3,
        }));
        wing.rotation.y = side * Math.PI / 4;
        wing.position.set(side * (bayW * 0.36), bayY, facadeZ + 0.045);
        facade.add(wing);
      }
      
      const bayRoof = new THREE.Mesh(new THREE.ConeGeometry(bayW * 0.62, 0.18, 4), sill);
      bayRoof.position.set(0, bayY + bayH / 2 + 0.09, facadeZ + 0.09);
      bayRoof.rotation.y = Math.PI / 4;
      facade.add(bayRoof);
    }
  }

  // 4. Upper Floor Victorian Sash Windows with Classical Pediments & Sills
  const across = Math.max(1, Math.min(5, Math.floor(facadeWidth / 0.5)));
  const rows = Math.max(2, Math.min(4, Math.floor(height / 0.85)));
  const windowWidth = Math.min(0.24, facadeWidth / (across + 1) * 0.55);
  const windowHeight = Math.min(0.34, height / (rows + 1) * 0.52);
  const doorWidth = Math.min(0.4, facadeWidth * 0.21);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < across; col++) {
      const wx = across === 1 ? 0 : -facadeWidth * 0.34 + (facadeWidth * 0.68 * col) / (across - 1);
      if (row === 0) {
        if (isShop) continue;
        if (Math.abs(wx) < doorWidth / 2 + windowWidth / 2 + 0.1) continue;
      }
      if (row === 1 && index % 3 === 1 && Math.abs(wx) < 0.38) continue;
      const wy = Math.min(height - 0.34, 0.45 + row * Math.min(0.72, (height - 0.6) / (rows)));

      const pane = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, windowHeight, 0.035), glass);
      pane.position.set(wx, wy, facadeZ); facade.add(pane);

      // Mullion & Transom (cross muntins for 4-pane Victorian window)
      const mullionV = new THREE.Mesh(new THREE.BoxGeometry(0.016, windowHeight, 0.045), frame);
      mullionV.position.set(wx, wy, facadeZ + 0.02); facade.add(mullionV);
      const mullionH = new THREE.Mesh(new THREE.BoxGeometry(windowWidth, 0.016, 0.045), frame);
      mullionH.position.set(wx, wy, facadeZ + 0.02); facade.add(mullionH);

      // Window jambs & sills
      for (const offset of [-1, 1]) {
        const jamb = new THREE.Mesh(new THREE.BoxGeometry(0.035, windowHeight + 0.07, 0.055), frame);
        jamb.position.set(wx + offset * (windowWidth / 2 + 0.025), wy, facadeZ + 0.02); facade.add(jamb);
      }
      const sillPiece = new THREE.Mesh(new THREE.BoxGeometry(windowWidth + 0.12, 0.045, 0.1), sill);
      sillPiece.position.set(wx, wy - windowHeight / 2 - 0.045, facadeZ + 0.035); facade.add(sillPiece);

      // Classical Triangular Stone Pediment on upper storey windows (Image 8)
      if (row === 1) {
        const pediment = new THREE.Mesh(new THREE.ConeGeometry(windowWidth * 0.65, 0.08, 3), sill);
        pediment.rotation.z = Math.PI;
        pediment.position.set(wx, wy + windowHeight / 2 + 0.07, facadeZ + 0.035);
        facade.add(pediment);
      }
    }
  }

  // 5. Exterior Base Course, Molded Cornice, String Course, Roof Dormers & Chimney with Flues
  const baseCourse = new THREE.Mesh(new THREE.BoxGeometry(width + 0.08, 0.12, depth + 0.08), sill);
  baseCourse.position.set(center.x, 0.07, center.z); sceneAdd(baseCourse);
  const cornice = new THREE.Mesh(new THREE.BoxGeometry(width + 0.12, 0.1, depth + 0.12), sill);
  cornice.position.set(center.x, height - 0.08, center.z); sceneAdd(cornice);

  // String course separating ground and upper storeys
  const stringCourse = new THREE.Mesh(new THREE.BoxGeometry(facadeWidth + 0.08, 0.06, 0.08), sill);
  stringCourse.position.set(0, Math.min(height * 0.36, 1.3), facadeZ + 0.02);
  facade.add(stringCourse);

  // Victorian Roof Dormers on tall townhouses
  if (height >= 3.2) {
    const dormerCount = Math.max(1, Math.floor(facadeWidth / 1.1));
    for (let d = 0; d < dormerCount; d++) {
      const dx = dormerCount === 1 ? 0 : -facadeWidth * 0.25 + (facadeWidth * 0.5 * d) / (dormerCount - 1);
      const dormer = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.28), wall);
      dormer.position.set(dx, height + roofHeight * 0.42, facadeDepth / 2 - 0.02);
      facade.add(dormer);
      const dormerWin = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.2), glass);
      dormerWin.position.set(dx, height + roofHeight * 0.42, facadeDepth / 2 + 0.125);
      facade.add(dormerWin);
      const dormerRoof = new THREE.Mesh(makeGableRoof(0.28, 0.3, 0.14), roofMat);
      dormerRoof.position.set(dx, height + roofHeight * 0.42 + 0.14, facadeDepth / 2 - 0.02);
      facade.add(dormerRoof);
    }
  }

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.65, 0.2), new THREE.MeshStandardMaterial({ color: 0x292421, roughness: 1 }));
  const chimneyX = center.x + width * 0.22;
  const chimneyZ = center.z - depth * 0.16;
  const chimneyY = height + roofHeight * 0.62;
  chimney.position.set(chimneyX, chimneyY, chimneyZ); sceneAdd(chimney);

  // Terracotta chimney flue pots
  for (const side of [-0.038, 0.038]) {
    const flue = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.035, 0.14, 6), new THREE.MeshStandardMaterial({ color: 0x8a452d, roughness: 0.9 }));
    const flueY = chimneyY + 0.36;
    flue.position.set(chimneyX + side, flueY, chimneyZ);
    sceneAdd(flue);
    chimneyFlues.push(new THREE.Vector3(chimneyX + side, flueY + 0.08, chimneyZ));
  }
}

function nearestStreetFacing(x, y) {
  let closest = { distance: Infinity, dx: 0, dy: 1 };
  for (const path of CITY_PATHS) for (let index = 1; index < path.length; index++) {
    const [ax, ay] = path[index - 1], [bx, by] = path[index];
    const vx = bx - ax, vy = by - ay;
    const t = THREE.MathUtils.clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy), 0, 1);
    const dx = ax + vx * t - x, dy = ay + vy * t - y;
    const distance = Math.hypot(dx, dy);
    if (distance < closest.distance) closest = { distance, dx, dy };
  }
  const sideX = Math.abs(closest.dx) > Math.abs(closest.dy);
  const rotation = sideX ? (closest.dx > 0 ? Math.PI / 2 : -Math.PI / 2) : (closest.dy > 0 ? 0 : Math.PI);
  return { sideX, rotation };
}

function addLandmarks() {
  const brick = new THREE.MeshStandardMaterial({ color: 0x57342b, roughness: 0.9 });
  const stone = new THREE.MeshStandardMaterial({ color: 0x4b5054, roughness: 0.88 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x1c2229, roughness: 0.8 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x161c20, metalness: 0.8, roughness: 0.35 });

  // 1. Scotland Yard gateway and clock-lit police facade.
  addArch(182, 126, 1.45, 1.6, stone, roof);

  // 2. Baker Street's iconic townhouse and brass number plate (Image 8)
  const bakerWidth = 1.48, bakerDepth = 1.35, bakerHeight = 3.65;
  const stuccoMat = new THREE.MeshStandardMaterial({ color: 0xded8cc, roughness: 0.92 });
  const bakerCenter = toVector(523, 126, 0);

  // Upper brick facade (floors 1, 2 & 3)
  const baker = new THREE.Mesh(new THREE.BoxGeometry(bakerWidth, bakerHeight, bakerDepth), brick);
  baker.position.set(bakerCenter.x, bakerHeight / 2, bakerCenter.z);
  baker.castShadow = true; baker.receiveShadow = true; sceneAdd(baker);
  cameraBlockers.push(baker);

  // Ground floor cream stucco rustication
  const bakerGround = new THREE.Mesh(new THREE.BoxGeometry(bakerWidth + 0.04, 1.25, bakerDepth + 0.04), stuccoMat);
  bakerGround.position.set(bakerCenter.x, 0.625, bakerCenter.z);
  bakerGround.receiveShadow = true; sceneAdd(bakerGround);

  // Mansard slate roof
  const bakerRoof = new THREE.Mesh(makeGableRoof(bakerWidth + 0.16, bakerDepth + 0.16, 0.85), roof);
  bakerRoof.position.set(bakerCenter.x, bakerHeight, bakerCenter.z);
  sceneAdd(bakerRoof);

  // Front entrance door (dark green Victorian 6-panel with brass knocker)
  const doorMat = new THREE.MeshStandardMaterial({ color: 0x163426, roughness: 0.65 });
  const bDoor = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.88, 0.05), doorMat);
  bDoor.position.set(bakerCenter.x - 0.38, 0.46, bakerCenter.z + bakerDepth / 2 + 0.035);
  sceneAdd(bDoor);

  // Arched Fanlight window above door
  const fanlight = new THREE.Mesh(new THREE.CircleGeometry(0.18, 16, 0, Math.PI), new THREE.MeshStandardMaterial({
    color: 0xffd188, emissive: 0xff8c1a, emissiveIntensity: 1.4, roughness: 0.3
  }));
  fanlight.position.set(bakerCenter.x - 0.38, 0.94, bakerCenter.z + bakerDepth / 2 + 0.04);
  sceneAdd(fanlight);

  // Ground floor sash window
  const gWin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.62, 0.05), new THREE.MeshStandardMaterial({
    color: 0xffdb99, emissive: 0xd97524, emissiveIntensity: 0.65, roughness: 0.3
  }));
  gWin.position.set(bakerCenter.x + 0.35, 0.58, bakerCenter.z + bakerDepth / 2 + 0.035);
  sceneAdd(gWin);

  // Brass Plaque "221B"
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 }));
  plaque.position.set(bakerCenter.x - 0.38, 0.58, bakerCenter.z + bakerDepth / 2 + 0.065);
  sceneAdd(plaque);
  const houseNumber = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.11), new THREE.MeshBasicMaterial({ map: makeSignTexture('221B'), toneMapped: false }));
  houseNumber.position.set(bakerCenter.x - 0.38, 0.58, bakerCenter.z + bakerDepth / 2 + 0.08);
  sceneAdd(houseNumber);

  // 1st Floor: Sherlock's Study 3-sided Canted Bay Window (Image 8)
  const bayW = 0.88, bayH = 0.76;
  const bayWin = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.58, bayH, 0.24), new THREE.MeshStandardMaterial({
    color: 0xffdb99, emissive: 0xd97524, emissiveIntensity: 1.2, roughness: 0.3
  }));
  bayWin.position.set(bakerCenter.x, 1.72, bakerCenter.z + bakerDepth / 2 + 0.12);
  sceneAdd(bayWin);
  for (const side of [-1, 1]) {
    const bayWing = new THREE.Mesh(new THREE.BoxGeometry(bayW * 0.3, bayH, 0.04), new THREE.MeshStandardMaterial({
      color: 0xffdb99, emissive: 0xd97524, emissiveIntensity: 1.0, roughness: 0.3
    }));
    bayWing.rotation.y = side * Math.PI / 4;
    bayWing.position.set(bakerCenter.x + side * (bayW * 0.38), 1.72, bakerCenter.z + bakerDepth / 2 + 0.06);
    sceneAdd(bayWing);
  }
  const bayRoof = new THREE.Mesh(new THREE.ConeGeometry(bayW * 0.62, 0.22, 4), stone);
  bayRoof.position.set(bakerCenter.x, 1.72 + bayH / 2 + 0.11, bakerCenter.z + bakerDepth / 2 + 0.12);
  bayRoof.rotation.y = Math.PI / 4; sceneAdd(bayRoof);

  // 2nd & 3rd Floor Sash Windows with pediments
  for (const fy of [2.55, 3.22]) {
    for (const side of [-0.36, 0.36]) {
      const uWin = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.42, 0.04), new THREE.MeshStandardMaterial({
        color: 0xffd896, emissive: 0xa4511d, emissiveIntensity: 0.5, roughness: 0.4
      }));
      uWin.position.set(bakerCenter.x + side, fy, bakerCenter.z + bakerDepth / 2 + 0.03);
      sceneAdd(uWin);
      const ped = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.08, 3), stone);
      ped.rotation.z = Math.PI;
      ped.position.set(bakerCenter.x + side, fy + 0.26, bakerCenter.z + bakerDepth / 2 + 0.04);
      sceneAdd(ped);
    }
  }

  // Iconic illuminated Baker Street storefront sign
  const bakerSignBoard = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.32, 0.06), new THREE.MeshStandardMaterial({ color: 0x141a18, roughness: 0.7, metalness: 0.3 }));
  bakerSignBoard.position.set(bakerCenter.x, 1.25, bakerCenter.z + bakerDepth / 2 + 0.07); sceneAdd(bakerSignBoard);
  const bakerSignText = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.28), new THREE.MeshBasicMaterial({ map: makeSignTexture('BAKER STREET', 'CONSULTING DETECTIVE'), toneMapped: false }));
  bakerSignText.position.set(bakerCenter.x, 1.25, bakerCenter.z + bakerDepth / 2 + 0.105); sceneAdd(bakerSignText);
  const bakerSignGlow = new THREE.PointLight(0xf4b45e, 2.0, 4.0);
  bakerSignGlow.position.set(bakerCenter.x, 1.35, bakerCenter.z + bakerDepth / 2 + 0.35); sceneAdd(bakerSignGlow);

  // Wrought iron basement area railings
  addIronRailing(bakerCenter.x - 0.75, bakerCenter.z + bakerDepth / 2 + 0.25, bakerCenter.x + 0.75, bakerCenter.z + bakerDepth / 2 + 0.25, 0.42);

  // Signal Box B & Telegraph Network (738, 306)
  const signalLoc = toVector(738, 306);
  const signalTower = new THREE.Mesh(new THREE.BoxGeometry(0.85, 2.2, 0.72), brick);
  signalTower.position.set(signalLoc.x, 1.1, signalLoc.z); signalTower.castShadow = true; sceneAdd(signalTower);
  cameraBlockers.push(signalTower);
  const signalRoof = new THREE.Mesh(makeGableRoof(1.0, 0.85, 0.45), roof);
  signalRoof.position.set(signalLoc.x, 2.2, signalLoc.z); sceneAdd(signalRoof);
  const signalSign = new THREE.Mesh(new THREE.PlaneGeometry(0.65, 0.18), new THREE.MeshBasicMaterial({
    map: makeSignTexture('SIGNAL BOX B', 'G.W.R. TELEGRAPH'), toneMapped: false
  }));
  signalSign.position.set(signalLoc.x, 1.65, signalLoc.z + 0.37); sceneAdd(signalSign);
  const leverPlate = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.18), ironMat);
  leverPlate.position.set(signalLoc.x, 0.65, signalLoc.z + 0.38); sceneAdd(leverPlate);

  // Commercial Relay Office (874, 410)
  const relayLoc = toVector(874, 410);
  const relayHut = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.0, 0.75), brick);
  relayHut.position.set(relayLoc.x, 1.0, relayLoc.z); relayHut.castShadow = true; sceneAdd(relayHut);
  cameraBlockers.push(relayHut);
  const relayRoof = new THREE.Mesh(makeGableRoof(1.05, 0.88, 0.42), roof);
  relayRoof.position.set(relayLoc.x, 2.0, relayLoc.z); sceneAdd(relayRoof);
  const relaySign = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.18), new THREE.MeshBasicMaterial({
    map: makeSignTexture('COMMERCIAL RELAY', 'EASTERN TELEGRAPH CO.'), toneMapped: false
  }));
  relaySign.position.set(relayLoc.x, 1.55, relayLoc.z + 0.385); sceneAdd(relaySign);

  // 3. Iron-and-glass station canopy beside the rails.
  addStationCanopy(810, 336);
  addDockCrane(770, 420);
  const stationCenter = toVector(810, 336);
  const stationBoard = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.34, 0.09), new THREE.MeshStandardMaterial({ color: 0x25211b, roughness: 0.82 }));
  stationBoard.position.set(stationCenter.x, 1.72, stationCenter.z + 0.76); stationBoard.castShadow = true; sceneAdd(stationBoard);
  const stationText = new THREE.Mesh(new THREE.PlaneGeometry(1.12, 0.25), new THREE.MeshBasicMaterial({ map: makeSignTexture('EAST LONDON', 'PASSENGER TERMINAL'), toneMapped: false }));
  stationText.position.set(stationCenter.x, 1.72, stationCenter.z + 0.812); sceneAdd(stationText);

  // 4. Blackthorn Safehouse & Warehouse & Grand Victorian Mansion (480, 555)
  const safehouseCenter = toVector(480, 555);
  const warehouseWall = new THREE.MeshStandardMaterial({ color: 0x3d2b24, roughness: 0.94 });

  // Main warehouse brick block (preserved for test compatibility)
  const warehouse = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.8, 1.8), warehouseWall);
  warehouse.position.set(safehouseCenter.x - 2.8, 1.4, safehouseCenter.z + 1.2);
  warehouse.castShadow = true; warehouse.receiveShadow = true;
  sceneAdd(warehouse);
  cameraBlockers.push(warehouse);

  // Warehouse gable roof
  const whRoof = new THREE.Mesh(makeGableRoof(2.5, 1.9, 0.8), roof);
  whRoof.position.set(safehouseCenter.x - 2.8, 2.8, safehouseCenter.z + 1.2);
  sceneAdd(whRoof);

  // Hoist Jib Boom extending from gable
  const hoistBeam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.95), ironMat);
  hoistBeam.position.set(safehouseCenter.x - 2.8, 3.1, safehouseCenter.z + 0.4);
  sceneAdd(hoistBeam);
  const hoistRope = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 1.1, 4), new THREE.MeshStandardMaterial({ color: 0x7a6348 }));
  hoistRope.position.set(safehouseCenter.x - 2.8, 2.55, safehouseCenter.z - 0.05);
  sceneAdd(hoistRope);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.008, 4, 12, Math.PI * 1.5), ironMat);
  hook.position.set(safehouseCenter.x - 2.8, 2.0, safehouseCenter.z - 0.05);
  sceneAdd(hook);

  // Arched double cargo doors
  const cargoDoor = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.06), new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.85 }));
  cargoDoor.position.set(safehouseCenter.x - 2.8, 0.65, safehouseCenter.z + 0.28);
  sceneAdd(cargoDoor);

  // Warehouse Sign
  const whSign = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.28), new THREE.MeshBasicMaterial({
    map: makeSignTexture('BLACKTHORN & CO.', 'BONDED WAREHOUSE'), toneMapped: false
  }));
  whSign.position.set(safehouseCenter.x - 2.8, 1.95, safehouseCenter.z + 0.285);
  sceneAdd(whSign);

  // --- GRAND VICTORIAN BLACKTHORN HOUSE ESTATE (PANELS 3, 4, 5, 6, 8, 9) ---
  const mansionStone = new THREE.MeshStandardMaterial({ color: 0x363b42, roughness: 0.85, metalness: 0.1 });
  const mansionWood = new THREE.MeshStandardMaterial({ color: 0x2e1f14, roughness: 0.58, metalness: 0.12 });
  const crimsonCarpetMat = new THREE.MeshStandardMaterial({ color: 0x7a1824, roughness: 0.95 });
  const goldMetalMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.25, metalness: 0.88 });
  const clockWoodMat = new THREE.MeshStandardMaterial({ color: 0x381f12, roughness: 0.48, metalness: 0.18 });

  // A. Entrance Courtyard Wrought Iron Gate & Stone Pillars
  const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x1a1e22, metalness: 0.85, roughness: 0.32 });
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.36, 1.95, 0.36), stone);
    post.position.set(safehouseCenter.x + side * 1.45, 0.98, safehouseCenter.z);
    post.castShadow = true; post.receiveShadow = true; sceneAdd(post);

    // Gas lantern on top of each gate pillar
    const postLantern = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.32, 0.22), goldMetalMat);
    postLantern.position.set(safehouseCenter.x + side * 1.45, 2.15, safehouseCenter.z);
    sceneAdd(postLantern);
    const postLight = new THREE.PointLight(0xffbe6b, 1.6, 5.5, 2);
    postLight.position.set(safehouseCenter.x + side * 1.45, 2.18, safehouseCenter.z);
    sceneAdd(postLight);
  }

  // Wrought iron gate leaves (swingable)
  const gateLeftPivot = new THREE.Group();
  gateLeftPivot.position.set(safehouseCenter.x - 1.25, 0, safehouseCenter.z);
  sceneAdd(gateLeftPivot);
  const gateLeftMesh = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.65, 0.05), gateMaterial);
  gateLeftMesh.position.set(0.61, 0.85, 0); gateLeftPivot.add(gateLeftMesh);
  mansionInteractions.gateLeft = gateLeftPivot;

  const gateRightPivot = new THREE.Group();
  gateRightPivot.position.set(safehouseCenter.x + 1.25, 0, safehouseCenter.z);
  sceneAdd(gateRightPivot);
  const gateRightMesh = new THREE.Mesh(new THREE.BoxGeometry(1.22, 1.65, 0.05), gateMaterial);
  gateRightMesh.position.set(-0.61, 0.85, 0); gateRightPivot.add(gateRightMesh);
  mansionInteractions.gateRight = gateRightPivot;

  // Gilded Estate Nameplate on Gate
  const manorGateSign = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.26), new THREE.MeshBasicMaterial({
    map: makeSignTexture('BLACKTHORN HOUSE', 'PRIVATE RESIDENCE · 1895'), toneMapped: false
  }));
  manorGateSign.position.set(safehouseCenter.x, 1.82, safehouseCenter.z - 0.04);
  sceneAdd(manorGateSign);

  // Boundary Stone Wall with Iron Spikes
  for (const side of [-1, 1]) {
    const bWall = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.4, 0.24), stone);
    bWall.position.set(safehouseCenter.x + side * 3.4, 0.7, safehouseCenter.z);
    bWall.castShadow = true; bWall.receiveShadow = true; sceneAdd(bWall);
  }

  // B. Grand Entrance Hall (Center Foyer, Panels 4 & 8)
  const hallCenterZ = safehouseCenter.z + 3.8;
  const hallFloor = new THREE.Mesh(
    new THREE.BoxGeometry(6.8, 0.06, 6.4),
    new THREE.MeshStandardMaterial({ color: 0x2c2016, roughness: 0.42, metalness: 0.28, map: sharedWoodTexture || makeWoodTexture() })
  );
  hallFloor.position.set(safehouseCenter.x, 0.03, hallCenterZ);
  hallFloor.receiveShadow = true; sceneAdd(hallFloor);

  // Exterior Mansion Front Facade with Gothic Portico
  const facadeL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.8, 0.32), mansionStone);
  facadeL.position.set(safehouseCenter.x - 2.2, 1.9, safehouseCenter.z + 0.8);
  facadeL.castShadow = true; facadeL.receiveShadow = true; sceneAdd(facadeL);
  cameraBlockers.push(facadeL);

  const facadeR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3.8, 0.32), mansionStone);
  facadeR.position.set(safehouseCenter.x + 2.2, 1.9, safehouseCenter.z + 0.8);
  facadeR.castShadow = true; facadeR.receiveShadow = true; sceneAdd(facadeR);
  cameraBlockers.push(facadeR);

  // Portico Arch above main door
  const porticoArch = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 0.38), mansionStone);
  porticoArch.position.set(safehouseCenter.x, 3.2, safehouseCenter.z + 0.8);
  sceneAdd(porticoArch);

  // Double Arched Oak Entrance Doors
  const manorDoor = new THREE.Mesh(new THREE.BoxGeometry(1.6, 2.4, 0.08), mansionWood);
  manorDoor.position.set(safehouseCenter.x, 1.2, safehouseCenter.z + 0.82);
  sceneAdd(manorDoor);

  // Grand Sweeping Staircase with Crimson Carpet
  const stairGroup = new THREE.Group();
  stairGroup.position.set(safehouseCenter.x, 0, hallCenterZ + 2.2);
  for (let s = 0; s < 7; s++) {
    const stepWood = mesh(new THREE.BoxGeometry(2.8 - s * 0.12, 0.18, 0.34), mansionWood, 0, s * 0.18 + 0.09, -s * 0.3);
    const stepCarpet = mesh(new THREE.BoxGeometry(1.4, 0.02, 0.34), crimsonCarpetMat, 0, s * 0.18 + 0.19, -s * 0.3);
    stairGroup.add(stepWood, stepCarpet);
  }
  sceneAdd(stairGroup);

  // Upper Balcony Landing
  const balcony = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.18, 1.8), mansionWood);
  balcony.position.set(safehouseCenter.x, 1.44, hallCenterZ + 2.8);
  balcony.castShadow = true; sceneAdd(balcony);

  // Grand Brass Candelabra Chandelier hanging from high ceiling
  const chandGroup = new THREE.Group();
  chandGroup.position.set(safehouseCenter.x, 2.9, hallCenterZ);
  const chandStem = mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.1, 6), goldMetalMat, 0, 0.55, 0);
  const chandRing = mesh(new THREE.TorusGeometry(0.55, 0.035, 6, 18), goldMetalMat, 0, 0, 0);
  chandRing.rotation.x = Math.PI / 2;
  chandGroup.add(chandStem, chandRing);
  for (let c = 0; c < 8; c++) {
    const angle = (c * 45) * (Math.PI / 180);
    const candle = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), new THREE.MeshBasicMaterial({ color: 0xffe9b8 }), Math.cos(angle) * 0.55, 0.08, Math.sin(angle) * 0.55);
    chandGroup.add(candle);
  }
  const chandLight = new THREE.PointLight(0xffbe6b, 2.4, 9.5, 2);
  chandLight.position.set(0, -0.1, 0);
  chandGroup.add(chandLight);
  sceneAdd(chandGroup);

  // Gilded Oil Paintings along Entrance Hall Walls
  for (const side of [-1, 1]) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.95, 0.72), goldMetalMat);
    frame.position.set(safehouseCenter.x + side * 3.3, 1.6, hallCenterZ);
    sceneAdd(frame);
    const canvasArt = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.88), new THREE.MeshBasicMaterial({ map: makePortraitTexture() }));
    canvasArt.position.set(safehouseCenter.x + side * 3.26, 1.6, hallCenterZ);
    canvasArt.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
    sceneAdd(canvasArt);
  }

  // Marble Statue on Pedestal
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.82, 8), stone);
  plinth.position.set(safehouseCenter.x - 2.5, 0.41, hallCenterZ - 1.2); sceneAdd(plinth);
  const bust = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 10), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.32 }));
  bust.position.set(safehouseCenter.x - 2.5, 0.98, hallCenterZ - 1.2); sceneAdd(bust);

  // C. The Study Wing (East Wing, Panel 5 & 8)
  const studyCenterX = safehouseCenter.x + 5.2;
  const studyCenterZ = hallCenterZ;
  const studyFloor = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.06, 6.2),
    new THREE.MeshStandardMaterial({ color: 0x362316, roughness: 0.52, map: sharedWoodTexture || makeWoodTexture() })
  );
  studyFloor.position.set(studyCenterX, 0.03, studyCenterZ);
  sceneAdd(studyFloor);

  // Study East Wall & Fireplace
  const studyWallE = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 6.2), mansionStone);
  studyWallE.position.set(studyCenterX + 2.1, 1.7, studyCenterZ); sceneAdd(studyWallE);
  cameraBlockers.push(studyWallE);

  // Fireplace with warm flickering hearth
  const fireplace = new THREE.Mesh(new THREE.BoxGeometry(0.65, 1.45, 1.65), stone);
  fireplace.position.set(studyCenterX + 1.8, 0.72, studyCenterZ); sceneAdd(fireplace);
  const fireGlow = new THREE.PointLight(0xff7a22, 2.2, 4.5, 2);
  fireGlow.position.set(studyCenterX + 1.5, 0.45, studyCenterZ); sceneAdd(fireGlow);

  // Executive Victorian Oak Desk
  const deskMesh = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.76, 0.95), mansionWood);
  deskMesh.position.set(studyCenterX, 0.38, studyCenterZ + 0.4);
  deskMesh.castShadow = true; sceneAdd(deskMesh);

  // London Map on desk
  const deskMap = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.52), new THREE.MeshBasicMaterial({ color: 0xecd9b5 }));
  deskMap.rotation.x = -Math.PI / 2;
  deskMap.position.set(studyCenterX, 0.77, studyCenterZ + 0.4); sceneAdd(deskMap);

  // Green glass banker's lamp
  const bankerLamp = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 6), goldMetalMat);
  bankerLamp.position.set(studyCenterX + 0.55, 0.92, studyCenterZ + 0.4); sceneAdd(bankerLamp);
  const bankerShade = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.1), new THREE.MeshStandardMaterial({ color: 0x228b44, roughness: 0.2 }));
  bankerShade.position.set(studyCenterX + 0.55, 1.08, studyCenterZ + 0.4); sceneAdd(bankerShade);
  const bankerLight = new THREE.PointLight(0x76ff88, 0.8, 2.2);
  bankerLight.position.set(studyCenterX + 0.55, 1.05, studyCenterZ + 0.4); sceneAdd(bankerLight);

  // --- THE GRANDFATHER CLOCK (PANEL 5 PUZZLE) ---
  const clockGroup = new THREE.Group();
  clockGroup.position.set(studyCenterX - 0.85, 0, studyCenterZ - 2.5);

  // Mahogany case
  const clockBody = mesh(new THREE.BoxGeometry(0.56, 2.25, 0.38), clockWoodMat, 0, 1.12, 0);
  const clockCrown = mesh(new THREE.ConeGeometry(0.38, 0.32, 4), clockWoodMat, 0, 2.38, 0);
  clockCrown.rotation.y = Math.PI / 4;
  clockGroup.add(clockBody, clockCrown);

  // Dial face
  const dialMesh = new THREE.Mesh(new THREE.CircleGeometry(0.21, 24), new THREE.MeshBasicMaterial({ map: makeClockDialTexture() }));
  dialMesh.position.set(0, 1.82, 0.195);
  clockGroup.add(dialMesh);

  // Movable Hour Hand
  const hourHandPivot = new THREE.Group();
  hourHandPivot.position.set(0, 1.82, 0.20);
  const hourHand = mesh(new THREE.BoxGeometry(0.016, 0.11, 0.008), goldMetalMat, 0, 0.05, 0);
  hourHandPivot.add(hourHand);
  clockGroup.add(hourHandPivot);
  mansionInteractions.clockHourHand = hourHandPivot;

  // Movable Minute Hand
  const minuteHandPivot = new THREE.Group();
  minuteHandPivot.position.set(0, 1.82, 0.205);
  const minuteHand = mesh(new THREE.BoxGeometry(0.012, 0.15, 0.008), goldMetalMat, 0, 0.07, 0);
  minuteHandPivot.add(minuteHand);
  clockGroup.add(minuteHandPivot);
  mansionInteractions.clockMinuteHand = minuteHandPivot;

  // Glass pendulum door and swinging brass pendulum
  const pendulumPivot = new THREE.Group();
  pendulumPivot.position.set(0, 1.35, 0.08);
  const pendRod = mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 4), goldMetalMat, 0, -0.27, 0);
  const pendBob = mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), goldMetalMat, 0, -0.55, 0);
  pendBob.rotation.x = Math.PI / 2;
  pendulumPivot.add(pendRod, pendBob);
  clockGroup.add(pendulumPivot);
  mansionInteractions.pendulum = pendulumPivot;

  sceneAdd(clockGroup);

  // D. The Library Wing (West Wing, Panel 6 Puzzle)
  const libCenterX = safehouseCenter.x - 5.2;
  const libCenterZ = hallCenterZ;
  const libFloor = new THREE.Mesh(
    new THREE.BoxGeometry(4.2, 0.06, 6.2),
    new THREE.MeshStandardMaterial({ color: 0x281912, roughness: 0.55, map: sharedWoodTexture || makeWoodTexture() })
  );
  libFloor.position.set(libCenterX, 0.03, libCenterZ); sceneAdd(libFloor);

  // Library West Wall
  const libWallW = new THREE.Mesh(new THREE.BoxGeometry(0.32, 3.4, 6.2), mansionStone);
  libWallW.position.set(libCenterX - 2.1, 1.7, libCenterZ); sceneAdd(libWallW);
  cameraBlockers.push(libWallW);

  // Massive Oak Bookcases lined with leather books
  const bookcase = new THREE.Mesh(new THREE.BoxGeometry(0.48, 2.7, 3.8), mansionWood);
  bookcase.position.set(libCenterX - 1.8, 1.35, libCenterZ); sceneAdd(bookcase);

  // Rolling library brass ladder
  const ladder = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.8, 6), goldMetalMat);
  ladder.position.set(libCenterX - 1.45, 1.35, libCenterZ - 0.6);
  ladder.rotation.z = -0.16; sceneAdd(ladder);

  // --- THE 5 INTERACTIVE ROMAN NUMERAL BOOKS (PANEL 6 PUZZLE) ---
  const numerals = ['I', 'II', 'III', 'IV', 'V'];
  mansionInteractions.books = [];
  const bookShelfGroup = new THREE.Group();
  bookShelfGroup.position.set(libCenterX - 1.5, 1.25, libCenterZ);
  for (let b = 0; b < 5; b++) {
    const bookMat = new THREE.MeshStandardMaterial({
      roughness: 0.45,
      map: makeLibraryBookTexture(numerals[b], false)
    });
    const bookMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.38, 0.28), bookMat);
    bookMesh.position.set(0, 0, (b - 2) * 0.18);
    bookShelfGroup.add(bookMesh);
    mansionInteractions.books.push(bookMesh);
  }
  sceneAdd(bookShelfGroup);

  // E. Secret Passage & The Thief's Portrait Chamber (Panels 8 & 9)
  const cryptZ = hallCenterZ + 4.8;
  const cryptFloor = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.06, 4.4), stone);
  cryptFloor.position.set(safehouseCenter.x, 0.03, cryptZ); sceneAdd(cryptFloor);

  // --- BASEMENT MECHANISM CRYPTEX PEDESTAL (Panel 11 Art Reference) ---
  const cryptexPedestal = new THREE.Group();
  cryptexPedestal.position.set(safehouseCenter.x, 0, hallCenterZ + 2.2);

  const cryptexPlinth = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 0.85, 8), mansionStone);
  cryptexPlinth.position.y = 0.425;
  cryptexPlinth.castShadow = true;
  cryptexPedestal.add(cryptexPlinth);

  const cradle = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.12, 0.32), goldMetalMat);
  cradle.position.y = 0.88;
  cryptexPedestal.add(cradle);

  const cryptexGroup = new THREE.Group();
  cryptexGroup.position.set(0, 0.98, 0);
  cryptexGroup.rotation.z = Math.PI / 2;

  const brassRingMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
  const darkRingMat = new THREE.MeshStandardMaterial({ color: 0x1f1a14, metalness: 0.4, roughness: 0.6 });

  const cryptexRings = [];
  for (let r = 0; r < 4; r++) {
    const ringGroup = new THREE.Group();
    const ringMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.11, 16), brassRingMat);
    const bandMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.145, 0.145, 0.04, 16), darkRingMat);
    ringGroup.add(ringMesh, bandMesh);
    ringGroup.position.y = (r - 1.5) * 0.13;
    cryptexGroup.add(ringGroup);
    cryptexRings.push(ringGroup);
  }
  cryptexPedestal.add(cryptexGroup);

  const cryptexLight = new THREE.PointLight(0xffb74d, 1.8, 3.2);
  cryptexLight.position.set(0, 1.35, 0);
  cryptexPedestal.add(cryptexLight);

  sceneAdd(cryptexPedestal);
  mansionInteractions.cryptexPedestal = cryptexPedestal;
  mansionInteractions.cryptexRings = cryptexRings;
  mansionInteractions.cryptexLight = cryptexLight;

  // Secret stone sliding door
  const secretDoor = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2.6, 0.25), mansionStone);
  secretDoor.position.set(safehouseCenter.x, 1.3, hallCenterZ + 2.7);
  sceneAdd(secretDoor);
  mansionInteractions.secretDoor = secretDoor;

  // Torch Sconces in crypt
  for (const side of [-1, 1]) {
    const sconce = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.24, 0.16), ironMat);
    sconce.position.set(safehouseCenter.x + side * 1.9, 1.6, cryptZ); sceneAdd(sconce);
    const torchLight = new THREE.PointLight(0xff6e1c, 1.8, 4.8, 2);
    torchLight.position.set(safehouseCenter.x + side * 1.7, 1.7, cryptZ); sceneAdd(torchLight);
  }

  // --- THE OIL PORTRAIT OF EDWARD BLACKTHORN (PANEL 9 REVEAL) ---
  const portraitFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.95, 0.08), goldMetalMat);
  portraitFrame.position.set(safehouseCenter.x, 1.6, cryptZ + 1.8);
  portraitFrame.castShadow = true; sceneAdd(portraitFrame);

  const portraitCanvas = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 1.76),
    new THREE.MeshBasicMaterial({ map: makePortraitTexture() })
  );
  portraitCanvas.position.set(safehouseCenter.x, 1.6, cryptZ + 1.75);
  sceneAdd(portraitCanvas);
  mansionInteractions.portraitMesh = portraitCanvas;

  // Spotlight illuminating the portrait
  const portraitSpotlight = new THREE.PointLight(0xffd77a, 2.8, 4.2);
  portraitSpotlight.position.set(safehouseCenter.x, 2.4, cryptZ + 1.0);
  sceneAdd(portraitSpotlight);

  // 5. Hanging Tavern Sign in St. Jude Alley (300, 414)
  const alleyLoc = toVector(300, 414);
  const tavernBracket = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), ironMat);
  tavernBracket.position.set(alleyLoc.x - 0.45, 1.85, alleyLoc.z);
  sceneAdd(tavernBracket);
  const tavernSign = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.42), new THREE.MeshStandardMaterial({ color: 0x1f1812, roughness: 0.8 }));
  tavernSign.position.set(alleyLoc.x - 0.45, 1.62, alleyLoc.z);
  sceneAdd(tavernSign);
  const tavernSignFace = new THREE.Mesh(new THREE.PlaneGeometry(0.38, 0.28), new THREE.MeshBasicMaterial({
    map: makeSignTexture('THE BLACKTHORN INN'), toneMapped: false
  }));
  tavernSignFace.position.set(alleyLoc.x - 0.432, 1.62, alleyLoc.z);
  tavernSignFace.rotation.y = Math.PI / 2;
  sceneAdd(tavernSignFace);

  // 6. Westminster Archway (315, 235)
  const archLoc = toVector(315, 235);
  const archStone = new THREE.MeshStandardMaterial({ color: 0x484c50, roughness: 0.9 });
  for (const side of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.28, 1.75, 0.35), archStone);
    p.position.set(archLoc.x + side * 0.9, 0.88, archLoc.z);
    p.castShadow = true;
    sceneAdd(p);
  }
  const archSpan = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.28, 0.38), archStone);
  archSpan.position.set(archLoc.x, 1.85, archLoc.z);
  archSpan.castShadow = true;
  sceneAdd(archSpan);
  const carriageLantern = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.2, 0.14), new THREE.MeshStandardMaterial({
    color: 0xffd188, emissive: 0xff9422, emissiveIntensity: 2.1, roughness: 0.2
  }));
  carriageLantern.position.set(archLoc.x, 1.65, archLoc.z);
  sceneAdd(carriageLantern);
  const archLight = new THREE.PointLight(0xfda340, 1.5, 4.8, 2);
  archLight.position.set(archLoc.x, 1.65, archLoc.z);
  sceneAdd(archLight);
}

function addArch(x, y, width, height, wall, roof) {
  const center = toVector(x, y);
  const stoneMat = new THREE.MeshStandardMaterial({ color: 0x5a5852, roughness: 0.88 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x161c20, metalness: 0.8, roughness: 0.35 });

  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.32, height, 0.42), wall);
    pillar.position.set(center.x + side * width / 2, height / 2, center.z);
    pillar.castShadow = true; pillar.receiveShadow = true;
    sceneAdd(pillar);

    // Ashlar stone quoins along Scotland Yard entrance gateway
    for (let qy = 0.16; qy < height; qy += 0.24) {
      const isLong = Math.round(qy / 0.24) % 2 === 0;
      const qw = isLong ? 0.38 : 0.32;
      const quoin = new THREE.Mesh(new THREE.BoxGeometry(qw, 0.18, 0.46), stoneMat);
      quoin.position.set(center.x + side * width / 2, qy, center.z);
      sceneAdd(quoin);
    }

    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.12, 0.52), stoneMat);
    cap.position.set(center.x + side * width / 2, height + 0.04, center.z);
    sceneAdd(cap);
  }

  const beam = new THREE.Mesh(new THREE.BoxGeometry(width + 0.38, 0.32, 0.46), roof);
  beam.position.set(center.x, height + 0.14, center.z);
  beam.castShadow = true;
  sceneAdd(beam);

  const clock = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16), new THREE.MeshStandardMaterial({
    color: 0xffdf99, emissive: 0xb57822, emissiveIntensity: 0.85
  }));
  clock.rotation.x = Math.PI / 2;
  clock.position.set(center.x, height + 0.14, center.z + 0.25);
  sceneAdd(clock);

  // Metropolitan Police Lintel Inscription
  const plaque = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.24, 0.04), new THREE.MeshStandardMaterial({ color: 0x151b22, roughness: 0.7 }));
  plaque.position.set(center.x, height + 0.42, center.z + 0.2);
  sceneAdd(plaque);
  const plaqueText = new THREE.Mesh(new THREE.PlaneGeometry(1.28, 0.22), new THREE.MeshBasicMaterial({
    map: makeSignTexture('SCOTLAND YARD', 'METROPOLITAN POLICE'), toneMapped: false
  }));
  plaqueText.position.set(center.x, height + 0.42, center.z + 0.225);
  sceneAdd(plaqueText);

  // Iconic Blue Metropolitan Police Lantern
  const blueLampPost = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 6), ironMat);
  blueLampPost.position.set(center.x + width / 2 + 0.22, 1.15, center.z + 0.22);
  sceneAdd(blueLampPost);

  const blueGlass = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), new THREE.MeshStandardMaterial({
    color: 0x3b82f6, emissive: 0x1d4ed8, emissiveIntensity: 2.2, roughness: 0.15
  }));
  blueGlass.position.set(center.x + width / 2 + 0.22, 1.35, center.z + 0.22);
  sceneAdd(blueGlass);

  const blueLight = new THREE.PointLight(0x3882f6, 1.6, 4.5, 2);
  blueLight.position.set(center.x + width / 2 + 0.22, 1.35, center.z + 0.22);
  sceneAdd(blueLight);

  // Freestanding Hexagonal Scotland Yard Street Signpost on Fluted Column
  const yardPost = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 1.35, 8), ironMat);
  yardPost.position.set(center.x - width / 2 - 0.52, 0.675, center.z + 0.38);
  sceneAdd(yardPost);
  const yardBox = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 6), new THREE.MeshStandardMaterial({
    color: 0x12171e, roughness: 0.65, metalness: 0.25
  }));
  yardBox.position.set(center.x - width / 2 - 0.52, 1.48, center.z + 0.38);
  sceneAdd(yardBox);
  const yardBoxFace = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.2), new THREE.MeshBasicMaterial({
    map: makeSignTexture('SCOTLAND', 'YARD'), toneMapped: false
  }));
  yardBoxFace.position.set(center.x - width / 2 - 0.52, 1.48, center.z + 0.6);
  sceneAdd(yardBoxFace);

  // Wrought iron gate between pillars
  for (const side of [-1, 1]) {
    const gatePanel = new THREE.Mesh(new THREE.BoxGeometry(width / 2 - 0.08, height * 0.75, 0.04), ironMat);
    gatePanel.position.set(center.x + side * (width / 4), (height * 0.75) / 2, center.z);
    sceneAdd(gatePanel);
  }

  // Scotland Yard Seal Registry Desk (252, 182)
  const registryLoc = toVector(252, 182);
  const deskMat = new THREE.MeshStandardMaterial({ color: 0x2e1f16, roughness: 0.65, map: sharedWoodTexture || makeWoodTexture() });
  const registryDesk = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.72, 0.52), deskMat);
  registryDesk.position.set(registryLoc.x, 0.36, registryLoc.z);
  registryDesk.castShadow = true; sceneAdd(registryDesk);
  const registryBook = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.04, 0.24), new THREE.MeshStandardMaterial({ color: 0xc8b898, roughness: 0.4 }));
  registryBook.position.set(registryLoc.x - 0.12, 0.74, registryLoc.z);
  sceneAdd(registryBook);
  const waxStamp = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, 0.1, 8), new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 }));
  waxStamp.position.set(registryLoc.x + 0.16, 0.77, registryLoc.z);
  sceneAdd(waxStamp);

  // Crime scene chalk outline & forensic ink exhibit on cobblestones (112, 108)
  const crimeScene = toVector(112, 108);
  const chalkShape = new THREE.Mesh(
    new THREE.RingGeometry(0.35, 0.38, 20),
    new THREE.MeshBasicMaterial({ color: 0xdedede, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
  );
  chalkShape.rotation.x = -Math.PI / 2;
  chalkShape.position.set(crimeScene.x, 0.012, crimeScene.z);
  sceneAdd(chalkShape);

  // Spilled dark glossy ink puddle on wet cobbles
  const inkPuddle = new THREE.Mesh(
    new THREE.CircleGeometry(0.26, 16),
    new THREE.MeshStandardMaterial({ color: 0x080512, roughness: 0.08, metalness: 0.88, depthWrite: false })
  );
  inkPuddle.rotation.x = -Math.PI / 2;
  inkPuddle.position.set(crimeScene.x + 0.14, 0.013, crimeScene.z + 0.08);
  sceneAdd(inkPuddle);

  // Broken glass ink vial fragments
  const brokenVial = new THREE.Mesh(
    new THREE.CylinderGeometry(0.022, 0.03, 0.07, 6),
    new THREE.MeshStandardMaterial({ color: 0x1a2e3b, roughness: 0.2, metalness: 0.5, transparent: true, opacity: 0.8 })
  );
  brokenVial.rotation.z = Math.PI / 2.5;
  brokenVial.position.set(crimeScene.x + 0.22, 0.022, crimeScene.z + 0.08);
  sceneAdd(brokenVial);

  // Police Caution Tripod Stanchion
  const policeTripod = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.58, 3), new THREE.MeshStandardMaterial({ color: 0xd4a028, roughness: 0.5 }));
  policeTripod.position.set(crimeScene.x - 0.32, 0.29, crimeScene.z - 0.22);
  sceneAdd(policeTripod);
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

function addDockCrane(x, y) {
  const center = toVector(x, y);
  const iron = new THREE.MeshStandardMaterial({ color: 0x1d2226, metalness: 0.8, roughness: 0.42 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x2e241c, roughness: 0.88 });
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.6, 6), iron);
  tower.position.set(center.x, 1.3, center.z);
  tower.castShadow = true; sceneAdd(tower);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.55, 0.72), wood);
  cab.position.set(center.x, 2.5, center.z);
  cab.castShadow = true; sceneAdd(cab);
  const boom = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 3.2), iron);
  boom.position.set(center.x, 3.2, center.z - 1.1);
  boom.rotation.x = Math.PI / 5.2;
  boom.castShadow = true; sceneAdd(boom);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.4, 4), iron);
  cable.position.set(center.x, 2.4, center.z - 2.2);
  sceneAdd(cable);
  const lantern = new THREE.PointLight(0xf4b45e, 1.6, 4.8);
  lantern.position.set(center.x, 3.1, center.z - 2.2);
  sceneAdd(lantern);
}

function addLamp(x, y, index) {
  const location = toVector(x, y);
  const iron = new THREE.MeshStandardMaterial({ color: 0x171c20, metalness: 0.74, roughness: 0.38 });
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.055, 1.18, 7), iron);
  post.position.set(location.x, 0.59, location.z); post.castShadow = true; sceneAdd(post);

  // Decorative Victorian cross-arm and lantern cap
  const crossArm = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.024, 0.024), iron);
  crossArm.position.set(location.x, 1.14, location.z); sceneAdd(crossArm);
  const lanternCap = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.09, 4), iron);
  lanternCap.position.set(location.x, 1.39, location.z); lanternCap.rotation.y = Math.PI / 4; sceneAdd(lanternCap);

  // Glowing lantern glass
  const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.17), new THREE.MeshStandardMaterial({
    color: 0xffd188, emissive: 0xff9922, emissiveIntensity: 2.2, roughness: 0.2
  }));
  lantern.position.set(location.x, 1.25, location.z); sceneAdd(lantern);

  // Volumetric warm gaslight bloom halo sprite
  const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getLampGlowMap(),
    color: 0xffd690,
    transparent: true,
    opacity: 0.78,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  glowSprite.position.set(location.x, 1.25, location.z);
  glowSprite.scale.set(1.45, 1.45, 1.45);
  sceneAdd(glowSprite);

  let light = null;
  if (index % 2 === 0) {
    light = new THREE.PointLight(0xfda340, 1.45, 5.2, 1.8);
    light.position.set(location.x, 1.28, location.z); sceneAdd(light);
  }

  // Reflected amber light pool on wet cobbles
  const pool = new THREE.Mesh(new THREE.CircleGeometry(0.95, 20), new THREE.MeshBasicMaterial({
    color: 0xf4a642, transparent: true, opacity: 0.16, depthWrite: false
  }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(location.x, 0.009, location.z); sceneAdd(pool);

  gasLampObjects.push({
    light,
    glow: glowSprite,
    baseIntensity: 1.45,
    baseScale: 1.45,
    seed: index * 1.618,
  });
}

function addStreetProps() {
  sharedWoodTexture ||= makeWoodTexture();
  const woodMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a4332, roughness: 0.88, metalness: 0.04, map: sharedWoodTexture
  });
  const ironMaterial = new THREE.MeshStandardMaterial({
    color: 0x1a1e22, roughness: 0.6, metalness: 0.7
  });

  // Street cargo crate clusters and whisky barrels along key corners
  const propLocations = [
    { x: 195, y: 165, crates: 2, barrels: 1 },
    { x: 320, y: 220, crates: 1, barrels: 2 },
    { x: 515, y: 175, crates: 2, barrels: 1 },
    { x: 675, y: 250, crates: 3, barrels: 2 },
    { x: 790, y: 340, crates: 2, barrels: 2 },
    { x: 705, y: 435, crates: 1, barrels: 1 },
    { x: 465, y: 535, crates: 2, barrels: 2 },
    { x: 315, y: 425, crates: 1, barrels: 2 },
  ];

  propLocations.forEach((loc, idx) => {
    const base = toVector(loc.x, loc.y);
    // Crates
    for (let c = 0; c < loc.crates; c++) {
      const size = 0.22 + (c * 0.04);
      const crate = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), woodMaterial);
      const offsetX = (c === 0 ? 0 : 0.22) * (idx % 2 === 0 ? 1 : -1);
      const offsetZ = (c === 2 ? 0.2 : 0);
      crate.position.set(base.x + offsetX, size / 2, base.z + offsetZ);
      crate.rotation.y = (idx + c) * 0.45;
      crate.castShadow = true; crate.receiveShadow = true;
      sceneAdd(crate);
    }
    // Barrels
    for (let b = 0; b < loc.barrels; b++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.32, 10), woodMaterial);
      const offsetX = (b === 0 ? -0.25 : -0.42) * (idx % 2 === 0 ? 1 : -1);
      barrel.position.set(base.x + offsetX, 0.16, base.z + b * 0.15);
      barrel.castShadow = true; barrel.receiveShadow = true;
      sceneAdd(barrel);
      // Iron hoops
      for (const hoopY of [-0.09, 0.09]) {
        const hoop = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.125, 0.02, 10), ironMaterial);
        hoop.position.set(barrel.position.x, 0.16 + hoopY, barrel.position.z);
        sceneAdd(hoop);
      }
    }
    // Sidewalk Cast-Iron Bollard
    const bollard = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.42, 8), ironMaterial);
    bollard.position.set(base.x + 0.35, 0.21, base.z - 0.2);
    bollard.castShadow = true;
    sceneAdd(bollard);
    const bollardTop = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), ironMaterial);
    bollardTop.position.set(bollard.position.x, 0.43, bollard.position.z);
    sceneAdd(bollardTop);
  });

  // Victorian Hansom Cabs parked along curbs
  addHansomCab(555, 128, -Math.PI / 2);
  addHansomCab(275, 435, 0);
  addHansomCab(775, 370, Math.PI / 4);

  // Victorian Cast-Iron & Mahogany Street Benches
  addStreetBench(822, 315, 0);
  addStreetBench(475, 175, Math.PI);

  // Victorian Broadsheet Newspaper Stand Kiosk
  addNewspaperStand(645, 225, -Math.PI / 3);

  // Cast-Iron Directional Street Fingerpost
  addStreetSignpost(498, 185);

  // Cast-Iron Street Drainage Grates & Manhole Covers
  addManholeCovers();

  // Wall-pasted Wanted & Police Notice Posters
  addWallPosters();

  // Grand Victorian Union Jack Banners & Double-Sided Street Clocks (Image 9)
  addStreetBannersAndClocks();
}

function addStreetBannersAndClocks() {
  sharedUnionJackTexture ||= makeUnionJackTexture();
  sharedClockTexture ||= makeClockTexture();
  
  const flagMat = new THREE.MeshStandardMaterial({
    map: sharedUnionJackTexture,
    roughness: 0.85,
    metalness: 0.05,
    side: THREE.DoubleSide
  });
  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    metalness: 0.85,
    roughness: 0.25
  });
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x161a20,
    metalness: 0.78,
    roughness: 0.4
  });

  // 1. Grand Victorian Union Jack Banners (Image 9)
  const bannerLocations = [
    { gx: 512, gy: 110, rotY: Math.PI },        // Baker Street thoroughfare
    { gx: 270, gy: 195, rotY: -Math.PI / 2 },   // Scotland Yard approach
    { gx: 785, gy: 320, rotY: 0 },              // Station / Railway boulevard
    { gx: 510, gy: 310, rotY: Math.PI / 2 },    // Central London Crossing
    { gx: 660, gy: 215, rotY: -Math.PI / 3 },   // East high street
  ];

  bannerLocations.forEach(({ gx, gy, rotY }) => {
    const loc = toVector(gx, gy);
    const group = new THREE.Group();
    group.position.set(loc.x, 2.2, loc.z);
    group.rotation.y = rotY;

    // Angled flagpole (40 degrees outward towards the street)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.95, 6), poleMat);
    pole.rotation.x = -Math.PI / 4;
    pole.position.set(0, 0.28, 0.28);
    group.add(pole);

    // Spearhead finial
    const finial = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), poleMat);
    finial.rotation.x = -Math.PI / 4;
    finial.position.set(0, 0.62, 0.62);
    group.add(finial);

    // Draped Union Jack flag
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.42), flagMat);
    flag.position.set(0, 0.22, 0.38);
    flag.rotation.x = -Math.PI / 4;
    flag.rotation.z = -0.08;
    group.add(flag);

    sceneAdd(group);
  });

  // 2. Ornate Double-Sided Street Clocks (Image 9)
  const clockLocations = [
    { gx: 485, gy: 145, rotY: Math.PI / 2 },
    { gx: 340, gy: 235, rotY: 0 },
    { gx: 735, gy: 295, rotY: -Math.PI / 2 }
  ];

  clockLocations.forEach(({ gx, gy, rotY }) => {
    const loc = toVector(gx, gy);
    const group = new THREE.Group();
    group.position.set(loc.x, 2.1, loc.z);
    group.rotation.y = rotY;

    // Scrollwork iron wall bracket
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.42), ironMat);
    bracket.position.set(0, 0, 0.21);
    group.add(bracket);

    const brace = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, 0.28), ironMat);
    brace.rotation.x = Math.PI / 4;
    brace.position.set(0, -0.09, 0.18);
    group.add(brace);

    // Dual-face cylindrical clock body
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.08, 16), ironMat);
    body.rotation.z = Math.PI / 2;
    body.position.set(0, -0.02, 0.38);
    group.add(body);

    // Clock faces (left and right)
    const faceMat = new THREE.MeshBasicMaterial({ map: sharedClockTexture, toneMapped: false });
    for (const side of [-1, 1]) {
      const face = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), faceMat);
      face.rotation.y = side * Math.PI / 2;
      face.position.set(side * 0.045, -0.02, 0.38);
      group.add(face);
    }

    sceneAdd(group);
  });
}

function addHansomCab(gx, gy, heading) {
  const loc = toVector(gx, gy);
  const cabGroup = new THREE.Group();
  cabGroup.position.set(loc.x, 0, loc.z);
  cabGroup.rotation.y = heading;

  const blackGloss = new THREE.MeshStandardMaterial({ color: 0x111316, roughness: 0.22, metalness: 0.35 });
  const yellowWood = new THREE.MeshStandardMaterial({ color: 0xcca036, roughness: 0.65 });
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x181c20, metalness: 0.8, roughness: 0.38 });
  const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.88, roughness: 0.25 });

  // Main Passenger Carriage Cabin
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.68, 0.78), blackGloss);
  cabin.position.set(0, 0.58, -0.05);
  cabin.castShadow = true; cabin.receiveShadow = true;
  cabGroup.add(cabin);

  // Curved passenger front apron
  const apron = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.65, 8, 1, false, 0, Math.PI), blackGloss);
  apron.rotation.z = Math.PI / 2;
  apron.rotation.y = Math.PI;
  apron.position.set(0, 0.42, 0.34);
  cabGroup.add(apron);

  // Elevated rear Coachman Dickey Seat
  const driverSeat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.22, 0.24), blackGloss);
  driverSeat.position.set(0, 1.05, -0.44);
  cabGroup.add(driverSeat);
  const driverBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.24, 0.04), blackGloss);
  driverBack.position.set(0, 1.25, -0.54);
  cabGroup.add(driverBack);

  // Large Spoked Wheels
  const wheelRadius = 0.46;
  for (const side of [-1, 1]) {
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(side * 0.42, wheelRadius, -0.05);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(wheelRadius, 0.016, 6, 18), darkIron);
    wheelGroup.add(rim);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.06, 8), yellowWood);
    hub.rotation.z = Math.PI / 2;
    wheelGroup.add(hub);
    for (let s = 0; s < 8; s++) {
      const angle = (s * Math.PI) / 4;
      const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, wheelRadius * 1.9, 4), yellowWood);
      spoke.rotation.z = angle;
      wheelGroup.add(spoke);
    }
    cabGroup.add(wheelGroup);
  }

  // Dual Brass Carriage Lanterns
  for (const side of [-1, 1]) {
    const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.08), brassMat);
    lantern.position.set(side * 0.36, 0.72, 0.28);
    cabGroup.add(lantern);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.06), new THREE.MeshStandardMaterial({
      color: 0xffdb99, emissive: 0xff9922, emissiveIntensity: 2.2, roughness: 0.15
    }));
    glass.position.set(side * 0.36, 0.72, 0.28);
    cabGroup.add(glass);
  }

  const cabLight = new THREE.PointLight(0xffbe6b, 1.2, 3.8, 2);
  cabLight.position.set(0, 0.75, 0.45);
  cabGroup.add(cabLight);

  // Front Harness Shafts
  for (const side of [-0.22, 0.22]) {
    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.024, 1.15), yellowWood);
    shaft.position.set(side, 0.32, 0.95);
    cabGroup.add(shaft);
  }

  sceneAdd(cabGroup);
}

function addStreetBench(gx, gy, heading) {
  const loc = toVector(gx, gy);
  const benchGroup = new THREE.Group();
  benchGroup.position.set(loc.x, 0, loc.z);
  benchGroup.rotation.y = heading;

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x161c20, metalness: 0.75, roughness: 0.4 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x3d281a, roughness: 0.85 });

  for (const side of [-0.36, 0.36]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.36, 0.32), ironMat);
    leg.position.set(side, 0.18, 0);
    const armRest = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.16, 0.36), ironMat);
    armRest.position.set(side, 0.42, -0.02);
    benchGroup.add(leg, armRest);
  }
  for (let s = 0; s < 4; s++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.02, 0.06), woodMat);
    slat.position.set(0, 0.28, -0.1 + s * 0.07);
    benchGroup.add(slat);
  }
  for (let b = 0; b < 3; b++) {
    const backSlat = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.02), woodMat);
    backSlat.position.set(0, 0.38 + b * 0.07, -0.14);
    benchGroup.add(backSlat);
  }
  sceneAdd(benchGroup);
}

function addNewspaperStand(gx, gy, heading) {
  const loc = toVector(gx, gy);
  const standGroup = new THREE.Group();
  standGroup.position.set(loc.x, 0, loc.z);
  standGroup.rotation.y = heading;

  const woodMat = new THREE.MeshStandardMaterial({ color: 0x483222, roughness: 0.9 });
  const paperMat = new THREE.MeshStandardMaterial({ color: 0xe8dcbe, roughness: 0.95 });

  const table = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.65, 0.45), woodMat);
  table.position.set(0, 0.325, 0);
  standGroup.add(table);

  const top = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.04, 0.52), woodMat);
  top.position.set(0, 0.66, 0);
  top.rotation.x = -0.18;
  standGroup.add(top);

  for (const sx of [-0.26, 0, 0.26]) {
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.32), paperMat);
    stack.position.set(sx, 0.69, -0.02);
    stack.rotation.x = -0.18;
    standGroup.add(stack);
  }

  const headline = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.24), new THREE.MeshBasicMaterial({
    map: makeSignTexture('THE DAILY TELEGRAPH', 'MYSTERY IN WHITECHAPEL'), toneMapped: false
  }));
  headline.position.set(0, 0.34, 0.23);
  standGroup.add(headline);

  sceneAdd(standGroup);
}

function addStreetSignpost(gx, gy) {
  const loc = toVector(gx, gy);
  const postGroup = new THREE.Group();
  postGroup.position.set(loc.x, 0, loc.z);

  const ironMat = new THREE.MeshStandardMaterial({ color: 0x161c20, metalness: 0.8, roughness: 0.35 });
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.6, 8), ironMat);
  column.position.y = 0.8;
  postGroup.add(column);

  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), ironMat);
  cap.position.y = 1.62;
  postGroup.add(cap);

  const bladeN = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.016), new THREE.MeshBasicMaterial({
    map: makeSignTexture('BAKER ST'), toneMapped: false
  }));
  bladeN.position.set(0.18, 1.48, 0);
  postGroup.add(bladeN);

  const bladeE = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.09, 0.42), new THREE.MeshBasicMaterial({
    map: makeSignTexture('SCOTLAND YARD'), toneMapped: false
  }));
  bladeE.position.set(0, 1.36, 0.18);
  postGroup.add(bladeE);

  sceneAdd(postGroup);
}

function addManholeCovers() {
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x1e2226, metalness: 0.75, roughness: 0.5 });
  const spots = [
    [315, 235], [476, 342], [690, 450], [566, 491], [238, 184]
  ];
  spots.forEach(([x, y]) => {
    const loc = toVector(x, y);
    const manhole = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16), ironMat);
    manhole.rotation.x = -Math.PI / 2;
    manhole.position.set(loc.x + 0.35, 0.012, loc.z + 0.25);
    sceneAdd(manhole);
  });
}

function addWallPosters() {
  const posterMat = new THREE.MeshBasicMaterial({
    map: makeSignTexture('WANTED: REWARD', '100 GUINEAS'), toneMapped: false
  });
  const spots = [
    { x: 300, y: 410, rotY: Math.PI / 2, offsetX: -0.42, offsetY: 1.1, offsetZ: 0 },
    { x: 630, y: 160, rotY: 0, offsetX: 0, offsetY: 1.1, offsetZ: -0.45 },
    { x: 200, y: 135, rotY: -Math.PI / 2, offsetX: 0.42, offsetY: 1.1, offsetZ: 0 },
  ];
  spots.forEach((p) => {
    const loc = toVector(p.x, p.y);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.22), posterMat);
    poster.rotation.y = p.rotY;
    poster.position.set(loc.x + p.offsetX, p.offsetY, loc.z + p.offsetZ);
    sceneAdd(poster);
  });
}

function makeClueMarker(category = 'default', pointId = '') {
  const group = new THREE.Group();
  group.userData.category = category;
  group.userData.pointId = pointId;
  group.userData.seed = Math.random() * Math.PI * 2;
  group.userData.baseY = 0.02;

  // Subtle ground discovery proximity ring
  const ringGeo = new THREE.RingGeometry(0.26, 0.32, 28);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xe5c276,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const proximityRing = new THREE.Mesh(ringGeo, ringMat);
  proximityRing.rotation.x = -Math.PI / 2;
  proximityRing.position.y = 0.015;
  group.add(proximityRing);
  group.userData.ring = proximityRing;

  if (category === 'footprints') {
    // 1. Muddy boot tread impressions on cobblestones + forensic evidence card
    const mudMat = new THREE.MeshStandardMaterial({
      color: 0x1b1510,
      roughness: 0.22, // wet slick mud
      metalness: 0.1,
    });
    // Left boot sole & heel
    const leftSole = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.005, 0.15), mudMat);
    leftSole.position.set(-0.06, 0.006, -0.06); leftSole.rotation.y = -0.08; group.add(leftSole);
    const leftHeel = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.006, 0.055), mudMat);
    leftHeel.position.set(-0.06, 0.008, 0.035); group.add(leftHeel);

    // Right boot sole & heel (staggered stride)
    const rightSole = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.005, 0.15), mudMat);
    rightSole.position.set(0.065, 0.006, 0.08); rightSole.rotation.y = 0.06; group.add(rightSole);
    const rightHeel = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.006, 0.055), mudMat);
    rightHeel.position.set(0.065, 0.008, 0.175); group.add(rightHeel);

    // Standing forensic yellow/ivory numbered evidence tent card (#3)
    const cardMat = new THREE.MeshStandardMaterial({ color: 0xdfcb7a, roughness: 0.5 });
    const tentCard = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.06, 3), cardMat);
    tentCard.position.set(0.14, 0.035, -0.02); tentCard.rotation.y = Math.PI / 6; group.add(tentCard);

    group.userData.material = mudMat;
    return group;
  }

  if (category === 'fabric') {
    // 2. Torn tweed/velvet cloth caught on wrought iron picket
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x191e23, metalness: 0.75, roughness: 0.4 });
    const picket = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.36, 6), ironMat);
    picket.position.y = 0.18; group.add(picket);
    const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.06, 4), ironMat);
    spearTip.position.y = 0.39; group.add(spearTip);

    // Torn cloth swatch caught on picket
    const tweedMat = new THREE.MeshStandardMaterial({
      color: 0x3a3028,
      emissive: 0x181410,
      roughness: 0.85,
      side: THREE.DoubleSide
    });
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.18, 2, 2), tweedMat);
    cloth.position.set(0.035, 0.3, 0); cloth.rotation.y = 0.3; group.add(cloth);

    // Stray dangling thread
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.002, 0.002, 0.08, 3), tweedMat);
    thread.position.set(0.06, 0.23, 0.02); group.add(thread);

    group.userData.cloth = cloth;
    group.userData.material = tweedMat;
    return group;
  }

  if (category === 'photograph') {
    // 3. Wooden crate with framed Victorian daguerreotype plate
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x33281e, roughness: 0.8 });
    const crate = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.16, 0.24), crateMat);
    crate.position.y = 0.08; group.add(crate);

    const frameMat = new THREE.MeshStandardMaterial({ color: 0x221c16, roughness: 0.45 });
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.008, 0.14), frameMat);
    frame.position.set(0, 0.164, 0); group.add(frame);

    const photoMat = new THREE.MeshStandardMaterial({ color: 0xbfaa88, roughness: 0.35, metalness: 0.2 });
    const photo = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.11), photoMat);
    photo.position.set(0, 0.169, 0); photo.rotation.x = -Math.PI / 2; group.add(photo);

    group.userData.material = photoMat;
    return group;
  }

  if (category === 'key') {
    // 4. Heavy antique Victorian skeleton key lying on drainage stone
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x202428, roughness: 0.3 });
    const stone = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.035, 8), stoneMat);
    stone.position.y = 0.018; group.add(stone);

    const brassMat = new THREE.MeshStandardMaterial({ color: 0xd4a852, metalness: 0.82, roughness: 0.25, emissive: 0x3d280b });
    const bow = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.006, 6, 16), brassMat);
    bow.position.set(-0.045, 0.042, 0); bow.rotation.x = Math.PI / 2; group.add(bow);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 6), brassMat);
    barrel.position.set(0.015, 0.042, 0); barrel.rotation.z = Math.PI / 2; group.add(barrel);
    const bit = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.006, 0.03), brassMat);
    bit.position.set(0.065, 0.042, 0.014); group.add(bit);

    group.userData.material = brassMat;
    return group;
  }

  if (category === 'fingerprints') {
    // 5. Abandoned glass oil lantern with latent fingerprint powder smudge
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1d2922,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.85
    });
    const bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.05, 0.15, 10), glassMat);
    bottle.position.y = 0.075; group.add(bottle);

    const printMat = new THREE.MeshStandardMaterial({
      color: 0xd0d8de,
      roughness: 0.4,
      transparent: true,
      opacity: 0.82
    });
    const smudge = new THREE.Mesh(new THREE.PlaneGeometry(0.04, 0.05), printMat);
    smudge.position.set(0.041, 0.08, 0); smudge.rotation.y = Math.PI / 2; group.add(smudge);

    group.userData.material = printMat;
    return group;
  }

  if (category === 'witness') {
    // 6. Dropped leather route notebook with loose passenger receipt
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x421818, roughness: 0.55 });
    const book = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.02, 0.13), leatherMat);
    book.position.y = 0.015; group.add(book);

    const gildMat = new THREE.MeshStandardMaterial({ color: 0xc4a35a, metalness: 0.6, roughness: 0.35 });
    const gild = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.016, 0.12), gildMat);
    gild.position.set(0.005, 0.015, 0); group.add(gild);

    const receiptMat = new THREE.MeshStandardMaterial({ color: 0xdfd9c8, roughness: 0.65 });
    const receipt = new THREE.Mesh(new THREE.PlaneGeometry(0.07, 0.1), receiptMat);
    receipt.position.set(0.1, 0.006, 0.02); receipt.rotation.x = -Math.PI / 2; receipt.rotation.z = 0.2; group.add(receipt);

    group.userData.material = gildMat;
    return group;
  }

  if (category === 'letter') {
    // 7. Stone ledge with folded parchment dispatch and wax seal
    const sillMat = new THREE.MeshStandardMaterial({ color: 0x22262a, roughness: 0.5 });
    const sill = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.18), sillMat);
    sill.position.y = 0.04; group.add(sill);

    const paperMat = new THREE.MeshStandardMaterial({ color: 0xe2d7c0, roughness: 0.55 });
    const letter = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.11), paperMat);
    letter.position.set(0, 0.086, 0); group.add(letter);

    const sealMat = new THREE.MeshStandardMaterial({ color: 0x8a1b1b, roughness: 0.35 });
    const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.008, 10), sealMat);
    seal.position.set(0.02, 0.094, 0); group.add(seal);

    group.userData.material = paperMat;
    return group;
  }

  // Default / Station exhibit pedestal
  group.userData.isPedestal = true;
  group.userData.baseY = 0.12;
  const material = new THREE.MeshStandardMaterial({
    color: 0xf4c26a,
    emissive: 0x8a5416,
    emissiveIntensity: 1.8,
    metalness: 0.45,
    roughness: 0.28
  });
  const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), material);
  core.position.y = 0.28; core.castShadow = true; group.add(core);

  const ring1 = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.018, 6, 28), new THREE.MeshBasicMaterial({
    color: 0xf4d389, transparent: true, opacity: 0.85
  }));
  ring1.rotation.x = -Math.PI / 2; ring1.position.y = 0.035; group.add(ring1);

  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.012, 5, 24), new THREE.MeshBasicMaterial({
    color: 0xe5a952, transparent: true, opacity: 0.45
  }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.025; group.add(ring2);

  const markerSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: getLampGlowMap(),
    color: 0xffdf99,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }));
  markerSprite.position.y = 0.28;
  markerSprite.scale.set(0.7, 0.7, 0.7);
  group.add(markerSprite);

  group.userData.material = material;
  group.userData.markerSprite = markerSprite;
  return group;
}



function makeRain(count = 850) {
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
  if (point.category && !point.mission) {
    return !room.clues?.some((c) => c.id === point.id);
  }
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

let titleMistTexture = null;
function getTitleMistTexture() {
  if (titleMistTexture) return titleMistTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 64, 12, 128, 64, 120);
  grad.addColorStop(0, 'rgba(180, 205, 225, 0.75)');
  grad.addColorStop(0.5, 'rgba(140, 170, 195, 0.35)');
  grad.addColorStop(1, 'rgba(140, 170, 195, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 128);
  titleMistTexture = new THREE.CanvasTexture(canvas);
  return titleMistTexture;
}

export function createTitleWorld(canvas, options = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  } catch (error) {
    console.warn('The 3D Title scene could not start; falling back to illustrated backdrop.', error);
    return null;
  }

  const reducedDeviceQuality = Boolean(window.matchMedia?.('(pointer: coarse)').matches || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4));
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, reducedDeviceQuality ? 1.1 : 1.5));
  renderer.shadowMap.enabled = !reducedDeviceQuality;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;

  const scene = new THREE.Scene();
  const night = new THREE.Color('#070e17');
  scene.background = night;
  scene.fog = new THREE.FogExp2(night, 0.028);

  const camera = new THREE.PerspectiveCamera(46, 1.6, 0.1, 90);
  camera.position.set(0, 1.54, 4.4);
  camera.lookAt(0, 2.9, -22);

  const hemi = new THREE.HemisphereLight(0x9ebbdc, 0x14181c, 1.4);
  scene.add(hemi);

  const moon = new THREE.DirectionalLight(0x92b4d8, 2.4);
  moon.position.set(-8, 16, -6);
  moon.castShadow = !reducedDeviceQuality;
  moon.shadow.mapSize.set(1024, 1024);
  scene.add(moon);

  // Full Moon in the distance
  const moonDisc = new THREE.Mesh(
    new THREE.CircleGeometry(2.1, 28),
    new THREE.MeshBasicMaterial({ color: 0xe0ecf8, transparent: true, opacity: 0.9, depthWrite: false })
  );
  moonDisc.position.set(-7, 18, -26);
  moonDisc.lookAt(0, 0, 0);
  scene.add(moonDisc);

  const moonHalo = new THREE.Mesh(
    new THREE.CircleGeometry(6.5, 28),
    new THREE.MeshBasicMaterial({ color: 0x6e8fad, transparent: true, opacity: 0.25, depthWrite: false })
  );
  moonHalo.position.set(-7, 18, -25.9);
  moonHalo.lookAt(0, 0, 0);
  scene.add(moonHalo);

  // Distant Westminster Clock Tower
  const clockTower = createClockTower();
  clockTower.position.set(0, 0, -28);
  scene.add(clockTower);

  // Street Ground (Wet Cobblestones with rich reflections)
  const cobbleMat = new THREE.MeshStandardMaterial({
    color: 0x4e5860, roughness: 0.28, metalness: 0.35, map: makeCobbleTexture()
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(36, 60), cobbleMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, -10);
  ground.receiveShadow = true;
  scene.add(ground);

  // Puddles reflecting gaslamps
  const puddleMat = new THREE.MeshBasicMaterial({
    color: 0x8ba4b2, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide
  });
  const puddleGlint = new THREE.MeshBasicMaterial({
    color: 0xf4b45e, transparent: true, opacity: 0.35, depthWrite: false, side: THREE.DoubleSide
  });
  for (let pz = 2; pz > -26; pz -= 4.2) {
    for (const px of [-1.2, 0.9]) {
      const puddle = new THREE.Mesh(new THREE.CircleGeometry(0.65, 18), puddleMat);
      puddle.rotation.x = -Math.PI / 2;
      puddle.position.set(px, 0.012, pz);
      puddle.scale.set(1.4, 0.6, 1);
      scene.add(puddle);
      const glint = new THREE.Mesh(new THREE.CircleGeometry(0.35, 14), puddleGlint);
      glint.rotation.x = -Math.PI / 2;
      glint.position.set(px - 0.05, 0.014, pz + 0.04);
      scene.add(glint);
    }
  }

  // Flanking Victorian Buildings on left & right
  sharedBrickMaps ||= makeBrickMaps();
  const wallMat = new THREE.MeshStandardMaterial({
    color: 0x3b332e, roughness: 0.94, metalness: 0.02, map: sharedBrickMaps.color, bumpMap: sharedBrickMaps.height, bumpScale: 0.02
  });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a2128, roughness: 0.88, side: THREE.DoubleSide });
  const chimMat = new THREE.MeshStandardMaterial({ color: 0x2e2722, roughness: 0.92 });
  const potMat = new THREE.MeshStandardMaterial({ color: 0x824424, roughness: 0.85 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0xf5b565, emissive: 0xd97524, emissiveIntensity: 0.85, roughness: 0.4
  });
  const sillMat = new THREE.MeshStandardMaterial({ color: 0x5a554d, roughness: 0.9 });

  for (let z = 4; z > -28; z -= 5.5) {
    for (const side of [-1, 1]) {
      const bx = side * 4.4;
      const bw = 3.6, bh = 5.2 + Math.random() * 1.5, bd = 4.8;
      const bldg = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), wallMat);
      bldg.position.set(bx, bh / 2, z);
      bldg.castShadow = true; bldg.receiveShadow = true;
      scene.add(bldg);

      const roof = new THREE.Mesh(makeGableRoof(bw + 0.2, bd + 0.2, 1.4), roofMat);
      roof.position.set(bx, bh, z);
      scene.add(roof);

      // Victorian chimney stack with terra-cotta chimney pots
      const chimX = bx - side * 0.7;
      const chimY = bh + 1.25;
      const chimZ = z - 0.3;
      const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.95, 0.55), chimMat);
      chimney.position.set(chimX, chimY, chimZ);
      chimney.castShadow = true;
      scene.add(chimney);
      for (const po of [-0.14, 0.14]) {
        const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.38, 8), potMat);
        pot.position.set(chimX, chimY + 0.6, chimZ + po);
        scene.add(pot);
      }

      // Lit windows facing the street
      const facadeX = bx - side * (bw / 2 + 0.04);
      for (let floor = 1; floor <= 3; floor++) {
        for (let col = -1; col <= 1; col++) {
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.35), glassMat);
          win.position.set(facadeX, floor * 1.35, z + col * 1.2);
          scene.add(win);
          const sill = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.45), sillMat);
          sill.position.set(facadeX, floor * 1.35 - 0.25, z + col * 1.2);
          scene.add(sill);
        }
      }
    }
  }

  // Avenue Gas Lamps
  const titleLampLights = [];
  const lampIron = new THREE.MeshStandardMaterial({ color: 0x161a1e, metalness: 0.75, roughness: 0.35 });
  for (let lz = 2; lz > -26; lz -= 6.2) {
    for (const side of [-1, 1]) {
      const lx = side * 2.35;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 1.4, 7), lampIron);
      post.position.set(lx, 0.7, lz); post.castShadow = true; scene.add(post);

      const lantern = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.24, 0.19), new THREE.MeshStandardMaterial({
        color: 0xffd188, emissive: 0xff9922, emissiveIntensity: 2.4, roughness: 0.2
      }));
      lantern.position.set(lx, 1.45, lz); scene.add(lantern);

      // Volumetric glow sprite
      const glowSprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: getLampGlowMap(),
        color: 0xffd690,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }));
      glowSprite.position.set(lx, 1.45, lz);
      glowSprite.scale.set(1.6, 1.6, 1.6);
      scene.add(glowSprite);

      // Light source with flicker tracking
      const lampLight = new THREE.PointLight(0xffbe6b, 1.35, 5.2, 2);
      lampLight.position.set(lx, 1.48, lz);
      scene.add(lampLight);
      titleLampLights.push({ light: lampLight, baseIntensity: 1.35, seed: Math.abs(lz) * 1.8 });

      // Light pool on street
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.9, 18), new THREE.MeshBasicMaterial({
        color: 0xdf983a, transparent: true, opacity: 0.18, depthWrite: false
      }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.set(lx, 0.01, lz);
      scene.add(pool);
    }
  }

  // Layered London River Fog / Ground Mist planes drifting across the avenue
  const mistPlanes = [];
  const mistMat = new THREE.MeshBasicMaterial({
    map: getTitleMistTexture(),
    transparent: true,
    opacity: reducedDeviceQuality ? 0.12 : 0.22,
    depthWrite: false,
    blending: THREE.NormalBlending
  });
  for (let mz = 1; mz > -25; mz -= 8) {
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(12, 3.2), mistMat);
    plane.position.set(0, 0.75, mz);
    scene.add(plane);
    mistPlanes.push({ mesh: plane, baseZ: mz, seed: Math.abs(mz) * 2.3 });
  }

  // Foreground Detective Silhouette (Refined atmospheric proportion)
  const detective = createForegroundDetective();
  detective.scale.set(0.72, 0.72, 0.72);
  detective.position.set(0, 0, 0.6);
  detective.rotation.y = Math.PI; // Facing down the street with back to camera
  scene.add(detective);

  // Dedicated cool moonlight rim light emphasizing detective's silhouette from behind
  const detMoonRimLight = new THREE.DirectionalLight(0xb2d6fa, 2.4);
  detMoonRimLight.position.set(0, 3.8, -4.2);
  detMoonRimLight.target = detective;
  scene.add(detMoonRimLight);

  // Soft amber personal gaslamp bounce under detective
  const detLanternLight = new THREE.PointLight(0xffcd7a, 0.9, 3.6, 2);
  detLanternLight.position.set(-0.35, 0.8, 0.5);
  scene.add(detLanternLight);

  // Rain
  const rain = makeRain(reducedDeviceQuality ? 300 : 750);
  scene.add(rain.points);

  let active = false;
  let reducedMotion = Boolean(options.reducedMotion);
  let previousTime = performance.now();

  function resize() {
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    renderer.setSize(bounds.width, bounds.height, false);
    camera.aspect = bounds.width / bounds.height;
    camera.updateProjectionMatrix();
  }

  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (canvas.parentElement) observer?.observe(canvas.parentElement);
  window.addEventListener('resize', resize);
  resize();

  function animate() {
    const now = performance.now();
    const delta = Math.min((now - previousTime) / 1000, 0.05);
    previousTime = now;

    if (!reducedMotion) {
      rain.update(delta);
      const t = now * 0.00035;
      camera.position.x = Math.sin(t) * 0.05;
      camera.position.y = 1.54 + Math.cos(t * 0.7) * 0.02;
      camera.lookAt(0, 2.9, -22);

      mistPlanes.forEach((mp) => {
        mp.mesh.position.x = Math.sin(now * 0.0004 + mp.seed) * 0.5;
        mp.mesh.position.z = mp.baseZ + Math.cos(now * 0.0003 + mp.seed) * 0.3;
      });

      titleLampLights.forEach((lamp) => {
        lamp.light.intensity = lamp.baseIntensity * (1 + Math.sin(now * 0.006 + lamp.seed) * 0.07 + Math.cos(now * 0.014 + lamp.seed) * 0.03);
      });
    }
    renderer.render(scene, camera);
  }

  return {
    setActive(state) {
      active = Boolean(state);
      renderer.setAnimationLoop(active ? animate : null);
      if (active) resize();
    },
    setReducedMotion(val) { reducedMotion = Boolean(val); },
    setGraphicsQuality(level) {
      if (level === 'low') {
        mistPlanes.forEach((p) => { p.mesh.visible = false; });
        renderer.setPixelRatio(0.85);
        renderer.shadowMap.enabled = false;
        moon.castShadow = false;
      } else if (level === 'medium') {
        mistPlanes.forEach((p) => { p.mesh.visible = true; p.mesh.material.opacity = 0.14; });
        renderer.setPixelRatio(1.0);
        renderer.shadowMap.enabled = true;
        moon.castShadow = true;
      } else {
        mistPlanes.forEach((p) => { p.mesh.visible = true; p.mesh.material.opacity = 0.22; });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.shadowMap.enabled = true;
        moon.castShadow = true;
      }
      resize();
    },
    resize,
    dispose() {
      renderer.setAnimationLoop(null);
      renderer.dispose();
      observer?.disconnect();
      window.removeEventListener('resize', resize);
      disposeObject(scene);
    },
  };
}

function createClockTower() {
  const group = new THREE.Group();
  const stone = new THREE.MeshStandardMaterial({ color: 0x222a33, roughness: 0.9, metalness: 0.1 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x36424f, roughness: 0.85 });
  const darkRoof = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.8 });

  // Main tower shaft
  const base = mesh(new THREE.BoxGeometry(3.6, 26, 3.6), stone, 0, 13, 0);
  // Buttresses
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const col = mesh(new THREE.BoxGeometry(0.6, 26, 0.6), trim, sx * 1.8, 13, sz * 1.8);
    group.add(col);
  }
  // Belfry balcony
  const balcony = mesh(new THREE.BoxGeometry(4.4, 1.2, 4.4), trim, 0, 24.5, 0);
  // Clock section
  const clockBox = mesh(new THREE.BoxGeometry(3.8, 4.2, 3.8), stone, 0, 27.2, 0);
  // Glowing clock face (facing camera at z > 0)
  const clockFace = new THREE.Mesh(
    new THREE.CircleGeometry(1.4, 32),
    new THREE.MeshBasicMaterial({ color: 0xffe299 })
  );
  clockFace.position.set(0, 27.2, 1.92);
  // Clock hands
  const hourHand = mesh(new THREE.BoxGeometry(0.1, 0.7, 0.02), darkRoof, 0, 27.4, 1.94);
  const minHand = mesh(new THREE.BoxGeometry(0.08, 1.0, 0.02), darkRoof, 0.35, 27.3, 1.94);
  minHand.rotation.z = -Math.PI / 3;

  // Ambient clock glow light
  const clockLight = new THREE.PointLight(0xffbe60, 2.2, 18, 1.8);
  clockLight.position.set(0, 27.2, 3.2);

  // Clock tower spire
  const spireBase = mesh(new THREE.BoxGeometry(3.4, 2.4, 3.4), trim, 0, 30.5, 0);
  const spire = mesh(new THREE.ConeGeometry(2.1, 8, 4), darkRoof, 0, 35.7, 0);
  spire.rotation.y = Math.PI / 4;

  group.add(base, balcony, clockBox, clockFace, hourHand, minHand, clockLight, spireBase, spire);
  return group;
}



function createForegroundDetective() {
  const group = new THREE.Group();
  const coatColor = 0x141a24;
  const capeColor = 0x10151f;
  const dark = 0x080b0f;
  const caneWood = 0x241208;
  const brassColor = 0xd4af37;
  const matCoat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.82, metalness: 0.12 });
  const matCape = new THREE.MeshStandardMaterial({ color: capeColor, roughness: 0.78, metalness: 0.15 });
  const matDark = new THREE.MeshStandardMaterial({ color: dark, roughness: 0.85, metalness: 0.08 });
  const matCane = new THREE.MeshStandardMaterial({ color: caneWood, roughness: 0.45, metalness: 0.1 });
  const matBrass = new THREE.MeshStandardMaterial({ color: brassColor, roughness: 0.28, metalness: 0.88 });

  // Body / long coat torso
  const torso = mesh(new THREE.CylinderGeometry(0.25, 0.40, 1.08, 10), matCoat, 0, 0.98, 0);
  // Coat tail extending toward ground
  const coatSkirt = mesh(new THREE.CylinderGeometry(0.40, 0.56, 0.92, 12), matCoat, 0, 0.44, 0);
  // Inverness shoulder cape with flared silhouette
  const cape = mesh(new THREE.CylinderGeometry(0.36, 0.54, 0.58, 12), matCape, 0, 1.32, 0);
  // Coat collar
  const collar = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.18, 9), matCoat, 0, 1.58, 0);

  // Head
  const head = mesh(new THREE.SphereGeometry(0.15, 12, 10), matDark, 0, 1.72, 0);

  // Deerstalker Hat
  const hatCrown = mesh(new THREE.SphereGeometry(0.17, 14, 12), matCape, 0, 1.80, 0);
  hatCrown.scale.set(0.95, 0.82, 1.18);

  // Front visor brim (facing away from camera)
  const frontVisor = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 14, 1, false, Math.PI * 0.8, Math.PI * 1.4), matDark, 0, 1.76, -0.07);
  frontVisor.rotation.x = 0.25;

  // Rear visor brim (facing toward camera)
  const rearVisor = mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.03, 14, 1, false, -Math.PI * 0.2, Math.PI * 1.4), matDark, 0, 1.76, 0.07);
  rearVisor.rotation.x = -0.25;

  // Tied ear-flaps on top
  const earFlapLeft = mesh(new THREE.BoxGeometry(0.045, 0.15, 0.19), matCape, -0.16, 1.82, 0);
  earFlapLeft.rotation.z = -0.15;
  const earFlapRight = mesh(new THREE.BoxGeometry(0.045, 0.15, 0.19), matCape, 0.16, 1.82, 0);
  earFlapRight.rotation.z = 0.15;
  const flapTie = mesh(new THREE.BoxGeometry(0.13, 0.035, 0.07), matDark, 0, 1.90, 0);

  // Legs & boots
  const legLeft = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.52, 8), matDark, -0.14, 0.26, 0);
  const legRight = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.52, 8), matDark, 0.14, 0.26, 0);
  const bootLeft = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), matDark, -0.14, 0.06, -0.04);
  const bootRight = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.28), matDark, 0.14, 0.06, -0.04);

  // Arms inside coat
  const armLeft = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.68, 8), matCoat, -0.34, 1.12, 0.04);
  armLeft.rotation.z = 0.14;
  armLeft.rotation.x = -0.18;
  const armRight = mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.68, 8), matCoat, 0.34, 1.12, 0.04);
  armRight.rotation.z = -0.14;
  armRight.rotation.x = -0.18;

  // Iconic Victorian walking cane held in right hand
  const caneStick = mesh(new THREE.CylinderGeometry(0.013, 0.017, 0.96, 8), matCane, 0.44, 0.48, 0.12);
  caneStick.rotation.z = -0.05;
  const ferrule = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.05, 8), matBrass, 0.46, 0.025, 0.12);
  const caneKnob = mesh(new THREE.SphereGeometry(0.034, 12, 8), matBrass, 0.41, 0.97, 0.12);

  // Ground contact shadow
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(0.65, 20),
    new THREE.MeshBasicMaterial({ color: 0x010306, transparent: true, opacity: 0.8, depthWrite: false })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.008;

  group.add(
    torso, coatSkirt, cape, collar, head,
    hatCrown, frontVisor, rearVisor, earFlapLeft, earFlapRight, flapTie,
    legLeft, legRight, bootLeft, bootRight, armLeft, armRight,
    caneStick, ferrule, caneKnob, shadow
  );

  // Scale up for prominent foreground silhouette
  group.scale.set(1.22, 1.22, 1.22);

  group.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  return group;
}


