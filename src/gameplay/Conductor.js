/**
 * Conductor - Timing engine for rhythm game
 * Works with both traditional audio files AND procedurally generated audio
 * Uses performance.now() for precise timing instead of audio.currentTime
 */

export class Conductor {
  constructor(bpm = 100) {
    this.bpm = bpm;
    this.songPosition = 0;
    this.currentBeat = 0;
    this.currentStep = 0;
    this._audio = null;           // Audio element (or mock object from AudioGenerator)
    this._startTime = null;       // Start time using performance.now()
    this._pauseOffset = 0;        // Offset when pausing/resuming
    this._lastPosition = 0;       // Track last position for jump detection
    this._positionJumps = 0;      // Count how many jumps occurred (for debugging)
  }

  /** Begin the clock. Call this when the song is ready to start. */
  start() {
    this._startTime = performance.now() - this._pauseOffset;
    this._pauseOffset = 0;
  }

  /** Pause the conductor (preserve current position) */
  pause() {
    if (this._startTime !== null) {
      this._pauseOffset = performance.now() - this._startTime;
    }
  }

  /** Resume from pause */
  resume() {
    if (this._pauseOffset > 0) {
      this._startTime = performance.now() - this._pauseOffset;
    }
  }

  /** Milliseconds per beat */
  get crochet() {
    return (60 / this.bpm) * 1000;
  }

  /** Milliseconds per 16th-note step */
  get stepCrochet() {
    return this.crochet / 4;
  }

  /**
   * Set audio reference (can be Audio element or AudioGenerator mock)
   * This is kept for compatibility but timing is handled by performance.now()
   */
  setAudio(audioEl) {
    this._audio = audioEl;
  }

  /**
   * Update song position and beat/step counters
   * Uses high-precision performance.now() instead of audio.currentTime
   * This ensures perfect sync with procedurally generated audio
   *
   * FIX: Detects and clamps position jumps to prevent notes from disappearing
   * when tab loses focus or browser throttles
   */
  update() {
    if (this._startTime !== null) {
      // Calculate position based on elapsed time since start
      const newPosition = performance.now() - this._startTime;

      // FIX: Detect position jumps > 1000ms (indicates tab unfocus or throttling)
      const positionDelta = newPosition - this._lastPosition;
      const MAX_JUMP = 1000; // Max allowed jump in milliseconds (1 second)

      if (positionDelta > MAX_JUMP && this._lastPosition > 0) {
        // Position jumped! Clamp the jump to prevent note skipping
        console.warn(`⚠️ Conductor position jump detected: ${positionDelta.toFixed(0)}ms → clamped to ${MAX_JUMP}ms`);
        this._positionJumps++;

        // Advance time by MAX_JUMP instead of the full delta
        this.songPosition = this._lastPosition + MAX_JUMP;

        // Adjust _startTime to match the clamped position
        // This keeps future updates synchronized
        this._startTime = performance.now() - this.songPosition;
      } else if (positionDelta < 0) {
        // FIX: Prevent songPosition from going backwards
        console.warn(`⚠️ Conductor time went backwards: ${positionDelta.toFixed(0)}ms → ignoring`);
        // Keep previous position
        this.songPosition = this._lastPosition;
      } else {
        // Normal update - no jump detected
        this.songPosition = newPosition;
      }

      this._lastPosition = this.songPosition;
    }

    // Calculate current beat and step from position
    this.currentBeat = Math.floor(this.songPosition / this.crochet);
    this.currentStep = Math.floor(this.songPosition / this.stepCrochet);
  }

  /**
   * Reset conductor to beginning (for looping)
   * Restarts timing from position 0
   */
  reset() {
    this.songPosition = 0;
    this.currentBeat = 0;
    this.currentStep = 0;
    this._pauseOffset = 0;
    this._lastPosition = 0; // FIX: Reset jump detection
    // Restart timing immediately from current moment
    this._startTime = performance.now();
  }
}

