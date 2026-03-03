import { Conductor }    from '../gameplay/Conductor.js';
import { NoteManager }  from '../gameplay/NoteManager.js';
import { InputHandler } from '../input/InputHandler.js';
import { LANE_COLORS, LANE_KEYS } from '../gameplay/Note.js';
import { Character }    from '../characters/Character.js';
import { playHitSound } from '../audio/HitSound.js';
import { audioGenerator } from '../audio/AudioGenerator.js';

const JUDGEMENTS = [
  { label: 'Sick!', window: 45,  points: 350, color: '#FFDD57' },
  { label: 'Good',  window: 90,  points: 200, color: '#12FA05' },
  { label: 'Bad',   window: 135, points: 100, color: '#F9393F' },
];

const PAUSE_OPTIONS = ['Resume', 'Toggle Bot', 'Practice', 'Easy', 'Normal', 'Hard', 'Main Menu'];

// Difficulty tuning
const DIFF = {
  easy:   { hitGain: 8, missDrain: 1,  scrollSpeed: 0.32, hitWindow: 160 },
  normal: { hitGain: 3, missDrain: 5,  scrollSpeed: 0.45, hitWindow: 135 },
  hard:   { hitGain: 1, missDrain: 12, scrollSpeed: 0.70, hitWindow: 75  },
};

// Layout constants
const OPP_BASE_X   = 30;
const PLR_BASE_X   = 490;
const LANE_SPACING = 90;
const LANE_WIDTH   = 80;
const HIT_Y        = 550;

export class PlayState {
  constructor(game, chart, mode = 'normal', onExit = null, onEditChart = null) {
    this.game      = game;
    this.chart     = chart;
    this.onExit    = onExit;
    this.onEditChart = onEditChart;
    this.conductor = new Conductor(chart.bpm);

    // Parse mode (e.g., "normal+bot", "easy+bot", "practice")
    const hasBot = mode.includes('+bot');
    const baseMode = mode.replace('+bot', '');

    this._difficulty    = baseMode === 'practice' ? 'normal' : baseMode;
    this._practiceMode  = baseMode === 'practice';
    this._botMode       = hasBot;

    const diff = DIFF[this._difficulty] ?? DIFF.normal;
    this.playerNotes   = new NoteManager({ baseX: PLR_BASE_X, laneSpacing: LANE_SPACING, laneWidth: LANE_WIDTH, hitY: HIT_Y, scrollSpeed: diff.scrollSpeed, hitWindow: diff.hitWindow });
    this.opponentNotes = new NoteManager({ baseX: OPP_BASE_X, laneSpacing: LANE_SPACING, laneWidth: LANE_WIDTH, hitY: HIT_Y, scrollSpeed: diff.scrollSpeed });

    this.input = new InputHandler();

    this.character = new Character({ x: 665, y: 490, scale: 0.8, flipX: true });
    this.opponent  = new Character({
      x: 205, y: 490, scale: 0.8, flipX: false,
      theme: { cap: '#8B0000', shirt: '#8B0000', capBrim: '#5a0000', pants: '#1a1a1a', shoes: '#222' },
    });

    this.score  = 0;
    this.misses = 0;
    this.combo  = 0;
    this.lead   = 0;  // -100 = opponent winning, +100 = player winning

    this._flashTimers    = [0, 0, 0, 0];
    this._oppFlashTimers = [0, 0, 0, 0];
    this._hitLabel = '';
    this._hitColor = '#fff';
    this._hitTimer = 0;

    this._gameOver      = false;
    this._paused        = false;
    this._pauseMenuIdx  = 0;
    this._pauseMenuRects = [];
    this._hoverPauseIdx  = -1;

    // In-game editor mode
    this._editMode       = false;
    this._editTool       = 'add'; // 'add' or 'delete'
    this._editSide       = 'player'; // 'player' or 'opponent'
    this._hoverEditNote  = null;
  }

