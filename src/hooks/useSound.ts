import { useRef, useEffect, useCallback } from 'react';

function createNoiseBuffer(
  ctx: AudioContext,
  duration: number,
  filterFreq: number,
  volume: number,
  type: 'white' | 'brown' = 'white',
) {
  const sampleRate = ctx.sampleRate;
  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (type === 'brown') {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5 * volume;
    } else {
      data[i] = white * volume;
    }
  }

  // Offline-ish: we just return raw buffer; filtering applied at play time
  void filterFreq;
  return buffer;
}

function createFootstepBuffer(ctx: AudioContext) {
  const sampleRate = ctx.sampleRate;
  const duration = 0.12;
  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    // Heel thud + grit
    const env = Math.exp(-t * 28) * (1 - t * 4);
    const thud = Math.sin(2 * Math.PI * (90 + t * 40) * t) * 0.55;
    const grit = (Math.random() * 2 - 1) * Math.exp(-t * 55) * 0.45;
    data[i] = (thud + grit) * env * 0.9;
  }
  return buffer;
}

function createCarPassBuffer(ctx: AudioContext) {
  const sampleRate = ctx.sampleRate;
  const duration = 1.8;
  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const n = t / duration;
    // Doppler-ish whoosh envelope
    const env = Math.sin(Math.PI * n) ** 1.4;
    const engine = Math.sin(2 * Math.PI * (55 + n * 35) * t) * 0.35;
    const whoosh = (Math.random() * 2 - 1) * 0.25;
    data[i] = (engine + whoosh) * env * 0.5;
  }
  return buffer;
}

function createHornBuffer(ctx: AudioContext) {
  const sampleRate = ctx.sampleRate;
  const duration = 0.35;
  const length = Math.floor(duration * sampleRate);
  const buffer = ctx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const env = Math.exp(-t * 4) * (t < 0.02 ? t / 0.02 : 1);
    const a = Math.sin(2 * Math.PI * 380 * t);
    const b = Math.sin(2 * Math.PI * 420 * t);
    data[i] = (a * 0.55 + b * 0.45) * env * 0.25;
  }
  return buffer;
}

