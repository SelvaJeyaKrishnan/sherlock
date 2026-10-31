// Procedural Victorian London Ambient Soundscape
// Generates gentle rain on cobblestones and distant night breeze using the Web Audio API.
// Requires zero external sound files and works 100% offline.

let audioCtx = null;
let masterGain = null;
let rainSource = null;
let windSource = null;
let isPlaying = false;

function getAudioContext() {
  if (!audioCtx && typeof window !== 'undefined') {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  return audioCtx;
}

function createRainBuffer(ctx) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * 3; // 3-second seamless loop
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  // Generate pink/brownish noise with droplet impulses for rain on stone
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
    b6 = white * 0.115926;

    // Subtle random raindrop clicks
    const droplet = Math.random() < 0.0008 ? (Math.random() * 0.6 - 0.3) : 0;
    data[i] = pink * 0.12 + droplet;
  }
  return buffer;
}

function createWindBuffer(ctx) {
  const sampleRate = ctx.sampleRate;
  const bufferSize = sampleRate * 4;
  const buffer = ctx.createBuffer(1, bufferSize, sampleRate);
  const data = buffer.getChannelData(0);

  let lastOut = 0;
  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    data[i] = (lastOut + 0.02 * white) / 1.02;
    lastOut = data[i];
    data[i] *= 1.8;
  }
  return buffer;
}

export function getAmbientVolume() {
  try {
    const saved = localStorage.getItem('shadows-ambient-volume');
    return saved !== null ? Math.max(0, Math.min(1, Number(saved))) : 0.7;
  } catch {
    return 0.7;
  }
}

export function setAmbientVolume(vol) {
  const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
  try {
    localStorage.setItem('shadows-ambient-volume', String(clamped));
  } catch {}
  if (masterGain && audioCtx) {
    const targetGain = isPlaying ? clamped * 0.2 : 0;
    masterGain.gain.setValueAtTime(targetGain, audioCtx.currentTime);
  }
}

export function startAmbientAudio() {
  const ctx = getAudioContext();
  if (!ctx || isPlaying) return;

  if (ctx.state === 'suspended') {
    ctx.resume();
  }

  const vol = getAmbientVolume();
  masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, ctx.currentTime);
  masterGain.gain.linearRampToValueAtTime(vol * 0.2, ctx.currentTime + 1.2);
  masterGain.connect(ctx.destination);

  // Rain chain: Rain Buffer -> Bandpass Filter (cobblestone frequency) -> Rain Gain -> Master
  const rainBuffer = createRainBuffer(ctx);
  rainSource = ctx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;

  const rainFilter = ctx.createBiquadFilter();
  rainFilter.type = 'bandpass';
  rainFilter.frequency.setValueAtTime(1250, ctx.currentTime);
  rainFilter.Q.setValueAtTime(0.7, ctx.currentTime);

  const rainGain = ctx.createGain();
  rainGain.gain.setValueAtTime(0.75, ctx.currentTime);

  rainSource.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(masterGain);
  rainSource.start();

  // Wind chain: Wind Buffer -> Lowpass Filter -> Wind Gain -> Master
  const windBuffer = createWindBuffer(ctx);
  windSource = ctx.createBufferSource();
  windSource.buffer = windBuffer;
  windSource.loop = true;

  const windFilter = ctx.createBiquadFilter();
  windFilter.type = 'lowpass';
  windFilter.frequency.setValueAtTime(240, ctx.currentTime);

  // Slow LFO for wind gusting
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // 8-second gust cycle
  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(0.04, ctx.currentTime);
  const windGain = ctx.createGain();
  windGain.gain.setValueAtTime(0.08, ctx.currentTime);

  lfo.connect(lfoGain);
  lfoGain.connect(windGain.gain);
  lfo.start();

  windSource.connect(windFilter);
  windFilter.connect(windGain);
  windGain.connect(masterGain);
  windSource.start();

  isPlaying = true;
}

export function stopAmbientAudio() {
  if (!isPlaying || !audioCtx) return;
  try {
    if (masterGain) {
      masterGain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.8);
    }
    setTimeout(() => {
      try {
        rainSource?.stop();
        windSource?.stop();
        rainSource?.disconnect();
        windSource?.disconnect();
        masterGain?.disconnect();
      } catch {}
      isPlaying = false;
    }, 850);
  } catch {
    isPlaying = false;
  }
}

export function setAmbientAudioEnabled(enabled) {
  try {
    localStorage.setItem('shadows-ambient-audio', String(enabled));
  } catch {}

  if (enabled) {
    startAmbientAudio();
  } else {
    stopAmbientAudio();
  }
}

export function isAmbientAudioEnabled() {
  try {
    const saved = localStorage.getItem('shadows-ambient-audio');
    return saved === 'true';
  } catch {
    return false;
  }
}

