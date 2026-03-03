import { Conductor }    from '../gameplay/Conductor.js';
import { NoteManager }  from '../gameplay/NoteManager.js';
import { InputHandler } from '../input/InputHandler.js';
import { TouchHandler } from '../input/TouchHandler.js';
import { LANE_COLORS, LANE_KEYS } from '../gameplay/Note.js';
import { Character }    from '../characters/Character.js';
import { playHitSound } from '../audio/HitSound.js';
import { audioGenerator } from '../audio/AudioGenerator.js';
import { saveManager } from '../core/SaveManager.js';
import { achievementChecker } from '../core/Achievements.js';
import { AchievementToast } from '../ui/AchievementToast.js';

const JUDGEMENTS = [
  { label: 'SICK!', window: 45,  points: 350, color: '#FF2E63' },
  { label: 'GOOD',  window: 90,  points: 200, color: '#00FF88' },
  { label: 'BAD',   window: 135, points: 100, color: '#FFB74D' },
];

// Pause menu button options (new simplified design)
const PAUSE_OPTIONS = ['Resume', 'Restart', 'Options', 'Main Menu'];

// Button accent colors for each option
const PAUSE_BUTTON_COLORS = {
  'Resume': '#44ff88',      // Green
  'Restart': '#ffdd00',     // Yellow
  'Options': '#44ffff',     // Cyan
  'Main Menu': '#ff4444'    // Red
};

// Difficulty tuning
const DIFF = {
  easy:   { hitGain: 8, missDrain: 1,  scrollSpeed: 0.32, hitWindow: 160 },
  normal: { hitGain: 3, missDrain: 5,  scrollSpeed: 0.45, hitWindow: 135 },
  hard:   { hitGain: 1, missDrain: 12, scrollSpeed: 0.70, hitWindow: 75  },
};

// FIX BUG 1: Centralized lane configuration (single source of truth)
// All lane positions, widths, and spacing now come from this config
// This prevents misalignment between notes, receptors, and lane visuals
const LANE_CONFIG = {
  opponent: {
    baseX: 30,           // Left side starting X position
    laneWidth: 80,       // Width of each lane column
    laneSpacing: 90,     // Distance between lane centers
    get lanes() {
      // Helper: pre-calculate all 4 lane positions
      return [0, 1, 2, 3].map(i => ({
        x: this.baseX + (i * this.laneSpacing),
        width: this.laneWidth
      }));
    }
  },
  player: {
    baseX: 490,          // Right side starting X position
    laneWidth: 80,       // Width of each lane column
    laneSpacing: 90,     // Distance between lane centers
    get lanes() {
      // Helper: pre-calculate all 4 lane positions
      return [0, 1, 2, 3].map(i => ({
        x: this.baseX + (i * this.laneSpacing),
        width: this.laneWidth
      }));
    }
  },
  hitY: 550              // Y position of hit zone receptors
};

// Keep old constants for backwards compatibility (deprecated)
const OPP_BASE_X   = LANE_CONFIG.opponent.baseX;
const PLR_BASE_X   = LANE_CONFIG.player.baseX;
const LANE_SPACING = LANE_CONFIG.player.laneSpacing;
const LANE_WIDTH   = LANE_CONFIG.player.laneWidth;
const HIT_Y        = LANE_CONFIG.hitY;

export class PlayState {
  constructor(game, chart, mode = 'normal', onExit = null, onEditChart = null, speedMultiplier = 1.0) {
    this.game      = game;
    this.chart     = chart;
    this.onExit    = onExit;
    this.onEditChart = onEditChart;
    this.speedMultiplier = speedMultiplier;
    this.conductor = new Conductor(chart.bpm * speedMultiplier);

    // Parse mode (e.g., "normal+bot", "easy+bot", "practice")
    const hasBot = mode.includes('+bot');
    const baseMode = mode.replace('+bot', '');

    this._difficulty    = baseMode === 'practice' ? 'normal' : baseMode;
    this._practiceMode  = baseMode === 'practice';
    this._botMode       = hasBot;

    const diff = DIFF[this._difficulty] ?? DIFF.normal;
    // FIX BUG 1: Use LANE_CONFIG for all lane positions (ensures alignment)
    this.playerNotes   = new NoteManager({
      baseX: LANE_CONFIG.player.baseX,
      laneSpacing: LANE_CONFIG.player.laneSpacing,
      laneWidth: LANE_CONFIG.player.laneWidth,
      hitY: LANE_CONFIG.hitY,
      scrollSpeed: diff.scrollSpeed,
      hitWindow: diff.hitWindow
    });
    this.opponentNotes = new NoteManager({
      baseX: LANE_CONFIG.opponent.baseX,
      laneSpacing: LANE_CONFIG.opponent.laneSpacing,
      laneWidth: LANE_CONFIG.opponent.laneWidth,
      hitY: LANE_CONFIG.hitY,
      scrollSpeed: diff.scrollSpeed
    });

    this.input = new InputHandler();
    this.touch = new TouchHandler(game.canvas); // Mobile touch support

    // Player character (blue/purple theme - default)
    this.character = new Character({ x: 665, y: 490, scale: 0.8, flipX: true });

    // Opponent character (red/dark menacing theme)
    this.opponent  = new Character({
      x: 205, y: 490, scale: 0.8, flipX: false,
      theme: {
        skin:       '#E8C4BC',      // Pale/menacing skin
        skinShade:  '#C9A59D',
        cap:        '#8B0000',      // Dark red cap
        capBrim:    '#5a0000',      // Darker red brim
        shirt:      '#8B0000',      // Dark red shirt
        shirtShade: '#6B0000',      // Even darker for depth
        pants:      '#1a1a1a',      // Very dark pants
        pantsShade: '#0a0a0a',      // Black shade
        shoes:      '#000',         // Pure black shoes
        eyes:       '#8B0000',      // Red eyes (menacing)
        mouth:      '#5a0000',      // Dark mouth
      },
    });

    this.score  = 0;
    this.misses = 0;
    this.combo  = 0;
    this.maxCombo = 0; // Track highest combo achieved
    this.lead   = 0;  // -100 = opponent winning, +100 = player winning

    // Judgement counters for score saving
    this._judgementCounts = {
      perfect: 0,  // SICK!
      good: 0,     // GOOD
      ok: 0,       // BAD (ok tier)
      bad: 0,      // Missed notes
    };

    // Achievement tracking
    this._newlyUnlockedAchievements = [];
    this.achievementToast = new AchievementToast();

    this._flashTimers    = [0, 0, 0, 0];
    this._oppFlashTimers = [0, 0, 0, 0];
    this._hitLabel = '';
    this._hitColor = '#fff';
    this._hitTimer = 0;
    this._hitScale = 1;
    this._lastCombo = 0;
    this._comboPopTimer = 0;
    this._missShakeTimer = 0;

    // Combo milestone tracking
    this._lastMilestone = 0;
    this._milestoneEffect = null; // {combo, timer, particles}

    // DEBUG MODE: Toggle with F3
    this._debugMode = false;
    this._debugStats = {
      lastDt: 0,
      notesCulled: 0,
      activeNotes: 0,
      positionJumps: 0,
    };

    this._gameOver      = false;
    this._paused        = false;
    this._pauseMenuIdx  = 0;
    this._pauseMenuRects = [];
    this._hoverPauseIdx  = -1;

    // Enhanced pause menu state
    this._pauseMenuState = 'main'; // 'main', 'options', 'confirm'
    this._pauseMenuAnimation = 0;  // 0 to 1 for slide-in animation
    this._confirmDialogAnimation = 0;

    // Options panel sliders - load saved preferences
    const currentDiff = DIFF[this._difficulty] ?? DIFF.normal;
    const savedPrefs = saveManager.getPreferences();
    this._optionsSliders = {
      noteSpeed: savedPrefs.noteSpeed ?? currentDiff.scrollSpeed,
      musicVolume: savedPrefs.musicVolume ?? 0.7,
      hitSoundVolume: savedPrefs.hitSoundVolume ?? 1.0,
      botMode: savedPrefs.botMode ?? this._botMode
    };
    this._activeSlider = null; // Currently dragging slider name
    this._sliderRects = [];    // Slider hitboxes for mouse interaction

    // Apply loaded preferences immediately
    this.playerNotes.scrollSpeed = this._optionsSliders.noteSpeed;
    this.opponentNotes.scrollSpeed = this._optionsSliders.noteSpeed;
    audioGenerator.setVolume(this._optionsSliders.musicVolume);

    // In-game editor mode
    this._editMode       = false;
    this._editTool       = 'add';
    this._editSide       = 'player';
    this._hoverEditNote  = null;

    // Animation state
    this.time = 0;
    this.bgParticles = [];
    this.hitBurstParticles = [];
    this.characterNoteParticles = [];

    // FIX BUG 2: Deferred loop reset flag
    // Prevents race condition where onLoop callback modifies state mid-frame
    this._loopResetPending = false;

    this._initBgParticles();
  }

  _initBgParticles() {
    // Background ambient particles
    for (let i = 0; i < 50; i++) {
      this.bgParticles.push({
        x: Math.random() * this.game.canvas.width,
        y: Math.random() * this.game.canvas.height,
        size: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 0.2,
        speedY: (Math.random() - 0.5) * 0.2,
        opacity: Math.random() * 0.3 + 0.1,
        color: ['#FF2E63', '#00D9FF', '#BD00FF'][Math.floor(Math.random() * 3)]
      });
    }
  }

