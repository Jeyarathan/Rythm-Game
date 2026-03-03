export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.state = null;
    this.lastTime = 0;
    this._loop = this._loop.bind(this);
  }

  changeState(state) {
    this.state = state;
  }

  start() {
    requestAnimationFrame(this._loop);
  }

  _loop(timestamp) {
    const dt = Math.min((timestamp - this.lastTime) / 1000, 0.1);
    this.lastTime = timestamp;

    // Always reset transform before clearing — keeps the canvas sane even if
    // a previous frame threw an exception mid-render (unbalanced save/restore).
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    if (this.state) {
      try {
        this.state.update(dt);
        this.state.render(this.ctx);
      } catch (err) {
        console.error('Game loop error:', err);
        this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
    }

    requestAnimationFrame(this._loop);
  }
}
