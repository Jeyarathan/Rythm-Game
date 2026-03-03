import { LANE_COLORS, LANE_KEYS } from '../gameplay/Note.js';
import { Conductor } from '../gameplay/Conductor.js';

const LANE_SPACING = 90;
const LANE_WIDTH = 80;
const HIT_Y = 550;
const PLR_BASE_X = 490;
const OPP_BASE_X = 30;

const TOOLS = [
  { id: 'add', label: 'Add Note', color: '#12FA05', icon: '+' },
  { id: 'delete', label: 'Delete Note', color: '#F9393F', icon: '✕' },
];

export class ChartEditorState {
  constructor(game, onExit, initialChart = null) {
    this.game = game;
    this.onExit = onExit;

    this.bpm = initialChart?.bpm || 120;
    this.audioSrc = initialChart?.audioSrc || null;
    this.chartTitle = initialChart?.title || 'Custom Chart';
    this.audio = null;
    this.conductor = new Conductor(this.bpm);

    this.notes = initialChart?.notes ? [...initialChart.notes] : [];
    this.opponentNotes = initialChart?.opponentNotes ? [...initialChart.opponentNotes] : [];

    this.currentTool = 'add';
    this.editingOpponent = false; // false = player, true = opponent
    this.gridSnap = 500; // ms per grid line
    this.scrollSpeed = 0.45;

    this._toolRects = [];
    this._laneRects = [];
    this._hoverTool = -1;
    this._hoverNote = null;

    // Multi-note editing
    this.selectedNotes = new Set();
    this._isDragging = false;
    this._dragLane = -1;
    this._lastDragTime = -1;

    this._onKey = this._onKey.bind(this);
    this._onClick = this._onClick.bind(this);
    this._onMouseMove = this._onMouseMove.bind(this);
    this._onMouseDown = this._onMouseDown.bind(this);
    this._onMouseUp = this._onMouseUp.bind(this);
  }

  init() {
    window.addEventListener('keydown', this._onKey);
    this.game.canvas.addEventListener('click', this._onClick);
    this.game.canvas.addEventListener('mousemove', this._onMouseMove);
    this.game.canvas.addEventListener('mousedown', this._onMouseDown);
    this.game.canvas.addEventListener('mouseup', this._onMouseUp);

    // Load audio if available
    if (this.audioSrc) {
      this.audio = new Audio(this.audioSrc);
      this.audio.volume = 0.7;
      this.conductor.setAudio(this.audio);
    }
  }

