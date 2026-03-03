const MODES = [
  { label: 'Practice', key: 'practice', color: '#00D9FF', glow: '0 0 20px rgba(0,217,255,0.6)' },
  { label: 'Easy',     key: 'easy',     color: '#00FF88', glow: '0 0 20px rgba(0,255,136,0.6)' },
  { label: 'Normal',   key: 'normal',   color: '#FFD700', glow: '0 0 20px rgba(255,215,0,0.6)' },
  { label: 'Hard',     key: 'hard',     color: '#FF2E63', glow: '0 0 20px rgba(255,46,99,0.6)' },
];

const SPEED_OPTIONS = [
  { label: '0.5x', value: 0.5, color: '#44ffff' },
  { label: '0.75x', value: 0.75, color: '#44ff88' },
  { label: '1.0x', value: 1.0, color: '#ffdd00' },
  { label: '1.25x', value: 1.25, color: '#ff44aa' },
  { label: '1.5x', value: 1.5, color: '#ff8844' },
  { label: '2.0x', value: 2.0, color: '#ff4444' },
];

export class MenuState {
  constructor(game, songs, onStart, onEditor) {
    this.game         = game;
    this.songs        = songs;
    this.onStart      = onStart;
    this.onEditor     = onEditor;
    this.selectedSong = 0;
    this.selectedMode = 2;   // default: Normal
    this.botEnabled   = false;
    this.speedIndex   = 2;   // default: 1.0x (index in SPEED_OPTIONS)
    this._modeRects   = [];
    this._songRects   = [];
    this._botRect     = null;
    this._editorRect  = null;
    this._speedRects  = [];  // Speed option rects
    this._hoverMode   = -1;
    this._hoverSong   = -1;
    this._hoverBot    = false;
    this._hoverEditor = false;
    this._hoverSpeed  = -1;
    this._onKey       = this._onKey.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);

