/**
 * AudioGenerator - Procedural music generation using Web Audio API
 * Generates placeholder music for each song without needing audio files
 * Each song has a unique pattern based on its BPM
 */

export class AudioGenerator {
  constructor() {
    // Create audio context (will be initialized on user interaction)
    this.audioContext = null;
    this.masterGain = null;

    // Track current song
    this.currentSong = null;
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseTime = 0;

    // Scheduled notes (for stopping/cleanup)
    this.scheduledSources = [];

    // Loop callback - fired when audio loops/restarts
    // Used to sync game state (notes, conductor, etc.) with looping audio
    this.onLoop = null;

    // Loop tracking
    this.loopSchedulerInterval = null;
    this.nextScheduleTime = 0;
    this.scheduleAheadTime = 10; // Schedule 10 seconds ahead
    this.lastLoopNotification = 0; // Track when we last notified about loop

    // Song patterns - each song has unique characteristics
    this.songPatterns = {
      tutorial: {
        bpm: 100,
        bassNotes: [0, 0, 7, 0],           // Simple bass pattern
        melodyNotes: [0, 4, 7, 12],        // C-E-G-C (major chord)
        melodyRhythm: [0, 0.25, 0.5, 0.75], // Quarter notes
        hiHatPattern: [0, 0.25, 0.5, 0.75], // Steady beat
        bassVolume: 0.3,
        melodyVolume: 0.15,
        hiHatVolume: 0.08,
      },
      bopeebo: {
        bpm: 140,
        bassNotes: [0, 0, 5, 7],           // Funky bass
        melodyNotes: [0, 3, 7, 10, 12, 10, 7, 3], // Pentatonic scale
        melodyRhythm: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875], // Eighth notes
        hiHatPattern: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875], // Fast hi-hat
        bassVolume: 0.35,
        melodyVolume: 0.18,
        hiHatVolume: 0.1,
      },
      fresh: {
        bpm: 120,
        bassNotes: [0, 7, 5, 3],           // Walking bass
        melodyNotes: [0, 2, 4, 7, 9, 7, 4, 2], // Major scale melody
        melodyRhythm: [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875],
        hiHatPattern: [0, 0.25, 0.5, 0.75], // Moderate hi-hat
        bassVolume: 0.32,
        melodyVolume: 0.16,
        hiHatVolume: 0.09,
      },
      dadbattle: {
        bpm: 150,
        bassNotes: [0, 0, 3, 3, 5, 5, 7, 7], // Heavy metal style
        melodyNotes: [0, 5, 7, 12, 7, 5],   // Power chord progression
        melodyRhythm: [0, 0.167, 0.333, 0.5, 0.667, 0.833], // Triplets
        hiHatPattern: [0, 0.083, 0.167, 0.25, 0.333, 0.417, 0.5, 0.583, 0.667, 0.75, 0.833, 0.917], // Double-time
        bassVolume: 0.4,
        melodyVolume: 0.2,
        hiHatVolume: 0.12,
      },
      south: {
        bpm: 160,
        bassNotes: [0, 0, 0, 7, 5, 5, 5, 3], // Fast punchy bass
        melodyNotes: [12, 14, 16, 14, 12, 10, 12, 9, 7], // High melody
        melodyRhythm: [0, 0.111, 0.222, 0.333, 0.444, 0.556, 0.667, 0.778, 0.889],
        hiHatPattern: [0, 0.0625, 0.125, 0.1875, 0.25, 0.3125, 0.375, 0.4375, 0.5, 0.5625, 0.625, 0.6875, 0.75, 0.8125, 0.875, 0.9375], // Very fast
        bassVolume: 0.38,
        melodyVolume: 0.19,
        hiHatVolume: 0.11,
      },
    };
  }

  /**
   * Initialize audio context (must be called after user interaction)
   */
  async init() {
    if (this.audioContext) return; // Already initialized

    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();

      // Create master gain node for volume control
      this.masterGain = this.audioContext.createGain();
      this.masterGain.gain.value = 0.7; // Master volume
      this.masterGain.connect(this.audioContext.destination);

      console.log('AudioGenerator initialized');
      return true;
    } catch (err) {
      console.error('Failed to initialize AudioGenerator:', err);
      return false;
    }
  }

  /**
   * Convert semitones to frequency (A4 = 440 Hz is reference)
   */
  noteToFrequency(semitone, baseFrequency = 220) {
    // baseFrequency is A3 (220 Hz)
    return baseFrequency * Math.pow(2, semitone / 12);
  }

  /**
   * Create a bass drum sound
   */
  createBassDrum(time, pattern) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    // Start at high frequency and sweep down (kick drum effect)
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.1);

    // Short envelope
    gain.gain.setValueAtTime(pattern.bassVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.2);

    this.scheduledSources.push(osc);
  }

  /**
   * Create a bass note
   */
  createBassNote(time, semitone, pattern) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'sawtooth'; // Rich bass sound
    osc.frequency.value = this.noteToFrequency(semitone, 110); // Lower octave

    // Envelope for bass
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(pattern.bassVolume, time + 0.01);
    gain.gain.linearRampToValueAtTime(pattern.bassVolume * 0.7, time + 0.15);
    gain.gain.linearRampToValueAtTime(0, time + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.4);

    this.scheduledSources.push(osc);
  }

  /**
   * Create a melody note
   */
  createMelodyNote(time, semitone, pattern) {
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    osc.type = 'square'; // Chiptune-style melody
    osc.frequency.value = this.noteToFrequency(semitone, 440); // Higher octave

    // Envelope for melody
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(pattern.melodyVolume, time + 0.01);
    gain.gain.linearRampToValueAtTime(pattern.melodyVolume * 0.5, time + 0.08);
    gain.gain.linearRampToValueAtTime(0, time + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(time);
    osc.stop(time + 0.15);

    this.scheduledSources.push(osc);
  }

  /**
   * Create a hi-hat sound
   */
  createHiHat(time, pattern) {
    // Hi-hat uses white noise filtered
    const bufferSize = this.audioContext.sampleRate * 0.1; // 100ms
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);

    // Generate white noise
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;

    // High-pass filter for hi-hat sound
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 8000;

    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(pattern.hiHatVolume, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(time);
    noise.stop(time + 0.05);

    this.scheduledSources.push(noise);
  }

  /**
   * Schedule notes for a song pattern
   * Returns the pattern duration for loop timing
   */
  schedulePattern(startTime, duration, pattern) {
    const beatDuration = 60 / pattern.bpm; // Duration of one beat in seconds
    const patternDuration = beatDuration * 4; // 4-beat pattern

    let currentTime = startTime;
    const endTime = startTime + duration;

    while (currentTime < endTime) {
      // Schedule bass notes (kick on beat 1 and 3)
      this.createBassDrum(currentTime, pattern);
      this.createBassDrum(currentTime + beatDuration * 2, pattern);

      // Schedule bass notes
      pattern.bassNotes.forEach((semitone, i) => {
        const noteTime = currentTime + (i / pattern.bassNotes.length) * patternDuration;
        if (noteTime < endTime) {
          this.createBassNote(noteTime, semitone, pattern);
        }
      });

      // Schedule melody notes
      pattern.melodyNotes.forEach((semitone, i) => {
        const rhythm = pattern.melodyRhythm[i % pattern.melodyRhythm.length];
        const noteTime = currentTime + rhythm * beatDuration * 4;
        if (noteTime < endTime) {
          this.createMelodyNote(noteTime, semitone, pattern);
        }
      });

      // Schedule hi-hat pattern
      pattern.hiHatPattern.forEach((rhythm) => {
        const noteTime = currentTime + rhythm * beatDuration * 4;
        if (noteTime < endTime) {
          this.createHiHat(noteTime, pattern);
        }
      });

      currentTime += patternDuration;
    }

    // Return pattern duration for loop scheduling
    return patternDuration;
  }

  /**
   * Start playing a song
   * @param {string} songKey - Song identifier
   * @param {number} speedMultiplier - Playback speed (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
   */
  async play(songKey, speedMultiplier = 1.0) {
    if (!this.audioContext) {
      await this.init();
    }

    // Resume audio context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const pattern = this.songPatterns[songKey];
    if (!pattern) {
      console.error(`Unknown song: ${songKey}`);
      return null;
    }

    // Stop any currently playing song
    this.stop();

    this.currentSong = songKey;
    this.isPlaying = true;
    this.startTime = this.audioContext.currentTime - (this.pauseTime || 0);
    this.lastLoopNotification = 0;
    this.speedMultiplier = speedMultiplier; // Store for resume/loop

    // Calculate pattern length for loop detection (with speed multiplier)
    const effectiveBpm = pattern.bpm * speedMultiplier;
    const beatDuration = 60 / effectiveBpm;
    const patternDuration = beatDuration * 4;
    this.patternDuration = patternDuration;

    // Create modified pattern with adjusted BPM for speed multiplier
    const modifiedPattern = { ...pattern, bpm: effectiveBpm };
    this.currentPattern = modifiedPattern; // Store for loop scheduler

    // Schedule initial audio chunk
    this.nextScheduleTime = this.audioContext.currentTime;
    this.schedulePattern(this.nextScheduleTime, this.scheduleAheadTime, modifiedPattern);
    this.nextScheduleTime += this.scheduleAheadTime;

    // Start continuous scheduler to keep audio playing and detect loops
    this.startLoopScheduler(modifiedPattern);

    // Return a mock audio object that matches the Audio API
    return {
      currentTime: 0,
      duration: 0,
      paused: false,
      volume: this.masterGain.gain.value,
      play: async () => { await this.resume(); },
      pause: () => { this.pause(); },
    };
  }

  /**
   * Start the loop scheduler - continuously schedules ahead and detects loops
   */
  startLoopScheduler(pattern) {
    // Clear any existing scheduler
    if (this.loopSchedulerInterval) {
      clearInterval(this.loopSchedulerInterval);
    }

    // Check every 100ms if we need to schedule more audio
    this.loopSchedulerInterval = setInterval(() => {
      if (!this.isPlaying) return;

      const currentTime = this.audioContext.currentTime;
      const timeUntilNext = this.nextScheduleTime - currentTime;

      // If we're within 5 seconds of running out of scheduled audio, schedule more
      if (timeUntilNext < 5) {
        // Calculate song position to detect loops
        const songPosition = (currentTime - this.startTime) * 1000; // In milliseconds
        const loopNumber = Math.floor(songPosition / (this.patternDuration * 1000));

        // Check if we've crossed into a new loop
        if (loopNumber > this.lastLoopNotification) {
          this.lastLoopNotification = loopNumber;
          // Fire onLoop callback to notify game state to reset
          if (this.onLoop) {
            console.log(`Audio loop detected at ${songPosition}ms (loop #${loopNumber})`);
            this.onLoop();
          }
        }

        // Schedule next chunk
        this.schedulePattern(this.nextScheduleTime, this.scheduleAheadTime, pattern);
        this.nextScheduleTime += this.scheduleAheadTime;
      }
    }, 100); // Check every 100ms
  }

  /**
   * Pause playback
   */
  pause() {
    if (!this.isPlaying) return;

    this.pauseTime = this.audioContext.currentTime - this.startTime;
    this.isPlaying = false;

    // Stop loop scheduler
    if (this.loopSchedulerInterval) {
      clearInterval(this.loopSchedulerInterval);
      this.loopSchedulerInterval = null;
    }

    // Stop all scheduled sounds
    this.stopAllSources();
  }

  /**
   * Resume playback
   */
  async resume() {
    if (this.isPlaying || !this.currentSong) return;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Use stored pattern with speed multiplier (or fallback to original)
    const pattern = this.currentPattern || this.songPatterns[this.currentSong];
    this.isPlaying = true;
    this.startTime = this.audioContext.currentTime - (this.pauseTime || 0);

    // Re-schedule audio
    this.nextScheduleTime = this.audioContext.currentTime;
    this.schedulePattern(this.nextScheduleTime, this.scheduleAheadTime, pattern);
    this.nextScheduleTime += this.scheduleAheadTime;

    // Restart loop scheduler
    this.startLoopScheduler(pattern);
  }

  /**
   * Stop playback completely
   */
  stop() {
    this.isPlaying = false;
    this.startTime = 0;
    this.pauseTime = 0;
    this.currentSong = null;
    this.lastLoopNotification = 0;

    // Stop loop scheduler
    if (this.loopSchedulerInterval) {
      clearInterval(this.loopSchedulerInterval);
      this.loopSchedulerInterval = null;
    }

    this.stopAllSources();
  }

  /**
   * Stop all currently scheduled audio sources
   */
  stopAllSources() {
    this.scheduledSources.forEach(source => {
      try {
        source.stop();
      } catch (e) {
        // Already stopped
      }
    });
    this.scheduledSources = [];
  }

  /**
   * Get current playback time in milliseconds
   */
  getCurrentTime() {
    if (!this.isPlaying) return this.pauseTime * 1000;
    return (this.audioContext.currentTime - this.startTime) * 1000;
  }

  /**
   * Set master volume
   */
  setVolume(value) {
    if (this.masterGain) {
      this.masterGain.gain.value = Math.max(0, Math.min(1, value));
    }
  }

  /**
   * Get pattern info for a song
   */
  getSongPattern(songKey) {
    return this.songPatterns[songKey];
  }
}

// Create singleton instance
export const audioGenerator = new AudioGenerator();
