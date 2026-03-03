/**
 * Enhanced per-lane colors with neon glow aesthetic
 * Lane 0 (Left):  Purple - #aa44ff
 * Lane 1 (Down):  Cyan   - #44ffff
 * Lane 2 (Up):    Green  - #44ff88
 * Lane 3 (Right): Pink   - #ff44aa
 */
export const LANE_COLORS = ['#aa44ff', '#44ffff', '#44ff88', '#ff44aa'];

/** Default key labels shown on receptors */
export const LANE_KEYS = ['A', 'S', 'W', 'D'];

/**
 * Arrow symbols for each lane direction
 * Used to show arrow on notes
 */
export const LANE_ARROWS = ['←', '↓', '↑', '→'];

export class Note {
  constructor(lane, time, type = 'normal', duration = 0) {
    this.lane = lane;
    this.time = time;
    this.type = type;
    this.duration = duration;
    this.hit = false;
    this.missed = false;
    this.holding = false;
    this.holdProgress = 0;
    this.splash = false;
    this.splashTimer = 0;
    this._animTime = Math.random() * Math.PI * 2; // Random offset for animation
    // FIX: Active flag for defensive checks (currently always true, may be used for future pooling)
    this.isActive = true;
  }

  getY(songPosition, hitY, scrollSpeed) {
    return hitY - (this.time - songPosition) * scrollSpeed;
  }

  getEndY(songPosition, hitY, scrollSpeed) {
    return hitY - (this.time + this.duration - songPosition) * scrollSpeed;
  }

  /**
   * FIX: Safe removal check - only allow removal if note is processed AND past the hit zone
   * This prevents premature culling that causes notes to disappear
   */
  shouldRemove(songPosition, cullThreshold) {
    const noteEndTime = this.time + (this.duration || 0);

    // Must be both processed (hit or missed) AND past the cull threshold
    if ((this.hit || this.missed) && noteEndTime < cullThreshold) {
      return true;
    }

    // Never remove active notes that haven't been processed
    return false;
  }

