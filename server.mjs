import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rooms, randomCode, newRoom, makePlayer, activePlayers, authenticate, publicRoom, doAction, addLog, httpError, sweepRoom, findByCode, MAX_PLAYERS, RECONNECT_GRACE_MS } from './lib/game-core.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC = join(ROOT, 'public');
const PORT = Number(process.env.PORT || 3000);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function readJson(req) {
  if (req.parsedBody) return req.parsedBody;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 12_000) throw httpError(413, 'Request is too large.');
  }
  try { return raw ? JSON.parse(raw) : {}; }
  catch { throw httpError(400, 'That request could not be read. Please try again.'); }
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  res.end(JSON.stringify(data));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'POST' && url.pathname === '/api/game') {
      const body = await readJson(req);
      const localRoutes = { create: '/api/create', join: '/api/join', state: '/api/state', action: '/api/action' };
      if (!localRoutes[body.op]) return sendJson(res, 400, { error: 'Unknown game request.' });
      req.parsedBody = body;
      url.pathname = localRoutes[body.op];
    }
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ok: true, rooms: rooms.size });
    if (req.method === 'GET' && url.pathname === '/api/game') return sendJson(res, 200, { ok: true, storage: 'local-memory' });
    if (req.method === 'POST' && url.pathname === '/api/create') {
      const body = await readJson(req);
      if (rooms.size >= 1500) return sendJson(res, 503, { error: 'The room service is busy. Try again in a moment.' });
      let code;
      do { code = randomCode(); } while (rooms.has(code));
      const { room, player } = newRoom(code, body.name);
      rooms.set(code, room);
      return sendJson(res, 201, { code, token: player.token, playerId: player.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/join') {
      const body = await readJson(req);
      const room = findByCode(body.code);
      if (!room) return sendJson(res, 404, { error: 'Room not found. Check the code and try again.' });
      const reconnect = [...room.players.values()].find((p) => p.token === body.token && body.token);
      if (reconnect) {
        if (room.phase === 'results') return sendJson(res, 409, { error: 'This case is complete. Start a rematch before reconnecting.' });
        reconnect.connected = true;
        reconnect.dropped = false;
        reconnect.lastSeen = Date.now();
        room.lastTouched = Date.now();
        return sendJson(res, 200, { code: room.code, token: reconnect.token, playerId: reconnect.id, reconnected: true });
      }
      const players = activePlayers(room);
      if (room.phase !== 'lobby') return sendJson(res, 409, { error: 'This case has already started. Ask the host for the current room link after the case.' });
      if (players.length >= MAX_PLAYERS) return sendJson(res, 409, { error: 'This room is full. A room can hold eight players.' });
      const player = makePlayer(body.name);
      room.players.set(player.id, player);
      room.scores.set(player.id, 0);
      room.lastTouched = Date.now();
      addLog(room, `${player.name} joined the waiting room.`, 'note');
      return sendJson(res, 201, { code: room.code, token: player.token, playerId: player.id });
    }
    if (req.method === 'POST' && url.pathname === '/api/state') {
      const body = await readJson(req);
      const { room, player } = authenticate(body);
      return sendJson(res, 200, publicRoom(room, player));
    }
    if (req.method === 'POST' && url.pathname === '/api/action') {
      const body = await readJson(req);
      const { room, player } = authenticate(body);
      const result = doAction(room, player, body);
      room.lastTouched = Date.now();
      return sendJson(res, result.ok === false ? 400 : 200, { ...result, state: publicRoom(room, player) });
    }
    if (url.pathname.startsWith('/api/')) return sendJson(res, 405, { error: 'Method not allowed.' });
    if (req.method === 'GET') {
      const relative = url.pathname === '/' ? 'index.html' : normalize(url.pathname.slice(1));
      if (relative.startsWith('..')) return sendJson(res, 403, { error: 'Not found.' });
      try {
        const data = await readFile(join(PUBLIC, relative));
        res.writeHead(200, { 'Content-Type': contentTypes[extname(relative)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'", 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()' });
        return res.end(data);
      } catch {
        return sendJson(res, 404, { error: 'Not found.' });
      }
    }
    return sendJson(res, 405, { error: 'Method not allowed.' });
  } catch (error) {
    return sendJson(res, error.status || 500, { error: error.status ? error.message : 'The room service hit an unexpected error. Please retry.' });
  }
});

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    sweepRoom(room);
    for (const p of room.players.values()) {
      if (!p.dropped && !p.connected && now - p.lastSeen > RECONNECT_GRACE_MS) {
        p.dropped = true;
        addLog(room, `${p.name} has left the active roster after the reconnect window.`, 'note');
      }
    }
    if (room.phase === 'lobby' && now - room.lastTouched > 45 * 60_000) rooms.delete(code);
    if (room.phase === 'results' && now - room.lastTouched > 60 * 60_000) rooms.delete(code);
  }
}, 2500).unref();

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  server.listen(PORT, '0.0.0.0', () => console.log(`Sherlock: Shadows of London is listening on port ${PORT}`));
}


