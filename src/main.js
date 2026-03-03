import { Game } from './Game.js';
import { LoadingState } from './states/LoadingState.js';
import { MenuState } from './states/MenuState.js';
import { PlayState } from './states/PlayState.js';
import { ChartEditorState } from './states/ChartEditorState.js';
import { charts } from './data/charts.js';
import { audioGenerator } from './audio/AudioGenerator.js';

// Polyfill ctx.roundRect for browsers that don't support it yet
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r = 0) {
    const R = Math.min(typeof r === 'number' ? r : r[0], w / 2, h / 2);
    this.moveTo(x + R, y);
    this.lineTo(x + w - R, y);
    this.quadraticCurveTo(x + w, y, x + w, y + R);
    this.lineTo(x + w, y + h - R);
    this.quadraticCurveTo(x + w, y + h, x + w - R, y + h);
    this.lineTo(x + R, y + h);
    this.quadraticCurveTo(x, y + h, x, y + h - R);
    this.lineTo(x, y + R);
    this.quadraticCurveTo(x, y, x + R, y);
    this.closePath();
  };
}

const canvas = document.getElementById('game-canvas');
canvas.width = 900;
canvas.height = 750;

const game = new Game(canvas);

// Song list - audio is generated procedurally, no files needed
const songs = [
  { title: 'Tutorial',  bpm: 100, chartKey: 'tutorial' },
  { title: 'Bopeebo',   bpm: 140, chartKey: 'bopeebo' },
  { title: 'Fresh',     bpm: 120, chartKey: 'fresh' },
  { title: 'Dadbattle', bpm: 150, chartKey: 'dadbattle' },
  { title: 'South',     bpm: 160, chartKey: 'south' },
];

function goToMenu() {
  const menu = new MenuState(game, songs, startSong, openChartEditor);
  game.changeState(menu);
  menu.init();
}

function openChartEditor(initialChart = null) {
  const editor = new ChartEditorState(game, goToMenu, initialChart);
  game.changeState(editor);
  editor.init();
}

async function startSong(song, mode = 'normal', speedMultiplier = 1.0) {
  // Get chart from embedded data
  const chart = { ...charts[song.chartKey] };
  chart.bpm = song.bpm;
  chart.title = song.title;

  // Mark that we're using procedurally generated audio
  chart.useGeneratedAudio = true;
  chart.audioKey = song.chartKey; // Key for AudioGenerator

  const state = new PlayState(game, chart, mode, goToMenu, openChartEditor, speedMultiplier);
  game.changeState(state);
  state.init();
}

/**
 * Initialize audio generation system
 * Shows loading screen while setting up Web Audio API
 */
async function startLoading() {
  // Create mock "assets" for loading screen
  // We're not actually loading files, just initializing audio context
  const assets = [
    { type: 'audio-init', key: 'audioContext', songCount: songs.length }
  ];

  const loadingState = new LoadingState(game, assets, async (results, errors) => {
    // Initialize AudioGenerator
    const initialized = await audioGenerator.init();

    if (!initialized) {
      console.warn('AudioGenerator initialization failed - game will continue silently');
    } else {
      console.log('AudioGenerator ready - procedural music enabled');
    }

    // Go to menu after initialization
    goToMenu();
  });

  game.changeState(loadingState);
  loadingState.init();
}

// Start with loading screen
startLoading();
game.start();
