export class Conductor {
  constructor(bpm = 100) {
    this.bpm = bpm;
    this.songPosition = 0;
    this.currentBeat = 0;
    this.currentStep = 0;
    this._audio = null;
    this._startTime = null;
  }

  /** Begin the clock. Call this when the song is ready to start. */
  start() {
    this._startTime = performance.now();
  }

  /** Milliseconds per beat */
  get crochet() {
    return (60 / this.bpm) * 1000;
  }

  /** Milliseconds per 16th-note step */
  get stepCrochet() {
    return this.crochet / 4;
  }

  setAudio(audioEl) {
    this._audio = audioEl;
  }

  update() {
    if (this._startTime !== null) {
      this.songPosition = performance.now() - this._startTime;
    }
    this.currentBeat = Math.floor(this.songPosition / this.crochet);
    this.currentStep = Math.floor(this.songPosition / this.stepCrochet);
  }
}
