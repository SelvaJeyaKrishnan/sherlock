import { spawn } from 'node:child_process';

const chrome = spawn('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', [
  '--headless=new',
  '--remote-debugging-port=9222',
  '--disable-gpu',
  'http://localhost:3000'
]);

let connected = false;
for (let i = 0; i < 30; i++) {
  await new Promise(r => setTimeout(r, 200));
  try {
    await fetch('http://localhost:9222/json');
    connected = true;
    break;
  } catch {}
}

const list = await (await fetch('http://localhost:9222/json')).json();
const page = list.find(t => t.url.includes('localhost:3000'));
console.log('Page connected');

if (page?.webSocketDebuggerUrl) {
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const msgId = id++;
    const handler = (evt) => {
      const data = JSON.parse(evt.data);
      if (data.id === msgId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });

  await new Promise(r => ws.onopen = r);
  ws.onmessage = (evt) => {
    const msg = JSON.parse(evt.data);
    if (msg.method === 'Runtime.consoleAPICalled') {
      console.log('[BROWSER CONSOLE]', msg.params.type, msg.params.args.map(a => a.value || a.description));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      console.error('[BROWSER EXCEPTION]', msg.params.exceptionDetails.text, msg.params.exceptionDetails.exception?.description);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Console.enable');

  await new Promise(r => setTimeout(r, 1000));

  // Check state of buttons on welcome screen
  const evalResult = await send('Runtime.evaluate', {
    expression: `(() => {
      const playSolo = document.getElementById('play-game');
      const createRoom = document.getElementById('menu-create-room');
      const joinRoom = document.getElementById('menu-join-room');
      const settings = document.getElementById('open-settings');
      const howToPlay = document.getElementById('open-how-to-play');
      return {
        playSolo: { exists: !!playSolo, text: playSolo?.innerText, disabled: playSolo?.disabled },
        createRoom: { exists: !!createRoom, text: createRoom?.innerText, disabled: createRoom?.disabled },
        joinRoom: { exists: !!joinRoom, text: joinRoom?.innerText, disabled: joinRoom?.disabled },
        settings: { exists: !!settings, text: settings?.innerText, disabled: settings?.disabled },
        howToPlay: { exists: !!howToPlay, text: howToPlay?.innerText, disabled: howToPlay?.disabled },
        visibleScreens: Array.from(document.querySelectorAll('main:not(.hidden), .entry-screen:not(.hidden)')).map(e => e.id)
      };
    })()`,
    returnByValue: true
  });
  console.log('Buttons state:', evalResult?.result?.value);

  // Click Play Solo button
  console.log('--- Triggering click on #play-game ---');
  await send('Runtime.evaluate', {
    expression: `document.getElementById('play-game').click();`
  });
  await new Promise(r => setTimeout(r, 500));

  const afterPlaySolo = await send('Runtime.evaluate', {
    expression: `(() => {
      return {
        visibleScreens: Array.from(document.querySelectorAll('main:not(.hidden), .entry-screen:not(.hidden), #game:not(.hidden), #lobby-screen:not(.hidden)')).map(e => e.id),
        playerNameValue: document.getElementById('player-name')?.value
      };
    })()`,
    returnByValue: true
  });
  console.log('After clicking #play-game:', afterPlaySolo?.result?.value);

  ws.close();
}

chrome.kill();
