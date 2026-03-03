/**
 * Procedural FNF-style character drawing — no external assets required.
 * All coordinates are relative to (0, 0); Character.render() applies
 * translate + scale before calling this function.
 *
 * Pass a `theme` object to override colors (used for the opponent character).
 */

const DEFAULT_THEME = {
  skin:  '#FDBCB4',
  cap:   '#CE1DD8',
  shirt: '#CE1DD8',
  pants: '#2d2d5e',
  shoes: '#111',
};

const POSES = {
  idle:             { lArm: [-50, -5],  rArm: [50, -5],   bob: true },
  singLeft:         { lArm: [-75, -22], rArm: [35,  0],   tilt:  0.13 },
  singDown:         { lArm: [-22,  28], rArm: [22, 28],   dy: 8 },
  singUp:           { lArm: [-18, -70], rArm: [18, -70],  dy: -8 },
  singRight:        { lArm: [-35,  0],  rArm: [75, -22],  tilt: -0.13 },
  'singLeft-miss':  { lArm: [-58, 12],  rArm: [28, 12],   miss: true },
  'singDown-miss':  { lArm: [-20, 32],  rArm: [20, 32],   miss: true, dy: 10 },
  'singUp-miss':    { lArm: [-15, -52], rArm: [15, -52],  miss: true },
  'singRight-miss': { lArm: [-28, 12],  rArm: [58, 12],   miss: true },
};

export function drawPlaceholderChar(ctx, animName, t, theme = {}) {
  const pose = POSES[animName] ?? POSES.idle;
  const c    = { ...DEFAULT_THEME, ...theme };

  ctx.save();

  // Use globalAlpha instead of filter for better performance
  if (pose.miss) {
    ctx.globalAlpha = 0.6;
  }

  let dy = pose.dy ?? 0;
  if (pose.bob) dy += Math.sin(t * Math.PI * 2) * 5;

  ctx.save();
  ctx.translate(0, dy);
  if (pose.tilt) ctx.rotate(pose.tilt);

  // --- Shadow ---
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.beginPath();
  ctx.ellipse(0, 54, 26, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // --- Legs ---
  ctx.strokeStyle = c.pants;
  ctx.lineWidth   = 12;
  ctx.lineCap     = 'round';
  line(ctx, -8, 12, -14, 46);
  line(ctx,  8, 12,  14, 46);

  // --- Shoes ---
  ctx.fillStyle = c.shoes;
  ellipse(ctx, -19, 49, 13, 5, -0.2);
  ellipse(ctx,  19, 49, 13, 5,  0.2);

  // --- Body ---
  ctx.fillStyle = pose.miss ? '#777' : c.shirt;
  ctx.beginPath();
  ctx.roundRect(-19, -32, 38, 46, 7);
  ctx.fill();

  // --- Arms ---
  arm(ctx, [-18, -22], pose.lArm, pose.miss, c.skin);
  arm(ctx, [ 18, -22], pose.rArm, pose.miss, c.skin);

  // --- Head ---
  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.arc(0, -58, 27, 0, Math.PI * 2);
  ctx.fill();

  // --- Eyes ---
  eyes(ctx, t, pose.miss);

  // --- Mouth ---
  ctx.strokeStyle = '#333';
  ctx.lineWidth   = 2.5;
  ctx.beginPath();
  if (pose.miss) {
    ctx.arc(0, -47, 8, 0.3, Math.PI - 0.3);
  } else {
    ctx.arc(0, -52, 8, Math.PI + 0.3, -0.3);
  }
  ctx.stroke();

  // --- Cap dome ---
  ctx.fillStyle = pose.miss ? '#666' : c.cap;
  ctx.beginPath();
  ctx.arc(0, -72, 25, Math.PI, 0);
  ctx.fill();

  // --- Cap brim ---
  ctx.fillStyle = pose.miss ? '#555' : (theme.capBrim ?? '#a01eb0');
  ctx.beginPath();
  ctx.ellipse(8, -72, 33, 8, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

// ─── helpers ────────────────────────────────────────────────────────────────

function arm(ctx, [sx, sy], [ex, ey], miss, skinColor) {
  ctx.strokeStyle = miss ? '#aaa' : skinColor;
  ctx.lineWidth   = 12;
  ctx.lineCap     = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.fillStyle = miss ? '#aaa' : skinColor;
  ctx.beginPath();
  ctx.arc(ex, ey, 7, 0, Math.PI * 2);
  ctx.fill();
}

function eyes(ctx, t, miss) {
  ctx.fillStyle = '#fff';
  ellipse(ctx, -9, -60, 7, 8, 0);
  ellipse(ctx,  9, -60, 7, 8, 0);

  const blink = Math.sin(t * Math.PI * 2 * 3.2) > 0.96;
  ctx.fillStyle = miss ? '#888' : '#222';
  if (!blink) {
    ctx.beginPath(); ctx.arc(-9, -59, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc( 9, -59, 4, 0, Math.PI * 2); ctx.fill();
  } else {
    ctx.strokeStyle = '#333';
    ctx.lineWidth   = 2;
    line(ctx, -16, -60, -2, -60);
    line(ctx,   2, -60, 16, -60);
  }

  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(-7, -61, 1.5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(11, -61, 1.5, 0, Math.PI * 2); ctx.fill();
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function ellipse(ctx, x, y, rx, ry, rot) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  ctx.fill();
}
