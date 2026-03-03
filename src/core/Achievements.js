/**
 * Achievements - Achievement definitions and tracking
 * Checks conditions and unlocks achievements based on player stats and performance
 */

import { saveManager } from './SaveManager.js';

/**
 * Achievement definitions with unlock criteria
 * Each achievement has:
 * - id: unique identifier
 * - title: display name
 * - description: what the player needs to do
 * - icon: emoji or symbol (for now, can be replaced with sprites later)
 * - condition: function that returns true if unlocked
 * - progress: function that returns current progress (0-100)
 */
export const ACHIEVEMENTS = [
  // ── Beginner Achievements ──
  {
    id: 'first_song',
    title: 'First Steps',
    description: 'Complete any song',
    icon: '🎵',
    condition: (stats) => stats.totalPlays >= 1,
    progress: (stats) => Math.min(stats.totalPlays, 1) * 100,
  },
  {
    id: 'perfect_combo_10',
    title: 'Getting the Hang of It',
    description: 'Hit a 10 note combo',
    icon: '⭐',
    condition: (stats, session) => session?.maxCombo >= 10,
    progress: (stats, session) => Math.min((session?.maxCombo || 0) / 10, 1) * 100,
  },
  {
    id: 'perfect_10',
    title: 'Perfectionist',
    description: 'Hit 10 SICK! notes in a row',
    icon: '💯',
    condition: (stats) => stats.totalPerfect >= 10,
    progress: (stats) => Math.min(stats.totalPerfect / 10, 1) * 100,
  },

  // ── Intermediate Achievements ──
  {
    id: 'perfect_combo_50',
    title: 'Combo Master',
    description: 'Hit a 50 note combo',
    icon: '🔥',
    condition: (stats, session) => session?.maxCombo >= 50,
    progress: (stats, session) => Math.min((session?.maxCombo || 0) / 50, 1) * 100,
  },
  {
    id: 'score_10k',
    title: 'Score Chaser',
    description: 'Score 10,000 points in a single song',
    icon: '🏆',
    condition: (stats, session) => session?.score >= 10000,
    progress: (stats, session) => Math.min((session?.score || 0) / 10000, 1) * 100,
  },
  {
    id: 'five_songs',
    title: 'Song Explorer',
    description: 'Complete 5 different songs',
    icon: '🎼',
    condition: (stats) => stats.totalPlays >= 5,
    progress: (stats) => Math.min(stats.totalPlays / 5, 1) * 100,
  },
  {
    id: 'accuracy_90',
    title: 'Accurate',
    description: 'Finish a song with 90% accuracy',
    icon: '🎯',
    condition: (stats, session) => session?.accuracy >= 90,
    progress: (stats, session) => Math.min((session?.accuracy || 0) / 90, 1) * 100,
  },

  // ── Advanced Achievements ──
  {
    id: 'perfect_combo_100',
    title: 'Rhythm Legend',
    description: 'Hit a 100 note combo',
    icon: '👑',
    condition: (stats, session) => session?.maxCombo >= 100,
    progress: (stats, session) => Math.min((session?.maxCombo || 0) / 100, 1) * 100,
  },
  {
    id: 'score_50k',
    title: 'High Roller',
    description: 'Score 50,000 points in a single song',
    icon: '💎',
    condition: (stats, session) => session?.score >= 50000,
    progress: (stats, session) => Math.min((session?.score || 0) / 50000, 1) * 100,
  },
  {
    id: 'perfect_song',
    title: 'Flawless Victory',
    description: 'Complete a song with 100% accuracy (no misses)',
    icon: '✨',
    condition: (stats, session) => session?.accuracy === 100 && session?.miss === 0,
    progress: (stats, session) => session?.accuracy || 0,
  },
  {
    id: 'all_songs_normal',
    title: 'Normal Master',
    description: 'Complete all songs on Normal difficulty',
    icon: '🎖️',
    condition: (stats) => {
      const songs = ['tutorial', 'bopeebo', 'fresh', 'dadbattle', 'south'];
      return songs.every(song => saveManager.getHighScore(song, 'normal') !== null);
    },
    progress: (stats) => {
      const songs = ['tutorial', 'bopeebo', 'fresh', 'dadbattle', 'south'];
      const completed = songs.filter(song => saveManager.getHighScore(song, 'normal') !== null).length;
      return (completed / songs.length) * 100;
    },
  },
  {
    id: 'all_songs_hard',
    title: 'Hard Mode Champion',
    description: 'Complete all songs on Hard difficulty',
    icon: '🏅',
    condition: (stats) => {
      const songs = ['tutorial', 'bopeebo', 'fresh', 'dadbattle', 'south'];
      return songs.every(song => saveManager.getHighScore(song, 'hard') !== null);
    },
    progress: (stats) => {
      const songs = ['tutorial', 'bopeebo', 'fresh', 'dadbattle', 'south'];
      const completed = songs.filter(song => saveManager.getHighScore(song, 'hard') !== null).length;
      return (completed / songs.length) * 100;
    },
  },

  // ── Grind Achievements ──
  {
    id: 'total_notes_1000',
    title: 'Note Novice',
    description: 'Hit 1,000 total notes',
    icon: '📝',
    condition: (stats) => stats.totalNotesHit >= 1000,
    progress: (stats) => Math.min(stats.totalNotesHit / 1000, 1) * 100,
  },
  {
    id: 'total_notes_10000',
    title: 'Note Veteran',
    description: 'Hit 10,000 total notes',
    icon: '📋',
    condition: (stats) => stats.totalNotesHit >= 10000,
    progress: (stats) => Math.min(stats.totalNotesHit / 10000, 1) * 100,
  },
  {
    id: 'total_perfect_500',
    title: 'Precision Player',
    description: 'Hit 500 SICK! notes across all songs',
    icon: '🎪',
    condition: (stats) => stats.totalPerfect >= 500,
    progress: (stats) => Math.min(stats.totalPerfect / 500, 1) * 100,
  },
  {
    id: 'total_score_100k',
    title: 'Point Collector',
    description: 'Score 100,000 total points',
    icon: '💰',
    condition: (stats) => stats.totalScore >= 100000,
    progress: (stats) => Math.min(stats.totalScore / 100000, 1) * 100,
  },
];

