/** Per-lane colors matching FNF's color scheme: left, down, up, right */
export const LANE_COLORS = ['#C24B99', '#00FFFF', '#12FA05', '#F9393F'];

/** Default key labels shown on receptors */
export const LANE_KEYS = ['A', 'S', 'W', 'D'];

export class Note {
  constructor(lane, time, type = 'normal', duration = 0) {
    this.lane = lane;   // 0 = left, 1 = down, 2 = up, 3 = right
    this.time = time;   // ms at which the note should be hit
    this.type = type;   // 'normal' or 'hold'
    this.duration = duration; // ms to hold (for hold notes)
    this.hit = false;
    this.missed = false;
    this.holding = false; // true while player is holding
    this.holdProgress = 0; // 0-1, how much of the hold is complete
    this.splash = false; // true if hit was "Sick!" for splash effect
    this.splashTimer = 0; // timer for splash animation (0-1)
  }

  getY(songPosition, hitY, scrollSpeed) {
    return hitY - (this.time - songPosition) * scrollSpeed;
  }

  getEndY(songPosition, hitY, scrollSpeed) {
    return hitY - (this.time + this.duration - songPosition) * scrollSpeed;
  }

  renderSplash(ctx, hitY, laneX, laneWidth) {
    if (!this.splash || this.splashTimer <= 0) return;

    const x = laneX + laneWidth / 2;
    const y = hitY;

    // Splash expands and fades out
    const progress = 1 - this.splashTimer;
    const size = 20 + progress * 60; // Grows from 20 to 80
    const alpha = this.splashTimer; // Fades out

    ctx.save();
    ctx.globalAlpha = alpha;

    // Draw multiple expanding circles
    for (let i = 0; i < 3; i++) {
      const offset = i * 15;
      const circleSize = size + offset;

      ctx.strokeStyle = LANE_COLORS[this.lane];
      ctx.lineWidth = 4 - i;
      ctx.beginPath();
      ctx.arc(x, y, circleSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Draw particles/sparkles
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const dist = size * 0.8;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;

      ctx.fillStyle = LANE_COLORS[this.lane];
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  render(ctx, songPosition, hitY, scrollSpeed, laneX, laneWidth) {
    // Render splash effect even after hit
    if (this.splash && this.splashTimer > 0) {
      this.renderSplash(ctx, hitY, laneX, laneWidth);
    }

    if (this.hit || this.missed) return;

    const x = laneX;
    const y = this.getY(songPosition, hitY, scrollSpeed);

    // Only draw if on screen
    if (y < -40 || y > hitY + 200) return;

    if (this.type === 'hold' && this.duration > 0) {
      // Draw hold note
      const endY = this.getEndY(songPosition, hitY, scrollSpeed);
      const tailHeight = Math.max(0, y - endY);

      // Draw tail (the sustain part)
      if (tailHeight > 0) {
        const tailW = laneWidth - 20;
        const tailX = x + 10;

        // Background of tail
        ctx.fillStyle = `${LANE_COLORS[this.lane]}40`;
        ctx.fillRect(tailX, endY, tailW, tailHeight);

        // Progress indicator
        if (this.holding && this.holdProgress > 0) {
          const progressHeight = tailHeight * this.holdProgress;
          ctx.fillStyle = LANE_COLORS[this.lane];
          ctx.fillRect(tailX, y - progressHeight, tailW, progressHeight);
        }

        // Border
        ctx.strokeStyle = LANE_COLORS[this.lane];
        ctx.lineWidth = 2;
        ctx.strokeRect(tailX, endY, tailW, tailHeight);
      }

      // Draw head (the initial hit part)
      const w = laneWidth, h = 30;
      ctx.fillStyle = LANE_COLORS[this.lane];
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      // Draw normal note
      const w = laneWidth, h = 30;
      ctx.fillStyle = LANE_COLORS[this.lane];
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, 8);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  }
}
