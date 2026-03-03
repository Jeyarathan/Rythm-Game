let _ctx = null;

function getCtx() {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === 'suspended') _ctx.resume();
  return _ctx;
}

// Per-lane pitch: 0=Left, 1=Down, 2=Up, 3=Right
// start → end frequency of the sweep (all different now!)
const LANE_PITCH = [
  [700, 300],   // Left  — low-mid
  [480, 200],   // Down  — lowest
  [1600, 680],  // Up    — highest
  [1100, 480],  // Right — high-mid
];

/**
 * Plays a short percussive blip — synthesized, no files needed.
 * @param {number} [lane=0]   0=Left 1=Down 2=Up 3=Right
 * @param {number} [volume=0.22]
 */
export function playHitSound(lane = 0, volume = 0.22) {
  try {
    const ctx  = getCtx();
    const now  = ctx.currentTime;
    const [freqStart, freqEnd] = LANE_PITCH[lane] ?? LANE_PITCH[0];

    // Oscillator — quick high-to-low pitch sweep
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freqStart, now);
    osc.frequency.exponentialRampToValueAtTime(freqEnd, now + 0.07);

    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);

    osc.start(now);
    osc.stop(now + 0.09);

    // Short noise transient for click texture
    const bufSize   = ctx.sampleRate * 0.03;
    const buffer    = ctx.createBuffer(1, bufSize, ctx.sampleRate);
    const data      = buffer.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = (Math.random() * 2 - 1);

    const noise     = ctx.createBufferSource();
    const noiseGain = ctx.createGain();
    const filter    = ctx.createBiquadFilter();

    noise.buffer = buffer;
    filter.type  = 'highpass';
    filter.frequency.value = 3000;

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(ctx.destination);

    noiseGain.gain.setValueAtTime(volume * 0.6, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    noise.start(now);
    noise.stop(now + 0.03);
  } catch (_) {
    // AudioContext unavailable — silently skip
  }
}
