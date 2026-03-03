/**
 * TouchHandler - Mobile touch controls for rhythm game
 * Provides touch-based input for receptors with visual feedback
 * Supports multi-touch for simultaneous lane presses
 */

export class TouchHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.touches = {}; // Active touch points mapped by identifier
    this.laneStates = [false, false, false, false]; // Current state of each lane
    this.receptorRects = []; // Hitboxes for each receptor (set by game state)

    // Callbacks (like InputHandler)
    this.onHit = null;     // (lane: number) => void - triggered on touch start
    this.onRelease = null; // (lane: number) => void - triggered on touch end

    // Bind event handlers
    this._onTouchStart = this._onTouchStart.bind(this);
    this._onTouchMove = this._onTouchMove.bind(this);
    this._onTouchEnd = this._onTouchEnd.bind(this);
    this._onTouchCancel = this._onTouchCancel.bind(this);

    // Register touch events
    this.canvas.addEventListener('touchstart', this._onTouchStart, { passive: false });
    this.canvas.addEventListener('touchmove', this._onTouchMove, { passive: false });
    this.canvas.addEventListener('touchend', this._onTouchEnd, { passive: false });
    this.canvas.addEventListener('touchcancel', this._onTouchCancel, { passive: false });
  }

  /**
   * Set receptor hitbox rectangles for touch detection
   * Called by PlayState after rendering receptors
   * @param {Array} rects - Array of {x, y, w, h, lane} objects
   */
  setReceptorRects(rects) {
    this.receptorRects = rects;
  }

  /**
   * Handle touch start - detect which lane was touched
   */
  _onTouchStart(e) {
    e.preventDefault(); // Prevent scrolling/zooming

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const x = (touch.clientX - rect.left) * scaleX;
      const y = (touch.clientY - rect.top) * scaleY;

      // Check which receptor was touched
      const lane = this._findTouchedLane(x, y);
      if (lane !== -1) {
        this.touches[touch.identifier] = { lane, x, y };

        // Trigger onHit if this lane wasn't already pressed
        if (!this.laneStates[lane]) {
          this.laneStates[lane] = true;
          this.onHit?.(lane);
        }
      }
    }
  }

  /**
   * Handle touch move - update touch position (for hold notes)
   */
  _onTouchMove(e) {
    e.preventDefault();

    const rect = this.canvas.getBoundingClientRect();
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = this.touches[touch.identifier];

      if (touchData) {
        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;

        // Update position
        touchData.x = x;
        touchData.y = y;

        // Check if still touching the same lane (for hold notes)
        const newLane = this._findTouchedLane(x, y);
        if (newLane !== touchData.lane) {
          const oldLane = touchData.lane;

          // Check if old lane still has other touches
          const oldLaneStillTouched = Object.values(this.touches)
            .filter(t => t.lane === oldLane && touchData !== t).length > 0;

          if (!oldLaneStillTouched) {
            this.laneStates[oldLane] = false;
            this.onRelease?.(oldLane);
          }

          if (newLane !== -1) {
            // Moved to different lane - press new
            const wasPressed = this.laneStates[newLane];
            this.laneStates[newLane] = true;
            touchData.lane = newLane;

            if (!wasPressed) {
              this.onHit?.(newLane);
            }
          }
        }
      }
    }
  }

  /**
   * Handle touch end - release lane
   */
  _onTouchEnd(e) {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = this.touches[touch.identifier];

      if (touchData) {
        const lane = touchData.lane;
        delete this.touches[touch.identifier];

        // Check if this was the last touch on this lane
        const stillTouched = Object.values(this.touches).some(t => t.lane === lane);
        if (!stillTouched) {
          this.laneStates[lane] = false;
          this.onRelease?.(lane);
        }
      }
    }
  }

  /**
   * Handle touch cancel (browser interruption)
   */
  _onTouchCancel(e) {
    e.preventDefault();

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      const touchData = this.touches[touch.identifier];

      if (touchData) {
        const lane = touchData.lane;
        delete this.touches[touch.identifier];

        // Check if this was the last touch on this lane
        const stillTouched = Object.values(this.touches).some(t => t.lane === lane);
        if (!stillTouched) {
          this.laneStates[lane] = false;
          this.onRelease?.(lane);
        }
      }
    }
  }

  /**
   * Find which lane was touched based on coordinates
   * Returns lane index (0-3) or -1 if no lane hit
   */
  _findTouchedLane(x, y) {
    for (const rect of this.receptorRects) {
      if (x >= rect.x && x <= rect.x + rect.w &&
          y >= rect.y && y <= rect.y + rect.h) {
        return rect.lane;
      }
    }
    return -1;
  }

  /**
   * Check if a lane is currently pressed
   * Used by PlayState to trigger note hits
   */
  isLanePressed(lane) {
    return this.laneStates[lane] || false;
  }

  /**
   * Check if any lane is pressed (for pause menu, etc.)
   */
  isAnyLanePressed() {
    return this.laneStates.some(state => state);
  }

  /**
   * Get all currently pressed lanes
   * Returns array of lane indices
   */
  getPressedLanes() {
    return this.laneStates
      .map((pressed, lane) => pressed ? lane : null)
      .filter(lane => lane !== null);
  }

  /**
   * Reset all lane states (for pause/unpause)
   */
  reset() {
    this.laneStates = [false, false, false, false];
    this.touches = {};
  }

  /**
   * Cleanup - remove event listeners
   */
  destroy() {
    this.canvas.removeEventListener('touchstart', this._onTouchStart);
    this.canvas.removeEventListener('touchmove', this._onTouchMove);
    this.canvas.removeEventListener('touchend', this._onTouchEnd);
    this.canvas.removeEventListener('touchcancel', this._onTouchCancel);
  }

  /**
   * Render touch feedback overlay (optional visual debugging)
   * Shows which lanes are currently being touched
   */
  renderDebugOverlay(ctx) {
    // Draw touch points
    for (const touchId in this.touches) {
      const touch = this.touches[touchId];
      ctx.save();
      ctx.fillStyle = 'rgba(255, 100, 100, 0.5)';
      ctx.beginPath();
      ctx.arc(touch.x, touch.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Draw lane state indicators
    const laneColors = ['#aa44ff', '#44ffff', '#44ff88', '#ff44aa'];
    for (let i = 0; i < this.laneStates.length; i++) {
      if (this.laneStates[i]) {
        const rect = this.receptorRects[i];
        if (rect) {
          ctx.save();
          ctx.strokeStyle = laneColors[i];
          ctx.lineWidth = 4;
          ctx.shadowBlur = 20;
          ctx.shadowColor = laneColors[i];
          ctx.strokeRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10);
          ctx.restore();
        }
      }
    }
  }
}
