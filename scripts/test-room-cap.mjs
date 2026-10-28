const endpoint = process.env.GAME_TEST_URL || 'http://localhost:3000/api/game';

async function request(body) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  return { response, data };
}

const created = await request({ op: 'create', name: 'Cap host' });
if (!created.response.ok) throw new Error(`Create failed: ${created.data.error}`);
// Join serially against the local in-memory test server; atomic concurrency is
// covered separately by the Vercel API handler test.
const seats = [];
for (let index = 0; index < 7; index++) {
  seats.push(await request({ op: 'join', code: created.data.code, name: `Player ${index + 1}` }));
}
if (seats.some(({ response }) => !response.ok)) throw new Error('A valid player could not join.');
const state = await request({ op: 'state', code: created.data.code, token: created.data.token });
if (state.data.room.connectedCount !== 8) throw new Error(`Expected 8 connected players, got ${state.data.room.connectedCount}.`);
const ninth = await request({ op: 'join', code: created.data.code, name: 'Ninth player' });
if (ninth.response.status !== 409 || !ninth.data.error?.includes('full')) throw new Error('The ninth player was not rejected with a clear full-room error.');

const coOpHost = await request({ op: 'create', name: 'Holmes' });
const coOpGuest = await request({ op: 'join', code: coOpHost.data.code, name: 'Watson' });
if (!coOpGuest.response.ok) throw new Error(`Co-op join failed: ${coOpGuest.data.error}`);
const hostReady = await request({ op: 'action', action: 'ready', ready: true, code: coOpHost.data.code, token: coOpHost.data.token });
if (!hostReady.response.ok) throw new Error(`Host ready action failed: ${hostReady.data.error}`);
const waiting = await request({ op: 'state', code: coOpHost.data.code, token: coOpHost.data.token });
if (waiting.data.room.phase !== 'lobby' || waiting.data.room.readyCount !== 1) throw new Error('The game started before every player was ready.');
const guestReady = await request({ op: 'action', action: 'ready', ready: true, code: coOpGuest.data.code, token: coOpGuest.data.token });
if (!guestReady.response.ok) throw new Error(`Guest ready action failed: ${guestReady.data.error}`);
const prematureGuestStart = await request({ op: 'action', action: 'start', code: coOpHost.data.code, token: coOpGuest.data.token });
if (prematureGuestStart.response.status !== 400) throw new Error('A guest was allowed to start the room.');
const hostStart = await request({ op: 'action', action: 'start', code: coOpHost.data.code, token: coOpHost.data.token });
if (!hostStart.response.ok) throw new Error(`Host start action failed: ${hostStart.data.error}`);
const coOpStates = [];
for (const player of [coOpHost.data, coOpGuest.data]) coOpStates.push(await request({ op: 'state', code: player.code, token: player.token }));
if (coOpStates.some(({ data }) => data.room.mode !== 'cooperative' || data.me.role !== 'detective')) throw new Error('A two-player game did not start in cooperative detective mode.');

const partyHost = await request({ op: 'create', name: 'Inspector' });
const partySeats = [];
for (const name of ['Irene', 'Lestrade', 'Moriarty']) {
  partySeats.push(await request({ op: 'join', code: partyHost.data.code, name }));
}
if (partySeats.some(({ response }) => !response.ok)) throw new Error('A detective could not join the four-player room.');
for (const { data } of [partyHost, ...partySeats]) {
  const ready = await request({ op: 'action', action: 'ready', ready: true, code: data.code, token: data.token });
  if (!ready.response.ok) throw new Error(`A player could not signal ready: ${ready.data.error}`);
}
const prematurePartyGuestStart = await request({ op: 'action', action: 'start', code: partyHost.data.code, token: partySeats[0].data.token });
if (prematurePartyGuestStart.response.status !== 400) throw new Error('A non-host was allowed to start the four-player room.');
const partyHostStart = await request({ op: 'action', action: 'start', code: partyHost.data.code, token: partyHost.data.token });
if (!partyHostStart.response.ok) throw new Error(`The host could not start the four-player case: ${partyHostStart.data.error}`);
const partyStates = [];
for (const player of [partyHost.data, ...partySeats.map(({ data }) => data)]) {
  partyStates.push(await request({ op: 'state', code: player.code, token: player.token }));
}
if (partyStates.some(({ response }) => !response.ok)) throw new Error('A player could not read the four-player game state.');
const roles = partyStates.map(({ data }) => data.me.role);
if (partyStates.some(({ data }) => data.room.mode !== 'deduction' || data.room.players.some((player) => player.revealedRole))) throw new Error('The four-player case exposed a secret role or skipped culprit mode.');
if (roles.filter((role) => role === 'culprit').length !== 1) throw new Error('A four-player game must assign exactly one culprit.');

console.log('PASS: room cap; game waits for every player’s ready signal; two-player co-op and four-player hidden-culprit modes start correctly.');
