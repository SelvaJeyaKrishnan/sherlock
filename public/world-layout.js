export const WORLD_SCALE = 40;
export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 640;

export const CITY_PATHS = [
  [[182, 145], [315, 235], [498, 160]],
  [[498, 160], [660, 235], [804, 355]],
  [[804, 355], [690, 450], [480, 555]],
  [[480, 555], [300, 414], [182, 145]],
  [[498, 160], [476, 342], [480, 555]],
];

export const CITY_BUILDINGS = [
  { x: 38, y: 36, w: 136, h: 60, height: 2.1 },
  { x: 210, y: 37, w: 105, h: 75, height: 1.9 },
  { x: 360, y: 34, w: 86, h: 60, height: 2.6 },
  { x: 532, y: 33, w: 128, h: 78, height: 2.0 },
  { x: 713, y: 44, w: 102, h: 55, height: 2.4 },
  { x: 830, y: 40, w: 90, h: 68, height: 1.8 },
  { x: 75, y: 434, w: 142, h: 86, height: 2.2 },
  { x: 244, y: 508, w: 114, h: 66, height: 1.9 },
  { x: 625, y: 517, w: 154, h: 74, height: 2.1 },
  { x: 730, y: 428, w: 90, h: 64, height: 2.5 },
  { x: 345, y: 265, w: 78, h: 58, height: 1.8 },
  { x: 538, y: 302, w: 112, h: 67, height: 2.2 },
  { x: 277, y: 300, w: 60, h: 50, height: 1.7 },
  { x: 631, y: 145, w: 76, h: 54, height: 2.0 },
  { x: 35, y: 545, w: 116, h: 64, height: 1.8 },
  { x: 12, y: 208, w: 80, h: 70, height: 2.3 },
  { x: 184, y: 240, w: 70, h: 64, height: 1.8 },
  { x: 316, y: 40, w: 40, h: 62, height: 2.4 },
  { x: 457, y: 38, w: 62, h: 72, height: 2.6 },
  { x: 826, y: 86, w: 92, h: 78, height: 2.2 },
  { x: 36, y: 321, w: 65, h: 74, height: 2.0 },
  { x: 494, y: 380, w: 90, h: 70, height: 2.1 },
  { x: 843, y: 496, w: 84, h: 68, height: 1.8 },
];

export const GAS_LAMPS = [
  [182, 145], [315, 235], [498, 160], [660, 235], [804, 355],
  [690, 450], [480, 555], [300, 414], [476, 342], [238, 184],
  [576, 197], [744, 304], [566, 491], [205, 402], [857, 443],
];

export function gameToWorld(x, y, height = 0) {
  return { x: (x - WORLD_WIDTH / 2) / WORLD_SCALE, y: height, z: (y - WORLD_HEIGHT / 2) / WORLD_SCALE };
}
