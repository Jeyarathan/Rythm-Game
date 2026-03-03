import { Note } from './Note.js';

const SCROLL_SPEED = 0.45;  // pixels per millisecond
const HIT_WINDOW   = 135;   // ms tolerance for a valid hit

export class NoteManager {
  constructor({ baseX = 100, laneSpacing = 120, laneWidth = 100, hitY = 550,
                scrollSpeed = SCROLL_SPEED, hitWindow = HIT_WINDOW } = {}) {
    this.baseX       = baseX;
    this.laneSpacing = laneSpacing;
    this.laneWidth   = laneWidth;
    this.hitY        = hitY;
    this.scrollSpeed = scrollSpeed;
    this.hitWindow   = hitWindow;
    this.notes       = [];
    this._nextCheckIndex = 0; // Track which note to check next for optimization
  }

  getLaneX(lane) {
    return this.baseX + lane * this.laneSpacing;
  }

  loadNotes(array) {
    this.notes = array.map(n => new Note(n.lane, n.time, n.type ?? 'normal', n.duration ?? 0));
    this.notes.sort((a, b) => a.time - b.time);
    this._nextCheckIndex = 0;
  }

  /** Returns the note that was hit, or null */
  checkHit(lane, songPosition) {
    for (const note of this.notes) {
      if (note.hit || note.missed || note.lane !== lane) continue;
      if (Math.abs(note.time - songPosition) <= this.hitWindow) {
        if (note.type === 'hold') {
          note.holding = true;
          note.holdProgress = 0;
        } else {
          note.hit = true;
        }
        return note;
      }
    }
    return null;
  }

  /** Update hold notes based on which keys are currently pressed */
  updateHolds(songPosition, keysPressed) {
    for (const note of this.notes) {
      if (note.type !== 'hold' || note.hit || note.missed) continue;
      if (!note.holding) continue;

      const holdEndTime = note.time + note.duration;
      const elapsed = songPosition - note.time;
      const progress = Math.min(1, elapsed / note.duration);

      // Check if player is still holding the key
      if (keysPressed[note.lane]) {
        note.holdProgress = progress;

        // Successfully held until the end
        if (songPosition >= holdEndTime) {
          note.hit = true;
          note.holding = false;
          note._missHandled = true; // Mark as handled so it doesn't trigger miss detection
        }
      } else {
        // Released too early
        note.holding = false;
        if (progress < 0.95) { // Allow 5% margin
          note.missed = true;
          // Don't set _missHandled here - let the miss detection handle it
        } else {
          note.hit = true; // Close enough
          note._missHandled = true;
        }
      }
    }
  }

  /** Player-side: mark notes past the window as missed */
  update(songPosition) {
    // Remove old processed notes to prevent lag
    // For hold notes, use the end time instead of start time
    const cullThreshold = songPosition - 2000; // Remove notes more than 2 seconds old
    while (this.notes.length > 0) {
      const note = this.notes[0];
      const noteEndTime = note.time + (note.duration || 0);

      if (noteEndTime < cullThreshold && (note.hit || note.missed)) {
        this.notes.shift();
        if (this._nextCheckIndex > 0) this._nextCheckIndex--;
      } else {
        break;
      }
    }

    // Only check notes that haven't been processed yet
    // Start from the last checked index to avoid re-checking old notes
    const startIdx = this._nextCheckIndex;

    for (let i = startIdx; i < this.notes.length; i++) {
      const note = this.notes[i];

      // If we've reached notes in the future, stop checking
      if (note.time > songPosition + this.hitWindow) {
        break;
      }

      // Skip already processed notes
      if (note.hit || note.missed) {
        this._nextCheckIndex = i + 1;
        continue;
      }

      // For hold notes, check if they're being held
      if (note.type === 'hold' && note.holding) {
        // Don't mark as missed while holding
        continue;
      }

      // Mark as missed if past the window
      if (songPosition - note.time > this.hitWindow) {
        note.missed = true;
        this._nextCheckIndex = i + 1;
      } else {
        // Note is still in hit window, stop checking
        break;
      }
    }
  }

  /** Bot-side: auto-hit notes when song reaches them. Returns newly-hit notes. */
  updateBot(songPosition) {
    // Remove old processed notes to prevent lag
    const cullThreshold = songPosition - 2000;
    while (this.notes.length > 0) {
      const note = this.notes[0];
      const noteEndTime = note.time + (note.duration || 0);

      if (noteEndTime < cullThreshold && (note.hit || note.missed)) {
        this.notes.shift();
      } else {
        break;
      }
    }

    const hit = [];
    // Only check notes near current time
    for (const note of this.notes) {
      if (note.time > songPosition + 100) break; // Future notes
      if (note.hit || note.missed) continue;
      if (songPosition >= note.time) {
        // Bot instantly completes all notes (including holds)
        note.hit = true;
        note._missHandled = true;
        if (note.type === 'hold') {
          note.holdProgress = 1; // Show as fully completed
        }
        hit.push(note);
      }
    }
    return hit;
  }

  isDone() {
    return this.notes.length > 0 && this.notes.every(n => n.hit || n.missed);
  }

  reset() {
    this._nextCheckIndex = 0;
    for (const note of this.notes) {
      note.hit          = false;
      note.missed       = false;
      note._missHandled = false;
      note.holding      = false;
      note.holdProgress = 0;
      note._lastHoldFrame = false;
    }
  }

  render(ctx, songPosition) {
    // Only render notes that are visible on screen
    // Calculate the time range for visible notes
    const visibleRangeStart = songPosition - 500; // Notes below screen
    const visibleRangeEnd = songPosition + (this.hitY + 300) / this.scrollSpeed; // Notes above screen

    for (const note of this.notes) {
      // Skip notes that are too far in the past or future
      if (note.time < visibleRangeStart) continue;
      if (note.time > visibleRangeEnd) break; // Notes are sorted, so we can break early

      note.render(ctx, songPosition, this.hitY, this.scrollSpeed, this.getLaneX(note.lane), this.laneWidth);
    }
  }
}