  init() {
    const playerNotes = this._difficulty === 'easy'
      ? (this.chart.notes ?? []).filter((_, i) => i % 2 === 0)
      : (this.chart.notes ?? []);

    // Store original note data for looping
    this._originalPlayerNotes = playerNotes;
    this._originalOpponentNotes = this.chart.opponentNotes ?? [];

    this.playerNotes.loadNotes(playerNotes);
    this.opponentNotes.loadNotes(this.chart.opponentNotes ?? []);

    // Calculate and store the chart end time once at load
    let chartEndTime = 0;
    for (const note of playerNotes) {
      const noteEnd = note.time + (note.duration || 0);
      chartEndTime = Math.max(chartEndTime, noteEnd);
    }
    for (const note of (this.chart.opponentNotes ?? [])) {
      const noteEnd = note.time + (note.duration || 0);
      chartEndTime = Math.max(chartEndTime, noteEnd);
    }
    this._chartEndTime = chartEndTime;

    if (this.chart.useGeneratedAudio) {
      this._useGeneratedAudio = true;
      this._audioKey = this.chart.audioKey;
      this._audio = null;
      this.conductor.setAudio(null);
    } else {
      this._audio = new Audio(this.chart.audioSrc);
      this._audio.volume = 0.7;
      this.conductor.setAudio(this._audio);
    }

    this.input.onHit = (lane) => this._onLaneHit(lane);

    // Pause menu keyboard handler
    this._pauseHandler = (e) => {
      if (this._gameOver) return;

      if (e.key === 'Escape') {
        this._togglePause();
        return;
      }

      if (e.key === '7') {
        this._toggleEditMode();
        return;
      }

      // Toggle bot mode with B key
      if (e.key === 'b' || e.key === 'B') {
        this._botMode = !this._botMode;
        console.log(`🤖 Bot mode: ${this._botMode ? 'ON' : 'OFF'}`);
        return;
      }

      // Edit mode controls
      if (this._editMode) {
        if (e.key === '1') {
          this._editTool = 'add';
        } else if (e.key === '2') {
          this._editTool = 'delete';
        } else if (e.key === 'Tab') {
          e.preventDefault();
          this._editSide = this._editSide === 'player' ? 'opponent' : 'player';
        } else if (e.key === 's' || e.key === 'S') {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this._saveChartInGame();
          }
        }
        return;
      }

      if (this._paused) {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          this._pauseMenuIdx = (this._pauseMenuIdx - 1 + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          this._pauseMenuIdx = (this._pauseMenuIdx + 1) % PAUSE_OPTIONS.length;
        } else if (e.key === 'Enter') {
          this._selectPauseOption();
        }
      }
    };
    window.addEventListener('keydown', this._pauseHandler);

    // Pause menu mouse handlers
    this._pauseClickHandler = (e) => {
      // Edit mode click handler
      if (this._editMode) {
        this._handleEditClick(e);
        return;
      }

      if (!this._paused || this._gameOver) return;
      const { x, y } = this._canvasPos(e);
      for (let i = 0; i < this._pauseMenuRects.length; i++) {
        if (this._hitRect(this._pauseMenuRects[i], x, y)) {
          this._pauseMenuIdx = i;
          this._selectPauseOption();
          return;
        }
      }
    };
    this._pauseMoveHandler = (e) => {
      // Edit mode hover handler
      if (this._editMode) {
        this._handleEditHover(e);
        return;
      }

      if (!this._paused || this._gameOver) return;
      const { x, y } = this._canvasPos(e);
      this._hoverPauseIdx = this._pauseMenuRects.findIndex(r => this._hitRect(r, x, y));
      this.game.canvas.style.cursor = this._hoverPauseIdx !== -1 ? 'pointer' : 'default';
    };
    this.game.canvas.addEventListener('click',     this._pauseClickHandler);
    this.game.canvas.addEventListener('mousemove', this._pauseMoveHandler);

    this.conductor.start();

