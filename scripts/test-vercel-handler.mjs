import assert from 'node:assert/strict';
import { createGameHandler } from '../api/game.mjs';

const values = new Map();
const store = {
  async get(key) {
    await Promise.resolve();
    return values.get(key) ?? null;
  },
  async create(key, value) {
    await Promise.resolve();
    if (values.has(key)) return null;
    values.set(key, value);
    return 'OK';
  },
  async compareAndSwap(key, expected, next) {
    await new Promise((resolve) => setTimeout(resolve, Math.floor(Math.random() * 3)));
    if (values.get(key) !== expected) return 0;
    values.set(key, next);
    return 1;
  },
  async ping() { return 'PONG'; },
};

const handler = createGameHandler(() => store);

async function request(body, method = 'POST') {
  const response = await handler.fetch(new Request('https://game.test/api/game', {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json' } : undefined,
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  }));
  const data = await response.json();
  return { response, data };
}

const health = await request(null, 'GET');
assert.equal(health.response.status, 200);
assert.equal(health.data.storage, 'connected');

const created = await request({ op: 'create', name: 'Holmes' });
assert.equal(created.response.status, 201);
const seats = await Promise.all(Array.from({ length: 7 }, (_, index) => request({
  op: 'join', code: created.data.code, name: `Player ${index + 1}`,
})));
assert.ok(seats.every(({ response }) => response.status === 201), 'Concurrent room joins should all commit.');
const hostState = await request({ op: 'state', code: created.data.code, token: created.data.token });
assert.equal(hostState.data.room.connectedCount, 8);
const concurrentPolls = await Promise.all([
  request({ op: 'state', code: created.data.code, token: created.data.token }),
  ...seats.map(({ data }) => request({ op: 'state', code: created.data.code, token: data.token })),
]);
assert.ok(concurrentPolls.every(({ response }) => response.status === 200), 'Eight clients should be able to poll the shared room concurrently.');
const ninth = await request({ op: 'join', code: created.data.code, name: 'Ninth player' });
assert.equal(ninth.response.status, 409);
assert.match(ninth.data.error, /full/);

const coOp = await request({ op: 'create', name: 'Watson' });
const guest = await request({ op: 'join', code: coOp.data.code, name: 'Irene' });
const hostReady = await request({ op: 'action', action: 'ready', ready: true, code: coOp.data.code, token: coOp.data.token });
assert.equal(hostReady.response.status, 200);
assert.equal(hostReady.data.state.room.phase, 'lobby');
const guestReady = await request({ op: 'action', action: 'ready', ready: true, code: guest.data.code, token: guest.data.token });
assert.equal(guestReady.response.status, 200);
assert.equal(guestReady.data.state.room.phase, 'investigation');
assert.equal(guestReady.data.state.room.mode, 'cooperative');

const broken = createGameHandler(() => {
  throw Object.assign(new Error('Connect an Upstash Redis database to this Vercel project, then redeploy.'), { status: 503 });
});
const missingStorage = await broken.fetch(new Request('https://game.test/api/game', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ op: 'create', name: 'No storage' }),
}));
assert.equal(missingStorage.status, 503);
assert.match((await missingStorage.json()).error, /Upstash Redis/);

console.log('PASS: Vercel API health, concurrent Redis CAS joins and polls, 8-seat limit, Ready gate, co-op start, and missing-storage guidance.');