export function useSound() {
  const ctxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const windSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const trafficSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const footstepBufferRef = useRef<AudioBuffer | null>(null);
  const carBufferRef = useRef<AudioBuffer | null>(null);
  const hornBufferRef = useRef<AudioBuffer | null>(null);
  const lastFootstepRef = useRef(0);
  const unlockedRef = useRef(false);
  const carTimerRef = useRef<number | null>(null);
  const disposedRef = useRef(false);

  const ensureCtx = useCallback(() => {
    if (disposedRef.current) return null;
    if (!ctxRef.current) {
      const ctx = new AudioContext();
      ctxRef.current = ctx;
      const master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
      masterGainRef.current = master;

      footstepBufferRef.current = createFootstepBuffer(ctx);
      carBufferRef.current = createCarPassBuffer(ctx);
      hornBufferRef.current = createHornBuffer(ctx);
    }
    return ctxRef.current;
  }, []);

  const playBuffered = useCallback(
    (
      buffer: AudioBuffer | null,
      opts: { volume?: number; filterFreq?: number; playbackRate?: number; pan?: number } = {},
    ) => {
      const ctx = ctxRef.current;
      const master = masterGainRef.current;
      if (!ctx || !master || !buffer || ctx.state !== 'running') return;

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = opts.playbackRate ?? 1;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = opts.filterFreq ?? 4000;

      const gain = ctx.createGain();
      gain.gain.value = opts.volume ?? 0.2;

      let node: AudioNode = source;
      source.connect(filter);
      node = filter;

      if (ctx.createStereoPanner && opts.pan != null) {
        const panner = ctx.createStereoPanner();
        panner.pan.value = opts.pan;
        filter.connect(panner);
        panner.connect(gain);
      } else {
        filter.connect(gain);
      }
      gain.connect(master);
      source.start();
      void node;
    },
    [],
  );

  const startLoops = useCallback(() => {
    const ctx = ctxRef.current;
    const master = masterGainRef.current;
    if (!ctx || !master || windSourceRef.current) return;

    // Wind breeze (brown noise, high-pass soft)
    const windBuf = createNoiseBuffer(ctx, 6, 800, 0.35, 'brown');
    const wind = ctx.createBufferSource();
    wind.buffer = windBuf;
    wind.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 450;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.07;
    // gentle LFO on wind
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = 0.08;
    lfoGain.gain.value = 0.03;
    lfo.connect(lfoGain);
    lfoGain.connect(windGain.gain);
    wind.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    wind.start();
    lfo.start();
    windSourceRef.current = wind;

    // Distant traffic bed
    const trafficBuf = createNoiseBuffer(ctx, 5, 300, 0.4, 'brown');
    const traffic = ctx.createBufferSource();
    traffic.buffer = trafficBuf;
    traffic.loop = true;
    const tFilter = ctx.createBiquadFilter();
    tFilter.type = 'lowpass';
    tFilter.frequency.value = 280;
    const tGain = ctx.createGain();
    tGain.gain.value = 0.09;
    traffic.connect(tFilter);
    tFilter.connect(tGain);
    tGain.connect(master);
    traffic.start();
    trafficSourceRef.current = traffic;

    // Occasional car passes / horns
    const scheduleCar = () => {
      if (disposedRef.current || !unlockedRef.current) return;
      const pan = Math.random() * 2 - 1;
      playBuffered(carBufferRef.current, {
        volume: 0.08 + Math.random() * 0.07,
        filterFreq: 900 + Math.random() * 800,
        playbackRate: 0.85 + Math.random() * 0.35,
        pan,
      });
      if (Math.random() < 0.18) {
        window.setTimeout(() => {
          playBuffered(hornBufferRef.current, {
            volume: 0.05 + Math.random() * 0.04,
            filterFreq: 2000,
            pan: pan * 0.7,
          });
        }, 200 + Math.random() * 400);
      }
      carTimerRef.current = window.setTimeout(scheduleCar, 2800 + Math.random() * 5200);
    };
    carTimerRef.current = window.setTimeout(scheduleCar, 1200);
  }, [playBuffered]);

  const unlock = useCallback(async () => {
    if (unlockedRef.current || disposedRef.current) return;
    const ctx = ensureCtx();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      try {
        await ctx.resume();
      } catch {
        return;
      }
    }
    if (ctx.state !== 'running') return;

    unlockedRef.current = true;
    startLoops();
  }, [ensureCtx, startLoops]);

  useEffect(() => {
    disposedRef.current = false;
    const onGesture = () => {
      void unlock();
    };
    window.addEventListener('pointerdown', onGesture);
    window.addEventListener('keydown', onGesture);

    return () => {
      disposedRef.current = true;
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
      if (carTimerRef.current != null) window.clearTimeout(carTimerRef.current);
      try {
        windSourceRef.current?.stop();
      } catch {
        /* ok */
      }
      try {
        trafficSourceRef.current?.stop();
      } catch {
        /* ok */
      }
      windSourceRef.current = null;
      trafficSourceRef.current = null;
      // Don't close AudioContext on StrictMode remount mid-session if still unlocked —
      // closing causes silent bugs. Only null refs after stop.
      void ctxRef.current?.close();
      ctxRef.current = null;
      masterGainRef.current = null;
      unlockedRef.current = false;
    };
  }, [unlock]);

  const playFootstep = useCallback(() => {
    void unlock();
    const ctx = ctxRef.current;
    if (!ctx || ctx.state !== 'running') return;

    const now = ctx.currentTime;
    if (now - lastFootstepRef.current < 0.32) return;
    lastFootstepRef.current = now;

    playBuffered(footstepBufferRef.current, {
      volume: 0.16 + Math.random() * 0.08,
      filterFreq: 1200 + Math.random() * 900,
      playbackRate: 0.92 + Math.random() * 0.18,
      pan: (Math.random() - 0.5) * 0.3,
    });
  }, [unlock, playBuffered]);

  return { playFootstep, unlock };
}