    if (this._useGeneratedAudio) {
      audioGenerator.play(this._audioKey).then(mockAudio => {
        this._audio = mockAudio;
        this.conductor.setAudio(mockAudio);
      }).catch(err => console.error('Audio error:', err));
    } else if (this._audio) {
      this._audio.play().catch(() => {
        const resume = () => { if (this._audio) this._audio.play(); window.removeEventListener('keydown', resume); };
        window.addEventListener('keydown', resume);
      });
    }
  }

  _canvasPos(e) {
    const r = this.game.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (this.game.canvas.width  / r.width),
      y: (e.clientY - r.top)  * (this.game.canvas.height / r.height),
    };
  }

  _hitRect(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  // ─── Pause ─────────────────────────────────────────────────────────────────

  _togglePause() {
    this._paused = !this._paused;
    if (this._paused) {
      this._audio?.pause();
    } else {
      this._hoverPauseIdx = -1;
      this.game.canvas.style.cursor = 'default';
      this._audio?.play().catch(() => {});
    }
  }

  _selectPauseOption() {
    const opt = PAUSE_OPTIONS[this._pauseMenuIdx];
    if (opt === 'Resume') {
      this._togglePause();
    } else if (opt === 'Toggle Bot') {
      this._botMode = !this._botMode;
      this._togglePause();
    } else if (opt === 'Practice') {
      this._practiceMode = true;
      this._difficulty   = 'normal';
      this._applyDifficulty();
      this._togglePause();
    } else if (opt === 'Main Menu') {
      this._audio?.pause();
      window.removeEventListener('keydown', this._pauseHandler);
      this.game.canvas.removeEventListener('click',     this._pauseClickHandler);
      this.game.canvas.removeEventListener('mousemove', this._pauseMoveHandler);
      this.game.canvas.style.cursor = 'default';
      this.onExit?.();
    } else {
      this._practiceMode = false;
      this._difficulty   = opt.toLowerCase();  // 'easy' | 'normal' | 'hard'
      this._applyDifficulty();
      this._togglePause();
    }
  }

  _toggleEditMode() {
    this._editMode = !this._editMode;
    if (this._editMode) {
      // Entering edit mode - pause the game
      if (!this._paused) {
        this._audio?.pause();
      }
    } else {
      // Exiting edit mode - resume playing immediately with edited notes
      this._hoverEditNote = null;
      this.game.canvas.style.cursor = 'default';

      // Resume audio immediately
      if (!this._paused && this._audio) {
        this._audio.play().catch(() => {});
      }
    }
  }

  _handleEditClick(e) {
    const { x, y } = this._canvasPos(e);
    const noteManager = this._editSide === 'player' ? this.playerNotes : this.opponentNotes;
    const baseX = this._editSide === 'player' ? PLR_BASE_X : OPP_BASE_X;

    // Check which lane was clicked
    for (let lane = 0; lane < 4; lane++) {
      const laneX = baseX + lane * LANE_SPACING;
      if (x >= laneX && x <= laneX + LANE_WIDTH) {
        if (this._editTool === 'add') {
          // Add note
          const deltaY = HIT_Y - y;
          const time = this.conductor.songPosition + deltaY / noteManager.scrollSpeed;
          const snappedTime = Math.round(time / 500) * 500; // 500ms grid

          // Check if note exists
          const exists = noteManager.notes.some(n =>
            n.lane === lane && !n.hit && !n.missed && Math.abs(n.time - snappedTime) < 100
          );

          if (!exists && snappedTime >= 0) {
            const Note = noteManager.notes[0]?.constructor || class { constructor(l, t) { this.lane = l; this.time = t; this.hit = false; this.missed = false; } };
            noteManager.notes.push(new Note(lane, snappedTime));
            noteManager.notes.sort((a, b) => a.time - b.time);
          }
        } else if (this._editTool === 'delete') {
          // Delete note
          const clickedNote = noteManager.notes.find(n => {
            if (n.lane !== lane || n.hit || n.missed) return false;
            const noteY = n.getY(this.conductor.songPosition, HIT_Y, noteManager.scrollSpeed);
            return Math.abs(noteY - y) < 20;
          });

          if (clickedNote) {
            const index = noteManager.notes.indexOf(clickedNote);
            if (index !== -1) {
              noteManager.notes.splice(index, 1);
            }
          }
        }
        return;
      }
    }
  }

  _handleEditHover(e) {
    const { x, y } = this._canvasPos(e);
    const noteManager = this._editSide === 'player' ? this.playerNotes : this.opponentNotes;
    const baseX = this._editSide === 'player' ? PLR_BASE_X : OPP_BASE_X;

    this._hoverEditNote = null;

    for (const note of noteManager.notes) {
      if (note.hit || note.missed) continue;
      const laneX = baseX + note.lane * LANE_SPACING;
      const noteY = note.getY(this.conductor.songPosition, HIT_Y, noteManager.scrollSpeed);

      if (x >= laneX && x <= laneX + LANE_WIDTH && Math.abs(y - noteY) < 20) {
        this._hoverEditNote = note;
        this.game.canvas.style.cursor = 'pointer';
        return;
      }
    }

    this.game.canvas.style.cursor = 'default';
  }

  _saveChartInGame() {
    const chart = {
      title: this.chart.title || 'Custom Chart',
      notes: this.playerNotes.notes.map(n => ({ lane: n.lane, time: n.time })),
      opponentNotes: this.opponentNotes.notes.map(n => ({ lane: n.lane, time: n.time })),
    };

    const json = JSON.stringify(chart, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const filename = (this.chart.title || 'chart').toLowerCase().replace(/\s+/g, '-');
    a.download = `${filename}-edited.json`;
    a.click();

    URL.revokeObjectURL(url);
    console.log('Chart saved!', chart);
  }

  _openEditor() {
    this._audio?.pause();
    window.removeEventListener('keydown', this._pauseHandler);
    this.game.canvas.removeEventListener('click',     this._pauseClickHandler);
    this.game.canvas.removeEventListener('mousemove', this._pauseMoveHandler);
    this.game.canvas.style.cursor = 'default';
    this.onEditChart?.(this.chart);
  }

  _applyDifficulty() {
    const diff = DIFF[this._difficulty] ?? DIFF.normal;
    this.playerNotes.scrollSpeed   = diff.scrollSpeed;
    this.playerNotes.hitWindow     = diff.hitWindow;
    this.opponentNotes.scrollSpeed = diff.scrollSpeed;
  }

  // ─── Game over ─────────────────────────────────────────────────────────────

  _onGameOver() {
    this._gameOver = true;
    if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }

    // Manual retry only - press SPACE or ENTER to retry
    this._retryHandler = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        window.removeEventListener('keydown', this._retryHandler);
        this._retry();
      }
    };
    window.addEventListener('keydown', this._retryHandler);
  }

  _retry() {
    this._gameOver       = false;
    this.score           = 0;
    this.misses          = 0;
    this.combo           = 0;
    this.lead            = 0;
    this._hitTimer       = 0;
    this._flashTimers    = [0, 0, 0, 0];
    this._oppFlashTimers = [0, 0, 0, 0];

    // Remove retry handler
    if (this._retryHandler) {
      window.removeEventListener('keydown', this._retryHandler);
      this._retryHandler = null;
    }

    // Reset notes and restart immediately
    this.playerNotes.reset();
    this.opponentNotes.reset();
    this.conductor.start();

    // Start audio immediately
    if (this._audio) {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
    }
  }

  // ─── Hit / miss ────────────────────────────────────────────────────────────

  _onLaneHit(lane) {
    if (this._paused || this._gameOver) return;
    this._flashTimers[lane] = 0.12;

    const note = this.playerNotes.checkHit(lane, this.conductor.songPosition);
    if (note) {
      playHitSound(lane);
      const diff = Math.abs(note.time - this.conductor.songPosition);
      const j = JUDGEMENTS.find(j => diff <= j.window) ?? JUDGEMENTS.at(-1);

      // Add splash effect for "Sick!" hits
      if (j.label === 'Sick!') {
        note.splash = true;
        note.splashTimer = 1.0;
      }

      // For hold notes, only register initial hit, continuous scoring happens in update
      if (note.type !== 'hold') {
        this._registerHit(j.label, j.color, j.points);
      } else {
        this._registerHit(j.label, j.color, j.points * 0.3); // 30% on initial hit
      }
      this.character.sing(lane);
    } else {
      this._registerMiss();
      this.character.miss(lane);
    }
  }

  _registerHit(label, color, points) {
    this.score += points * (1 + Math.floor(this.combo / 10));
    this.combo++;
    const gain     = DIFF[this._difficulty]?.hitGain ?? 3;
    this.lead      = Math.min(100, this.lead + gain);
    this._hitLabel = label;
    this._hitColor = color;
    this._hitTimer = 0.6;
  }

  _registerMiss() {
    this.misses++;
    this.combo = 0;
    const drain = DIFF[this._difficulty]?.missDrain ?? 5;
    this.lead   = Math.max(-100, this.lead - drain);
    this._hitLabel = 'Miss';
    this._hitColor = '#888';
    this._hitTimer = 0.6;
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this._gameOver || this._paused || this._editMode) return;

    this.conductor.update();

    // Bot mode: auto-play player notes
    if (this._botMode) {
      const playerBotHits = this.playerNotes.updateBot(this.conductor.songPosition);
      for (const note of playerBotHits) {
        this._flashTimers[note.lane] = 0.12;
        this.character.sing(note.lane);
        playHitSound(note.lane);
        // Add splash effect for bot hits (always "Sick!")
        note.splash = true;
        note.splashTimer = 1.0;
        // Give points for bot hits
        const judgement = JUDGEMENTS[0]; // Always "Sick!" for bot
        this.score += judgement.points;
        this.combo++;
        this.lead = Math.min(100, this.lead + 2);
        this._hitLabel = judgement.label;
        this._hitColor = judgement.color;
        this._hitTimer = 0.5;
      }
    } else {
      // Manual play
      this.playerNotes.update(this.conductor.songPosition);
      // Update hold notes and give points for holding
      this.playerNotes.updateHolds(this.conductor.songPosition, this.input.held);
    }

    // Give points for holding notes
    if (this._botMode) {
      // Bot mode: auto-score hold notes
      for (const note of this.playerNotes.notes) {
        if (note.type === 'hold' && note.holding) {
          const pointsPerSecond = 200;
          this.score += Math.floor(pointsPerSecond * dt);
          this.lead = Math.min(100, this.lead + 0.5 * dt * 60);
        }
      }
    } else {
      // Manual mode: score and detect misses
      for (const note of this.playerNotes.notes) {
        if (note.type === 'hold' && note.holding && !note._lastHoldFrame) {
          // Give points continuously while holding (70% of total points distributed over duration)
          const pointsPerSecond = 200; // Adjust as needed
          this.score += Math.floor(pointsPerSecond * dt);
          this.lead = Math.min(100, this.lead + 0.5 * dt * 60); // Small lead gain while holding
        }
        note._lastHoldFrame = note.holding;
      }

      // Player miss detection - check ALL notes, not just from last index
      // This ensures hold notes that are released early get caught
      let missesThisFrame = 0;
      const MAX_MISSES_PER_FRAME = 10;

      for (const note of this.playerNotes.notes) {
        // Only check notes that should have been hit by now
        if (note.time > this.conductor.songPosition + this.playerNotes.hitWindow) {
          break; // Notes are sorted, so we can stop
        }

        if (note.missed && !note._missHandled) {
          note._missHandled = true;

          // Process misses
          if (missesThisFrame < MAX_MISSES_PER_FRAME) {
            this._registerMiss();
            this.character.miss(note.lane);
            missesThisFrame++;
          }
        }
      }
    }

    // Opponent bot auto-plays
    const botHits = this.opponentNotes.updateBot(this.conductor.songPosition);
    for (const note of botHits) {
      this._oppFlashTimers[note.lane] = 0.12;
      this.opponent.sing(note.lane);
    }

    // Death check (skipped in practice and bot modes)
    if (!this._practiceMode && !this._botMode && this.lead <= -100) {
      this._onGameOver();
      return;
    }

    // Loop instantly when chart ends (NO DELAY) - RELOAD ALL NOTES
    // Works for ALL difficulties: Practice, Easy, Normal, Hard
    if (this.conductor.songPosition > this._chartEndTime) {
      // RELOAD notes from original data (don't just reset)
      this.playerNotes.loadNotes(this._originalPlayerNotes);
      this.opponentNotes.loadNotes(this._originalOpponentNotes);
      this.conductor.start();
      if (this._audio) {
        this._audio.currentTime = 0;
        this._audio.play().catch(() => {});
      }
    }

    this.opponent.update(dt);
    this.character.update(dt);
    this._flashTimers    = this._flashTimers.map(t    => Math.max(0, t - dt));
    this._oppFlashTimers = this._oppFlashTimers.map(t => Math.max(0, t - dt));
    if (this._hitTimer > 0) this._hitTimer -= dt;

    // Update splash timers for all notes
    for (const note of this.playerNotes.notes) {
      if (note.splashTimer > 0) {
        note.splashTimer = Math.max(0, note.splashTimer - dt * 2); // Fade out in 0.5 seconds
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  render(ctx) {
    const { canvas } = this.game;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Lane guides — opponent side
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(this.opponentNotes.getLaneX(i), 0, LANE_WIDTH, canvas.height);
    }

    // Lane guides — player side
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(this.playerNotes.getLaneX(i), 0, LANE_WIDTH, canvas.height);
    }

    // Characters (behind notes)
    this.opponent.render(ctx);
    this.character.render(ctx);

    // Notes
    this.opponentNotes.render(ctx, this.conductor.songPosition);
    this.playerNotes.render(ctx, this.conductor.songPosition);

    // Receptors — opponent side
    for (let i = 0; i < 4; i++) {
      const x    = this.opponentNotes.getLaneX(i);
      const glow = this._oppFlashTimers[i] > 0;
      ctx.fillStyle   = glow ? LANE_COLORS[i] : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 8);
      ctx.fill();
      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth   = glow ? 3 : 1;
      ctx.stroke();
    }

    // Receptors — player side
    for (let i = 0; i < 4; i++) {
      const x    = this.playerNotes.getLaneX(i);
      const glow = this._flashTimers[i] > 0;
      ctx.fillStyle   = glow ? LANE_COLORS[i] : 'rgba(255,255,255,0.12)';
      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 8);
      ctx.fill();
      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth   = glow ? 3 : 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.font      = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(LANE_KEYS[i], x + LANE_WIDTH / 2, HIT_Y + 44);
    }

    // Lead bar at top-center
    this._renderLeadBar(ctx, canvas);

    // Score / combo / misses — top-right
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 18px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Score:  ${this.score}`,  canvas.width - 10, 60);
    ctx.fillText(`Combo:  ${this.combo}`,  canvas.width - 10, 82);
    ctx.fillText(`Misses: ${this.misses}`, canvas.width - 10, 104);

    // Mode badge — top-left
    const modeLabel = this._practiceMode
      ? 'PRACTICE'
      : this._difficulty.toUpperCase();
    const modeColor = this._practiceMode ? '#00FFFF'
      : this._difficulty === 'easy'   ? '#12FA05'
      : this._difficulty === 'hard'   ? '#F9393F'
      : '#FFDD57';
    ctx.fillStyle = modeColor;
    ctx.font      = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(modeLabel, 10, 60);

    // Judgement popup
    if (this._hitTimer > 0) {
      const alpha = this._hitTimer / 0.6;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle   = this._hitColor;
      ctx.font        = 'bold 36px sans-serif';
      ctx.textAlign   = 'center';
      ctx.fillText(this._hitLabel, PLR_BASE_X + LANE_SPACING * 1.5 + LANE_WIDTH / 2, HIT_Y - 60);
      ctx.restore();
    }

    // Song position
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font      = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${(this.conductor.songPosition / 1000).toFixed(1)}s`, canvas.width - 10, canvas.height - 10);

    // Edit hint
    if (!this._editMode && !this._paused && !this._gameOver) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font      = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Press 7 to edit chart', 10, canvas.height - 10);
    }

    // Overlays
    if (this._gameOver) this._renderGameOver(ctx, canvas);
    if (this._paused)   this._renderPauseMenu(ctx, canvas);
    if (this._editMode) this._renderEditOverlay(ctx, canvas);
  }

  // ─── Edit Mode Overlay ─────────────────────────────────────────────────────

  _renderEditOverlay(ctx, canvas) {
    // Semi-transparent overlay
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = '#C24B99';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EDIT MODE', canvas.width / 2, 60);

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '15px monospace';
    ctx.fillText('Click on lanes to add/delete notes  •  1 = Add  •  2 = Delete  •  TAB = Switch sides', canvas.width / 2, 95);
    ctx.font = '13px monospace';
    ctx.fillText('Ctrl+S to save  •  7 to exit edit mode', canvas.width / 2, 115);

    // Tool indicator
    const toolBgW = 160, toolBgH = 40;
    const toolBgX = 10, toolBgY = canvas.height - 120;

    ctx.fillStyle = this._editTool === 'add' ? 'rgba(18,250,5,0.2)' : 'rgba(249,57,63,0.2)';
    ctx.beginPath();
    ctx.roundRect(toolBgX, toolBgY, toolBgW, toolBgH, 8);
    ctx.fill();

    const toolColor = this._editTool === 'add' ? '#12FA05' : '#F9393F';
    const toolLabel = this._editTool === 'add' ? '+ ADD MODE' : '✕ DELETE MODE';
    ctx.fillStyle = toolColor;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(toolLabel, toolBgX + 10, toolBgY + 25);

    // Side indicator
    const sideBgY = toolBgY + toolBgH + 10;
    ctx.fillStyle = this._editSide === 'player' ? 'rgba(18,250,5,0.2)' : 'rgba(249,57,63,0.2)';
    ctx.beginPath();
    ctx.roundRect(toolBgX, sideBgY, toolBgW, toolBgH, 8);
    ctx.fill();

    const sideColor = this._editSide === 'player' ? '#12FA05' : '#F9393F';
    const sideLabel = this._editSide === 'player' ? 'PLAYER (right)' : 'OPPONENT (left)';
    ctx.fillStyle = sideColor;
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText(sideLabel, toolBgX + 10, sideBgY + 25);

    // Highlight active lanes
    const baseX = this._editSide === 'player' ? PLR_BASE_X : OPP_BASE_X;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = this._editSide === 'player' ? 'rgba(18,250,5,0.5)' : 'rgba(249,57,63,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(baseX + i * LANE_SPACING, 150, LANE_WIDTH, canvas.height - 150);
    }

    // Highlight hovered note
    if (this._hoverEditNote) {
      const laneX = baseX + this._hoverEditNote.lane * LANE_SPACING;
      const noteY = this._hoverEditNote.getY(this.conductor.songPosition, HIT_Y,
        this._editSide === 'player' ? this.playerNotes.scrollSpeed : this.opponentNotes.scrollSpeed);

      ctx.strokeStyle = '#FFDD57';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(laneX, noteY - 15, LANE_WIDTH, 30, 8);
      ctx.stroke();
    }

    // Stats
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Player Notes: ${this.playerNotes.notes.filter(n => !n.hit && !n.missed).length}`, canvas.width - 10, canvas.height - 60);
    ctx.fillText(`Opponent Notes: ${this.opponentNotes.notes.filter(n => !n.hit && !n.missed).length}`, canvas.width - 10, canvas.height - 40);
    ctx.fillText(`Time: ${(this.conductor.songPosition / 1000).toFixed(1)}s`, canvas.width - 10, canvas.height - 20);
  }

  // ─── Overlay renderers ─────────────────────────────────────────────────────

  _renderLeadBar(ctx, canvas) {
    const barW = 380;
    const barH = 16;
    const barX = (canvas.width - barW) / 2;
    const barY = 14;
    const mid  = barX + barW / 2;

    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barW, barH);

    const normalized = (this.lead + 100) / 200;
    const markerX    = barX + normalized * barW;

    if (this.lead >= 0) {
      ctx.fillStyle = '#12FA05';
      ctx.fillRect(mid, barY, markerX - mid, barH);
    } else {
      ctx.fillStyle = '#F9393F';
      ctx.fillRect(markerX, barY, mid - markerX, barH);
    }

    ctx.strokeStyle = '#555';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(mid, barY);
    ctx.lineTo(mid, barY + barH);
    ctx.stroke();

    ctx.fillStyle   = '#fff';
    ctx.beginPath();
    ctx.arc(markerX, barY + barH / 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.font      = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textAlign = 'left';
    ctx.fillText('OPPONENT', barX + 4, barY + barH + 14);
    ctx.textAlign = 'right';
    ctx.fillText('YOU', barX + barW - 4, barY + barH + 14);
  }

  _renderGameOver(ctx, canvas) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#F9393F';
    ctx.font      = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2 - 30);

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font      = '26px sans-serif';
    ctx.fillText('Press ENTER or SPACE to retry', canvas.width / 2, canvas.height / 2 + 36);
  }

  _renderPauseMenu(ctx, canvas) {
    // Dimmed overlay
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = '#fff';
    ctx.font      = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2 - 140);

    // Current mode indicator
    const baseLabel = this._practiceMode ? 'Practice' : this._difficulty[0].toUpperCase() + this._difficulty.slice(1);
    const modeLabel = this._botMode ? `${baseLabel} + Bot` : baseLabel;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.font      = '15px monospace';
    ctx.fillText(`Mode: ${modeLabel}`, canvas.width / 2, canvas.height / 2 - 100);

    // Menu options
    const itemW = 280, itemH = 42;
    const itemX = canvas.width / 2 - itemW / 2;
    this._pauseMenuRects = [];

    PAUSE_OPTIONS.forEach((opt, i) => {
      const y        = canvas.height / 2 - 50 + i * 52;
      const selected = i === this._pauseMenuIdx;
      const hovered  = i === this._hoverPauseIdx && !selected;
      this._pauseMenuRects.push({ x: itemX, y: y - 30, w: itemW, h: itemH });

      // Box background
      if (selected || hovered) {
        ctx.fillStyle = selected ? 'rgba(255,221,87,0.18)' : 'rgba(255,255,255,0.08)';
        ctx.beginPath();
        ctx.roundRect(itemX, y - 30, itemW, itemH, 8);
        ctx.fill();
        ctx.strokeStyle = selected ? '#FFDD57' : 'rgba(255,255,255,0.25)';
        ctx.lineWidth   = selected ? 1.5 : 1;
        ctx.stroke();
      }

      ctx.fillStyle = selected ? '#FFDD57' : hovered ? '#fff' : 'rgba(255,255,255,0.65)';
      ctx.font      = selected ? 'bold 30px sans-serif' : '26px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(opt, canvas.width / 2, y);
    });

    // Navigation hint
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font      = '13px monospace';
    ctx.fillText('↑ ↓  navigate   •   ENTER / click  select   •   ESC  resume', canvas.width / 2, canvas.height - 24);
  }
}