  init() {
    const playerNotes = this._difficulty === 'easy'
      ? (this.chart.notes ?? []).filter((_, i) => i % 2 === 0)
      : (this.chart.notes ?? []);

    // FIX BUG 2: Store normalized plain objects (not Note instances) for safe looping
    // This ensures loadNotes() always receives consistent raw data on every loop
    this._originalPlayerNotes = playerNotes.map(n => ({
      lane: n.lane,
      time: n.time,
      type: n.type ?? 'normal',
      duration: n.duration ?? 0
    }));
    this._originalOpponentNotes = (this.chart.opponentNotes ?? []).map(n => ({
      lane: n.lane,
      time: n.time,
      type: n.type ?? 'normal',
      duration: n.duration ?? 0
    }));

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

    // Use procedurally generated audio instead of files
    if (this.chart.useGeneratedAudio) {
      // AudioGenerator will be started in init() after user interaction
      this._useGeneratedAudio = true;
      this._audioKey = this.chart.audioKey;
      this._audio = null; // Will be set after audioGenerator.play()
      this.conductor.setAudio(null);
      console.log(`Using procedurally generated audio for: ${this.chart.audioKey}`);
    } else if (this.chart.audioSrc) {
      // Fallback to file-based audio if provided
      this._audio = new Audio(this.chart.audioSrc);
      this._audio.volume = 0.7;
      this.conductor.setAudio(this._audio);
    } else {
      // No audio available
      console.warn('Playing without audio');
      this._audio = null;
      this.conductor.setAudio(null);
    }

    this.input.onHit = (lane) => this._onLaneHit(lane);
    this.touch.onHit = (lane) => this._onLaneHit(lane); // Touch support

    // Pause menu keyboard handler
    this._pauseHandler = (e) => {
      if (this._gameOver) return;

      // ESC key - context-aware pause menu handling
      if (e.key === 'Escape') {
        if (this._paused) {
          // In pause menu - handle based on current state
          if (this._pauseMenuState === 'options') {
            // Go back to main menu from options
            this._pauseMenuState = 'main';
            this._pauseMenuIdx = 0;
            return;
          } else if (this._pauseMenuState === 'confirm') {
            // Cancel confirmation dialog
            this._pauseMenuState = 'main';
            this._pauseMenuIdx = 0;
            return;
          } else {
            // Close pause menu (resume game)
            this._togglePause();
            return;
          }
        } else {
          // Not paused - open pause menu
          this._togglePause();
          return;
        }
      }

      if (e.key === '7') {
        this._toggleEditMode();
        return;
      }

      // FIX: F3 toggles debug overlay
      if (e.key === 'F3') {
        e.preventDefault();
        this._debugMode = !this._debugMode;
        console.log(`🐛 Debug mode: ${this._debugMode ? 'ON' : 'OFF'}`);
        return;
      }

      if (e.key === 'b' || e.key === 'B') {
        this._botMode = !this._botMode;
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

      // Enhanced pause menu navigation with state support
      if (this._paused) {
        if (this._pauseMenuState === 'confirm') {
          // Confirmation dialog navigation (YES/NO)
          if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
            this._pauseMenuIdx = this._pauseMenuIdx === 0 ? 1 : 0;
          } else if (e.key === 'Enter' || e.key === ' ') {
            if (this._pauseMenuIdx === 0) {
              // YES - confirm exit to main menu
              this._confirmMainMenu();
            } else {
              // NO - cancel
              this._pauseMenuState = 'main';
              this._pauseMenuIdx = 0;
            }
          }
        } else {
          // Main menu / Options navigation
          if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
            this._pauseMenuIdx = (this._pauseMenuIdx - 1 + PAUSE_OPTIONS.length) % PAUSE_OPTIONS.length;
          } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
            this._pauseMenuIdx = (this._pauseMenuIdx + 1) % PAUSE_OPTIONS.length;
          } else if (e.key === 'Enter' || e.key === ' ') {
            this._selectPauseOption();
          }
        }
      }
    };
    window.addEventListener('keydown', this._pauseHandler);

    // Pause menu mouse handlers
    this._pauseClickHandler = (e) => {
      if (this._editMode) {
        this._handleEditClick(e);
        return;
      }

      if (!this._paused || this._gameOver) return;
      const { x, y } = this._canvasPos(e);

      // Handle options panel interactions
      if (this._pauseMenuState === 'options') {
        // Check back button click
        if (this._pauseMenuRects.length > 0 && this._hitRect(this._pauseMenuRects[0], x, y)) {
          this._pauseMenuState = 'main';
          this._pauseMenuIdx = 0;
          return;
        }

        // Check bot toggle click
        const botToggle = this._sliderRects.find(s => s.name === 'botToggle');
        if (botToggle && this._hitRect(botToggle.rect, x, y)) {
          this._optionsSliders.botMode = !this._optionsSliders.botMode;
          this._botMode = this._optionsSliders.botMode;

          // Save preference
          saveManager.savePreferences({
            noteSpeed: this._optionsSliders.noteSpeed,
            musicVolume: this._optionsSliders.musicVolume,
            hitSoundVolume: this._optionsSliders.hitSoundVolume,
            botMode: this._optionsSliders.botMode
          });
          return;
        }
        return;
      }

      // Handle main menu button clicks
      for (let i = 0; i < this._pauseMenuRects.length; i++) {
        if (this._hitRect(this._pauseMenuRects[i], x, y)) {
          this._pauseMenuIdx = i;
          this._selectPauseOption();
          return;
        }
      }
    };
    this._pauseMoveHandler = (e) => {
      if (this._editMode) {
        this._handleEditHover(e);
        return;
      }

      if (!this._paused || this._gameOver) return;
      const { x, y } = this._canvasPos(e);

      // Handle slider dragging in options panel
      if (this._pauseMenuState === 'options' && this._activeSlider) {
        this._updateSliderValue(this._activeSlider, x);
        return;
      }

      this._hoverPauseIdx = this._pauseMenuRects.findIndex(r => this._hitRect(r, x, y));
      this.game.canvas.style.cursor = this._hoverPauseIdx !== -1 ? 'pointer' : 'default';
    };

    // Mouse down handler for sliders
    this._pauseMouseDownHandler = (e) => {
      if (!this._paused || this._pauseMenuState !== 'options') return;
      const { x, y } = this._canvasPos(e);

      // Check if clicking on a slider
      for (const slider of this._sliderRects) {
        if (this._hitRect(slider.rect, x, y)) {
          this._activeSlider = slider.name;
          this._updateSliderValue(slider.name, x);
          break;
        }
      }
    };

    // Mouse up handler for sliders
    this._pauseMouseUpHandler = (e) => {
      this._activeSlider = null;
    };
    this.game.canvas.addEventListener('click',     this._pauseClickHandler);
    this.game.canvas.addEventListener('mousemove', this._pauseMoveHandler);
    this.game.canvas.addEventListener('mousedown', this._pauseMouseDownHandler);
    this.game.canvas.addEventListener('mouseup',   this._pauseMouseUpHandler);

    this.conductor.start();

    // Start audio - either generated or file-based
    if (this._useGeneratedAudio) {
      // Set up loop callback BEFORE starting audio
      // FIX BUG 2: Set flag instead of immediate reset to avoid mid-frame race condition
      // The actual reset happens at the start of update() on a clean frame boundary
      audioGenerator.onLoop = () => {
        console.log('Audio looped - reset pending');
        this._loopResetPending = true; // Set flag only, actual reset in update()
      };

      // Use AudioGenerator for procedural music
      audioGenerator.play(this._audioKey, this.speedMultiplier).then(mockAudio => {
        this._audio = mockAudio;
        this.conductor.setAudio(mockAudio);
      }).catch((err) => {
        console.error('Failed to start generated audio:', err);
        // Continue without audio - game still works
      });
    } else if (this._audio) {
      // Use file-based audio
      this._audio.play().catch(() => {
        const resume = () => {
          if (this._audio) this._audio.play();
          window.removeEventListener('keydown', resume);
        };
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

  /**
   * Toggle pause state with animation
   * Handles audio pause/resume and menu animations
   */
  _togglePause() {
    this._paused = !this._paused;

    if (this._paused) {
      // Pause audio and game
      if (this._useGeneratedAudio) {
        audioGenerator.pause();
        this.conductor.pause();
      } else {
        this._audio?.pause();
      }

      // Reset touch states (clear any active touches)
      this.touch.reset();

      // Reset pause menu state
      this._pauseMenuState = 'main';
      this._pauseMenuIdx = 0;
      this._pauseMenuAnimation = 0; // Start animation

    } else {
      // Resume audio and game
      this._hoverPauseIdx = -1;
      this.game.canvas.style.cursor = 'default';

      if (this._useGeneratedAudio) {
        audioGenerator.resume();
        this.conductor.resume();
      } else {
        this._audio?.play().catch(() => {});
      }
    }
  }

  /**
   * Handle pause menu button selection
   * Executes action for selected button
   */
  _selectPauseOption() {
    const opt = PAUSE_OPTIONS[this._pauseMenuIdx];

    switch (opt) {
      case 'Resume':
        // Close menu and resume game
        this._togglePause();
        break;

      case 'Restart':
        // Restart song from beginning
        this._restartSong();
        break;

      case 'Options':
        // Open options sub-panel
        this._pauseMenuState = 'options';
        this._pauseMenuIdx = 0; // Reset selection for options
        break;

      case 'Main Menu':
        // Show confirmation dialog
        this._pauseMenuState = 'confirm';
        this._confirmDialogAnimation = 0;
        break;
    }
  }

  /**
   * Restart the current song from the beginning
   * Resets score, combo, health, and notes
   */
  _restartSong() {
    // Reset game state
    this.score = 0;
    this.misses = 0;
    this.combo = 0;
    this.lead = 0;
    this._hitTimer = 0;
    this._flashTimers = [0, 0, 0, 0];
    this._oppFlashTimers = [0, 0, 0, 0];
    this._gameOver = false;

    // Reset notes
    this.playerNotes.reset();
    this.opponentNotes.reset();

    // Reset conductor
    this.conductor.reset();
    this.conductor.start();

    // Restart audio from beginning
    if (this._useGeneratedAudio) {
      audioGenerator.stop();
      audioGenerator.play(this._audioKey, this.speedMultiplier).catch(() => {});
    } else if (this._audio) {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
    }

    // Close pause menu
    this._paused = false;
    this._pauseMenuState = 'main';
  }

  /**
   * Confirm returning to main menu
   * Called from confirmation dialog
   */
  _confirmMainMenu() {
    // Save score before exiting
    this._saveScore();

    // Stop audio
    if (this._useGeneratedAudio) {
      audioGenerator.onLoop = null;
      audioGenerator.stop();
    } else {
      this._audio?.pause();
    }

    // Clean up event listeners
    window.removeEventListener('keydown', this._pauseHandler);
    this.game.canvas.removeEventListener('click', this._pauseClickHandler);
    this.game.canvas.removeEventListener('mousemove', this._pauseMoveHandler);
    this.game.canvas.removeEventListener('mousedown', this._pauseMouseDownHandler);
    this.game.canvas.removeEventListener('mouseup', this._pauseMouseUpHandler);
    this.game.canvas.style.cursor = 'default';

    // Cleanup input handlers
    this.input.destroy();
    this.touch.destroy();

    // Return to menu
    this.onExit?.();
  }

  /**
   * Update slider value based on mouse position
   * Applies the value to the corresponding game setting
   */
  _updateSliderValue(sliderName, mouseX) {
    const slider = this._sliderRects.find(s => s.name === sliderName);
    if (!slider) return;

    // Calculate value based on mouse position
    const { rect, min, max } = slider;
    const trackStart = rect.x;
    const trackWidth = rect.w;
    const relativeX = Math.max(0, Math.min(trackWidth, mouseX - trackStart));
    const normalizedValue = relativeX / trackWidth;
    const value = min + normalizedValue * (max - min);

    // Update slider value
    this._optionsSliders[sliderName] = value;

    // Apply setting immediately (live preview)
    switch (sliderName) {
      case 'noteSpeed':
        // Update scroll speed for both note managers
        this.playerNotes.scrollSpeed = value;
        this.opponentNotes.scrollSpeed = value;
        break;

      case 'musicVolume':
        // Update audio generator volume
        if (audioGenerator && audioGenerator.audioContext) {
          audioGenerator.setVolume(value);
        }
        break;

      case 'hitSoundVolume':
        // TODO: Update hit sound volume if HitSound.js supports it
        // For now just store the value
        break;
    }

    // Save preferences to localStorage
    saveManager.savePreferences({
      noteSpeed: this._optionsSliders.noteSpeed,
      musicVolume: this._optionsSliders.musicVolume,
      hitSoundVolume: this._optionsSliders.hitSoundVolume,
      botMode: this._optionsSliders.botMode
    });
  }

  _toggleEditMode() {
    this._editMode = !this._editMode;
    if (this._editMode) {
      if (!this._paused) {
        // Pause audio when entering edit mode
        if (this._useGeneratedAudio) {
          audioGenerator.pause();
          this.conductor.pause();
        } else {
          this._audio?.pause();
        }
      }
    } else {
      this._hoverEditNote = null;
      this.game.canvas.style.cursor = 'default';

      if (!this._paused) {
        // Resume audio when exiting edit mode
        if (this._useGeneratedAudio) {
          audioGenerator.resume();
          this.conductor.resume();
        } else if (this._audio) {
          this._audio.play().catch(() => {});
        }
      }
    }
  }

  _handleEditClick(e) {
    const { x, y } = this._canvasPos(e);
    const noteManager = this._editSide === 'player' ? this.playerNotes : this.opponentNotes;
    const baseX = this._editSide === 'player' ? PLR_BASE_X : OPP_BASE_X;

    for (let lane = 0; lane < 4; lane++) {
      const laneX = baseX + lane * LANE_SPACING;
      if (x >= laneX && x <= laneX + LANE_WIDTH) {
        if (this._editTool === 'add') {
          const deltaY = HIT_Y - y;
          const time = this.conductor.songPosition + deltaY / noteManager.scrollSpeed;
          const snappedTime = Math.round(time / 500) * 500;

          const exists = noteManager.notes.some(n =>
            n.lane === lane && !n.hit && !n.missed && Math.abs(n.time - snappedTime) < 100
          );

          if (!exists && snappedTime >= 0) {
            const Note = noteManager.notes[0]?.constructor || class { constructor(l, t) { this.lane = l; this.time = t; this.hit = false; this.missed = false; } };
            noteManager.notes.push(new Note(lane, snappedTime));
            noteManager.notes.sort((a, b) => a.time - b.time);
          }
        } else if (this._editTool === 'delete') {
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
    // Stop audio when opening chart editor
    if (this._useGeneratedAudio) {
      audioGenerator.onLoop = null; // Clear loop callback
      audioGenerator.stop();
    } else {
      this._audio?.pause();
    }

    window.removeEventListener('keydown', this._pauseHandler);
    this.game.canvas.removeEventListener('click',     this._pauseClickHandler);
    this.game.canvas.removeEventListener('mousemove', this._pauseMoveHandler);
    this.game.canvas.removeEventListener('mousedown', this._pauseMouseDownHandler);
    this.game.canvas.removeEventListener('mouseup',   this._pauseMouseUpHandler);
    this.game.canvas.style.cursor = 'default';

    // Cleanup input handlers
    this.input.destroy();
    this.touch.destroy();

    this.onEditChart?.(this.chart);
  }

  _applyDifficulty() {
    const diff = DIFF[this._difficulty] ?? DIFF.normal;
    this.playerNotes.scrollSpeed   = diff.scrollSpeed;
    this.playerNotes.hitWindow     = diff.hitWindow;
    this.opponentNotes.scrollSpeed = diff.scrollSpeed;
  }

  // ─── Game over ─────────────────────────────────────────────────────────────

  _saveScore() {
    // Calculate total notes
    const totalNotes = this._judgementCounts.perfect + this._judgementCounts.good +
                       this._judgementCounts.ok + this._judgementCounts.bad;

    if (totalNotes === 0) return; // Don't save if no notes were played

    // Calculate accuracy
    const accuracy = ((this._judgementCounts.perfect + this._judgementCounts.good + this._judgementCounts.ok) / totalNotes) * 100;

    // Prepare score data
    const scoreData = {
      score: this.score,
      accuracy: Math.round(accuracy * 100) / 100, // Round to 2 decimals
      combo: this.maxCombo,
      perfect: this._judgementCounts.perfect,
      good: this._judgementCounts.good,
      ok: this._judgementCounts.ok,
      bad: this._judgementCounts.bad,
      miss: this.misses
    };

    // Save score (returns true if new high score)
    const isNewRecord = saveManager.saveScore(this.chart.chartKey, this._difficulty, scoreData);

    if (isNewRecord) {
      console.log(`🏆 New high score for ${this.chart.chartKey} (${this._difficulty}): ${this.score}`);
    }

    // Check for newly unlocked achievements
    const newAchievements = achievementChecker.checkAchievements(scoreData);

    if (newAchievements.length > 0) {
      console.log('🎉 Achievements unlocked:', newAchievements.map(a => a.title).join(', '));
      // Show achievement toast notifications
      this.achievementToast.showMultiple(newAchievements);
      this._newlyUnlockedAchievements = newAchievements;
    }

    return isNewRecord;
  }

  _onGameOver() {
    this._gameOver = true;

    // Save final score before stopping
    this._saveScore();

    // Stop audio and clear loop callback
    if (this._useGeneratedAudio) {
      audioGenerator.onLoop = null; // Clear callback
      audioGenerator.stop();
    } else if (this._audio) {
      this._audio.pause();
      this._audio.currentTime = 0;
    }

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
    this.maxCombo        = 0;
    this.lead            = 0;
    this._hitTimer       = 0;
    this._flashTimers    = [0, 0, 0, 0];
    this._oppFlashTimers = [0, 0, 0, 0];

    // Reset judgement counts
    this._judgementCounts = {
      perfect: 0,
      good: 0,
      ok: 0,
      bad: 0,
    };

    if (this._retryHandler) {
      window.removeEventListener('keydown', this._retryHandler);
      this._retryHandler = null;
    }

    this.playerNotes.reset();
    this.opponentNotes.reset();
    this.conductor.reset();
    this.conductor.start();

    // Restart audio from beginning
    if (this._useGeneratedAudio) {
      audioGenerator.stop();
      audioGenerator.play(this._audioKey, this.speedMultiplier).then(mockAudio => {
        this._audio = mockAudio;
      }).catch(() => {});
    } else if (this._audio) {
      this._audio.currentTime = 0;
      this._audio.play().catch(() => {});
    }
  }

  // ─── Hit / miss ────────────────────────────────────────────────────────────

  _spawnHitBurst(lane, x, y, color) {
    // Spawn particle burst on hit
    const particleCount = 12;
    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.3;
      const speed = 2 + Math.random() * 3;
      this.hitBurstParticles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 3 + Math.random() * 3,
        life: 1.0,
        color
      });
    }
  }

  _spawnCharacterNotes(char) {
    // Spawn floating music notes around character
    for (let i = 0; i < 3; i++) {
      this.characterNoteParticles.push({
        x: char.x + (Math.random() - 0.5) * 60,
        y: char.y - 40 + (Math.random() - 0.5) * 40,
        vy: -0.5 - Math.random() * 0.5,
        vx: (Math.random() - 0.5) * 0.3,
        life: 1.5,
        size: 12 + Math.random() * 8,
        rotation: Math.random() * Math.PI * 2
      });
    }
  }

  _onLaneHit(lane) {
    if (this._paused || this._gameOver) return;
    this._flashTimers[lane] = 0.12;

    const note = this.playerNotes.checkHit(lane, this.conductor.songPosition);
    if (note) {
      playHitSound(lane);
      const diff = Math.abs(note.time - this.conductor.songPosition);
      const j = JUDGEMENTS.find(j => diff <= j.window) ?? JUDGEMENTS.at(-1);

      // Particle burst
      const x = this.playerNotes.getLaneX(lane) + LANE_WIDTH / 2;
      const y = HIT_Y;
      this._spawnHitBurst(lane, x, y, LANE_COLORS[lane]);

      if (j.label === 'SICK!') {
        note.splash = true;
        note.splashTimer = 1.0;
      }

      if (note.type !== 'hold') {
        this._registerHit(j.label, j.color, j.points);
      } else {
        this._registerHit(j.label, j.color, j.points * 0.3);
      }
      this.character.sing(lane);
      this._spawnCharacterNotes(this.character);
    } else {
      this._registerMiss();
      this.character.miss(lane);
    }
  }

  _registerHit(label, color, points) {
    this.score += points * (1 + Math.floor(this.combo / 10));
    this.combo++;
    this.maxCombo = Math.max(this.maxCombo, this.combo); // Track max combo
    const gain     = DIFF[this._difficulty]?.hitGain ?? 3;
    this.lead      = Math.min(100, this.lead + gain);
    this._hitLabel = label;
    this._hitColor = color;
    this._hitTimer = 0.6;
    this._hitScale = 1.5; // Start big

    // ── COMBO MILESTONE EFFECTS ──
    this._checkComboMilestone();

    // Track judgement counts
    if (label === 'SICK!') {
      this._judgementCounts.perfect++;
    } else if (label === 'GOOD') {
      this._judgementCounts.good++;
    } else if (label === 'BAD') {
      this._judgementCounts.ok++;
    }

    // Combo pop animation
    if (this.combo !== this._lastCombo) {
      this._comboPopTimer = 0.3;
    }
    this._lastCombo = this.combo;
  }

  _registerMiss() {
    this.misses++;
    this.combo = 0;
    const drain = DIFF[this._difficulty]?.missDrain ?? 5;
    this.lead   = Math.max(-100, this.lead - drain);
    this._hitLabel = 'MISS';
    this._hitColor = '#FF2E63';
    this._hitTimer = 0.6;
    this._hitScale = 1.5;
    this._missShakeTimer = 0.2; // Shake effect

    // Track miss count
    this._judgementCounts.bad++;

    // Reset milestone tracking on combo break
    this._lastMilestone = 0;
  }

  /**
   * Check and trigger combo milestone effects
   * Milestones: 25, 50, 75, 100, 150, 200
   */
  _checkComboMilestone() {
    const milestones = [25, 50, 75, 100, 150, 200];
    const currentMilestone = milestones.find(m =>
      this.combo >= m && this._lastMilestone < m
    );

    if (currentMilestone) {
      this._lastMilestone = currentMilestone;

      // Trigger milestone effect
      this._milestoneEffect = {
        combo: currentMilestone,
        timer: 2.0, // Display for 2 seconds
        particles: []
      };

      // Spawn celebration particles
      const cx = this.game.canvas.width / 2;
      const cy = this.game.canvas.height / 2;

      for (let i = 0; i < 30; i++) {
        const angle = (Math.PI * 2 * i) / 30;
        const speed = 2 + Math.random() * 2;
        this._milestoneEffect.particles.push({
          x: cx,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 8 + Math.random() * 4,
          color: ['#ffdd00', '#ff44aa', '#44ffff', '#44ff88'][Math.floor(Math.random() * 4)],
          life: 1.5,
          rotation: Math.random() * Math.PI * 2,
          rotationSpeed: (Math.random() - 0.5) * 0.2
        });
      }

      // Play a special sound effect (optional - can be added later)
      console.log(`🎊 COMBO MILESTONE: ${currentMilestone}!`);
    }
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    // FIX BUG 2: Handle deferred loop reset at frame boundary (MUST be first!)
    // This prevents race condition where onLoop modifies notes mid-frame
    // Uses loadNotes() to restore ALL original notes (including those culled by shift())
    if (this._loopResetPending) {
      this._loopResetPending = false;

      // FIX: Use loadNotes() NOT reset() - this reloads ALL original notes
      // reset() only clears flags on existing notes, doesn't restore culled ones
      this.playerNotes.loadNotes(this._originalPlayerNotes);
      this.opponentNotes.loadNotes(this._originalOpponentNotes);

      // Reset timing and health
      this.conductor.reset();
      this.lead = 0;

      // Verification logging - note counts should stay constant every loop
      console.log('✅ Safe loop reset:', {
        playerNotes: this._originalPlayerNotes.length,
        opponentNotes: this._originalOpponentNotes.length,
        songPosition: this.conductor.songPosition
      });
      return; // Skip this frame to prevent race conditions
    }

    // FIX: Cap delta time to prevent huge jumps when tab loses focus
    // Even though Game.js caps it, this is a defensive measure
    const originalDt = dt;
    dt = Math.min(dt, 0.05); // Max 50ms per frame

    // FIX: Update debug stats
    this._debugStats.lastDt = originalDt;
    if (originalDt > 0.05) {
      console.warn(`⚠️ Delta time spike: ${(originalDt * 1000).toFixed(1)}ms (capped to 50ms)`);
    }

    this.time += dt;

    // Update achievement toast
    this.achievementToast.update(dt);

    // Update background particles
    this.bgParticles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;
      if (p.x < 0) p.x = this.game.canvas.width;
      if (p.x > this.game.canvas.width) p.x = 0;
      if (p.y < 0) p.y = this.game.canvas.height;
      if (p.y > this.game.canvas.height) p.y = 0;
    });

    // Update hit burst particles
    this.hitBurstParticles = this.hitBurstParticles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity
      p.life -= dt * 2;
      return p.life > 0;
    });

    // Update character note particles
    this.characterNoteParticles = this.characterNoteParticles.filter(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.life -= dt;
      return p.life > 0;
    });

    // Update combo milestone effect
    if (this._milestoneEffect) {
      this._milestoneEffect.timer -= dt;

      // Update particles
      this._milestoneEffect.particles = this._milestoneEffect.particles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05; // Light gravity
        p.rotation += p.rotationSpeed;
        p.life -= dt;
        return p.life > 0;
      });

      // Clear effect when timer expires
      if (this._milestoneEffect.timer <= 0) {
        this._milestoneEffect = null;
      }
    }

    // Update timers
    this._hitScale = Math.max(1, this._hitScale - dt * 2);
    this._comboPopTimer = Math.max(0, this._comboPopTimer - dt);
    this._missShakeTimer = Math.max(0, this._missShakeTimer - dt);

    // Update pause menu animations
    if (this._paused) {
      // Slide-in animation for pause menu (200ms duration)
      this._pauseMenuAnimation = Math.min(1, this._pauseMenuAnimation + dt * 5);

      // Fade-in animation for confirmation dialog (150ms duration)
      if (this._pauseMenuState === 'confirm') {
        this._confirmDialogAnimation = Math.min(1, this._confirmDialogAnimation + dt * 6.67);
      }
    }

    if (this._gameOver || this._paused || this._editMode) return;

    // FIX: Update debug stats before conductor update
    const prevPosition = this.conductor.songPosition;
    this.conductor.update();

    // Track active notes for debug overlay
    this._debugStats.activeNotes = this.playerNotes.notes.filter(n => !n.hit && !n.missed).length;
    this._debugStats.positionJumps = this.conductor._positionJumps;

    // Bot mode
    if (this._botMode) {
      const playerBotHits = this.playerNotes.updateBot(this.conductor.songPosition);
      for (const note of playerBotHits) {
        this._flashTimers[note.lane] = 0.12;
        this.character.sing(note.lane);
        playHitSound(note.lane);

        const x = this.playerNotes.getLaneX(note.lane) + LANE_WIDTH / 2;
        const y = HIT_Y;
        this._spawnHitBurst(note.lane, x, y, LANE_COLORS[note.lane]);

        note.splash = true;
        note.splashTimer = 1.0;
        const judgement = JUDGEMENTS[0];
        this.score += judgement.points;
        this.combo++;
        this.lead = Math.min(100, this.lead + 2);
        this._hitLabel = judgement.label;
        this._hitColor = judgement.color;
        this._hitTimer = 0.5;
        this._hitScale = 1.5;

        if (this.combo !== this._lastCombo) {
          this._comboPopTimer = 0.3;
        }
        this._lastCombo = this.combo;

        this._spawnCharacterNotes(this.character);
      }
    } else {
      this.playerNotes.update(this.conductor.songPosition);

      // Combine keyboard and touch input for hold notes
      const combinedHeld = [
        this.input.held[0] || this.touch.laneStates[0],
        this.input.held[1] || this.touch.laneStates[1],
        this.input.held[2] || this.touch.laneStates[2],
        this.input.held[3] || this.touch.laneStates[3],
      ];
      this.playerNotes.updateHolds(this.conductor.songPosition, combinedHeld);
    }

    // Hold note scoring
    if (this._botMode) {
      for (const note of this.playerNotes.notes) {
        if (note.type === 'hold' && note.holding) {
          const pointsPerSecond = 200;
          this.score += Math.floor(pointsPerSecond * dt);
          this.lead = Math.min(100, this.lead + 0.5 * dt * 60);
        }
      }
    } else {
      for (const note of this.playerNotes.notes) {
        if (note.type === 'hold' && note.holding && !note._lastHoldFrame) {
          const pointsPerSecond = 200;
          this.score += Math.floor(pointsPerSecond * dt);
          this.lead = Math.min(100, this.lead + 0.5 * dt * 60);
        }
        note._lastHoldFrame = note.holding;
      }

      let missesThisFrame = 0;
      const MAX_MISSES_PER_FRAME = 10;

      for (const note of this.playerNotes.notes) {
        if (note.time > this.conductor.songPosition + this.playerNotes.hitWindow) {
          break;
        }

        if (note.missed && !note._missHandled) {
          note._missHandled = true;

          if (missesThisFrame < MAX_MISSES_PER_FRAME) {
            this._registerMiss();
            this.character.miss(note.lane);
            missesThisFrame++;
          }
        }
      }
    }

    // Opponent bot
    const botHits = this.opponentNotes.updateBot(this.conductor.songPosition);
    for (const note of botHits) {
      this._oppFlashTimers[note.lane] = 0.12;
      this.opponent.sing(note.lane);
      this._spawnCharacterNotes(this.opponent);
    }

    // Death check
    if (!this._practiceMode && !this._botMode && this.lead <= -100) {
      this._onGameOver();
      return;
    }

    // FIX BUG 2: Loop detection removed - onLoop callback handles all resets
    // This prevents double-reset conflict between chart end time and audio loop
    // All loop resets now go through the _loopResetPending flag system

    this.opponent.update(dt);
    this.character.update(dt);
    this._flashTimers    = this._flashTimers.map(t    => Math.max(0, t - dt));
    this._oppFlashTimers = this._oppFlashTimers.map(t => Math.max(0, t - dt));
    if (this._hitTimer > 0) this._hitTimer -= dt;

    // Update splash timers
    for (const note of this.playerNotes.notes) {
      if (note.splashTimer > 0) {
        note.splashTimer = Math.max(0, note.splashTimer - dt * 2);
      }
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  render(ctx) {
    const { canvas } = this.game;

    // ── ANIMATED BACKGROUND ──
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#0A0A14');
    gradient.addColorStop(0.5, '#1A0E28');
    gradient.addColorStop(1, '#0F0520');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Stage lighting (soft spotlights from top)
    const spotlightGradient1 = ctx.createRadialGradient(canvas.width * 0.25, 0, 0, canvas.width * 0.25, 0, canvas.height * 0.6);
    spotlightGradient1.addColorStop(0, 'rgba(189,0,255,0.08)');
    spotlightGradient1.addColorStop(1, 'transparent');
    ctx.fillStyle = spotlightGradient1;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const spotlightGradient2 = ctx.createRadialGradient(canvas.width * 0.75, 0, 0, canvas.width * 0.75, 0, canvas.height * 0.6);
    spotlightGradient2.addColorStop(0, 'rgba(255,46,99,0.08)');
    spotlightGradient2.addColorStop(1, 'transparent');
    ctx.fillStyle = spotlightGradient2;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // FIX BUG 1: Wrap background particles in ctx.save/restore
    // This prevents shadowBlur from leaking to subsequent draws
    this.bgParticles.forEach(p => {
      ctx.save(); // ← Save canvas state before setting shadowBlur
      ctx.fillStyle = p.color + Math.floor(p.opacity * 255).toString(16).padStart(2, '0');
      ctx.shadowBlur = 10;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore(); // ← Restore canvas state (resets shadowBlur automatically)
    });

    // ── LANE GUIDES WITH GLOW ──
    // Opponent lanes
    for (let i = 0; i < 4; i++) {
      const laneX = this.opponentNotes.getLaneX(i);

      // Lane background with gradient
      const laneGradient = ctx.createLinearGradient(laneX, 0, laneX + LANE_WIDTH, 0);
      laneGradient.addColorStop(0, 'rgba(0,0,0,0.2)');
      laneGradient.addColorStop(0.5, 'rgba(255,255,255,0.03)');
      laneGradient.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = laneGradient;
      ctx.fillRect(laneX, 0, LANE_WIDTH, canvas.height);

      // Lane shimmer
      const shimmer = Math.sin(this.time * 2 + i) * 0.02 + 0.03;
      ctx.fillStyle = LANE_COLORS[i] + Math.floor(shimmer * 255).toString(16).padStart(2, '0');
      ctx.fillRect(laneX, 0, LANE_WIDTH, canvas.height);

      // FIX BUG 1: Lane separator with neon glow (wrapped in save/restore)
      if (i < 3) {
        ctx.save(); // ← Isolate shadowBlur effect
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.shadowBlur = 8;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(laneX + LANE_WIDTH, 0);
        ctx.lineTo(laneX + LANE_WIDTH, canvas.height);
        ctx.stroke();
        ctx.restore(); // ← Restore (no need to manually reset shadowBlur)
      }
    }

    // Player lanes
    for (let i = 0; i < 4; i++) {
      const laneX = this.playerNotes.getLaneX(i);

      const laneGradient = ctx.createLinearGradient(laneX, 0, laneX + LANE_WIDTH, 0);
      laneGradient.addColorStop(0, 'rgba(0,0,0,0.2)');
      laneGradient.addColorStop(0.5, 'rgba(255,255,255,0.03)');
      laneGradient.addColorStop(1, 'rgba(0,0,0,0.2)');
      ctx.fillStyle = laneGradient;
      ctx.fillRect(laneX, 0, LANE_WIDTH, canvas.height);

      const shimmer = Math.sin(this.time * 2 + i) * 0.02 + 0.03;
      ctx.fillStyle = LANE_COLORS[i] + Math.floor(shimmer * 255).toString(16).padStart(2, '0');
      ctx.fillRect(laneX, 0, LANE_WIDTH, canvas.height);

      // FIX BUG 1: Lane separator with neon glow (wrapped in save/restore)
      if (i < 3) {
        ctx.save(); // ← Isolate shadowBlur effect
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.shadowBlur = 8;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(laneX + LANE_WIDTH, 0);
        ctx.lineTo(laneX + LANE_WIDTH, canvas.height);
        ctx.stroke();
        ctx.restore(); // ← Restore (no need to manually reset shadowBlur)
      }
    }

    // ── CHARACTERS WITH GLOW ──
    ctx.save();

    // Opponent glow when singing
    if (this._oppFlashTimers.some(t => t > 0)) {
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#FF2E63';
    }
    this.opponent.render(ctx);
    ctx.restore();

    ctx.save();
    // Player glow when singing
    if (this._flashTimers.some(t => t > 0)) {
      ctx.shadowBlur = 40;
      ctx.shadowColor = '#00D9FF';
    }
    this.character.render(ctx);
    ctx.restore();

    // Character note particles
    this.characterNoteParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life / 1.5;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);
      ctx.fillStyle = '#FF2E63';
      ctx.font = `${p.size}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♪', 0, 0);
      ctx.restore();
    });

    // ── NOTES WITH GLOW ──
    this.opponentNotes.render(ctx, this.conductor.songPosition);
    this.playerNotes.render(ctx, this.conductor.songPosition);

    // Hit burst particles
    this.hitBurstParticles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    // ── HIT ZONE RECEPTORS ──
    // Opponent receptors
    for (let i = 0; i < 4; i++) {
      const x = this.opponentNotes.getLaneX(i);
      const glow = this._oppFlashTimers[i] > 0;

      ctx.save();
      if (glow) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.fillStyle = LANE_COLORS[i] + 'CC';
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.fillStyle = LANE_COLORS[i] + '33';
      }

      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 10);
      ctx.fill();

      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth = glow ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();

      // Ring ripple on hit
      if (glow) {
        const rippleSize = (0.12 - this._oppFlashTimers[i]) * 200;
        ctx.save();
        ctx.globalAlpha = this._oppFlashTimers[i] / 0.12;
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + LANE_WIDTH / 2, HIT_Y, rippleSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }

    // Player receptors
    for (let i = 0; i < 4; i++) {
      const x = this.playerNotes.getLaneX(i);
      const glow = this._flashTimers[i] > 0;

      ctx.save();
      if (glow) {
        ctx.shadowBlur = 30;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.fillStyle = LANE_COLORS[i] + 'CC';
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = LANE_COLORS[i];
        ctx.fillStyle = LANE_COLORS[i] + '33';
      }

      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 10);
      ctx.fill();

      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth = glow ? 3 : 1.5;
      ctx.stroke();
      ctx.restore();

      // Ring ripple
      if (glow) {
        const rippleSize = (0.12 - this._flashTimers[i]) * 200;
        ctx.save();
        ctx.globalAlpha = this._flashTimers[i] / 0.12;
        ctx.strokeStyle = LANE_COLORS[i];
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(x + LANE_WIDTH / 2, HIT_Y, rippleSize, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }

      // Key labels
      ctx.fillStyle = glow ? '#fff' : 'rgba(255,255,255,0.4)';
      ctx.font = glow ? 'bold 15px monospace' : '14px monospace';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 0;
      ctx.fillText(LANE_KEYS[i], x + LANE_WIDTH / 2, HIT_Y + 44);
    }

    // Set touch handler receptor rects for mobile touch detection
    const receptorRects = [];
    for (let i = 0; i < 4; i++) {
      const x = this.playerNotes.getLaneX(i);
      receptorRects.push({
        x: x,
        y: HIT_Y - 15,
        w: LANE_WIDTH,
        h: 30,
        lane: i
      });
    }
    this.touch.setReceptorRects(receptorRects);

    // ── HEALTH BAR (SLEEK PILL-SHAPED) ──
    this._renderHealthBar(ctx, canvas);

    // ── SCORE PANEL (GLASSMORPHISM) ──
    this._renderScorePanel(ctx, canvas);

    // Mode badge
    const modeLabel = this._practiceMode ? 'PRACTICE' : this._difficulty.toUpperCase();
    const modeColor = this._practiceMode ? '#00D9FF'
      : this._difficulty === 'easy'   ? '#00FF88'
      : this._difficulty === 'hard'   ? '#FF2E63'
      : '#FFD700';

    ctx.save();
    ctx.shadowBlur = 15;
    ctx.shadowColor = modeColor;
    ctx.fillStyle = modeColor;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(modeLabel, 10, 60);
    ctx.restore();

    // ── HIT RATING POPUP ──
    if (this._hitTimer > 0) {
      this._renderHitRating(ctx);
    }

    // Song position
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.font = '13px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(`${(this.conductor.songPosition / 1000).toFixed(1)}s`, canvas.width - 10, canvas.height - 10);

    // Edit hint
    if (!this._editMode && !this._paused && !this._gameOver) {
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('Press 7 to edit chart', 10, canvas.height - 10);
    }

    // ── COMBO MILESTONE EFFECT ──
    if (this._milestoneEffect) {
      this._renderMilestoneEffect(ctx, canvas);
    }

    // Overlays
    if (this._gameOver) this._renderGameOver(ctx, canvas);
    if (this._paused)   this._renderPauseMenu(ctx, canvas);
    if (this._editMode) this._renderEditOverlay(ctx, canvas);

    // Achievement toast (always on top)
    this.achievementToast.render(ctx, canvas);

    // FIX: Debug overlay (F3 to toggle)
    if (this._debugMode) {
      this._renderDebugOverlay(ctx, canvas);
    }
  }

  // ─── Custom Renderers ──────────────────────────────────────────────────────

  _renderHealthBar(ctx, canvas) {
    const barW = 420;
    const barH = 28;
    const barX = (canvas.width - barW) / 2;
    const barY = 14;
    const mid = barX + barW / 2;

    // Pulsing effect when health is low
    const lowHealthPulse = this.lead < -70 ? Math.sin(this.time * 8) * 0.3 + 0.7 : 1;

    ctx.save();

    // Pill-shaped background
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.fill();

    // Health fill
    const normalized = (this.lead + 100) / 200;
    const markerX = barX + normalized * barW;

    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.clip();

    if (this.lead >= 0) {
      // Player winning (pink/purple glow)
      const gradient = ctx.createLinearGradient(mid, 0, markerX, 0);
      gradient.addColorStop(0, '#BD00FF');
      gradient.addColorStop(1, '#FF2E63');
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 20;
      ctx.shadowColor = '#FF2E63';
      ctx.fillRect(mid, barY, markerX - mid, barH);
    } else {
      // Opponent winning (red glow)
      const gradient = ctx.createLinearGradient(markerX, 0, mid, 0);
      gradient.addColorStop(0, '#FF2E63');
      gradient.addColorStop(1, '#8B0000');
      ctx.fillStyle = gradient;
      ctx.shadowBlur = 20 * lowHealthPulse;
      ctx.shadowColor = '#FF2E63';
      ctx.fillRect(markerX, barY, mid - markerX, barH);
    }

    ctx.restore();

    // Border
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barW, barH, barH / 2);
    ctx.stroke();

    // Center divider
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(mid, barY);
    ctx.lineTo(mid, barY + barH);
    ctx.stroke();

    // FIX BUG 1: Marker dot with glow (wrapped in save/restore)
    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#fff';
    ctx.beginPath();
    ctx.arc(markerX, barY + barH / 2, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Labels
    ctx.font = '11px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.textAlign = 'left';
    ctx.fillText('OPPONENT', barX + 8, barY + barH + 14);
    ctx.textAlign = 'right';
    ctx.fillText('YOU', barX + barW - 8, barY + barH + 14);
  }

  _renderScorePanel(ctx, canvas) {
    const panelW = 200;
    const panelH = 150;
    const panelX = canvas.width - panelW - 10;
    const panelY = 50;

    // Glassmorphism background
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 15);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // Score with neon glow
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#FF2E63';
    ctx.fillStyle = '#FF2E63';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('SCORE', panelX + 15, panelY + 30);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px monospace';
    ctx.fillText(this.score.toString(), panelX + 15, panelY + 58);
    ctx.restore();

    // Combo with pop animation
    const comboScale = this._comboPopTimer > 0 ? 1 + this._comboPopTimer * 0.5 : 1;
    ctx.save();
    ctx.translate(panelX + 15, panelY + 90);
    ctx.scale(comboScale, comboScale);
    ctx.shadowBlur = 15;
    ctx.shadowColor = '#00D9FF';
    ctx.fillStyle = '#00D9FF';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('COMBO', 0, 0);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px monospace';
    ctx.fillText(this.combo.toString(), 0, 24);
    ctx.restore();

    // Misses with shake
    const shakeX = this._missShakeTimer > 0 ? (Math.random() - 0.5) * 4 : 0;
    ctx.save();
    ctx.translate(shakeX, 0);
    ctx.fillStyle = '#FF2E63';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('MISS', panelX + 15, panelY + panelH - 20);

    ctx.font = 'bold 20px monospace';
    ctx.fillText(this.misses.toString(), panelX + 70, panelY + panelH - 20);
    ctx.restore();

    // Bot indicator
    if (this._botMode) {
      ctx.save();
      ctx.shadowBlur = 15;
      ctx.shadowColor = '#BD00FF';
      ctx.fillStyle = '#BD00FF';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText('🤖 BOT', canvas.width - 15, panelY + panelH + 30);
      ctx.restore();
    }
  }

  _renderHitRating(ctx) {
    const alpha = this._hitTimer / 0.6;
    const x = PLR_BASE_X + LANE_SPACING * 1.5 + LANE_WIDTH / 2;
    const y = HIT_Y - 80;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(this._hitScale, this._hitScale);

    // Starburst background
    if (this._hitLabel === 'SICK!') {
      const burstSize = 60 * this._hitScale;
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI * 2 * i) / 8;
        ctx.strokeStyle = this._hitColor;
        ctx.lineWidth = 3;
        ctx.globalAlpha = alpha * 0.3;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * burstSize, Math.sin(angle) * burstSize);
        ctx.stroke();
      }
      ctx.globalAlpha = alpha;
    }

    // Rainbow gradient for SICK!
    if (this._hitLabel === 'SICK!') {
      const gradient = ctx.createLinearGradient(-50, 0, 50, 0);
      gradient.addColorStop(0, '#FF2E63');
      gradient.addColorStop(0.33, '#00D9FF');
      gradient.addColorStop(0.66, '#00FF88');
      gradient.addColorStop(1, '#FFD700');
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = this._hitColor;
    }

    ctx.shadowBlur = 30;
    ctx.shadowColor = this._hitColor;
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(this._hitLabel, 0, 0);

    ctx.restore();
  }

  // ─── Edit Mode Overlay ─────────────────────────────────────────────────────

  _renderEditOverlay(ctx, canvas) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#C24B99';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('EDIT MODE', canvas.width / 2, 60);

    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '15px monospace';
    ctx.fillText('Click on lanes to add/delete notes  •  1 = Add  •  2 = Delete  •  TAB = Switch sides', canvas.width / 2, 95);
    ctx.font = '13px monospace';
    ctx.fillText('Ctrl+S to save  •  7 to exit edit mode', canvas.width / 2, 115);

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

    const baseX = this._editSide === 'player' ? PLR_BASE_X : OPP_BASE_X;
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = this._editSide === 'player' ? 'rgba(18,250,5,0.5)' : 'rgba(249,57,63,0.5)';
      ctx.lineWidth = 3;
      ctx.strokeRect(baseX + i * LANE_SPACING, 150, LANE_WIDTH, canvas.height - 150);
    }

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

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Player Notes: ${this.playerNotes.notes.filter(n => !n.hit && !n.missed).length}`, canvas.width - 10, canvas.height - 60);
    ctx.fillText(`Opponent Notes: ${this.opponentNotes.notes.filter(n => !n.hit && !n.missed).length}`, canvas.width - 10, canvas.height - 40);
    ctx.fillText(`Time: ${(this.conductor.songPosition / 1000).toFixed(1)}s`, canvas.width - 10, canvas.height - 20);
  }

  _renderGameOver(ctx, canvas) {
    ctx.fillStyle = 'rgba(0,0,0,0.78)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.shadowBlur = 50;
    ctx.shadowColor = '#FF2E63';
    ctx.fillStyle = '#FF2E63';
    ctx.font = 'bold 80px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('YOU DIED', canvas.width / 2, canvas.height / 2 - 40);
    ctx.restore();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Press ENTER or SPACE to retry', canvas.width / 2, canvas.height / 2 + 30);
  }

  /**
   * Render the enhanced pause menu with animations
   * Includes main menu, options panel, and confirmation dialog
   */
  _renderPauseMenu(ctx, canvas) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    // ── BACKGROUND OVERLAY WITH BLUR EFFECT ──
    ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Animated scanline effect
    const scanlineY = (this.time * 100) % canvas.height;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
    ctx.fillRect(0, scanlineY, canvas.width, 2);

    // ── ENTRY ANIMATION (slide down + fade in) ──
    const animProgress = this._pauseMenuAnimation;
    const slideOffset = (1 - animProgress) * -100; // Slide from top
    const fadeAlpha = animProgress;

    ctx.save();
    ctx.globalAlpha = fadeAlpha;
    ctx.translate(0, slideOffset);

    // ── MAIN PAUSE CARD ──
    const cardW = 380;
    const cardH = this._pauseMenuState === 'main' ? 480 : 550;
    const cardX = cx - cardW / 2;
    const cardY = cy - cardH / 2;

    // FIX BUG 1: Card shadow with pink/purple glow (wrapped in save/restore)
    ctx.save();
    ctx.shadowBlur = 30;
    ctx.shadowColor = '#ff44aa';
    ctx.fillStyle = 'rgba(10, 10, 30, 0.95)';
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardW, cardH, 16);
    ctx.fill();

    // Card border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();

    // ── HEADER: "PAUSED" TITLE ──
    ctx.save();
    ctx.shadowBlur = 20;
    ctx.shadowColor = '#ff44aa';
    ctx.fillStyle = '#ff44aa';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', cx, cardY + 55);
    ctx.restore();

    // Divider line below title
    const dividerY = cardY + 75;
    const dividerGradient = ctx.createLinearGradient(cardX + 40, dividerY, cardX + cardW - 40, dividerY);
    dividerGradient.addColorStop(0, 'transparent');
    dividerGradient.addColorStop(0.5, '#ff44aa');
    dividerGradient.addColorStop(1, 'transparent');
    ctx.strokeStyle = dividerGradient;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cardX + 40, dividerY);
    ctx.lineTo(cardX + cardW - 40, dividerY);
    ctx.stroke();

    // ── CURRENT SONG INFO ──
    const infoY = dividerY + 25;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';

    const songName = this.chart?.title || 'Unknown';
    const diffLabel = this._difficulty[0].toUpperCase() + this._difficulty.slice(1);
    ctx.fillText(`${songName} | ${diffLabel}`, cx, infoY);

    ctx.fillText(`Score: ${this.score.toLocaleString()}`, cx, infoY + 20);

    // ── RENDER BASED ON STATE ──
    if (this._pauseMenuState === 'main') {
      this._renderMainPauseButtons(ctx, cx, cardX, cardY, cardW, cardH);
    } else if (this._pauseMenuState === 'options') {
      this._renderOptionsPanel(ctx, cx, cardX, cardY, cardW, cardH);
    } else if (this._pauseMenuState === 'confirm') {
      this._renderConfirmDialog(ctx, cx, cy);
    }

    ctx.restore(); // Restore animation transform
  }

  /**
   * Render main pause menu buttons
   * (Resume, Restart, Options, Main Menu)
   */
  _renderMainPauseButtons(ctx, cx, cardX, cardY, cardW, cardH) {
    const buttonStartY = cardY + 140;
    const buttonH = 52;
    const buttonGap = 8;
    const buttonW = cardW - 40;
    const buttonX = cardX + 20;

    this._pauseMenuRects = [];

    // Icon mapping
    const icons = {
      'Resume': '▶',
      'Restart': '🔄',
      'Options': '⚙️',
      'Main Menu': '🏠'
    };

    PAUSE_OPTIONS.forEach((opt, i) => {
      const y = buttonStartY + i * (buttonH + buttonGap);
      const selected = i === this._pauseMenuIdx;
      const hovered = i === this._hoverPauseIdx && !selected;
      const accentColor = PAUSE_BUTTON_COLORS[opt];

      this._pauseMenuRects.push({ x: buttonX, y, w: buttonW, h: buttonH });

      ctx.save();

      // Button background
      if (selected) {
        ctx.fillStyle = 'rgba(255, 68, 170, 0.2)';
        ctx.shadowBlur = 15;
        ctx.shadowColor = '#ff44aa';
      } else if (hovered) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
      }

      ctx.beginPath();
      ctx.roundRect(buttonX, y, buttonW, buttonH, 8);
      ctx.fill();

      // Button border
      if (selected) {
        ctx.strokeStyle = '#ff44aa';
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#ff44aa';
        ctx.lineWidth = 2;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Left accent border stripe
      ctx.fillStyle = accentColor;
      ctx.fillRect(buttonX, y, 4, buttonH);

      // Icon
      ctx.font = '24px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillStyle = selected ? '#fff' : 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(icons[opt], buttonX + 20, y + buttonH / 2 + 8);

      // Text
      ctx.font = selected ? 'bold 20px sans-serif' : '18px sans-serif';
      ctx.fillStyle = selected ? '#fff' : 'rgba(255, 255, 255, 0.8)';
      ctx.fillText(opt.toUpperCase(), buttonX + 55, y + buttonH / 2 + 7);

      ctx.restore();
    });

    // Keyboard hints
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('↑ ↓  Navigate  •  ENTER  Select  •  ESC  Close', cx, cardY + cardH - 15);
  }

  /**
   * Render options sub-panel with interactive sliders
   * Shows sliders for note speed, volumes, and bot toggle
   */
  _renderOptionsPanel(ctx, cx, cardX, cardY, cardW, cardH) {
    this._sliderRects = []; // Reset slider hitboxes

    // Options header
    ctx.fillStyle = '#44ffff';
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('OPTIONS', cx, cardY + 130);

    const startY = cardY + 170;
    const sliderSpacing = 75;
    const sliderW = cardW - 80;
    const sliderX = cardX + 40;
    const trackH = 6;
    const thumbRadius = 10;

    // ── SLIDER 1: NOTE SPEED ──
    this._renderSlider(ctx, {
      x: sliderX,
      y: startY,
      w: sliderW,
      label: 'Note Speed',
      value: this._optionsSliders.noteSpeed,
      min: 0.3,
      max: 2.0,
      name: 'noteSpeed',
      color: '#ffdd00',
      unit: 'x',
      trackH,
      thumbRadius
    });

    // ── SLIDER 2: MUSIC VOLUME ──
    this._renderSlider(ctx, {
      x: sliderX,
      y: startY + sliderSpacing,
      w: sliderW,
      label: 'Music Volume',
      value: this._optionsSliders.musicVolume,
      min: 0,
      max: 1.0,
      name: 'musicVolume',
      color: '#ff44aa',
      unit: '%',
      trackH,
      thumbRadius
    });

    // ── SLIDER 3: HIT SOUND VOLUME ──
    this._renderSlider(ctx, {
      x: sliderX,
      y: startY + sliderSpacing * 2,
      w: sliderW,
      label: 'Hit Sound',
      value: this._optionsSliders.hitSoundVolume,
      min: 0,
      max: 1.0,
      name: 'hitSoundVolume',
      color: '#44ffff',
      unit: '%',
      trackH,
      thumbRadius
    });

    // ── BOT MODE TOGGLE ──
    const toggleY = startY + sliderSpacing * 3;
    this._renderBotToggle(ctx, {
      x: sliderX,
      y: toggleY,
      w: sliderW,
      label: 'Bot Mode'
    });

    // ── BACK BUTTON ──
    const backBtnW = 160;
    const backBtnH = 45;
    const backBtnX = cx - backBtnW / 2;
    const backBtnY = cardY + cardH - 65;

    ctx.fillStyle = 'rgba(68, 255, 136, 0.2)';
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(backBtnX, backBtnY, backBtnW, backBtnH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#44ff88';
    ctx.font = 'bold 18px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('← BACK', cx, backBtnY + backBtnH / 2 + 7);

    // Store back button rect for click detection
    this._pauseMenuRects = [{ x: backBtnX, y: backBtnY, w: backBtnW, h: backBtnH }];

    // Hint
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.font = '12px monospace';
    ctx.fillText('Click and drag sliders to adjust  •  ESC to go back', cx, cardY + cardH - 15);
  }

  /**
   * Render a slider control
   * Includes label, track, fill, thumb, and value display
   */
  _renderSlider(ctx, config) {
    const { x, y, w, label, value, min, max, name, color, unit, trackH, thumbRadius } = config;

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y - 8);

    // Value display
    const displayValue = unit === '%' ? Math.round(value * 100) : value.toFixed(2);
    const valueText = displayValue + unit;
    ctx.fillStyle = color;
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(valueText, x + w, y - 8);

    // Track background
    const trackY = y + 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.beginPath();
    ctx.roundRect(x, trackY, w, trackH, trackH / 2);
    ctx.fill();

    // FIX BUG 1: Track fill (colored portion) with glow (wrapped)
    const normalizedValue = (value - min) / (max - min);
    const fillW = w * normalizedValue;

    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowBlur = 10;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.roundRect(x, trackY, fillW, trackH, trackH / 2);
    ctx.fill();
    ctx.restore();

    // FIX BUG 1: Thumb (draggable circle) with glow (wrapped)
    const thumbX = x + fillW;
    const thumbY = trackY + trackH / 2;

    ctx.save();
    ctx.fillStyle = '#fff';
    ctx.shadowBlur = 15;
    ctx.shadowColor = color;
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, thumbRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Store slider hitbox for interaction
    this._sliderRects.push({
      name,
      rect: { x, y: trackY - thumbRadius, w, h: trackH + thumbRadius * 2 },
      min,
      max
    });
  }

  /**
   * Render bot mode toggle switch
   * ON/OFF switch with green/gray states
   */
  _renderBotToggle(ctx, config) {
    const { x, y, w, label } = config;
    const isOn = this._optionsSliders.botMode;

    // Label
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(label, x, y);

    // Toggle switch
    const switchW = 60;
    const switchH = 28;
    const switchX = x + w - switchW;
    const switchY = y - 22;
    const circleRadius = 11;

    // Switch background
    ctx.fillStyle = isOn ? 'rgba(68, 255, 136, 0.3)' : 'rgba(255, 255, 255, 0.1)';
    ctx.strokeStyle = isOn ? '#44ff88' : 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(switchX, switchY, switchW, switchH, switchH / 2);
    ctx.fill();
    ctx.stroke();

    // FIX BUG 1: Toggle circle with glow when ON (wrapped)
    const circleX = isOn ? switchX + switchW - circleRadius - 3 : switchX + circleRadius + 3;
    const circleY = switchY + switchH / 2;

    ctx.save();
    ctx.fillStyle = isOn ? '#44ff88' : 'rgba(255, 255, 255, 0.6)';
    if (isOn) {
      ctx.shadowBlur = 12;
      ctx.shadowColor = '#44ff88';
    }
    ctx.beginPath();
    ctx.arc(circleX, circleY, circleRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ON/OFF text
    ctx.fillStyle = isOn ? '#44ff88' : 'rgba(255, 255, 255, 0.5)';
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(isOn ? 'ON' : 'OFF', x + w - switchW - 10, y);

    // Store toggle hitbox for click detection
    this._sliderRects.push({
      name: 'botToggle',
      rect: { x: switchX - 20, y: switchY, w: switchW + 40, h: switchH },
      min: 0,
      max: 1
    });
  }

  /**
   * Render confirmation dialog for exiting to main menu
   * "Are you sure? Progress will be lost."
   */
  _renderConfirmDialog(ctx, cx, cy) {
    // Darken background further
    ctx.globalAlpha = this._confirmDialogAnimation * 0.3;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(0, 0, this.game.canvas.width, this.game.canvas.height);
    ctx.globalAlpha = this._confirmDialogAnimation;

    // Confirmation card
    const confirmW = 340;
    const confirmH = 180;
    const confirmX = cx - confirmW / 2;
    const confirmY = cy - confirmH / 2;

    // FIX BUG 1: Card background with red glow (wrapped)
    ctx.save();
    ctx.fillStyle = 'rgba(20, 10, 30, 0.98)';
    ctx.shadowBlur = 25;
    ctx.shadowColor = '#ff4444';
    ctx.beginPath();
    ctx.roundRect(confirmX, confirmY, confirmW, confirmH, 12);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 68, 68, 0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // Title
    ctx.fillStyle = '#ff4444';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Return to Menu?', cx, confirmY + 45);

    // Warning text
    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    ctx.font = '14px sans-serif';
    ctx.fillText('Your current progress will be lost.', cx, confirmY + 75);

    // YES / NO buttons
    const btnW = 130;
    const btnH = 42;
    const btnY = confirmY + 110;
    const btnGap = 20;
    const yesX = confirmX + (confirmW / 2) - btnW - (btnGap / 2);
    const noX = confirmX + (confirmW / 2) + (btnGap / 2);

    // YES button (red)
    ctx.fillStyle = this._pauseMenuIdx === 0 ? 'rgba(255, 68, 68, 0.4)' : 'rgba(255, 68, 68, 0.2)';
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = this._pauseMenuIdx === 0 ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(yesX, btnY, btnW, btnH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = this._pauseMenuIdx === 0 ? 'bold 18px sans-serif' : '16px sans-serif';
    ctx.fillText('YES', yesX + btnW / 2, btnY + btnH / 2 + 6);

    // NO button (green)
    ctx.fillStyle = this._pauseMenuIdx === 1 ? 'rgba(68, 255, 136, 0.4)' : 'rgba(68, 255, 136, 0.2)';
    ctx.strokeStyle = '#44ff88';
    ctx.lineWidth = this._pauseMenuIdx === 1 ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(noX, btnY, btnW, btnH, 8);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = this._pauseMenuIdx === 1 ? 'bold 18px sans-serif' : '16px sans-serif';
    ctx.fillText('NO', noX + btnW / 2, btnY + btnH / 2 + 6);

    ctx.globalAlpha = 1;
  }

  /**
   * Render combo milestone celebration effect
   * Shows big text, particles, and glow when hitting milestone combos
   */
  _renderMilestoneEffect(ctx, canvas) {
    const cx = canvas.width / 2;
    const cy = canvas.height / 2 - 50;

    // Fade in/out based on timer
    const fadeInDuration = 0.3;
    const fadeOutStart = 1.5;
    let alpha = 1;

    if (this._milestoneEffect.timer > (2.0 - fadeInDuration)) {
      // Fade in
      alpha = (2.0 - this._milestoneEffect.timer) / fadeInDuration;
    } else if (this._milestoneEffect.timer < fadeOutStart) {
      // Fade out
      alpha = this._milestoneEffect.timer / fadeOutStart;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    // ── PARTICLES ──
    this._milestoneEffect.particles.forEach(p => {
      ctx.save();
      ctx.globalAlpha = alpha * (p.life / 1.5);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation);

      // Star shape
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;

      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const angle = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        const radius = i % 2 === 0 ? p.size : p.size / 2;
        const px = Math.cos(angle) * radius;
        const py = Math.sin(angle) * radius;
        if (i === 0) {
          ctx.moveTo(px, py);
        } else {
          ctx.lineTo(px, py);
        }
      }
      ctx.closePath();
      ctx.fill();

      ctx.restore();
    });

    // ── MILESTONE TEXT ──
    const scale = 1 + Math.sin(this.time * 3) * 0.1; // Pulsing effect
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    // Glow background
    ctx.shadowBlur = 40;
    ctx.shadowColor = '#ffdd00';

    // "COMBO MILESTONE!" text
    ctx.font = 'bold 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffdd00';
    ctx.fillText('🎉 COMBO MILESTONE! 🎉', 0, -50);

    // Combo number
    ctx.shadowBlur = 50;
    ctx.font = 'bold 72px sans-serif';
    const gradient = ctx.createLinearGradient(0, -36, 0, 36);
    gradient.addColorStop(0, '#ffdd00');
    gradient.addColorStop(0.5, '#ff44aa');
    gradient.addColorStop(1, '#44ffff');
    ctx.fillStyle = gradient;
    ctx.fillText(this._milestoneEffect.combo.toString(), 0, 20);

    // "COMBO" label
    ctx.shadowBlur = 20;
    ctx.font = 'bold 32px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('COMBO', 0, 65);

    ctx.restore();
    ctx.restore();
  }

  /**
   * FIX: Render debug overlay (toggle with F3)
   * Shows critical stats to diagnose note disappearing bug
   */
  _renderDebugOverlay(ctx, canvas) {
    const x = 10;
    const y = 100;
    const lineHeight = 18;

    ctx.save();

    // Semi-transparent background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(x - 5, y - 5, 350, 180);

    // Border
    ctx.strokeStyle = '#ffdd00';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 5, y - 5, 350, 180);

    // Title
    ctx.fillStyle = '#ffdd00';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('🐛 DEBUG MODE (F3 to toggle)', x, y);

    // Stats
    ctx.fillStyle = '#ffffff';
    ctx.font = '12px monospace';
    let line = 1;

    const stats = [
      `Active Notes: ${this._debugStats.activeNotes} / ${this.playerNotes.notes.length}`,
      `Song Position: ${(this.conductor.songPosition / 1000).toFixed(2)}s`,
      `Delta Time: ${(this._debugStats.lastDt * 1000).toFixed(1)}ms ${this._debugStats.lastDt > 0.05 ? '⚠️ SPIKE' : ''}`,
      `Position Jumps: ${this._debugStats.positionJumps}`,
      `Combo: ${this.combo} (Max: ${this.maxCombo})`,
      `Score: ${this.score}`,
      `Misses: ${this.misses}`,
      `Speed: ${this.speedMultiplier}x`,
      `Bot Mode: ${this._botMode ? 'ON' : 'OFF'}`,
    ];

    stats.forEach(stat => {
      ctx.fillText(stat, x, y + lineHeight * (line + 0.5));
      line++;
    });

    // Warning indicators
    if (this._debugStats.positionJumps > 0) {
      ctx.fillStyle = '#ff4444';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('⚠️ Position jumps detected - check console', x, y + lineHeight * (line + 1));
    }

    ctx.restore();
  }
}
