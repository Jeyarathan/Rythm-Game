/**
 * SaveManager - Handles all data persistence using localStorage
 * Foundation for scores, achievements, preferences, and leaderboards
 */

export class SaveManager {
  constructor() {
    this.storageKey = 'fnf_rhythm_game_save';
    this.storageAvailable = this._checkStorageAvailable();

    // Default save data structure
    this.defaultData = {
      version: '1.0.0',
      preferences: {
        noteSpeed: 1.0,
        musicVolume: 0.7,
        hitSoundVolume: 1.0,
        botMode: false,
      },
      scores: {
        // Structure: { songKey: { difficulty: { score, accuracy, combo, perfect, good, ok, bad, miss, timestamp } } }
      },
      stats: {
        totalPlays: 0,
        totalNotesHit: 0,
        totalPerfect: 0,
        totalGood: 0,
        totalOk: 0,
        totalBad: 0,
        totalMiss: 0,
        totalScore: 0,
        firstPlayDate: null,
        lastPlayDate: null,
      },
      achievements: {
        // Structure: { achievementId: { unlocked, unlockedAt, progress } }
      },
      settings: {
        tutorialCompleted: false,
        showFPS: false,
      }
    };

    // Load save data or create new
    this.data = this.load();
  }

  /**
   * Check if localStorage is available
   * Gracefully handles blocked storage (incognito, browser settings, etc.)
   */
  _checkStorageAvailable() {
    try {
      const test = '__storage_test__';
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch (e) {
      console.warn('localStorage not available, using memory-only mode');
      return false;
    }
  }

  /**
   * Load save data from localStorage
   * Returns default data if no save exists or on error
   */
  load() {
    if (!this.storageAvailable) {
      return JSON.parse(JSON.stringify(this.defaultData));
    }

    try {
      const saved = localStorage.getItem(this.storageKey);
      if (!saved) {
        return JSON.parse(JSON.stringify(this.defaultData));
      }

      const parsed = JSON.parse(saved);

      // Merge with defaults to handle version updates
      return this._mergeWithDefaults(parsed);
    } catch (e) {
      console.error('Failed to load save data:', e);
      return JSON.parse(JSON.stringify(this.defaultData));
    }
  }

  /**
   * Merge saved data with defaults (handles new properties from updates)
   */
  _mergeWithDefaults(saved) {
    const merged = JSON.parse(JSON.stringify(this.defaultData));

    // Deep merge preferences
    if (saved.preferences) {
      Object.assign(merged.preferences, saved.preferences);
    }

    // Keep all saved scores
    if (saved.scores) {
      merged.scores = saved.scores;
    }

    // Keep all stats
    if (saved.stats) {
      Object.assign(merged.stats, saved.stats);
    }

    // Keep all achievements
    if (saved.achievements) {
      merged.achievements = saved.achievements;
    }

    // Keep settings
    if (saved.settings) {
      Object.assign(merged.settings, saved.settings);
    }

    return merged;
  }

  /**
   * Save data to localStorage
   * Returns true on success, false on failure
   */
  save() {
    if (!this.storageAvailable) {
      console.warn('Cannot save: localStorage not available');
      return false;
    }

    try {
      const serialized = JSON.stringify(this.data);
      localStorage.setItem(this.storageKey, serialized);
      return true;
    } catch (e) {
      console.error('Failed to save data:', e);
      return false;
    }
  }

  /**
   * Save score for a song/difficulty
   * Automatically updates if it's a new high score
   */
  saveScore(songKey, difficulty, scoreData) {
    // Initialize song scores if needed
    if (!this.data.scores[songKey]) {
      this.data.scores[songKey] = {};
    }

    const existingScore = this.data.scores[songKey][difficulty];
    const isNewHighScore = !existingScore || scoreData.score > existingScore.score;

    // Save if new high score
    if (isNewHighScore) {
      this.data.scores[songKey][difficulty] = {
        score: scoreData.score,
        accuracy: scoreData.accuracy,
        combo: scoreData.combo,
        perfect: scoreData.perfect,
        good: scoreData.good,
        ok: scoreData.ok,
        bad: scoreData.bad,
        miss: scoreData.miss,
        timestamp: Date.now(),
      };
    }

    // Update total stats regardless
    this.data.stats.totalPlays++;
    this.data.stats.totalNotesHit += (scoreData.perfect + scoreData.good + scoreData.ok);
    this.data.stats.totalPerfect += scoreData.perfect;
    this.data.stats.totalGood += scoreData.good;
    this.data.stats.totalOk += scoreData.ok;
    this.data.stats.totalBad += scoreData.bad;
    this.data.stats.totalMiss += scoreData.miss;
    this.data.stats.totalScore += scoreData.score;
    this.data.stats.lastPlayDate = Date.now();

    if (!this.data.stats.firstPlayDate) {
      this.data.stats.firstPlayDate = Date.now();
    }

    this.save();
    return isNewHighScore;
  }

  /**
   * Get high score for a song/difficulty
   */
  getHighScore(songKey, difficulty) {
    return this.data.scores[songKey]?.[difficulty] || null;
  }

  /**
   * Get all scores for a song (all difficulties)
   */
  getSongScores(songKey) {
    return this.data.scores[songKey] || {};
  }

  /**
   * Get top N scores across all songs
   */
  getTopScores(limit = 10) {
    const allScores = [];

    for (const [songKey, difficulties] of Object.entries(this.data.scores)) {
      for (const [difficulty, scoreData] of Object.entries(difficulties)) {
        allScores.push({
          songKey,
          difficulty,
          ...scoreData
        });
      }
    }

    // Sort by score descending
    allScores.sort((a, b) => b.score - a.score);

    return allScores.slice(0, limit);
  }

  /**
   * Save user preferences
   */
  savePreferences(prefs) {
    Object.assign(this.data.preferences, prefs);
    this.save();
  }

  /**
   * Get user preferences
   */
  getPreferences() {
    return this.data.preferences;
  }

  /**
   * Unlock achievement
   */
  unlockAchievement(achievementId) {
    if (!this.data.achievements[achievementId]) {
      this.data.achievements[achievementId] = {
        unlocked: true,
        unlockedAt: Date.now(),
        progress: 100
      };
      this.save();
      return true; // Newly unlocked
    }
    return false; // Already unlocked
  }

  /**
   * Update achievement progress
   */
  updateAchievementProgress(achievementId, progress) {
    if (!this.data.achievements[achievementId]) {
      this.data.achievements[achievementId] = {
        unlocked: false,
        unlockedAt: null,
        progress: progress
      };
    } else {
      this.data.achievements[achievementId].progress = progress;
    }
    this.save();
  }

  /**
   * Check if achievement is unlocked
   */
  isAchievementUnlocked(achievementId) {
    return this.data.achievements[achievementId]?.unlocked || false;
  }

  /**
   * Get achievement progress
   */
  getAchievementProgress(achievementId) {
    return this.data.achievements[achievementId]?.progress || 0;
  }

  /**
   * Get all unlocked achievements
   */
  getUnlockedAchievements() {
    return Object.entries(this.data.achievements)
      .filter(([_, data]) => data.unlocked)
      .map(([id, data]) => ({ id, ...data }));
  }

  /**
   * Save setting
   */
  saveSetting(key, value) {
    this.data.settings[key] = value;
    this.save();
  }

  /**
   * Get setting
   */
  getSetting(key) {
    return this.data.settings[key];
  }

  /**
   * Get total stats
   */
  getStats() {
    return this.data.stats;
  }

  /**
   * Reset all data (for testing or user request)
   */
  reset() {
    this.data = JSON.parse(JSON.stringify(this.defaultData));
    this.save();
  }

  /**
   * Export save data as JSON string (for backup/sharing)
   */
  exportData() {
    return JSON.stringify(this.data, null, 2);
  }

  /**
   * Import save data from JSON string
   */
  importData(jsonString) {
    try {
      const imported = JSON.parse(jsonString);
      this.data = this._mergeWithDefaults(imported);
      this.save();
      return true;
    } catch (e) {
      console.error('Failed to import data:', e);
      return false;
    }
  }
}

// Create singleton instance
export const saveManager = new SaveManager();