    // Animation
    this.time = 0;
    this.particles = [];
    this._initParticles();
  }

  _initParticles() {
    // Create animated particles for background
    for (let i = 0; i < 80; i++) {
      this.particles.push({
        x: Math.random() * this.game.canvas.width,
        y: Math.random() * this.game.canvas.height,
        size: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.3,
        speedY: (Math.random() - 0.5) * 0.3,
        opacity: Math.random() * 0.5 + 0.2,
        color: ['#FF2E63', '#00D9FF', '#BD00FF'][Math.floor(Math.random() * 3)]
      });
    }
  }

  init() {
    window.addEventListener('keydown', this._onKey);
    this.game.canvas.addEventListener('click',     this._onClick);
    this.game.canvas.addEventListener('mousemove', this._onMouseMove);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _onKey(e) {
    switch (e.key) {
      case 'ArrowLeft':  case 'a': case 'A':
        this.selectedMode = (this.selectedMode - 1 + MODES.length) % MODES.length; break;
      case 'ArrowRight': case 'd': case 'D':
        this.selectedMode = (this.selectedMode + 1) % MODES.length; break;
      case 'ArrowUp':    case 'w': case 'W':
        this.selectedSong = (this.selectedSong - 1 + this.songs.length) % this.songs.length; break;
      case 'ArrowDown':  case 's': case 'S':
        this.selectedSong = (this.selectedSong + 1) % this.songs.length; break;
      case 'Enter': case ' ':
        this._start(); break;
      case 'b': case 'B':
        this.botEnabled = !this.botEnabled; break;
      case 'e': case 'E':
        this._openEditor(); break;
    }
  }

  _onClick(e) {
    const { x, y } = this._canvasPos(e);

    if (this._botRect && this._hit(this._botRect, x, y)) {
      this.botEnabled = !this.botEnabled;
      return;
    }

    if (this._editorRect && this._hit(this._editorRect, x, y)) {
      this._openEditor();
      return;
    }

    for (let i = 0; i < this._modeRects.length; i++) {
      if (this._hit(this._modeRects[i], x, y)) {
        this.selectedMode = i;
        return;
      }
    }

    for (let i = 0; i < this._speedRects.length; i++) {
      if (this._hit(this._speedRects[i], x, y)) {
        this.speedIndex = i;
        return;
      }
    }

    for (let i = 0; i < this._songRects.length; i++) {
      if (this._hit(this._songRects[i], x, y)) {
        if (this.selectedSong === i) {
          this._start();
        } else {
          this.selectedSong = i;
        }
        return;
      }
    }
  }

  _onMouseMove(e) {
    const { x, y } = this._canvasPos(e);

    this._hoverMode = this._modeRects.findIndex(r => this._hit(r, x, y));
    this._hoverSong = this._songRects.findIndex(r => this._hit(r, x, y));
    this._hoverSpeed = this._speedRects.findIndex(r => this._hit(r, x, y));
    this._hoverBot = this._botRect && this._hit(this._botRect, x, y);
    this._hoverEditor = this._editorRect && this._hit(this._editorRect, x, y);

    const hovering = this._hoverMode !== -1 || this._hoverSong !== -1 || this._hoverSpeed !== -1 || this._hoverBot || this._hoverEditor;
    this.game.canvas.style.cursor = hovering ? 'pointer' : 'default';
  }

  _canvasPos(e) {
    const r     = this.game.canvas.getBoundingClientRect();
    const scaleX = this.game.canvas.width  / r.width;
    const scaleY = this.game.canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  }

  _hit(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  _start() {
    window.removeEventListener('keydown', this._onKey);
    this.game.canvas.removeEventListener('click',     this._onClick);
    this.game.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.game.canvas.style.cursor = 'default';
    const mode = MODES[this.selectedMode].key;
    const modeWithBot = this.botEnabled ? `${mode}+bot` : mode;
    const speedMultiplier = SPEED_OPTIONS[this.speedIndex].value;
    this.onStart(this.songs[this.selectedSong], modeWithBot, speedMultiplier);
  }

  _openEditor() {
    window.removeEventListener('keydown', this._onKey);
    this.game.canvas.removeEventListener('click',     this._onClick);
    this.game.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.game.canvas.style.cursor = 'default';
    this.onEditor?.();
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    this.time += dt;

    // Animate particles
    this.particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;

      // Wrap around screen
      if (p.x < 0) p.x = this.game.canvas.width;
      if (p.x > this.game.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.game.canvas.height;
      if (p.y > this.game.canvas.height) p.y = 0;
    });
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  render(ctx) {
    const { canvas } = this.game;
    const cx = canvas.width / 2;

    // ── Animated Background ──
    // Dark gradient background
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0A0A14');
    gradient.addColorStop(1, '#1A0A28');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Moving grid
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

    // Particles
    this.particles.forEach(p => {
      ctx.fillStyle = p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0');
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.shadowBlur = 0;

    // ── Neon Logo Header ──
    const pulse = Math.sin(this.time * 3) * 0.3 + 0.7;
    ctx.save();

    // Main title with multiple glow layers
    ctx.shadowBlur = 40 * pulse;
    ctx.shadowColor = '#FF2E63';
    ctx.fillStyle = '#FF2E63';
    ctx.font = 'bold 56px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FRIDAY NIGHT', cx, 70);

    ctx.shadowColor = '#00D9FF';
    ctx.fillStyle = '#00D9FF';
    ctx.font = 'bold 64px sans-serif';
    ctx.fillText('FUNKIN\'', cx, 125);

    ctx.shadowBlur = 20;
    ctx.shadowColor = '#BD00FF';
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '16px monospace';
    ctx.fillText('RHYTHM GAME', cx, 145);

    ctx.restore();

    // ── Difficulty Selector ──
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT DIFFICULTY', cx, 175);

    const modeW = 110, modeH = 42, modeGap = 12;
    const totalModeW  = MODES.length * modeW + (MODES.length - 1) * modeGap;
    const modeStartX  = cx - totalModeW / 2;
    this._modeRects   = [];

    MODES.forEach((mode, i) => {
      const x        = modeStartX + i * (modeW + modeGap);
      const y        = 185;
      const selected = i === this.selectedMode;
      const hovered  = i === this._hoverMode && !selected;
      this._modeRects.push({ x, y, w: modeW, h: modeH });

      ctx.save();

      // Glassmorphism background
      if (selected) {
        ctx.fillStyle = mode.color + '33'; // 20% opacity
        ctx.shadowBlur = 25;
        ctx.shadowColor = mode.color;
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = mode.color;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, modeW, modeH, 10);
      ctx.fill();

      // Border with glow
      if (selected) {
        ctx.strokeStyle = mode.color;
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (hovered) {
        ctx.strokeStyle = mode.color + '80';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Label
      ctx.shadowBlur = selected ? 10 : 0;
      ctx.shadowColor = mode.color;
      ctx.fillStyle = selected ? mode.color : hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)';
      ctx.font = selected ? 'bold 15px sans-serif' : '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mode.label, x + modeW / 2, y + modeH / 2 + 5);

      ctx.restore();
    });

    // ── Speed Selector ──
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('PLAYBACK SPEED', cx, 238);

    const speedW = 64, speedH = 34, speedGap = 8;
    const totalSpeedW = SPEED_OPTIONS.length * speedW + (SPEED_OPTIONS.length - 1) * speedGap;
    const speedStartX = cx - totalSpeedW / 2;
    this._speedRects = [];

    SPEED_OPTIONS.forEach((speed, i) => {
      const x = speedStartX + i * (speedW + speedGap);
      const y = 246;
      const selected = i === this.speedIndex;
      const hovered = i === this._hoverSpeed && !selected;
      this._speedRects.push({ x, y, w: speedW, h: speedH });

      ctx.save();

      // Glassmorphism background
      if (selected) {
        ctx.fillStyle = speed.color + '33';
        ctx.shadowBlur = 20;
        ctx.shadowColor = speed.color;
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.shadowBlur = 12;
        ctx.shadowColor = speed.color;
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
      }

      ctx.beginPath();
      ctx.roundRect(x, y, speedW, speedH, 8);
      ctx.fill();

      // Border
      if (selected || hovered) {
        ctx.strokeStyle = selected ? speed.color : speed.color + '80';
        ctx.lineWidth = selected ? 2 : 1;
        ctx.stroke();
      }

      // Label
      ctx.shadowBlur = selected ? 8 : 0;
      ctx.shadowColor = speed.color;
      ctx.fillStyle = selected ? speed.color : hovered ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)';
      ctx.font = selected ? 'bold 13px sans-serif' : '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(speed.label, x + speedW / 2, y + speedH / 2 + 4);

      ctx.restore();
    });

    // ── Bot Toggle ──
    const botBtnW = 170, botBtnH = 38;
    const botBtnX = cx - botBtnW / 2;
    const botBtnY = 295;
    this._botRect = { x: botBtnX, y: botBtnY, w: botBtnW, h: botBtnH };

    ctx.save();
    const botPulse = this.botEnabled ? Math.sin(this.time * 4) * 0.3 + 0.7 : 1;

    if (this.botEnabled) {
      ctx.fillStyle = 'rgba(189,0,255,0.3)';
      ctx.shadowBlur = 30 * botPulse;
      ctx.shadowColor = '#BD00FF';
    } else if (this._hoverBot) {
      ctx.fillStyle = 'rgba(189,0,255,0.15)';
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#BD00FF';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
    }

    ctx.beginPath();
    ctx.roundRect(botBtnX, botBtnY, botBtnW, botBtnH, 10);
    ctx.fill();

    ctx.strokeStyle = this.botEnabled ? '#BD00FF' : this._hoverBot ? '#BD00FF80' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = this.botEnabled ? 2 : 1;
    ctx.stroke();

    ctx.shadowBlur = this.botEnabled ? 10 : 0;
    ctx.shadowColor = '#BD00FF';
    ctx.fillStyle = this.botEnabled ? '#BD00FF' : this._hoverBot ? 'rgba(189,0,255,0.9)' : 'rgba(255,255,255,0.6)';
    ctx.font = this.botEnabled ? 'bold 15px sans-serif' : '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🤖 BOT ${this.botEnabled ? 'ON' : 'OFF'}`, cx, botBtnY + botBtnH / 2 + 5);

    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.fillText('Press B to toggle', cx, botBtnY + botBtnH + 12);

    // ── Song List Header ──
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('SELECT SONG', cx, 310);

    // ── Song Cards ──
    this._songRects = [];
    this.songs.forEach((song, i) => {
      const y        = 330 + i * 78;
      const cardW    = 440;
      const cardH    = 68;
      const bx       = cx - cardW / 2;
      const selected = i === this.selectedSong;
      const hovered  = i === this._hoverSong;
      this._songRects.push({ x: bx, y, w: cardW, h: cardH });

      ctx.save();

      // Glassmorphism card with glow
      if (selected) {
        const selPulse = Math.sin(this.time * 4) * 0.2 + 0.8;
        ctx.fillStyle = 'rgba(255,46,99,0.2)';
        ctx.shadowBlur = 35 * selPulse;
        ctx.shadowColor = '#FF2E63';
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.shadowBlur = 20;
        ctx.shadowColor = '#00D9FF';
      } else {
        ctx.fillStyle = 'rgba(255,255,255,0.03)';
      }

      ctx.beginPath();
      ctx.roundRect(bx, y, cardW, cardH, 12);
      ctx.fill();

      // Border
      if (selected) {
        ctx.strokeStyle = '#FF2E63';
        ctx.lineWidth = 2;
      } else if (hovered) {
        ctx.strokeStyle = '#00D9FF80';
        ctx.lineWidth = 1.5;
      } else {
        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();

      // Song title
      ctx.shadowBlur = selected ? 15 : 0;
      ctx.shadowColor = '#FF2E63';
      ctx.fillStyle = selected ? '#FF2E63' : hovered ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)';
      ctx.font = `${selected ? 'bold ' : ''}24px sans-serif`;
      ctx.textAlign = 'left';
      ctx.fillText(song.title, bx + 20, y + 30);

      // Show "Generated" badge instead
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(189,0,255,0.6)';
      ctx.font = '12px sans-serif';
      ctx.fillText('♪ Generated', bx + cardW - 100, y + 30);

      // BPM with visualizer bars
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = '13px monospace';
      ctx.fillText(`${song.bpm} BPM`, bx + 20, y + 52);

      // BPM Visualizer bars
      const barCount = 8;
      const barW = 4;
      const barGap = 3;
      const barX = bx + cardW - 100;
      const maxBarH = 30;

      for (let b = 0; b < barCount; b++) {
        const phase = this.time * (song.bpm / 60) * 2 + b * 0.3;
        const barH = (Math.sin(phase) * 0.5 + 0.5) * maxBarH;
        const barY = y + cardH / 2 + maxBarH / 2 - barH;

        const gradient = ctx.createLinearGradient(0, barY + barH, 0, barY);
        gradient.addColorStop(0, selected ? '#FF2E63' : '#00D9FF');
        gradient.addColorStop(1, selected ? '#BD00FF' : '#00FF88');

        ctx.fillStyle = gradient;
        ctx.fillRect(barX + b * (barW + barGap), barY, barW, barH);
      }

      ctx.restore();
    });

    // ── Keyboard Hints ──
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('WASD / Arrow Keys = Navigate  •  ENTER = Play  •  E = Chart Editor', cx, canvas.height - 70);

    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.font = '11px monospace';
    ctx.fillText('← → Change Difficulty  •  ↑ ↓ Change Song  •  Click to select', cx, canvas.height - 52);

    // ── Chart Editor Button ──
    const edBtnW = 220, edBtnH = 36;
    const edBtnX = cx - edBtnW / 2;
    const edBtnY = canvas.height - 35;
    this._editorRect = { x: edBtnX, y: edBtnY, w: edBtnW, h: edBtnH };

    ctx.save();

    if (this._hoverEditor) {
      ctx.fillStyle = 'rgba(0,217,255,0.2)';
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#00D9FF';
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.05)';
    }

    ctx.beginPath();
    ctx.roundRect(edBtnX, edBtnY, edBtnW, edBtnH, 10);
    ctx.fill();

    ctx.strokeStyle = this._hoverEditor ? '#00D9FF' : 'rgba(255,255,255,0.2)';
    ctx.lineWidth = this._hoverEditor ? 1.5 : 1;
    ctx.stroke();

    ctx.shadowBlur = this._hoverEditor ? 10 : 0;
    ctx.shadowColor = '#00D9FF';
    ctx.fillStyle = this._hoverEditor ? '#00D9FF' : 'rgba(255,255,255,0.6)';
    ctx.font = this._hoverEditor ? 'bold 14px sans-serif' : '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📝 CHART EDITOR', cx, edBtnY + edBtnH / 2 + 5);

    ctx.restore();
  }
}
