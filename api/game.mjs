import {
  randomCode,
  newRoom,
  makePlayer,
  activePlayers,
  authenticate,
  publicRoom,
  doAction,
  addLog,
  httpError,
  MAX_PLAYERS,
} from "../lib/game-core.mjs";

const STORE_PREFIX = "sherlock:room:";
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const MAX_CAS_ATTEMPTS = 12;
const CAS_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if current ~= ARGV[1] then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1
`;

const json = (data, status = 200) => Response.json(data, {
  status,
  headers: {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  },
});

function pack(value) {
  return JSON.stringify(value, (_key, current) => {
    if (current instanceof Map) return { __sherlockMap: [...current.entries()] };
    if (current instanceof Set) return { __sherlockSet: [...current.values()] };
    return current;
  });
}

function unpack(value) {
  return JSON.parse(value, (_key, current) => {
    if (current && Array.isArray(current.__sherlockMap)) return new Map(current.__sherlockMap);
    if (current && Array.isArray(current.__sherlockSet)) return new Set(current.__sherlockSet);
    return current;
  });
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 12_000) throw Object.assign(new Error("Request is too large."), { status: 413 });
  try { return text ? JSON.parse(text) : {}; }
  catch { throw Object.assign(new Error("That request could not be read. Please try again."), { status: 400 }); }
}

function createUpstashStore() {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw Object.assign(new Error("Connect an Upstash Redis database to this Vercel project, then redeploy."), { status: 503 });
  }

  let endpoint;
  try {
    endpoint = new URL(url);
    if (endpoint.protocol !== "https:") throw new Error("Redis URL must use HTTPS.");
  } catch {
    throw Object.assign(new Error("The Upstash Redis connection settings are invalid."), { status: 503 });
  }

  async function command(parts) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(parts),
      cache: "no-store",
    });
    let payload;
    try { payload = await response.json(); }
    catch { throw Object.assign(new Error("Upstash Redis did not return a valid response."), { status: 503 }); }
    if (!response.ok || payload?.error) {
      throw Object.assign(new Error("Upstash Redis is unavailable. Check the Vercel Storage connection and try again."), { status: 503 });
    }
    return payload.result;
  }

  return {
    get: (key) => command(["GET", key]),
    create: (key, value) => command(["SET", key, value, "NX", "EX", ROOM_TTL_SECONDS]),
    compareAndSwap: (key, expected, next) => command(["EVAL", CAS_SCRIPT, 1, key, expected, next, ROOM_TTL_SECONDS]),
    ping: () => command(["PING"]),
  };
}

async function createRoom(body, store) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = randomCode();
    const { room, player } = newRoom(code, body.name);
    const result = await store.create(`${STORE_PREFIX}${code}`, pack(room));
    if (result === "OK") return json({ code, token: player.token, playerId: player.id }, 201);
  }
  return json({ error: "Could not reserve a room code. Please try again." }, 503);
}

async function transact(body, store) {
  const code = String(body.code || "").toUpperCase();
  if (!/^[A-F0-9]{6}$/.test(code)) throw httpError(404, "Room not found. Check the code and try again.");
  const key = `${STORE_PREFIX}${code}`;

  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt++) {
    const previous = await store.get(key);
    if (!previous) throw httpError(404, "Room not found. Check the code and try again.");
    const room = unpack(previous);
    const roomStore = new Map([[code, room]]);
    let response;

    if (body.op === "join") {
      const reconnect = [...room.players.values()].find((p) => p.token === body.token && body.token);
      if (reconnect) {
        if (room.phase === "results") throw httpError(409, "This case is complete. Start a rematch before reconnecting.");
        reconnect.connected = true;
        reconnect.dropped = false;
        reconnect.lastSeen = Date.now();
        room.lastTouched = Date.now();
        response = json({ code: room.code, token: reconnect.token, playerId: reconnect.id, reconnected: true });
      } else {
        const players = activePlayers(room);
        if (room.phase !== "lobby") throw httpError(409, "This case has already started. Ask the host for the current room link after the case.");
        if (players.length >= MAX_PLAYERS) throw httpError(409, "This room is full. A room can hold eight players.");
        const player = makePlayer(body.name);
        room.players.set(player.id, player);
        room.scores.set(player.id, 0);
        room.lastTouched = Date.now();
        addLog(room, `${player.name} joined the waiting room.`, "note");
        response = json({ code: room.code, token: player.token, playerId: player.id }, 201);
      }
    } else {
      const { room: authenticatedRoom, player } = authenticate(body, roomStore);
      if (body.op === "state") {
        response = json(publicRoom(authenticatedRoom, player));
      } else if (body.op === "action") {
        const result = doAction(authenticatedRoom, player, body);
        authenticatedRoom.lastTouched = Date.now();
        response = json({ ...result, state: publicRoom(authenticatedRoom, player) }, result.ok === false ? 400 : 200);
      } else {
        throw Object.assign(new Error("Unknown game request."), { status: 400 });
      }
    }

    const committed = await store.compareAndSwap(key, previous, pack(room));
    if (Number(committed) === 1) return response;
  }
  return json({ error: "The room changed repeatedly. Please retry your action." }, 409);
}

export function createGameHandler(storeFactory = createUpstashStore) {
  return {
    async fetch(request) {
      if (request.method === "GET") {
        try {
          await storeFactory().ping();
          return json({ ok: true, storage: "connected" });
        } catch (error) {
          const status = Number(error?.status) || 503;
          return json({ error: status === 503 ? error.message : "The room service is unavailable." }, status);
        }
      }
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);

      try {
        const body = await readBody(request);
        const store = storeFactory();
        if (body.op === "create") return await createRoom(body, store);
        return await transact(body, store);
      } catch (error) {
        const status = Number(error?.status) || 500;
        const message = status < 500 || status === 503
          ? error.message
          : "The room service hit an unexpected error. Please retry.";
        return json({ error: message }, status);
      }
    },
  };
}

export default createGameHandler();
