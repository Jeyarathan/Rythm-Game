import { Game } from './Game.js';
import { MenuState } from './states/MenuState.js';
import { PlayState } from './states/PlayState.js';
import { ChartEditorState } from './states/ChartEditorState.js';
import { charts } from './data/charts.js';

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
canvas.height = 640;

const game = new Game(canvas);

const songs = [
  { title: 'Tutorial',  bpm: 100, audioSrc: 'assets/songs/tutorial.ogg',  chartKey: 'tutorial' },
  { title: 'Bopeebo',   bpm: 140, audioSrc: 'assets/songs/bopeebo.ogg',   chartKey: 'bopeebo' },
  { title: 'Fresh',     bpm: 120, audioSrc: 'assets/songs/fresh.ogg',     chartKey: 'fresh' },
  { title: 'Dadbattle', bpm: 150, audioSrc: 'assets/songs/dadbattle.ogg', chartKey: 'dadbattle' },
  { title: 'South',     bpm: 160, audioSrc: 'assets/songs/south.ogg',     chartKey: 'south' },
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

async function startSong(song, mode = 'normal') {
  // Get chart from embedded data
  const chart = { ...charts[song.chartKey] };
  chart.bpm = song.bpm;
  chart.audioSrc = song.audioSrc;
  chart.title = song.title;

  const state = new PlayState(game, chart, mode, goToMenu, openChartEditor);
  game.changeState(state);
  state.init();
}

goToMenu();
game.start();
