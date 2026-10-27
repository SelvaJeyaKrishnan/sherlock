import { access, readFile } from 'node:fs/promises';

const requiredFiles = [
  'public/index.html',
  'public/app.js',
  'public/styles.css',
  'public/cover.svg',
  'api/game.mjs',
  'lib/game-core.mjs',
  'vercel.json',
];

for (const file of requiredFiles) await access(new URL(`../${file}`, import.meta.url));

const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
if (!app.includes("'/api/game'")) {
  throw new Error('The browser client must call the Vercel game function directly.');
}
if (app.includes('/.netlify/functions/game')) {
  throw new Error('Remove the old Netlify function endpoint from the browser client.');
}

console.log('Vercel static files and /api/game function are ready.');