/**
 * AchievementChecker - Checks and unlocks achievements
 */
export class AchievementChecker {
  constructor() {
    this.newlyUnlocked = []; // Achievements unlocked this session
  }

  /**
   * Check all achievements against current stats and session data
   * @param {Object} sessionData - Data from the just-completed song (score, accuracy, combo, etc.)
   * @returns {Array} Array of newly unlocked achievement IDs
   */
  checkAchievements(sessionData = null) {
    this.newlyUnlocked = [];
    const stats = saveManager.getStats();

    for (const achievement of ACHIEVEMENTS) {
      // Skip if already unlocked
      if (saveManager.isAchievementUnlocked(achievement.id)) {
        continue;
      }

      // Check condition
      if (achievement.condition(stats, sessionData)) {
        // Unlock it!
        saveManager.unlockAchievement(achievement.id);
        this.newlyUnlocked.push(achievement);
      } else {
        // Update progress
        const progress = achievement.progress(stats, sessionData);
        saveManager.updateAchievementProgress(achievement.id, Math.floor(progress));
      }
    }

    return this.newlyUnlocked;
  }

  /**
   * Get newly unlocked achievements from last check
   */
  getNewlyUnlocked() {
    return this.newlyUnlocked;
  }

  /**
   * Get achievement by ID
   */
  getAchievement(id) {
    return ACHIEVEMENTS.find(a => a.id === id);
  }

  /**
   * Get all achievements with their unlock status
   */
  getAllAchievements() {
    return ACHIEVEMENTS.map(achievement => ({
      ...achievement,
      unlocked: saveManager.isAchievementUnlocked(achievement.id),
      progress: saveManager.getAchievementProgress(achievement.id),
      unlockedAt: saveManager.data.achievements[achievement.id]?.unlockedAt || null,
    }));
  }

  /**
   * Get achievement statistics
   */
  getStats() {
    const total = ACHIEVEMENTS.length;
    const unlocked = ACHIEVEMENTS.filter(a =>
      saveManager.isAchievementUnlocked(a.id)
    ).length;

    return {
      total,
      unlocked,
      percentage: total > 0 ? Math.round((unlocked / total) * 100) : 0,
    };
  }
}

// Create singleton instance
export const achievementChecker = new AchievementChecker();
