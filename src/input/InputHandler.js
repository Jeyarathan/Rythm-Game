/** Maps key names → lane index (0–3) */
const BINDINGS = {
  'a': 0, 'arrowleft': 0,
  's': 1, 'arrowdown':  1,
  'w': 2, 'arrowup':    2,
  'd': 3, 'arrowright': 3,
};

export class InputHandler {
  constructor() {
    this.held = [false, false, false, false];
    this.onHit     = null;  // (lane: number) => void
    this.onRelease = null;  // (lane: number) => void

    this._onKeyDown = this._onKeyDown.bind(this);
    this._onKeyUp   = this._onKeyUp.bind(this);
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup',   this._onKeyUp);
  }

  _onKeyDown(e) {
    const lane = BINDINGS[e.key.toLowerCase()];
    if (lane === undefined || this.held[lane]) return;
    e.preventDefault();
    this.held[lane] = true;
    this.onHit?.(lane);
  }

  _onKeyUp(e) {
    const lane = BINDINGS[e.key.toLowerCase()];
    if (lane === undefined) return;
    this.held[lane] = false;
    this.onRelease?.(lane);
  }

  destroy() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup',   this._onKeyUp);
  }
}
