/**
 * Procedural FNF-style character drawing — no external assets required.
 * All coordinates are relative to (0, 0); Character.render() applies
 * translate + scale before calling this function.
 *
 * Pass a `theme` object to override colors (used for the opponent character).
 */

// Enhanced color themes with more detail
const DEFAULT_THEME = {
  skin:       '#FDBCB4',
  skinShade:  '#E8A89D',  // Darker shade for depth
  cap:        '#CE1DD8',
  capBrim:    '#a01eb0',
  shirt:      '#CE1DD8',
  shirtShade: '#9D15A5',  // Darker shade for folds
  pants:      '#2d2d5e',
  pantsShade: '#1a1a3a',
  shoes:      '#111',
  eyes:       '#222',
  mouth:      '#333',
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

  // --- Legs with shading ---
  ctx.strokeStyle = pose.miss ? '#555' : c.pants;
  ctx.lineWidth   = 13;
  ctx.lineCap     = 'round';
  line(ctx, -8, 12, -14, 46);
  line(ctx,  8, 12,  14, 46);

  // Leg shading (darker inner line for depth)
  if (!pose.miss) {
    ctx.strokeStyle = c.pantsShade || c.pants;
    ctx.lineWidth   = 8;
    line(ctx, -8, 12, -14, 44);
    line(ctx,  8, 12,  14, 44);
  }

  // --- Shoes with detail ---
  ctx.fillStyle = c.shoes;
  ellipse(ctx, -19, 49, 13, 5, -0.2);
  ellipse(ctx,  19, 49, 13, 5,  0.2);

  // Shoe highlight
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
  ellipse(ctx, -21, 48, 6, 2, -0.2);
  ellipse(ctx,  17, 48, 6, 2,  0.2);

  // --- Body (torso) ---
  ctx.fillStyle = pose.miss ? '#777' : c.shirt;
  ctx.beginPath();
  ctx.roundRect(-19, -32, 38, 46, 7);
  ctx.fill();

  // Body shading (darker side for 3D effect)
  if (!pose.miss) {
    ctx.fillStyle = c.shirtShade || c.shirt;
    ctx.globalAlpha = 0.4;
    ctx.beginPath();
    ctx.roundRect(8, -32, 11, 46, [0, 7, 7, 0]); // Right side darker
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Belt/waistline detail
  ctx.fillStyle = pose.miss ? '#555' : (c.pantsShade || c.pants);
  ctx.fillRect(-19, 10, 38, 4);

  // --- Arms ---
  arm(ctx, [-18, -22], pose.lArm, pose.miss, c.skin);
  arm(ctx, [ 18, -22], pose.rArm, pose.miss, c.skin);

  // --- Head (face) ---
  ctx.fillStyle = c.skin;
  ctx.beginPath();
  ctx.arc(0, -58, 27, 0, Math.PI * 2);
  ctx.fill();

  // Head shading (for depth)
  ctx.fillStyle = c.skinShade || c.skin;
  ctx.globalAlpha = 0.3;
  ctx.beginPath();
  ctx.arc(14, -58, 20, -Math.PI/2, Math.PI/2);
  ctx.fill();
  ctx.globalAlpha = 1;

  // --- Neck ---
  ctx.fillStyle = c.skin;
  ctx.fillRect(-7, -35, 14, 8);

  // Neck shadow
  ctx.fillStyle = c.skinShade || c.skin;
  ctx.globalAlpha = 0.4;
  ctx.fillRect(-7, -35, 14, 3);
  ctx.globalAlpha = 1;

  // --- Eyes ---
  eyes(ctx, t, pose.miss);

  // --- Eyebrows (more expressive) ---
  ctx.strokeStyle = pose.miss ? '#666' : (c.eyes || '#333');
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  if (pose.miss) {
    // Sad eyebrows (angled down)
    line(ctx, -16, -67, -6, -69);
    line(ctx, 6, -69, 16, -67);
  } else {
    // Normal/confident eyebrows
    line(ctx, -15, -68, -5, -67);
    line(ctx, 5, -67, 15, -68);
  }

  // --- Mouth (more expressive) ---
  ctx.strokeStyle = c.mouth || '#333';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  if (pose.miss) {
    // Frown
    ctx.arc(0, -47, 8, 0.3, Math.PI - 0.3);
  } else {
    // Smile (singing)
    ctx.arc(0, -52, 8, Math.PI + 0.3, -0.3);
  }
  ctx.stroke();

  // Tooth highlight when singing (not on miss)
  if (!pose.miss) {
    ctx.fillStyle = '#fff';
    ctx.fillRect(-3, -50, 6, 3);
  }

  // --- Cap dome ---
  ctx.fillStyle = pose.miss ? '#666' : c.cap;
  ctx.beginPath();
  ctx.arc(0, -72, 25, Math.PI, 0);
  ctx.fill();

  // Cap highlight (for 3D look)
  if (!pose.miss) {
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath();
    ctx.arc(-8, -78, 12, Math.PI, 0);
    ctx.fill();
  }

  // --- Cap brim (more detailed) ---
  ctx.fillStyle = pose.miss ? '#555' : (c.capBrim || '#a01eb0');
  ctx.beginPath();
  ctx.ellipse(8, -72, 33, 8, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Cap brim shadow/depth
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(8, -71, 33, 6, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // Cap button on top
  ctx.fillStyle = pose.miss ? '#444' : (c.capBrim || '#a01eb0');
  ctx.beginPath();
  ctx.arc(0, -85, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
  ctx.restore();
}

// ─── helpers ────────────────────────────────────────────────────────────────

function arm(ctx, [sx, sy], [ex, ey], miss, skinColor) {
  // Upper arm (thicker, at shoulder)
  ctx.strokeStyle = miss ? '#aaa' : skinColor;
  ctx.lineWidth = 13;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  // Arm shading (darker underside)
  if (!miss) {
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(sx + 2, sy + 2);
    ctx.lineTo(ex + 2, ey + 2);
    ctx.stroke();
  }

  // Hand (fist)
  ctx.fillStyle = miss ? '#aaa' : skinColor;
  ctx.beginPath();
  ctx.arc(ex, ey, 8, 0, Math.PI * 2);
  ctx.fill();

  // Hand detail (knuckles/fingers)
  if (!miss) {
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1.5;
    line(ctx, ex - 4, ey, ex + 4, ey);
  }
}

function eyes(ctx, t, miss) {
  // Eye whites (larger, more expressive)
  ctx.fillStyle = '#fff';
  ellipse(ctx, -10, -60, 8, 9, -0.1);
  ellipse(ctx, 10, -60, 8, 9, 0.1);

  // Eye outline for definition
  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(-10, -60, 8, 9, -0.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(10, -60, 8, 9, 0.1, 0, Math.PI * 2);
  ctx.stroke();

  const blink = Math.sin(t * Math.PI * 2 * 3.2) > 0.96;

  if (!blink) {
    // Pupils (larger, more visible)
    ctx.fillStyle = miss ? '#888' : '#1a1a1a';
    ctx.beginPath();
    ctx.arc(-10, -59, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(10, -59, 5, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlights (for life-like appearance)
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(-8, -61, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(12, -61, 2, 0, Math.PI * 2);
    ctx.fill();

    // Smaller sparkle
    ctx.beginPath();
    ctx.arc(-11, -57, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(9, -57, 1, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Blinking eyes (curved lines)
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    line(ctx, -17, -60, -3, -60);
    line(ctx, 3, -60, 17, -60);
  }
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