  cleanup() {
    window.removeEventListener('keydown', this._onKey);
    this.game.canvas.removeEventListener('click', this._onClick);
    this.game.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.game.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.game.canvas.removeEventListener('mouseup', this._onMouseUp);
    this.game.canvas.style.cursor = 'default';
    if (this.audio) {
      this.audio.pause();
      this.audio = null;
    }
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  _onKey(e) {
    switch (e.key) {
      case 'Escape':
        this.cleanup();
        this.onExit?.();
        break;
      case ' ':
        e.preventDefault();
        this._togglePlayback();
        break;
      case 's':
      case 'S':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this._saveChart();
        }
        break;
      case 'l':
      case 'L':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this._loadChart();
        }
        break;
      case '1': this.currentTool = 'add'; break;
      case '2': this.currentTool = 'delete'; break;
      case 'Tab':
        e.preventDefault();
        this.editingOpponent = !this.editingOpponent;
        break;
      case 'a':
      case 'A':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          this._selectAll();
        }
        break;
      case 'Delete':
      case 'Backspace':
        this._deleteSelected();
        break;
      case 'c':
      case 'C':
        if (e.ctrlKey || e.metaKey) return; // Don't clear on Ctrl+C
        if (this.editingOpponent) {
          this.opponentNotes = [];
        } else {
          this.notes = [];
        }
        this.selectedNotes.clear();
        break;
    }
  }

  _onClick(e) {
    const { x, y } = this._canvasPos(e);

    // Check tool buttons
    for (let i = 0; i < this._toolRects.length; i++) {
      if (this._hit(this._toolRects[i], x, y)) {
        this.currentTool = TOOLS[i].id;
        return;
      }
    }

    // Check if clicking on a note with shift for multi-select
    if (e.shiftKey && this._hoverNote) {
      if (this.selectedNotes.has(this._hoverNote)) {
        this.selectedNotes.delete(this._hoverNote);
      } else {
        this.selectedNotes.add(this._hoverNote);
      }
      return;
    }

    // Clear selection if not shift-clicking
    if (!e.shiftKey) {
      this.selectedNotes.clear();
    }

    // Check lane clicks - try both opponent and player lanes
    for (let lane = 0; lane < 4; lane++) {
      // Check opponent lane
      const oppLaneX = OPP_BASE_X + lane * LANE_SPACING;
      if (x >= oppLaneX && x <= oppLaneX + LANE_WIDTH) {
        this.editingOpponent = true;
        this._handleLaneClick(lane, y, e.shiftKey);
        return;
      }

      // Check player lane
      const plrLaneX = PLR_BASE_X + lane * LANE_SPACING;
      if (x >= plrLaneX && x <= plrLaneX + LANE_WIDTH) {
        this.editingOpponent = false;
        this._handleLaneClick(lane, y, e.shiftKey);
        return;
      }
    }
  }

  _onMouseDown(e) {
    const { x, y } = this._canvasPos(e);

    // Start dragging in a lane
    for (let lane = 0; lane < 4; lane++) {
      const oppLaneX = OPP_BASE_X + lane * LANE_SPACING;
      if (x >= oppLaneX && x <= oppLaneX + LANE_WIDTH && y > 150) {
        this._isDragging = true;
        this._dragLane = lane;
        this.editingOpponent = true;
        this._lastDragTime = -1;
        return;
      }

      const plrLaneX = PLR_BASE_X + lane * LANE_SPACING;
      if (x >= plrLaneX && x <= plrLaneX + LANE_WIDTH && y > 150) {
        this._isDragging = true;
        this._dragLane = lane;
        this.editingOpponent = false;
        this._lastDragTime = -1;
        return;
      }
    }
  }

  _onMouseUp(e) {
    this._isDragging = false;
    this._dragLane = -1;
    this._lastDragTime = -1;
  }

  _handleLaneClick(lane, y, isShiftClick = false) {
    const noteArray = this.editingOpponent ? this.opponentNotes : this.notes;

    if (this.currentTool === 'add') {
      // Calculate time from Y position
      const deltaY = HIT_Y - y;
      const time = this.conductor.songPosition + deltaY / this.scrollSpeed;

      // Snap to grid
      const snappedTime = Math.round(time / this.gridSnap) * this.gridSnap;

      // Check if note already exists at this time/lane
      const exists = noteArray.some(n => n.lane === lane && Math.abs(n.time - snappedTime) < 50);
      if (!exists && snappedTime >= 0) {
        const newNote = { lane, time: snappedTime };
        noteArray.push(newNote);
        noteArray.sort((a, b) => a.time - b.time);
      }
    } else if (this.currentTool === 'delete') {
      // Find and delete note at clicked position
      const filtered = noteArray.filter(n => {
        if (n.lane !== lane) return true;
        const noteY = HIT_Y - (n.time - this.conductor.songPosition) * this.scrollSpeed;
        return Math.abs(noteY - y) > 20; // 20px click tolerance
      });

      if (this.editingOpponent) {
        this.opponentNotes = filtered;
      } else {
        this.notes = filtered;
      }
    }
  }

  _selectAll() {
    const noteArray = this.editingOpponent ? this.opponentNotes : this.notes;
    this.selectedNotes.clear();
    noteArray.forEach(note => this.selectedNotes.add(note));
  }

  _deleteSelected() {
    if (this.selectedNotes.size === 0) return;

    if (this.editingOpponent) {
      this.opponentNotes = this.opponentNotes.filter(n => !this.selectedNotes.has(n));
    } else {
      this.notes = this.notes.filter(n => !this.selectedNotes.has(n));
    }
    this.selectedNotes.clear();
  }

  _onMouseMove(e) {
    const { x, y } = this._canvasPos(e);

    this._hoverTool = this._toolRects.findIndex(r => this._hit(r, x, y));

    // Handle dragging to add multiple notes
    if (this._isDragging && this._dragLane !== -1 && this.currentTool === 'add') {
      const deltaY = HIT_Y - y;
      const time = this.conductor.songPosition + deltaY / this.scrollSpeed;
      const snappedTime = Math.round(time / this.gridSnap) * this.gridSnap;

      // Only add if we moved to a new time slot
      if (snappedTime !== this._lastDragTime && snappedTime >= 0) {
        const noteArray = this.editingOpponent ? this.opponentNotes : this.notes;
        const exists = noteArray.some(n => n.lane === this._dragLane && Math.abs(n.time - snappedTime) < 50);

        if (!exists) {
          noteArray.push({ lane: this._dragLane, time: snappedTime });
          noteArray.sort((a, b) => a.time - b.time);
        }
        this._lastDragTime = snappedTime;
      }
    }

    // Check if hovering over a note
    this._hoverNote = null;
    const noteArray = this.editingOpponent ? this.opponentNotes : this.notes;
    for (const note of noteArray) {
      const laneX = this._getLaneX(note.lane);
      const noteY = HIT_Y - (note.time - this.conductor.songPosition) * this.scrollSpeed;

      if (x >= laneX && x <= laneX + LANE_WIDTH && Math.abs(y - noteY) < 20) {
        this._hoverNote = note;
        break;
      }
    }

    const hovering = this._hoverTool !== -1 || this._hoverNote !== null || this._isDragging;
    this.game.canvas.style.cursor = hovering ? 'pointer' : 'default';
  }

  _canvasPos(e) {
    const r = this.game.canvas.getBoundingClientRect();
    const scaleX = this.game.canvas.width / r.width;
    const scaleY = this.game.canvas.height / r.height;
    return { x: (e.clientX - r.left) * scaleX, y: (e.clientY - r.top) * scaleY };
  }

  _hit(rect, x, y) {
    return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
  }

  _getLaneX(lane) {
    const baseX = this.editingOpponent ? OPP_BASE_X : PLR_BASE_X;
    return baseX + lane * LANE_SPACING;
  }

  // ─── Playback ──────────────────────────────────────────────────────────────

  _togglePlayback() {
    if (this.audio && !this.audio.paused) {
      this.audio.pause();
    } else if (this.audio) {
      this.conductor.start();
      this.audio.play().catch(() => {});
    }
  }

  // ─── Save / Load ───────────────────────────────────────────────────────────

  _saveChart() {
    const chart = {
      title: this.chartTitle,
      notes: this.notes,
      opponentNotes: this.opponentNotes,
    };

    const json = JSON.stringify(chart, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    const filename = this.chartTitle.toLowerCase().replace(/\s+/g, '-');
    a.download = `${filename}.json`;
    a.click();

    URL.revokeObjectURL(url);

    console.log('Chart saved!', chart);
  }

  _loadChart() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const text = await file.text();
      try {
        const chart = JSON.parse(text);
        this.notes = chart.notes || [];
        this.opponentNotes = chart.opponentNotes || [];
        console.log('Chart loaded!', chart);
      } catch (err) {
        console.error('Failed to load chart:', err);
        alert('Failed to load chart file');
      }
    };
    input.click();
  }

  // ─── Update ────────────────────────────────────────────────────────────────

  update(dt) {
    if (this.audio && !this.audio.paused) {
      this.conductor.update();
    }
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  render(ctx) {
    const { canvas } = this.game;
    const cx = canvas.width / 2;

    // Background
    ctx.fillStyle = '#0d0d1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Title
    ctx.fillStyle = '#C24B99';
    ctx.font = 'bold 42px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Chart Editor', cx, 50);

    // Tool selector
    this._toolRects = [];
    const toolW = 150, toolH = 44, toolGap = 14;
    const toolStartX = cx - (TOOLS.length * toolW + (TOOLS.length - 1) * toolGap) / 2;

    TOOLS.forEach((tool, i) => {
      const x = toolStartX + i * (toolW + toolGap);
      const y = 70;
      const selected = tool.id === this.currentTool;
      const hovered = i === this._hoverTool && !selected;
      this._toolRects.push({ x, y, w: toolW, h: toolH });

      ctx.fillStyle = selected ? tool.color : hovered ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.07)';
      ctx.beginPath();
      ctx.roundRect(x, y, toolW, toolH, 8);
      ctx.fill();

      ctx.strokeStyle = selected ? tool.color : hovered ? 'rgba(255,255,255,0.28)' : 'transparent';
      ctx.lineWidth = selected ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = selected ? '#000' : hovered ? '#fff' : 'rgba(255,255,255,0.5)';
      ctx.font = selected ? 'bold 18px sans-serif' : '16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(`${tool.icon} ${tool.label}`, x + toolW / 2, y + toolH / 2 + 6);
    });

    // Instructions
    ctx.fillStyle = 'rgba(255,255,255,0.42)';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Click/Drag to add  •  Shift+Click multi-select  •  Del delete selected  •  Ctrl+A select all  •  TAB switch  •  C clear  •  ESC exit', cx, 134);

    // Lane guides - OPPONENT
    for (let i = 0; i < 4; i++) {
      const alpha = this.editingOpponent ? 0.06 : 0.02;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(OPP_BASE_X + i * LANE_SPACING, 150, LANE_WIDTH, canvas.height - 150);
    }

    // Lane guides - PLAYER
    for (let i = 0; i < 4; i++) {
      const alpha = this.editingOpponent ? 0.02 : 0.06;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.fillRect(PLR_BASE_X + i * LANE_SPACING, 150, LANE_WIDTH, canvas.height - 150);
    }

    // Grid lines (time markers)
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let t = 0; t < this.conductor.songPosition + 10000; t += this.gridSnap) {
      const y = HIT_Y - (t - this.conductor.songPosition) * this.scrollSpeed;
      if (y > 150 && y < canvas.height) {
        ctx.beginPath();
        ctx.moveTo(OPP_BASE_X, y);
        ctx.lineTo(PLR_BASE_X + 3 * LANE_SPACING + LANE_WIDTH, y);
        ctx.stroke();

        // Time label
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${(t / 1000).toFixed(1)}s`, cx, y + 4);
      }
    }

    // Receptors - OPPONENT
    for (let i = 0; i < 4; i++) {
      const x = OPP_BASE_X + i * LANE_SPACING;
      const active = this.editingOpponent;
      ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 8);
      ctx.fill();
      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(LANE_KEYS[i], x + LANE_WIDTH / 2, HIT_Y + 44);
    }

    // Receptors - PLAYER
    for (let i = 0; i < 4; i++) {
      const x = PLR_BASE_X + i * LANE_SPACING;
      const active = !this.editingOpponent;
      ctx.fillStyle = active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)';
      ctx.beginPath();
      ctx.roundRect(x, HIT_Y - 15, LANE_WIDTH, 30, 8);
      ctx.fill();
      ctx.strokeStyle = LANE_COLORS[i];
      ctx.lineWidth = active ? 2 : 1;
      ctx.stroke();

      ctx.fillStyle = active ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.2)';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(LANE_KEYS[i], x + LANE_WIDTH / 2, HIT_Y + 44);
    }

    // Render opponent notes
    for (const note of this.opponentNotes) {
      const x = OPP_BASE_X + note.lane * LANE_SPACING;
      const y = HIT_Y - (note.time - this.conductor.songPosition) * this.scrollSpeed;

      // Only draw if on screen
      if (y < 150 || y > canvas.height) continue;

      const isHovered = this._hoverNote === note;
      const isSelected = this.selectedNotes.has(note);
      const w = LANE_WIDTH, h = 30;

      ctx.fillStyle = LANE_COLORS[note.lane];
      ctx.globalAlpha = this.editingOpponent ? (isHovered ? 0.8 : 1) : 0.4;
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, 8);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#FFDD57' : isHovered ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Render player notes
    for (const note of this.notes) {
      const x = PLR_BASE_X + note.lane * LANE_SPACING;
      const y = HIT_Y - (note.time - this.conductor.songPosition) * this.scrollSpeed;

      // Only draw if on screen
      if (y < 150 || y > canvas.height) continue;

      const isHovered = this._hoverNote === note;
      const isSelected = this.selectedNotes.has(note);
      const w = LANE_WIDTH, h = 30;

      ctx.fillStyle = LANE_COLORS[note.lane];
      ctx.globalAlpha = this.editingOpponent ? 0.4 : (isHovered ? 0.8 : 1);
      ctx.beginPath();
      ctx.roundRect(x, y - h / 2, w, h, 8);
      ctx.fill();

      ctx.strokeStyle = isSelected ? '#FFDD57' : isHovered ? '#fff' : 'rgba(255,255,255,0.6)';
      ctx.lineWidth = isSelected ? 4 : isHovered ? 3 : 2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // Stats
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`Player Notes: ${this.notes.length}`, canvas.width - 10, canvas.height - 104);
    ctx.fillText(`Opponent Notes: ${this.opponentNotes.length}`, canvas.width - 10, canvas.height - 82);
    if (this.selectedNotes.size > 0) {
      ctx.fillStyle = '#FFDD57';
      ctx.fillText(`Selected: ${this.selectedNotes.size}`, canvas.width - 10, canvas.height - 60);
      ctx.fillStyle = '#fff';
    }
    ctx.fillText(`Time: ${(this.conductor.songPosition / 1000).toFixed(1)}s`, canvas.width - 10, canvas.height - 38);
    ctx.fillText(`BPM: ${this.bpm}`, canvas.width - 10, canvas.height - 16);

    // Tool indicator
    const toolLabel = this.currentTool === 'add' ? 'ADD MODE' : 'DELETE MODE';
    const toolColor = this.currentTool === 'add' ? '#12FA05' : '#F9393F';
    ctx.fillStyle = toolColor;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(toolLabel, 10, canvas.height - 60);

    // Side indicator
    const sideLabel = this.editingOpponent ? 'EDITING: OPPONENT (left)' : 'EDITING: PLAYER (right)';
    const sideColor = this.editingOpponent ? '#F9393F' : '#12FA05';
    ctx.fillStyle = sideColor;
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(sideLabel, 10, canvas.height - 16);
  }
}
