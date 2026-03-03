/**
 * LoadingState - Preloads all game assets before starting
 * Shows a loading screen with progress bar
 * Handles missing files gracefully (won't crash if audio missing)
 */

export class LoadingState {
  constructor(game, assets, onComplete) {
    this.game = game;
    this.assets = assets;           // Array of {type, src, key}
    this.onComplete = onComplete;   // Callback when loading done

    this.loaded = {};               // Stores loaded assets by key
    this.progress = 0;              // 0 to 1
    this.loadedCount = 0;
    this.totalCount = assets.length;
    this.errors = [];               // Track failed loads
    // Check if we're initializing audio generation vs loading files
    this.isAudioGeneration = assets.length > 0 && assets[0].type === 'audio-init';
    this.status = this.isAudioGeneration ? 'Generating audio...' : 'Loading...';

    // Animation
    this.time = 0;
    this.dots = 0;
    this.dotsTimer = 0;
  }

  init() {
    // Start loading all assets
    this.assets.forEach((asset, index) => {
      this._loadAsset(asset, index);
    });

    // If no assets to load, complete immediately
    if (this.totalCount === 0) {
      setTimeout(() => this.onComplete(this.loaded, this.errors), 100);
    }
  }

  _loadAsset(asset, index) {
    const { type, src, key } = asset;

    switch (type) {
      case 'audio':
        this._loadAudio(src, key);
        break;
      case 'image':
        this._loadImage(src, key);
        break;
      case 'audio-init':
        // Special case: initializing audio generation system
        this._initAudioGeneration(asset);
        break;
      default:
        console.warn(`Unknown asset type: ${type}`);
        this._onAssetComplete(key, null, `Unknown type: ${type}`);
    }
  }

  /**
   * Initialize audio generation system (no file loading needed)
   */
  _initAudioGeneration(asset) {
    const { key, songCount } = asset;

    // Simulate initialization delay for visual feedback
    setTimeout(() => {
      this.loaded[key] = { initialized: true, songCount };
      this._onAssetComplete(key, { initialized: true }, null);
    }, 500); // Small delay so user sees the loading screen
  }

  _loadAudio(src, key) {
    const audio = new Audio();

    // Success handler
    const onLoad = () => {
      this.loaded[key] = audio;
      this._onAssetComplete(key, audio, null);
    };

    // Error handler - don't crash, just log and continue
    const onError = () => {
      console.warn(`Failed to load audio: ${src}`);
      this.loaded[key] = null; // Store null instead of crashing
      this._onAssetComplete(key, null, `Audio not found: ${src}`);
    };

    audio.addEventListener('canplaythrough', onLoad, { once: true });
    audio.addEventListener('error', onError, { once: true });

    // Set source last to trigger loading
    audio.src = src;
    audio.load();
  }

  _loadImage(src, key) {
    const img = new Image();

    img.onload = () => {
      this.loaded[key] = img;
      this._onAssetComplete(key, img, null);
    };

    img.onerror = () => {
      console.warn(`Failed to load image: ${src}`);
      this.loaded[key] = null;
      this._onAssetComplete(key, null, `Image not found: ${src}`);
    };

    img.src = src;
  }

  _onAssetComplete(key, asset, error) {
    this.loadedCount++;
    this.progress = this.loadedCount / this.totalCount;

    if (error) {
      this.errors.push(error);
    }

    // All assets processed (loaded or failed)
    if (this.loadedCount >= this.totalCount) {
      this.status = 'Complete!';
      // Small delay before transitioning
      setTimeout(() => {
        this.onComplete(this.loaded, this.errors);
      }, 300);
    }
  }

  update(dt) {
    this.time += dt;

    // Animate loading dots
    this.dotsTimer += dt;
    if (this.dotsTimer > 0.5) {
      this.dotsTimer = 0;
      this.dots = (this.dots + 1) % 4;
    }
  }

  render(ctx) {
    const { canvas } = this.game;
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // Dark gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0A0A14');
    gradient.addColorStop(1, '#1A0A28');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Animated grid (same as MenuState for consistency)
    ctx.strokeStyle = 'rgba(189,0,255,0.08)';
    ctx.lineWidth = 1;
    const gridSize = 40;
    const offsetX = (this.time * 10) % gridSize;
    const offsetY = (this.time * 10) % gridSize;

    for (let x = -gridSize + offsetX; x < canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = -gridSize + offsetY; y < canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }

    // Title
    ctx.save();
    const pulse = Math.sin(this.time * 3) * 0.3 + 0.7;
    ctx.shadowBlur = 30 * pulse;
    ctx.shadowColor = this.isAudioGeneration ? '#BD00FF' : '#FF2E63';
    ctx.fillStyle = this.isAudioGeneration ? '#BD00FF' : '#FF2E63';
    ctx.font = 'bold 48px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this.isAudioGeneration ? 'INITIALIZING' : 'LOADING', cx, cy - 80);
    ctx.restore();

    // Progress bar background
    const barW = 400;
    const barH = 30;
    const barX = cx - barW / 2;
    const barY = cy - 20;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, 15);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Progress bar fill
    if (this.progress > 0) {
      const fillW = barW * this.progress;

      ctx.save();
      const fillGradient = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
      fillGradient.addColorStop(0, '#00D9FF');
      fillGradient.addColorStop(0.5, '#BD00FF');
      fillGradient.addColorStop(1, '#FF2E63');

      ctx.fillStyle = fillGradient;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#BD00FF';
      ctx.beginPath();
      ctx.roundRect(barX + 2, barY + 2, fillW - 4, barH - 4, 13);
      ctx.fill();
      ctx.restore();
    }

    // Percentage text
    const percent = Math.floor(this.progress * 100);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${percent}%`, cx, barY + barH / 2 + 6);

    // Status text with animated dots
    const dotsStr = '.'.repeat(this.dots);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '16px monospace';
    ctx.fillText(`${this.status}${dotsStr}`, cx, cy + 40);

    // Asset count or song info
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '14px monospace';
    if (this.isAudioGeneration) {
      // Show song count for audio generation
      const songCount = this.assets[0]?.songCount || 5;
      ctx.fillText(`Preparing ${songCount} procedurally generated songs`, cx, cy + 65);
    } else {
      ctx.fillText(`${this.loadedCount} / ${this.totalCount} assets`, cx, cy + 65);
    }

    // Show errors if any (but don't stop loading)
    if (this.errors.length > 0 && !this.isAudioGeneration) {
      ctx.fillStyle = 'rgba(255,200,0,0.8)';
      ctx.font = '12px monospace';
      ctx.fillText(`⚠ ${this.errors.length} asset(s) missing (game will continue)`, cx, cy + 95);
    }

    // Spinning loader icon
    ctx.save();
    ctx.translate(cx, cy - 150);
    ctx.rotate(this.time * 3);
    ctx.strokeStyle = '#00D9FF';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    for (let i = 0; i < 8; i++) {
      ctx.save();
      ctx.rotate((i / 8) * Math.PI * 2);
      ctx.globalAlpha = 0.3 + (i / 8) * 0.7;
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(0, -40);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }
}