export function initAmbientAudio() {
  const enabled = isAmbientAudioEnabled();
  const toggle = document.getElementById('ambient-audio');
  if (toggle) {
    toggle.checked = enabled;
    toggle.addEventListener('change', () => {
      setAmbientAudioEnabled(toggle.checked);
    });
  }

  const vol = getAmbientVolume();
  const volSlider = document.getElementById('ambient-volume');
  const volBadge = document.getElementById('ambient-volume-val');
  if (volSlider) {
    volSlider.value = Math.round(vol * 100);
    if (volBadge) volBadge.textContent = `${Math.round(vol * 100)}%`;
    volSlider.addEventListener('input', () => {
      const newVol = Number(volSlider.value) / 100;
      setAmbientVolume(newVol);
      if (volBadge) volBadge.textContent = `${volSlider.value}%`;
      // Safely auto-enable if user turns volume up while muted
      if (newVol > 0 && toggle && !toggle.checked) {
        toggle.checked = true;
        setAmbientAudioEnabled(true);
      }
    });
  }

  // Resume context on first user interaction if enabled
  const tryStartOnInteraction = () => {
    if (isAmbientAudioEnabled() && !isPlaying) {
      startAmbientAudio();
    }
  };
  window.addEventListener('pointerdown', tryStartOnInteraction, { once: true });
  window.addEventListener('keydown', tryStartOnInteraction, { once: true });
}

export function playOutcomeChime(isVictory) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    if (isVictory) {
      // Warm golden bell chime (C5, E5, G5)
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(f, now + i * 0.12);
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.12 + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 1.4);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 1.5);
      });
    } else {
      // Restrained low resonant minor tone (A2 + C3)
      const freqs = [110.0, 130.81];
      freqs.forEach((f) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.16, now + 0.08);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 1.8);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 1.9);
      });
    }
  } catch {}
}

export function playClueProximityShimmer() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const freqs = [739.99, 880.0, 1108.73]; // F#5, A5, C#6
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.06);
      gain.gain.setValueAtTime(0, now + i * 0.06);
      gain.gain.linearRampToValueAtTime(0.045, now + i * 0.06 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0005, now + i * 0.06 + 0.7);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.06);
      osc.stop(now + i * 0.06 + 0.75);
    });
  } catch {}
}

export function playClueInspectSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Soft brass lens click
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.09);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.13);
  } catch {}
}

export function playClueDiscoveredChime() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Victoriana Evidence Triumph Chimes (D5, F#5, A5, D6)
    const freqs = [587.33, 739.99, 880.0, 1174.66];
    freqs.forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, now + i * 0.1);
      gain.gain.setValueAtTime(0, now + i * 0.1);
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.1 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.1 + 1.6);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.1);
      osc.stop(now + i * 0.1 + 1.7);
    });
  } catch {}
}

export function playStampSlamSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Low wooden desk stamp impact
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(32, now + 0.14);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  } catch {}
}

export function playRatchetClick() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(400, now + 0.035);
    gain.gain.setValueAtTime(0.09, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.045);
  } catch {}
}

export function playLockOpenSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Heavy metallic tumbler release
    [320, 580, 840].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + i * 0.04);
      gain.gain.setValueAtTime(0, now + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.18, now + i * 0.04 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.04 + 0.4);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.04);
      osc.stop(now + i * 0.04 + 0.45);
    });
  } catch {}
}

export function playPhotoSlideSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    // Paper friction swoosh
    const bufferSize = ctx.sampleRate * 0.08;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * 0.2;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, now);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    noise.start(now);
    noise.stop(now + 0.08);
  } catch {}
}

export function playPieceSnapSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.05);
    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {}
}

export function playGearClick() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(440, now + 0.04);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.05);
  } catch {}
}

export function playCipherSolvedSound() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    [392.0, 523.25, 659.25, 783.99].forEach((f, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, now + i * 0.09);
      gain.gain.setValueAtTime(0, now + i * 0.09);
      gain.gain.linearRampToValueAtTime(0.14, now + i * 0.09 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 1.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 1.3);
    });
  } catch {}
}

export function playChaseTensionPulse() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    [0, 0.22].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(75, now + offset);
      osc.frequency.exponentialRampToValueAtTime(45, now + offset + 0.18);
      gain.gain.setValueAtTime(0.22, now + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.22);
    });
  } catch {}
}

export function playSafehouseAssembleChime() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      gain.gain.setValueAtTime(0.01, now + idx * 0.1);
      gain.gain.linearRampToValueAtTime(0.18, now + idx * 0.1 + 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.1 + 1.8);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 1.9);
    });
  } catch {}
}

export function playEvidencePinnedSlam() {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== 'running') return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.12);
    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.16);
  } catch {}
}
