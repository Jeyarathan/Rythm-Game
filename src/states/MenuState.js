const MODES = [
  { label: 'Practice', key: 'practice', color: '#00FFFF' },
  { label: 'Easy',     key: 'easy',     color: '#12FA05' },
  { label: 'Normal',   key: 'normal',   color: '#FFDD57' },
  { label: 'Hard',     key: 'hard',     color: '#F9393F' },
];

export class MenuState {
  constructor(game, songs, onStart, onEditor) {
    this.game         = game;
    this.songs        = songs;
    this.onStart      = onStart;
    this.onEditor     = onEditor;
    this.selectedSong = 0;
    this.selectedMode = 2;   // default: Normal
    this.botEnabled   = false; // Bot toggle
    this._modeRects   = [];  // filled each render frame
    this._songRects   = [];
    this._botRect     = null;
    this._editorRect  = null;
    this._hoverMode   = -1;
    this._hoverSong   = -1;
    this._hoverBot    = false;
    this._hoverEditor = false;
    this._onKey       = this._onKey.bind(this);
    this._onClick     = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
  }

  init() {
    window.addEventListener('keydown', this._onKey);
    this.game.canvas.addEventListener('click',     this._onClick);
    this.game.canvas.addEventListener('mousemove', this._onMouseMove);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _onKey(e) {
    switch (e.key) {
      case 'ArrowLeft':  case 'a':
        this.selectedMode = (this.selectedMode - 1 + MODES.length) % MODES.length; break;
      case 'ArrowRight': case 'd':
        this.selectedMode = (this.selectedMode + 1) % MODES.length; break;
      case 'ArrowUp':    case 'w':
        this.selectedSong = (this.selectedSong - 1 + this.songs.length) % this.songs.length; break;
      case 'ArrowDown':  case 's':
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

    // Bot toggle button
    if (this._botRect && this._hit(this._botRect, x, y)) {
      this.botEnabled = !this.botEnabled;
      return;
    }

    // Editor button
    if (this._editorRect && this._hit(this._editorRect, x, y)) {
      this._openEditor();
      return;
    }

    // Mode buttons
    for (let i = 0; i < this._modeRects.length; i++) {
      if (this._hit(this._modeRects[i], x, y)) {
        this.selectedMode = i;
        return;
      }
    }

    // Song rows — first click selects, second click starts
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
    this._hoverBot = this._botRect && this._hit(this._botRect, x, y);
    this._hoverEditor = this._editorRect && this._hit(this._editorRect, x, y);

    const hovering = this._hoverMode !== -1 || this._hoverSong !== -1 || this._hoverBot || this._hoverEditor;
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
    this.onStart(this.songs[this.selectedSong], modeWithBot);
  }

  _openEditor() {
    window.removeEventListener('keydown', this._onKey);
    this.game.canvas.removeEventListener('click',     this._onClick);
    this.game.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.game.canvas.style.cursor = 'default';
    this.onEditor?.();
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  update(_dt) {}

  render(ctx) {
    const { canvas } = this.game;
    const cx = canvas.width / 2;

    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = '#C24B99';
    ctx.font      = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('FNF Rhythm Game', cx, 96);

    // ── Mode selector ──
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font      = '14px monospace';
    ctx.fillText('← →  or click  to select mode', cx, 132);

    const modeW = 130, modeH = 44, modeGap = 14;
    const totalModeW  = MODES.length * modeW + (MODES.length - 1) * modeGap;
    const modeStartX  = cx - totalModeW / 2;
    this._modeRects   = [];

    MODES.forEach((mode, i) => {
      const x        = modeStartX + i * (modeW + modeGap);
      const y        = 146;
      const selected = i === this.selectedMode;
      const hovered  = i === this._hoverMode && !selected;
      this._modeRects.push({ x, y, w: modeW, h: modeH });

      // Box fill
      ctx.fillStyle = selected ? mode.color
        : hovered   ? 'rgba(255,255,255,0.14)'
        :              'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.roundRect(x, y, modeW, modeH, 8);
      ctx.fill();

      // Box border
      ctx.strokeStyle = selected ? mode.color : hovered ? 'rgba(255,255,255,0.28)' : 'transparent';
      ctx.lineWidth   = selected ? 2 : 1;
      ctx.stroke();

      // Label
      ctx.fillStyle = selected ? '#000' : hovered ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.font      = selected ? 'bold 17px sans-serif' : '15px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(mode.label, x + modeW / 2, y + modeH / 2 + 6);
    });

    // ── Bot Toggle ──
    const botBtnW = 160, botBtnH = 36;
    const botBtnX = cx - botBtnW / 2;
    const botBtnY = 204;
    this._botRect = { x: botBtnX, y: botBtnY, w: botBtnW, h: botBtnH };

    ctx.fillStyle = this.botEnabled ? '#9D4EDD' : this._hoverBot ? 'rgba(157,78,221,0.2)' : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(botBtnX, botBtnY, botBtnW, botBtnH, 8);
    ctx.fill();
    ctx.strokeStyle = this.botEnabled ? '#9D4EDD' : this._hoverBot ? '#9D4EDD' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = this.botEnabled ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = this.botEnabled ? '#fff' : this._hoverBot ? '#9D4EDD' : 'rgba(255,255,255,0.65)';
    ctx.font = this.botEnabled ? 'bold 16px sans-serif' : '15px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`🤖 Bot ${this.botEnabled ? 'ON' : 'OFF'}`, cx, botBtnY + botBtnH / 2 + 6);

    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = '11px monospace';
    ctx.fillText('Press B to toggle', cx, botBtnY + botBtnH + 14);

    // ── Song list ──
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font      = '14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑ ↓  or click song  (click again to play)', cx, 268);

    this._songRects = [];
    this.songs.forEach((song, i) => {
      const y        = 304 + i * 82;
      const bx       = cx - 210;
      const bw       = 420;
      const bh       = 62;
      const selected = i === this.selectedSong;
      const hovered  = i === this._hoverSong;
      this._songRects.push({ x: bx, y: y - 36, w: bw, h: bh });

      if (selected) {
        ctx.fillStyle = 'rgba(194,75,153,0.22)';
        ctx.beginPath();
        ctx.roundRect(bx, y - 36, bw, bh, 7);
        ctx.fill();
        ctx.strokeStyle = '#C24B99';
        ctx.lineWidth   = 2;
        ctx.stroke();
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255,255,255,0.07)';
        ctx.beginPath();
        ctx.roundRect(bx, y - 36, bw, bh, 7);
        ctx.fill();
      }

      ctx.fillStyle = selected ? '#fff' : hovered ? 'rgba(255,255,255,0.8)' : 'rgba(255,255,255,0.5)';
      ctx.font      = `${selected ? 'bold ' : ''}26px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(song.title, cx, y + 4);

      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.font      = '13px monospace';
      ctx.fillText(`BPM: ${song.bpm}`, cx, y + 24);
    });

    // ── Bottom hints ──
    ctx.fillStyle = 'rgba(255,255,255,0.28)';
    ctx.font      = '15px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ENTER  or  double-click song to play  •  Press 7 in-game to edit', cx, canvas.height - 82);

    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.font      = '12px monospace';
    ctx.fillText('In-game lanes: A  S  W  D   or   ←  ↓  ↑  →', cx, canvas.height - 62);

    // ── Chart Editor Button ──
    const edBtnW = 220, edBtnH = 38;
    const edBtnX = cx - edBtnW / 2;
    const edBtnY = canvas.height - 42;
    this._editorRect = { x: edBtnX, y: edBtnY, w: edBtnW, h: edBtnH };

    ctx.fillStyle = this._hoverEditor ? 'rgba(194,75,153,0.22)' : 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.roundRect(edBtnX, edBtnY, edBtnW, edBtnH, 8);
    ctx.fill();
    ctx.strokeStyle = this._hoverEditor ? '#C24B99' : 'rgba(255,255,255,0.28)';
    ctx.lineWidth = this._hoverEditor ? 2 : 1;
    ctx.stroke();

    ctx.fillStyle = this._hoverEditor ? '#C24B99' : 'rgba(255,255,255,0.65)';
    ctx.font = this._hoverEditor ? 'bold 18px sans-serif' : '16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📝 Chart Editor (E)', cx, edBtnY + edBtnH / 2 + 6);
  }
}
