'use strict';
// Everything is drawn with canvas shapes; the only image used is the hero's face (mariochar.png).
const Sprites = (() => {
  // Face region inside mariochar.png (head + a bit of neck)...
  const HEAD = { x: 36, y: 12, w: 212, h: 278 };
  // ...and the outline (image pixels) that cuts the head away from the shoulders below it.
  const HEAD_CUT = [
    [0, 0], [257, 0], [257, 246], [240, 250], [229, 280], [200, 285], [170, 290],
    [132, 286], [116, 272], [98, 258], [78, 246], [64, 238], [0, 232],
  ];
  const HEAD_ASPECT = HEAD.w / HEAD.h;
  const NECK_X = 0.53;   // where the neck sits across the head cut-out (0 = back, 1 = nose)

  const headImg = new Image();
  let headFull = null, headHalf = null;
  headImg.onload = () => {
    headFull = document.createElement('canvas');
    headFull.width = HEAD.w;
    headFull.height = HEAD.h;
    const g = headFull.getContext('2d');
    g.beginPath();
    HEAD_CUT.forEach(([px, py], i) => g[i ? 'lineTo' : 'moveTo'](px - HEAD.x, py - HEAD.y));
    g.closePath();
    g.clip();
    g.drawImage(headImg, -HEAD.x, -HEAD.y);

    // Half-size copy: looks cleaner when the head is drawn small in-game.
    headHalf = document.createElement('canvas');
    headHalf.width = HEAD.w / 2;
    headHalf.height = HEAD.h / 2;
    const g2 = headHalf.getContext('2d');
    g2.imageSmoothingQuality = 'high';
    g2.drawImage(headFull, 0, 0, headHalf.width, headHalf.height);
  };
  headImg.src = 'mariochar.png';

  // ---------- helpers ----------
  function circle(ctx, x, y, r) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function ellipse(ctx, x, y, rx, ry) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  // ---------- hero ----------
  // Draws the face (facing right) into the box x,y,w,h.
  function head(ctx, x, y, w, h) {
    if (!headFull) {
      ctx.fillStyle = '#c68642';
      ellipse(ctx, x + w / 2, y + h / 2, w / 2, h / 2);
      return;
    }
    const onScreen = h * Math.abs(ctx.getTransform().d);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(onScreen > 150 ? headFull : headHalf, x, y, w, h);
  }

  // x,y,w,h is the hero's hit box; o = { facing: 1|-1, phase: walk cycle, air: bool }
  function hero(ctx, x, y, w, h, o) {
    o = o || {};
    const headH = h * 0.7, headW = headH * HEAD_ASPECT;
    const feet = y + h;
    const shoulderY = y + headH * 0.9;
    const b = (feet - shoulderY) / 21;            // body unit
    const hipY = feet - 9 * b;
    const swing = o.air ? 1 : Math.sin(o.phase || 0);

    const RED = '#e52521', BLUE = '#2b4fd8', SHOE = '#5a2f10';

    ctx.save();
    ctx.translate(x + w / 2, 0);
    ctx.scale(o.facing === -1 ? -1 : 1, 1);
    ctx.lineCap = 'round';

    const arm = (sx, angle) => {
      const sy = shoulderY + 4.5 * b;
      const hx = sx + Math.sin(angle) * 9 * b, hy = sy + Math.cos(angle) * 9 * b;
      ctx.strokeStyle = RED;
      ctx.lineWidth = 5 * b;
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(hx, hy); ctx.stroke();
      ctx.fillStyle = '#fff';
      circle(ctx, hx, hy, 3.3 * b);
    };
    const leg = (baseX, dir) => {
      const dx = dir * swing * (o.air ? 5 : 4) * b;
      const lift = Math.max(0, dir * swing) * (o.air ? 3.5 : 2) * b;
      const fx = baseX + dx, fy = feet - 2.6 * b - lift;
      ctx.strokeStyle = BLUE;
      ctx.lineWidth = 6 * b;
      ctx.beginPath(); ctx.moveTo(baseX, hipY); ctx.lineTo(fx, fy - 1.5 * b); ctx.stroke();
      ctx.fillStyle = SHOE;
      ellipse(ctx, fx + 2 * b, fy, 5.6 * b, 2.6 * b);
    };

    arm(-2 * b, o.air ? -0.7 : swing * 0.8);       // back arm
    leg(-3 * b, -1);                               // back leg
    leg(3 * b, 1);                                 // front leg

    // torso: red shirt + blue overalls
    ctx.fillStyle = RED;
    roundRect(ctx, -8.5 * b, shoulderY, 17 * b, hipY - shoulderY + 3 * b, 4 * b);
    ctx.fillStyle = BLUE;
    roundRect(ctx, -8.5 * b, shoulderY + 6.5 * b, 17 * b, hipY - shoulderY - 3.5 * b, 3 * b);
    ctx.fillRect(-6 * b, shoulderY + 1 * b, 3.2 * b, 7 * b);
    ctx.fillRect(2.8 * b, shoulderY + 1 * b, 3.2 * b, 7 * b);
    ctx.fillStyle = '#ffd83d';
    circle(ctx, -4.4 * b, shoulderY + 7.6 * b, 1.4 * b);
    circle(ctx, 4.4 * b, shoulderY + 7.6 * b, 1.4 * b);

    head(ctx, -headW * NECK_X, y, headW, headH);

    arm(2 * b, o.air ? 2.5 : -swing * 0.8);        // front arm (raised when jumping)
    ctx.restore();
  }

  // ---------- enemies & items ----------
  function enemy(ctx, e) {
    const { x, y, w, h } = e, cx = x + w / 2;
    const capColor = e.type === 'red' ? '#d63031' : '#9c4a1a';
    ctx.save();
    if (e.state === 'squashed') {
      ctx.fillStyle = capColor;
      ellipse(ctx, cx, y + h - 5, w / 2 + 4, 5);
      ctx.restore();
      return;
    }
    if (e.state === 'flipped') {
      ctx.translate(0, 2 * y + h);
      ctx.scale(1, -1);
    }
    const step = Math.sin(e.phase) > 0 ? 2 : -2;
    const dir = e.vx > 0 ? 1 : -1;
    ctx.fillStyle = '#2d1606';
    ellipse(ctx, cx - 7 + step, y + h - 3.5, 7, 4);
    ellipse(ctx, cx + 7 - step, y + h - 3.5, 7, 4);
    ctx.fillStyle = '#f3d2a2';
    roundRect(ctx, cx - 8, y + h * 0.5, 16, h * 0.4, 4);
    ctx.fillStyle = capColor;
    ellipse(ctx, cx, y + h * 0.42, w / 2 + 1, h * 0.42);
    ctx.fillStyle = '#fff';
    ellipse(ctx, cx - 5.5, y + h * 0.48, 3.4, 4.6);
    ellipse(ctx, cx + 5.5, y + h * 0.48, 3.4, 4.6);
    ctx.fillStyle = '#111';
    ellipse(ctx, cx - 5.5 + dir * 1.2, y + h * 0.5, 1.6, 2.6);
    ellipse(ctx, cx + 5.5 + dir * 1.2, y + h * 0.5, 1.6, 2.6);
    ctx.strokeStyle = '#1a0a00';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(cx - 11, y + h * 0.24); ctx.lineTo(cx - 2.5, y + h * 0.36);
    ctx.moveTo(cx + 11, y + h * 0.24); ctx.lineTo(cx + 2.5, y + h * 0.36);
    ctx.stroke();
    ctx.restore();
  }

  function mushroom(ctx, m) {
    const { x, y, w, h } = m, cx = x + w / 2;
    ctx.fillStyle = '#f6e3c0';
    roundRect(ctx, cx - 8, y + h * 0.5, 16, h * 0.5, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(cx - 4, y + h * 0.62, 2, 6);
    ctx.fillRect(cx + 2, y + h * 0.62, 2, 6);
    ctx.fillStyle = '#e52521';
    ctx.beginPath();
    ctx.ellipse(cx, y + h * 0.56, w / 2, h * 0.54, 0, Math.PI, 0);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, cx, y + h * 0.24, 4.5);
    circle(ctx, cx - 10, y + h * 0.42, 3);
    circle(ctx, cx + 10, y + h * 0.42, 3);
  }

  function coin(ctx, x, y, frame) {
    const rx = Math.abs(Math.cos(frame * 0.09)) * 8 + 2;
    ctx.fillStyle = '#b8860b';
    ellipse(ctx, x, y, rx + 1.5, 12.5);
    ctx.fillStyle = '#ffd83d';
    ellipse(ctx, x, y, rx, 11);
    ctx.fillStyle = '#fff3a8';
    ellipse(ctx, x - rx * 0.25, y - 2, rx * 0.35, 6);
  }

  // ---------- tiles ----------
  function tile(ctx, t, x, y, frame, topGround) {
    const S = TILE;
    switch (t) {
      case T.GROUND:
        ctx.fillStyle = '#b9652a';
        ctx.fillRect(x, y, S + 0.5, S + 0.5);
        ctx.fillStyle = '#8f4a1c';
        ctx.fillRect(x + 6, y + 19, 5, 4);
        ctx.fillRect(x + 23, y + 27, 6, 4);
        ctx.fillStyle = '#d58a4a';
        ctx.fillRect(x + 25, y + 16, 4, 3);
        if (topGround) {
          ctx.fillStyle = '#56c443';
          ctx.fillRect(x, y, S + 0.5, 9);
          ctx.fillStyle = '#3a9a2e';
          ctx.fillRect(x, y + 9, S + 0.5, 3);
          ctx.fillStyle = '#9be88a';
          ctx.fillRect(x, y, S + 0.5, 2.5);
        } else {
          ctx.fillStyle = '#8f4a1c';
          ctx.fillRect(x + 14, y + 6, 5, 4);
        }
        break;

      case T.BRICK:
        ctx.fillStyle = '#c8501a';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#f0915a';
        ctx.fillRect(x, y, S, 2);
        ctx.fillStyle = '#5b1e05';
        ctx.fillRect(x, y + 11, S, 2);
        ctx.fillRect(x, y + 23, S, 2);
        ctx.fillRect(x, y + 34, S, 2);
        ctx.fillRect(x + 17, y, 2, 11);
        ctx.fillRect(x + 8, y + 13, 2, 10);
        ctx.fillRect(x + 26, y + 13, 2, 10);
        ctx.fillRect(x + 17, y + 25, 2, 9);
        ctx.fillRect(x + S - 1, y, 1, S);
        break;

      case T.QCOIN:
      case T.QMUSH: {
        const glow = 0.5 + 0.5 * Math.sin(frame * 0.1);
        ctx.fillStyle = '#7a4a00';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#fbbd0e';
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        ctx.fillStyle = '#ffe58a';
        ctx.fillRect(x + 2, y + 2, S - 4, 3);
        ctx.fillRect(x + 2, y + 2, 3, S - 4);
        ctx.fillStyle = '#7a4a00';
        ctx.fillRect(x + 5, y + 5, 3, 3);
        ctx.fillRect(x + S - 8, y + 5, 3, 3);
        ctx.fillRect(x + 5, y + S - 8, 3, 3);
        ctx.fillRect(x + S - 8, y + S - 8, 3, 3);
        ctx.font = '20px "Press Start 2P", "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('?', x + S / 2 + 2.5, y + S / 2 + 3);
        ctx.fillStyle = `rgba(255,255,255,${0.75 + glow * 0.25})`;
        ctx.fillText('?', x + S / 2 + 1, y + S / 2 + 1.5);
        break;
      }

      case T.USED:
        ctx.fillStyle = '#4a2c10';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#8b5e34';
        ctx.fillRect(x + 2, y + 2, S - 4, S - 4);
        ctx.fillStyle = '#4a2c10';
        ctx.fillRect(x + 5, y + 5, 3, 3);
        ctx.fillRect(x + S - 8, y + 5, 3, 3);
        ctx.fillRect(x + 5, y + S - 8, 3, 3);
        ctx.fillRect(x + S - 8, y + S - 8, 3, 3);
        break;

      case T.HARD:
        ctx.fillStyle = '#a85f32';
        ctx.fillRect(x, y, S, S);
        ctx.fillStyle = '#dba373';
        ctx.fillRect(x, y, S, 4);
        ctx.fillRect(x, y, 4, S);
        ctx.fillStyle = '#6e3716';
        ctx.fillRect(x, y + S - 4, S, 4);
        ctx.fillRect(x + S - 4, y, 4, S);
        break;

      case T.PIPE_TL:
        ctx.fillStyle = '#0d5c12';
        ctx.fillRect(x - 3, y, S + 3.5, S);
        ctx.fillStyle = '#2fb52f';
        ctx.fillRect(x - 1, y + 2, S + 1.5, S - 4);
        ctx.fillStyle = '#8be78b';
        ctx.fillRect(x + 5, y + 2, 7, S - 4);
        ctx.fillStyle = '#5fd35f';
        ctx.fillRect(x + 15, y + 2, 4, S - 4);
        break;
      case T.PIPE_TR:
        ctx.fillStyle = '#0d5c12';
        ctx.fillRect(x, y, S + 3, S);
        ctx.fillStyle = '#2fb52f';
        ctx.fillRect(x, y + 2, S + 1, S - 4);
        ctx.fillStyle = '#1c8a22';
        ctx.fillRect(x + S - 12, y + 2, 9, S - 4);
        break;
      case T.PIPE_L:
        ctx.fillStyle = '#0d5c12';
        ctx.fillRect(x + 1, y, S, S + 0.5);
        ctx.fillStyle = '#2fb52f';
        ctx.fillRect(x + 3, y, S - 2.5, S + 0.5);
        ctx.fillStyle = '#8be78b';
        ctx.fillRect(x + 8, y, 6, S + 0.5);
        ctx.fillStyle = '#5fd35f';
        ctx.fillRect(x + 17, y, 3, S + 0.5);
        break;
      case T.PIPE_R:
        ctx.fillStyle = '#0d5c12';
        ctx.fillRect(x, y, S - 1, S + 0.5);
        ctx.fillStyle = '#2fb52f';
        ctx.fillRect(x, y, S - 3, S + 0.5);
        ctx.fillStyle = '#1c8a22';
        ctx.fillRect(x + S - 14, y, 8, S + 0.5);
        break;
    }
  }

  // ---------- scenery ----------
  function bush(ctx, x, groundY, size) {
    ctx.fillStyle = '#2f9e44';
    for (let i = 0; i < size; i++) circle(ctx, x + 18 + i * 26, groundY - 6, 20);
    circle(ctx, x + 2, groundY, 12);
    circle(ctx, x + 34 + (size - 1) * 26, groundY, 12);
    ctx.fillStyle = '#51cf66';
    for (let i = 0; i < size; i++) circle(ctx, x + 14 + i * 26, groundY - 11, 11);
  }

  function flag(ctx, x, topY, groundY, flagY) {
    ctx.fillStyle = '#6e3716';
    ctx.fillRect(x - 14, groundY - 14, 28, 14);
    ctx.fillStyle = '#a85f32';
    ctx.fillRect(x - 12, groundY - 12, 24, 10);
    ctx.fillStyle = '#e8f0e8';
    ctx.fillRect(x - 2.5, topY, 5, groundY - 14 - topY);
    ctx.fillStyle = '#9db09d';
    ctx.fillRect(x + 1, topY, 1.5, groundY - 14 - topY);
    ctx.fillStyle = '#ffd83d';
    circle(ctx, x, topY - 5, 8);
    ctx.fillStyle = '#e52521';
    ctx.beginPath();
    ctx.moveTo(x - 2, flagY);
    ctx.lineTo(x - 46, flagY + 16);
    ctx.lineTo(x - 2, flagY + 32);
    ctx.fill();
    ctx.fillStyle = '#fff';
    circle(ctx, x - 16, flagY + 16, 5);
  }

  function bricksRect(ctx, x, y, w, h) {
    ctx.fillStyle = '#b0623a';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#6e3716';
    for (let r = 0; r * 12 < h; r++) {
      ctx.fillRect(x, y + r * 12, w, 1.5);
      for (let c = (r % 2) * 12; c < w; c += 24) ctx.fillRect(x + c, y + r * 12, 1.5, Math.min(12, h - r * 12));
    }
  }

  function castle(ctx, x, groundY) {
    const S = TILE, w = 5 * S;
    const battlements = (bx, by, bw) => {
      for (let i = 0; i * 24 < bw; i++) bricksRect(ctx, bx + i * 24, by - 12, Math.min(14, bw - i * 24), 12);
    };
    bricksRect(ctx, x, groundY - 3 * S, w, 3 * S);
    battlements(x, groundY - 3 * S, w);
    bricksRect(ctx, x + S, groundY - 5 * S, 3 * S, 2 * S - 12);
    battlements(x + S, groundY - 5 * S, 3 * S);
    ctx.fillStyle = '#1a0d05';
    ctx.fillRect(x + S * 1.5, groundY - 4.4 * S, S * 0.5, S * 0.8);
    ctx.fillRect(x + S * 3, groundY - 4.4 * S, S * 0.5, S * 0.8);
    ctx.beginPath();                                   // door
    ctx.moveTo(x + 2 * S, groundY);
    ctx.lineTo(x + 2 * S, groundY - S);
    ctx.arc(x + 2.5 * S, groundY - S, S / 2, Math.PI, 0);
    ctx.lineTo(x + 3 * S, groundY);
    ctx.fill();
  }

  const THEMES = [
    { skyTop: '#3f86f5', skyBot: '#bfe3ff', far: '#7fcf8a', near: '#4fae62', cloud: 'rgba(255,255,255,.95)', orb: '#fff6b0', stars: false },
    { skyTop: '#ef5d5a', skyBot: '#ffd79a', far: '#d98a5c', near: '#b05f45', cloud: 'rgba(255,238,220,.9)', orb: '#fff3cf', stars: false },
    { skyTop: '#090e3a', skyBot: '#35449a', far: '#2f5f6e', near: '#1f4553', cloud: 'rgba(170,185,235,.5)', orb: '#f4f6ff', stars: true },
  ];

  function background(ctx, cam, themeIdx, frame, W, H) {
    const th = THEMES[themeIdx % THEMES.length];
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, th.skyTop);
    sky.addColorStop(1, th.skyBot);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    if (th.stars) {
      for (let i = 0; i < 60; i++) {
        const sx = (i * 197.3) % W, sy = (i * 89.7) % (H * 0.6);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + 0.5 * Math.abs(Math.sin(frame * 0.02 + i))})`;
        ctx.fillRect(sx, sy, 2, 2);
      }
    }

    // sun / moon
    ctx.fillStyle = 'rgba(255,255,255,.18)';
    circle(ctx, W - 150, 110, 56);
    ctx.fillStyle = th.orb;
    circle(ctx, W - 150, 110, 38);

    const wrap = (base, factor, period, margin) => (((base - cam * factor) % period) + period) % period - margin;

    // clouds
    ctx.fillStyle = th.cloud;
    for (let i = 0; i < 5; i++) {
      const cx = wrap(i * 300 + frame * 0.12, 0.15, 1500, 200), cy = 70 + ((i * 53) % 110), s = 0.8 + (i % 3) * 0.25;
      circle(ctx, cx, cy, 22 * s);
      circle(ctx, cx + 26 * s, cy - 12 * s, 28 * s);
      circle(ctx, cx + 56 * s, cy, 22 * s);
      ctx.fillRect(cx, cy, 56 * s, 22 * s);
    }

    // hills (two parallax layers)
    const hill = (hx, rx, top) => {
      ctx.beginPath();
      ctx.ellipse(hx, H, rx, H - top, 0, Math.PI, 0);
      ctx.fill();
    };
    ctx.fillStyle = th.far;
    for (let i = 0; i < 4; i++) hill(wrap(i * 420 + 100, 0.2, 1680, 260), 230, 270 + (i % 2) * 50);
    ctx.fillStyle = th.near;
    for (let i = 0; i < 4; i++) hill(wrap(i * 400, 0.45, 1600, 240), 190, 350 + ((i * 7) % 3) * 28);
  }

  return { hero, head, enemy, mushroom, coin, tile, bush, flag, castle, background };
})();
