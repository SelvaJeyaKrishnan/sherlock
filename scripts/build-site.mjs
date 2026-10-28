import { access, copyFile, mkdir, readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'public/boot.js',
  'public/loader.js',
  'public/app.js',
  'public/styles.css',
  'public/cover.svg',
  'public/london-district.png',
  'public/world-layout.js',
  'public/world3d.js',
  'public/vendor/three.module.js',
  'public/vendor/three.core.js',
  'api/game.mjs',
  'lib/game-core.mjs',
  'vercel.json',
];

await mkdir(new URL('../public/vendor/', import.meta.url), { recursive: true });
await copyFile(
  new URL('../node_modules/three/build/three.module.js', import.meta.url),
  new URL('../public/vendor/three.module.js', import.meta.url),
);
await copyFile(
  new URL('../node_modules/three/build/three.core.js', import.meta.url),
  new URL('../public/vendor/three.core.js', import.meta.url),
);

for (const file of requiredFiles) await access(new URL(`../${file}`, import.meta.url));

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
await access(new URL('../public/vendor/three.module.js', import.meta.url));
await access(new URL('../public/vendor/three.core.js', import.meta.url));
for (const required of ['Choose Your Detective', 'data-character="boy"', 'data-character="girl"']) {
  if (!html.includes(required)) throw new Error(`The character selection screen is missing ${required}.`);
}
for (const required of ["createDetectivePreview", "character: selectedCharacter"]) {
  if (!app.includes(required)) throw new Error(`The browser client is missing character selection wiring: ${required}.`);
}
if (!app.includes("'/api/game'")) {
  throw new Error('The browser client must call the Vercel game function directly.');
}
if (app.includes('/.netlify/functions/game')) {
  throw new Error('Remove the old Netlify function endpoint from the browser client.');
}

console.log('Vercel static files, Three.js runtime, and /api/game function are ready.');