  renderSplash(ctx, hitY, laneX, laneWidth) {
    if (!this.splash || this.splashTimer <= 0) return;

    const x = laneX + laneWidth / 2;
    const y = hitY;

    const progress = 1 - this.splashTimer;
    const size = 20 + progress * 60;
    const alpha = this.splashTimer;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Multiple expanding rings
    for (let i = 0; i < 3; i++) {
      const offset = i * 15;
      const circleSize = size + offset;

      ctx.strokeStyle = LANE_COLORS[this.lane];
      ctx.shadowBlur = 20;
      ctx.shadowColor = LANE_COLORS[this.lane];
      ctx.lineWidth = 4 - i;
      ctx.beginPath();
      ctx.arc(x, y, circleSize, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Sparkle particles
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount;
      const dist = size * 0.8;
      const px = x + Math.cos(angle) * dist;
      const py = y + Math.sin(angle) * dist;

      ctx.fillStyle = LANE_COLORS[this.lane];
      ctx.shadowBlur = 15;
      ctx.shadowColor = LANE_COLORS[this.lane];
      ctx.beginPath();
      ctx.arc(px, py, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  render(ctx, songPosition, hitY, scrollSpeed, laneX, laneWidth) {
    this._animTime += 0.05;

    // Render splash effect (always, even on hit notes)
    if (this.splash && this.splashTimer > 0) {
      this.renderSplash(ctx, hitY, laneX, laneWidth);
    }

    // FIX BUG 1: Only skip rendering for HIT notes (collected notes)
    // Missed notes continue rendering until they fall off screen naturally
    if (this.hit) return;

    const x = laneX;
    const y = this.getY(songPosition, hitY, scrollSpeed);

    // FIX BUG 2: Use canvas height directly, not hitY offset
    // This allows missed notes to fall off the bottom of the screen
    const CANVAS_HEIGHT = 750;
    if (y < -40 || y > CANVAS_HEIGHT + 50) return;

    // Visual indicator for missed notes (dimmed and simplified)
    if (this.missed) {
      ctx.save();
      ctx.globalAlpha = 0.35; // Dim missed notes so player can see them fall

      if (this.type === 'hold' && this.duration > 0) {
        const endY = this.getEndY(songPosition, hitY, scrollSpeed);
        const tailHeight = Math.max(0, y - endY);
        if (tailHeight > 0) {
          // Simplified hold tail for missed notes
          ctx.fillStyle = LANE_COLORS[this.lane] + '44';
          ctx.fillRect(x + 10, endY, laneWidth - 20, tailHeight);
        }
      }

      // Render dimmed note head
      this._renderNoteHead(ctx, x, y, laneWidth, 30);
      ctx.restore();
      return;
    }

    // Normal unhit note rendering (active notes player can still hit)
    if (this.type === 'hold' && this.duration > 0) {
      // ── HOLD NOTE WITH ANIMATED GRADIENT ──
      const endY = this.getEndY(songPosition, hitY, scrollSpeed);
      const tailHeight = Math.max(0, y - endY);

      if (tailHeight > 0) {
        const tailW = laneWidth - 20;
        const tailX = x + 10;

        ctx.save();

        // Animated flowing gradient
        const gradientOffset = (songPosition / 200) % 1;
        const gradient = ctx.createLinearGradient(0, endY, 0, y);

        // Create flowing effect
        gradient.addColorStop(0, LANE_COLORS[this.lane] + '60');
        gradient.addColorStop(gradientOffset * 0.5, LANE_COLORS[this.lane] + 'AA');
        gradient.addColorStop(gradientOffset, LANE_COLORS[this.lane] + 'FF');
        gradient.addColorStop((gradientOffset + 0.5) % 1, LANE_COLORS[this.lane] + 'AA');
        gradient.addColorStop(1, LANE_COLORS[this.lane] + '60');

        ctx.fillStyle = gradient;
        ctx.shadowBlur = 20;
        ctx.shadowColor = LANE_COLORS[this.lane];
        ctx.fillRect(tailX, endY, tailW, tailHeight);

        // Progress indicator (brighter section)
        if (this.holding && this.holdProgress > 0) {
          const progressHeight = tailHeight * this.holdProgress;
          const progressGradient = ctx.createLinearGradient(0, y - progressHeight, 0, y);
          progressGradient.addColorStop(0, LANE_COLORS[this.lane] + 'AA');
          progressGradient.addColorStop(1, LANE_COLORS[this.lane]);

          ctx.fillStyle = progressGradient;
          ctx.shadowBlur = 30;
          ctx.shadowColor = LANE_COLORS[this.lane];
          ctx.fillRect(tailX, y - progressHeight, tailW, progressHeight);
        }

        // Border with glow
        ctx.strokeStyle = LANE_COLORS[this.lane];
        ctx.lineWidth = 2;
        ctx.shadowBlur = 15;
        ctx.shadowColor = LANE_COLORS[this.lane];
        ctx.strokeRect(tailX, endY, tailW, tailHeight);

        ctx.restore();
      }

      // Draw head (initial hit part)
      this._renderNoteHead(ctx, x, y, laneWidth, 30);
    } else {
      // ── NORMAL NOTE ──
      this._renderNoteHead(ctx, x, y, laneWidth, 30);
    }
  }

  /**
   * Render the note head with enhanced neon visuals
   * Includes: drop shadow, glow, shine, border, and arrow symbol
   */
  _renderNoteHead(ctx, x, y, w, h) {
    ctx.save();

    // ── DROP SHADOW (below note for depth) ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.beginPath();
    ctx.roundRect(x + 3, y - h / 2 + 5, w, h, 10);
    ctx.fill();

    // ── OUTER GLOW (neon bloom effect) ──
    ctx.shadowBlur = 15;
    ctx.shadowColor = LANE_COLORS[this.lane];

    // ── MAIN NOTE BODY (gradient fill) ──
    const gradient = ctx.createLinearGradient(x, y - h / 2, x + w, y + h / 2);
    gradient.addColorStop(0, LANE_COLORS[this.lane] + 'DD');
    gradient.addColorStop(0.5, LANE_COLORS[this.lane]);
    gradient.addColorStop(1, LANE_COLORS[this.lane] + 'DD');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, 8);
    ctx.fill();

    // ── INNER SHINE (white highlight at top) ──
    const highlightGradient = ctx.createLinearGradient(x, y - h / 2, x, y - h / 2 + h * 0.4);
    highlightGradient.addColorStop(0, 'rgba(255,255,255,0.4)');
    highlightGradient.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.fillStyle = highlightGradient;
    ctx.beginPath();
    ctx.roundRect(x + 5, y - h / 2 + 3, w - 10, h * 0.35, 6);
    ctx.fill();

    // ── ANIMATED PULSING BORDER ──
    const pulseAlpha = Math.sin(this._animTime) * 0.3 + 0.7;
    ctx.strokeStyle = 'rgba(255,255,255,' + pulseAlpha + ')';
    ctx.lineWidth = 2;
    ctx.shadowBlur = 12;
    ctx.shadowColor = LANE_COLORS[this.lane];
    ctx.beginPath();
    ctx.roundRect(x, y - h / 2, w, h, 8);
    ctx.stroke();

    // ── ARROW DIRECTION SYMBOL ──
    // Shows which direction the note is for (← ↓ ↑ →)
    ctx.shadowBlur = 0; // Remove shadow for text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(LANE_ARROWS[this.lane], x + w / 2, y);

    ctx.restore();
  }
}
