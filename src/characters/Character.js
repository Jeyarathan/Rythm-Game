import { drawPlaceholderChar } from './PlaceholderChar.js';

const DIRS = ['Left', 'Down', 'Up', 'Right'];

export class Character {
  /**
   * @param {object} config
   * @param {number} config.x           - Foot anchor X on canvas
   * @param {number} config.y           - Foot anchor Y on canvas
   * @param {number} [config.scale=1]
   * @param {boolean} [config.flipX=false]
   * @param {number} [config.singDuration=600]  - ms before returning to idle
   * @param {string} [config.spriteSheet]       - URL of sprite-sheet image
   * @param {object} [config.animations]        - { name: { frames:[{x,y,w,h}], fps, loop } }
   * @param {object} [config.offsets]           - { name: [dx, dy] } anchor corrections
   */
  constructor(config) {
    this.x            = config.x ?? 0;
    this.y            = config.y ?? 0;
    this.scale        = config.scale ?? 1;
    this.flipX        = config.flipX ?? false;
    this.singDuration = config.singDuration ?? 600;
    this.theme        = config.theme ?? {};

    // Sprite-sheet support
    this.image      = null;
    this.animations = config.animations ?? {};
    this.offsets    = config.offsets    ?? {};

    if (config.spriteSheet) {
      this.image     = new Image();
      this.image.src = config.spriteSheet;
    }

    // Animation state
    this.currentAnimName = 'idle';
    this._singTimer  = 0;
    this._isSinging  = false;
    this._idleT      = 0;       // 0–1 idle cycle (used for bob + blink timing)
    this._frameIndex = 0;
    this._frameTimer = 0;
    this._fps        = 24;
    this._loop       = true;
    this._frames     = [];
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  sing(lane) {
    this._playAnim(`sing${DIRS[lane]}`, true);
    this._startSingTimer();
  }

  miss(lane) {
    this._playAnim(`sing${DIRS[lane]}-miss`, true);
    this._startSingTimer();
  }

  update(dt) {
    this._idleT = (this._idleT + dt * 0.8) % 1;

    if (this._isSinging) {
      this._singTimer -= dt * 1000;
      if (this._singTimer <= 0) {
        this._isSinging = false;
        this._playAnim('idle');
      }
    }

    // Advance sprite-sheet frames
    if (this._frames.length > 0) {
      this._frameTimer += dt * 1000;
      const dur = 1000 / this._fps;
      if (this._frameTimer >= dur) {
        this._frameTimer -= dur;
        if (this._frameIndex < this._frames.length - 1) {
          this._frameIndex++;
        } else if (this._loop) {
          this._frameIndex = 0;
        }
      }
    }
  }

  render(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.scale * (this.flipX ? -1 : 1), this.scale);

    if (this.image?.complete && this.image.naturalWidth > 0 && this._frames.length > 0) {
      this._renderSpriteSheet(ctx);
    } else {
      drawPlaceholderChar(ctx, this.currentAnimName, this._idleT, this.theme);
    }

    ctx.restore();
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  _playAnim(name, force = false) {
    if (this.currentAnimName === name && !force) return;
    this.currentAnimName = name;
    this._frameIndex     = 0;
    this._frameTimer     = 0;

    const anim = this.animations[name];
    if (anim) {
      this._frames = anim.frames ?? [];
      this._fps    = anim.fps    ?? 24;
      this._loop   = anim.loop   !== false;
    } else {
      this._frames = [];
    }
  }

  _startSingTimer() {
    this._isSinging = true;
    this._singTimer = this.singDuration;
  }

  _renderSpriteSheet(ctx) {
    const frame       = this._frames[this._frameIndex];
    const [ox, oy]    = this.offsets[this.currentAnimName] ?? [0, 0];
    ctx.drawImage(
      this.image,
      frame.x, frame.y, frame.w, frame.h,   // source rect
      ox - frame.w / 2, oy - frame.h,        // dest (centered x, feet at 0)
      frame.w, frame.h
    );
  }
}
