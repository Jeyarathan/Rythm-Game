/**
 * AchievementToast - Visual notification system for unlocked achievements
 * Displays a slide-in toast notification when achievements are unlocked
 * Supports queuing multiple achievements
 */

export class AchievementToast {
  constructor() {
    this.queue = []; // Queue of achievements to display
    this.current = null; // Currently displaying achievement
    this.animationProgress = 0; // 0 to 1 (slide-in, hold, slide-out)
    this.phase = 'idle'; // 'slide-in', 'hold', 'slide-out', 'idle'
    this.timer = 0;

    // Animation timing (in seconds)
    this.slideInDuration = 0.5;
    this.holdDuration = 3.0;
    this.slideOutDuration = 0.4;
  }

  /**
   * Add achievement to display queue
   * @param {Object} achievement - Achievement object with { id, title, description, icon }
   */
  show(achievement) {
    this.queue.push(achievement);

    // Start showing if not already active
    if (this.phase === 'idle') {
      this._showNext();
    }
  }

  /**
   * Add multiple achievements to queue
   */
  showMultiple(achievements) {
    achievements.forEach(achievement => this.queue.push(achievement));

    if (this.phase === 'idle') {
      this._showNext();
    }
  }

  /**
   * Start showing the next achievement in queue
   */
  _showNext() {
    if (this.queue.length === 0) {
      this.phase = 'idle';
      this.current = null;
      return;
    }

    this.current = this.queue.shift();
    this.phase = 'slide-in';
    this.animationProgress = 0;
    this.timer = 0;
  }

  /**
   * Update animation
   */
  update(dt) {
    if (this.phase === 'idle') return;

    this.timer += dt;

    switch (this.phase) {
      case 'slide-in':
        this.animationProgress = Math.min(this.timer / this.slideInDuration, 1);
        if (this.animationProgress >= 1) {
          this.phase = 'hold';
          this.timer = 0;
        }
        break;

      case 'hold':
        if (this.timer >= this.holdDuration) {
          this.phase = 'slide-out';
          this.timer = 0;
          this.animationProgress = 0;
        }
        break;

      case 'slide-out':
        this.animationProgress = Math.min(this.timer / this.slideOutDuration, 1);
        if (this.animationProgress >= 1) {
          // Move to next achievement
          this._showNext();
        }
        break;
    }
  }

  /**
   * Render the achievement toast
   */
  render(ctx, canvas) {
    if (!this.current || this.phase === 'idle') return;

    const toastWidth = 400;
    const toastHeight = 100;
    const padding = 20;

    // Calculate position based on animation phase
    let x, slideProgress;

    if (this.phase === 'slide-in') {
      // Ease out cubic
      slideProgress = 1 - Math.pow(1 - this.animationProgress, 3);
      x = canvas.width - toastWidth + (1 - slideProgress) * (toastWidth + 20);
    } else if (this.phase === 'slide-out') {
      // Ease in cubic
      slideProgress = Math.pow(this.animationProgress, 3);
      x = canvas.width - toastWidth + slideProgress * (toastWidth + 20);
    } else {
      // Holding
      x = canvas.width - toastWidth;
    }

    const y = padding;

    ctx.save();

    // ── DROP SHADOW ──
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 4;

    // ── BACKGROUND (Glassmorphism) ──
    const gradient = ctx.createLinearGradient(x, y, x, y + toastHeight);
    gradient.addColorStop(0, 'rgba(40, 40, 60, 0.95)');
    gradient.addColorStop(1, 'rgba(30, 30, 50, 0.95)');

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.roundRect(x, y, toastWidth, toastHeight, 15);
    ctx.fill();

    // ── BORDER WITH GLOW ──
    ctx.shadowColor = '#ffdd00';
    ctx.shadowBlur = 15;
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Reset shadow for content
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;

    // ── ACHIEVEMENT ICON ──
    const iconX = x + 25;
    const iconY = y + toastHeight / 2;

    // Icon background circle
    ctx.fillStyle = 'rgba(255, 221, 0, 0.2)';
    ctx.beginPath();
    ctx.arc(iconX, iconY, 30, 0, Math.PI * 2);
    ctx.fill();

    // Icon emoji
    ctx.font = '40px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(this.current.icon, iconX, iconY);

    // ── ACHIEVEMENT TEXT ──
    const textX = x + 75;

    // "Achievement Unlocked!" label
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('🎉 ACHIEVEMENT UNLOCKED!', textX, y + 15);

    // Achievement title
    ctx.font = 'bold 18px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(this.current.title, textX, y + 38);

    // Achievement description
    ctx.font = '13px sans-serif';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.fillText(this.current.description, textX, y + 62);

    // ── PROGRESS BAR (if there's a queue) ──
    if (this.queue.length > 0 && this.phase === 'hold') {
      const barWidth = toastWidth - 40;
      const barHeight = 3;
      const barX = x + 20;
      const barY = y + toastHeight - 10;

      // Background
      ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      ctx.fillRect(barX, barY, barWidth, barHeight);

      // Progress
      const progress = this.timer / this.holdDuration;
      ctx.fillStyle = '#ffdd00';
      ctx.fillRect(barX, barY, barWidth * progress, barHeight);

      // Queue indicator
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.fillText(`+${this.queue.length} more`, x + toastWidth - 20, y + toastHeight - 15);
    }

    ctx.restore();
  }

  /**
   * Check if currently displaying
   */
  isActive() {
    return this.phase !== 'idle';
  }

  /**
   * Clear all queued achievements
   */
  clear() {
    this.queue = [];
    this.current = null;
    this.phase = 'idle';
    this.animationProgress = 0;
    this.timer = 0;
  }

  /**
   * Get number of queued achievements
   */
  getQueueLength() {
    return this.queue.length;
  }
}
