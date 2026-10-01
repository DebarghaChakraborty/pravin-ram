'use strict';
(() => {
  const W = 960, H = 540;                       // logical game size (canvas is scaled to fit the window)
  const GRAVITY = 0.55, JUMP_V = -13.2, MAX_FALL = 13;
  const WALK_SPEED = 4.4, RUN_SPEED = 6.2, ACCEL = 0.45;
  const HERO_W = 30, SMALL_H = 70, BIG_H = 96;
  const GROUND_Y = GROUND_ROW * TILE;
  const START_TIME = 200;
  const STOMP_POINTS = [100, 200, 400, 800, 1000, 2000, 4000, 8000];
  const FONT = '"Press Start 2P", "Courier New", monospace';

  const $ = id => document.getElementById(id);
  const stage = $('stage'), canvas = $('game'), ctx = canvas.getContext('2d');
  const heroCanvas = $('heroCanvas'), hctx = heroCanvas.getContext('2d');
  let viewScale = 1, heroScale = 1;

  // High score lives only in memory: it survives replays, but a page refresh resets it to 0.
  let highScore = 0;

  const G = {
    state: 'intro', score: 0, coins: 0, lives: 3, levelNum: 1, seed: 1,
    time: START_TIME, frame: 0, camX: 0, combo: 0, newRecord: false,
    banner: 0, timer: 0, clearPhase: '', flagY: 0,
  };
  let level, player, enemies = [], items = [], particles = [], popups = [], bumps = [];

  const input = { left: false, right: false, jump: false, run: false, jumpPressed: false };
  const pad = n => String(n).padStart(6, '0');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ------------------------------------------------------------------ state / screens
  function setState(s) {
    G.state = s;
    stage.dataset.state = s;
    $('intro').classList.toggle('hidden', s !== 'intro');
    $('pause').classList.toggle('hidden', s !== 'paused');
    $('gameover').classList.toggle('hidden', s !== 'gameover');
  }

  function showIntro() {
    Sound.stopMusic();
    level = generateLevel(1, 2024);
    enemies = []; items = []; particles = []; popups = []; bumps = [];
    G.camX = 0;
    $('introHigh').textContent = pad(highScore);
    setState('intro');
    resize();
  }

  function startGame() {
    Sound.init();
    Object.assign(G, { score: 0, coins: 0, lives: 3, levelNum: 1, newRecord: false });
    Object.assign(input, { left: false, right: false, jump: false, run: false, jumpPressed: false });
    loadLevel(true, false);
    setState('playing');
    Sound.startMusic();
  }

  function loadLevel(fresh, keepBig) {
    if (fresh) G.seed = (Math.random() * 1e9) | 0;
    level = generateLevel(G.levelNum, G.seed);
    enemies = level.enemies.map(e => ({
      type: e.type, x: e.col * TILE + 3, y: GROUND_Y - 28, w: 30, h: 28,
      vx: e.type === 'red' ? -1.5 : -1, vy: 0, state: 'walk', active: false, phase: 0, onGround: false,
    }));
    items = []; particles = []; popups = []; bumps = [];
    const h = keepBig ? BIG_H : SMALL_H;
    player = {
      x: 3 * TILE, y: GROUND_Y - h, w: HERO_W, h, vx: 0, vy: 0, facing: 1, big: !!keepBig,
      onGround: true, coyote: 0, jumpBuffer: 0, invuln: 0, walkPhase: 0, hidden: false,
    };
    G.time = START_TIME;
    G.camX = 0;
    G.combo = 0;
    G.banner = 130;
    G.flagY = level.flagTop + 8;
  }

  function gameOver() {
    $('finalScore').textContent = pad(G.score);
    $('finalHigh').textContent = pad(highScore);
    $('newRecord').classList.toggle('hidden', !G.newRecord);
    setState('gameover');
    Sound.sfx.gameover();
  }

  function togglePause() {
    if (G.state === 'playing') { setState('paused'); Sound.stopMusic(); }
    else if (G.state === 'paused') { setState('playing'); Sound.startMusic(); }
  }

  function toggleMute() {
    $('muteBtn').classList.toggle('off', Sound.toggleMute());
  }

  // ------------------------------------------------------------------ score helpers
  function addScore(n, x, y, text) {
    G.score += n;
    if (G.score > highScore) {
      highScore = G.score;
      G.newRecord = true;
    }
    if (x !== undefined) popups.push({ x, y, text: text || String(n), t: 0 });
  }

  function collectCoin(x, y) {
    G.coins++;
    addScore(200);
    Sound.sfx.coin();
    if (G.coins % 50 === 0) {
      G.lives++;
      Sound.sfx.oneup();
      popups.push({ x, y: y - 20, text: '1UP', t: 0 });
    }
  }

  // ------------------------------------------------------------------ tiles & collision
  function tileAt(c, r) {
    if (c < 0 || c >= level.cols) return T.HARD;          // invisible walls at both ends
    if (r < 0 || r >= ROWS) return T.EMPTY;
    return level.tiles[r * level.stride + c];
  }
  const solidAt = (c, r) => tileAt(c, r) !== T.EMPTY;
  const setTile = (c, r, t) => { level.tiles[r * level.stride + c] = t; };

  function moveX(e, dx) {
    e.x += dx;
    const r0 = Math.floor(e.y / TILE), r1 = Math.floor((e.y + e.h - 0.01) / TILE);
    if (dx > 0) {
      const c = Math.floor((e.x + e.w - 0.01) / TILE);
      for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { e.x = c * TILE - e.w; return true; }
    } else if (dx < 0) {
      const c = Math.floor(e.x / TILE);
      for (let r = r0; r <= r1; r++) if (solidAt(c, r)) { e.x = (c + 1) * TILE; return true; }
    }
    return false;
  }

  // Returns null, {hit:'floor'} or {hit:'ceil', c, r} (the block that was bumped from below).
  function moveY(e, dy) {
    e.y += dy;
    const c0 = Math.floor(e.x / TILE), c1 = Math.floor((e.x + e.w - 0.01) / TILE);
    if (dy > 0) {
      const r = Math.floor((e.y + e.h - 0.01) / TILE);
      for (let c = c0; c <= c1; c++) if (solidAt(c, r)) { e.y = r * TILE - e.h; return { hit: 'floor' }; }
    } else if (dy < 0) {
      const r = Math.floor(e.y / TILE), mid = Math.floor((e.x + e.w / 2) / TILE);
      let hitCol = -1;
      for (let c = c0; c <= c1; c++) if (solidAt(c, r) && (hitCol < 0 || c === mid)) hitCol = c;
      if (hitCol >= 0) { e.y = (r + 1) * TILE; return { hit: 'ceil', c: hitCol, r }; }
    }
    return null;
  }

  // Gravity + walking for enemies and mushrooms (they turn around at walls).
  function stepBody(e) {
    e.vy = Math.min(e.vy + GRAVITY, MAX_FALL);
    if (moveX(e, e.vx)) e.vx = -e.vx;
    e.onGround = false;
    const res = moveY(e, e.vy);
    if (res) {
      e.vy = 0;
      if (res.hit === 'floor') e.onGround = true;
    }
  }

  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  function bumpTile(c, r) {
    const t = tileAt(c, r), x = c * TILE, y = r * TILE;
    if (t === T.BRICK) {
      if (player.big) {
        setTile(c, r, T.EMPTY);
        for (let i = 0; i < 4; i++) {
          particles.push({ kind: 'debris', x: x + 9 + (i % 2) * 18, y: y + 9 + (i >> 1) * 18, vx: (i % 2 ? 2.4 : -2.4), vy: i < 2 ? -9 : -6, t: 0 });
        }
        addScore(50);
        Sound.sfx.brick();
      } else {
        bumps.push({ c, r, t: 0 });
        Sound.sfx.bump();
      }
    } else if (t === T.QCOIN) {
      setTile(c, r, T.USED);
      bumps.push({ c, r, t: 0 });
      particles.push({ kind: 'coin', x: x + TILE / 2, y: y - 14, vx: 0, vy: -8, t: 0 });
      collectCoin(x + TILE / 2, y);
      popups.push({ x: x + TILE / 2, y: y - 30, text: '200', t: 0 });
    } else if (t === T.QMUSH) {
      setTile(c, r, T.USED);
      bumps.push({ c, r, t: 0 });
      items.push({ x: x + 3, y: y + 6, w: 30, h: 30, vx: 0, vy: 0, emerge: 36, onGround: false });
      Sound.sfx.sprout();
    } else {
      Sound.sfx.bump();
      return;
    }
    // Whatever is standing on the block gets knocked off / collected.
    for (const e of enemies) {
      if (e.state === 'walk' && Math.abs(e.y + e.h - y) < 5 && e.x + e.w > x && e.x < x + TILE) knockEnemy(e);
    }
    for (const co of level.coins) {
      if (!co.taken && Math.abs(co.x - (x + TILE / 2)) < 18 && Math.abs(co.y - (y - TILE / 2)) < 20) {
        co.taken = true;
        collectCoin(co.x, co.y);
      }
    }
  }

  function knockEnemy(e) {
    e.state = 'flipped';
    e.vy = -7;
    e.vx = e.x + e.w / 2 < player.x + player.w / 2 ? -1.5 : 1.5;
    addScore(100, e.x + e.w / 2, e.y);
    Sound.sfx.stomp();
  }

  // ------------------------------------------------------------------ player
  function updatePlayer() {
    const p = player;
    const max = input.run ? RUN_SPEED : WALK_SPEED;
    if (input.left && !input.right) { p.vx -= ACCEL; p.facing = -1; }
    else if (input.right && !input.left) { p.vx += ACCEL; p.facing = 1; }
    else {
      p.vx *= p.onGround ? 0.8 : 0.96;
      if (Math.abs(p.vx) < 0.1) p.vx = 0;
    }
    p.vx = clamp(p.vx, -max, max);

    // Jump, with a little coyote time and input buffering so it feels fair.
    if (input.jumpPressed) { p.jumpBuffer = 7; input.jumpPressed = false; }
    else if (p.jumpBuffer > 0) p.jumpBuffer--;
    p.coyote = p.onGround ? 6 : Math.max(0, p.coyote - 1);
    if (p.jumpBuffer > 0 && p.coyote > 0) {
      p.vy = JUMP_V;
      p.coyote = 0;
      p.jumpBuffer = 0;
      Sound.sfx.jump();
    }
    if (!input.jump && p.vy < -5) p.vy = -5;              // released early = short hop

    p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
    if (moveX(p, p.vx)) p.vx = 0;
    p.onGround = false;
    const res = moveY(p, p.vy);
    if (res) {
      if (res.hit === 'floor') { p.onGround = true; G.combo = 0; }
      else bumpTile(res.c, res.r);
      p.vy = 0;
    }

    p.walkPhase = p.onGround && Math.abs(p.vx) > 0.3 ? p.walkPhase + Math.abs(p.vx) * 0.085 : 0;
    if (p.invuln > 0) p.invuln--;
    if (p.y > H + 40) die(true);
  }

  function hurt() {
    const p = player;
    if (p.invuln > 0) return;
    if (p.big) {
      p.big = false;
      p.y += BIG_H - SMALL_H;
      p.h = SMALL_H;
      p.invuln = 120;
      Sound.sfx.hurt();
    } else {
      die(false);
    }
  }

  function grow() {
    const p = player;
    if (!p.big) {
      p.big = true;
      p.y -= BIG_H - SMALL_H;
      p.h = BIG_H;
    }
    addScore(1000, p.x + p.w / 2, p.y);
    Sound.sfx.powerup();
  }

  function die(fell) {
    if (G.state !== 'playing') return;
    const p = player;
    if (p.big) { p.big = false; p.y += BIG_H - SMALL_H; p.h = SMALL_H; }
    p.vx = 0;
    p.vy = fell ? 0 : -11;
    G.timer = 0;
    setState('dying');
    Sound.stopMusic();
    Sound.sfx.die();
  }

  function updateDying() {
    const p = player;
    G.timer++;
    if (G.timer > 25) {
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      p.y += p.vy;
    }
    if (G.timer > 150) {
      G.lives--;
      if (G.lives <= 0) return gameOver();
      loadLevel(false, false);
      setState('playing');
      Sound.startMusic();
    }
  }

  // ------------------------------------------------------------------ enemies, items, effects
  function updateEnemies() {
    const p = player;
    for (const e of enemies) {
      if (e.state === 'gone') continue;
      if (!e.active) {
        if (e.x < G.camX + W + 40) e.active = true;
        else continue;
      }
      if (e.state === 'flipped') {
        e.vy += GRAVITY; e.x += e.vx; e.y += e.vy;
        if (e.y > H + 60) e.state = 'gone';
        continue;
      }
      if (e.state === 'squashed') {
        if (--e.timer <= 0) e.state = 'gone';
        continue;
      }
      // Red ones are smarter: they turn around at ledges instead of walking off.
      if (e.type === 'red' && e.onGround) {
        const aheadX = e.vx > 0 ? e.x + e.w + 2 : e.x - 2;
        if (!solidAt(Math.floor(aheadX / TILE), Math.floor((e.y + e.h + 4) / TILE))) e.vx = -e.vx;
      }
      stepBody(e);
      e.phase += 0.16;
      if (e.y > H + 60) { e.state = 'gone'; continue; }

      if (G.state === 'playing' && overlap(p, e)) {
        const feet = p.y + p.h;
        if (p.vy > 0 && feet - p.vy <= e.y + e.h * 0.55) {
          e.state = 'squashed';
          e.timer = 26;
          p.vy = input.jump ? -11 : -6.5;
          addScore(STOMP_POINTS[Math.min(G.combo, STOMP_POINTS.length - 1)], e.x + e.w / 2, e.y);
          G.combo++;
          Sound.sfx.stomp();
        } else {
          hurt();
        }
      }
    }
  }

  function updateItems() {
    for (const m of items) {
      if (m.emerge > 0) {
        m.y -= 1;
        if (--m.emerge === 0) m.vx = 1.7;
      } else {
        stepBody(m);
      }
      if (m.y > H + 60) m.dead = true;
      else if (m.emerge < 12 && G.state === 'playing' && overlap(player, m)) { m.dead = true; grow(); }
    }
    items = items.filter(m => !m.dead);
  }

  function updateCoins() {
    const p = player;
    for (const co of level.coins) {
      if (!co.taken && co.x > p.x - 12 && co.x < p.x + p.w + 12 && co.y > p.y - 12 && co.y < p.y + p.h + 12) {
        co.taken = true;
        collectCoin(co.x, co.y);
        particles.push({ kind: 'spark', x: co.x, y: co.y, vx: 0, vy: 0, t: 0 });
      }
    }
  }

  function updateEffects() {
    for (const q of particles) {
      q.t++;
      if (q.kind !== 'spark') { q.vy += GRAVITY; q.x += q.vx; q.y += q.vy; }
    }
    particles = particles.filter(q => q.kind === 'debris' ? q.y < H + 40 : q.kind === 'coin' ? q.t < 28 : q.t < 14);
    for (const s of popups) { s.t++; s.y -= 0.9; }
    popups = popups.filter(s => s.t < 50);
    for (const bp of bumps) bp.t++;
    bumps = bumps.filter(bp => bp.t < 10);
  }

  function updateCamera() {
    const target = player.x + player.w / 2 - W * 0.42;
    G.camX += (target - G.camX) * 0.14;
    G.camX = clamp(G.camX, 0, level.cols * TILE - W);
  }

  // ------------------------------------------------------------------ level clear (flag pole)
  function startClear() {
    const p = player;
    const height = GROUND_Y - (p.y + p.h);
    const bonus = height > 300 ? 5000 : height > 220 ? 2000 : height > 140 ? 1000 : height > 60 ? 400 : 100;
    p.x = level.flagX - p.w + 6;
    p.y = Math.max(p.y, level.flagTop);
    p.vx = 0; p.vy = 0; p.facing = 1; p.invuln = 0; p.walkPhase = 0;
    addScore(bonus, level.flagX + 30, p.y);
    G.clearPhase = 'slide';
    G.timer = 0;
    setState('clear');
    Sound.stopMusic();
    Sound.sfx.clear();
  }

  function updateClear() {
    const p = player;
    if (G.clearPhase === 'slide') {
      const flagEnd = GROUND_Y - 52;
      p.y = Math.min(p.y + 3.5, GROUND_Y - p.h);
      G.flagY = Math.min(G.flagY + 4, flagEnd);
      p.onGround = p.y >= GROUND_Y - p.h;
      if (p.onGround && G.flagY >= flagEnd && ++G.timer > 20) { G.clearPhase = 'walk'; G.timer = 0; }
    } else if (G.clearPhase === 'walk') {
      p.vy = Math.min(p.vy + GRAVITY, MAX_FALL);
      moveX(p, 2.6);
      p.onGround = false;
      const res = moveY(p, p.vy);
      if (res) { p.vy = 0; p.onGround = true; }
      p.walkPhase += 0.24;
      if (p.x + p.w / 2 >= level.castleX + 2.5 * TILE) { p.hidden = true; G.clearPhase = 'tally'; }
    } else {
      if (G.time > 0) {
        const d = Math.min(G.time, 2);
        G.time -= d;
        addScore(d * 20);
        if (G.frame % 4 === 0) Sound.sfx.tick();
      } else if (++G.timer > 90) {
        G.levelNum++;
        loadLevel(true, p.big);
        setState('playing');
        Sound.startMusic();
      }
    }
  }

  // ------------------------------------------------------------------ main update
  function update() {
    G.frame++;
    switch (G.state) {
      case 'intro':
        G.camX = (0.5 - 0.5 * Math.cos(G.frame / 700)) * (level.cols * TILE - W);
        break;
      case 'playing':
        if (G.banner > 0) G.banner--;
        if (G.frame % 60 === 0 && --G.time <= 0) { G.time = 0; die(false); break; }
        updatePlayer();
        updateEnemies();
        updateItems();
        if (G.state === 'playing') {
          updateCoins();
          if (player.x + player.w >= level.flagX - 2) startClear();
        }
        updateEffects();
        updateCamera();
        break;
      case 'dying':
        updateDying();
        updateEnemies();
        updateEffects();
        break;
      case 'clear':
        updateClear();
        updateEffects();
        updateCamera();
        break;
    }
  }

  // ------------------------------------------------------------------ rendering
  function text(str, x, y, size, color, align) {
    ctx.font = `${size}px ${FONT}`;
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(0,0,0,.55)';
    ctx.fillText(str, x + 2, y + 2);
    ctx.fillStyle = color || '#fff';
    ctx.fillText(str, x, y);
  }

  function drawWorld(cam) {
    const c0 = Math.max(0, Math.floor(cam / TILE) - 1), c1 = Math.min(level.cols - 1, c0 + Math.ceil(W / TILE) + 2);

    for (const d of level.deco) if (d.col >= c0 - 4 && d.col <= c1) Sprites.bush(ctx, d.col * TILE, GROUND_Y, d.size);
    Sprites.castle(ctx, level.castleX, GROUND_Y);
    Sprites.flag(ctx, level.flagX, level.flagTop, GROUND_Y, G.flagY);

    for (const m of items) Sprites.mushroom(ctx, m);       // behind tiles, so it rises out of its block

    for (let r = 0; r < ROWS; r++) {
      for (let c = c0; c <= c1; c++) {
        const t = level.tiles[r * level.stride + c];
        if (t === T.EMPTY) continue;
        let y = r * TILE;
        if (bumps.length) {
          const bp = bumps.find(q => q.c === c && q.r === r);
          if (bp) y -= Math.sin(bp.t / 10 * Math.PI) * 9;
        }
        Sprites.tile(ctx, t, c * TILE, y, G.frame, t === T.GROUND && r === GROUND_ROW);
      }
    }

    for (const co of level.coins) {
      if (!co.taken && co.x > cam - 20 && co.x < cam + W + 20) Sprites.coin(ctx, co.x, co.y, G.frame + co.x * 0.05);
    }
    for (const e of enemies) if (e.active && e.state !== 'gone') Sprites.enemy(ctx, e);

    if (G.state !== 'intro' && player && !player.hidden) {
      const p = player;
      if (p.invuln % 8 < 4) {
        Sprites.hero(ctx, p.x, p.y, p.w, p.h, { facing: p.facing, phase: p.walkPhase, air: G.state === 'dying' || !p.onGround });
      }
    }

    for (const q of particles) {
      if (q.kind === 'coin') Sprites.coin(ctx, q.x, q.y, q.t * 4);
      else if (q.kind === 'debris') {
        ctx.fillStyle = '#c8501a';
        ctx.fillRect(q.x - 6, q.y - 6, 12, 12);
        ctx.fillStyle = '#5b1e05';
        ctx.fillRect(q.x - 6, q.y, 12, 2);
      } else {
        ctx.strokeStyle = `rgba(255,240,150,${1 - q.t / 14})`;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(q.x, q.y, 6 + q.t * 1.5, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    for (const s of popups) text(s.text, s.x, s.y, 10, '#fff', 'center');
  }

  function drawHud() {
    const hurry = G.time <= 30 && G.state === 'playing' && G.frame % 30 < 15;
    text('SCORE', 28, 14, 13);
    text(pad(G.score), 28, 34, 13);

    text('COINS', 190, 14, 13);
    Sprites.coin(ctx, 198, 41, G.frame);
    text('x' + String(G.coins).padStart(2, '0'), 214, 34, 13);

    text('WORLD', 340, 14, 13);
    text(`${Math.ceil(G.levelNum / 3)}-${(G.levelNum - 1) % 3 + 1}`, 340, 34, 13);

    text('TIME', 485, 14, 13);
    text(String(Math.ceil(G.time)).padStart(3, '0'), 485, 34, 13, hurry ? '#ff5a4d' : '#fff');

    text('LIVES', 600, 14, 13);
    Sprites.head(ctx, 600, 30, 16.5, 21.5);
    text('x' + G.lives, 622, 34, 13);

    text('HIGH', 730, 14, 13, '#ffd83d');
    text(pad(highScore), 730, 34, 13, '#ffd83d');

    if (G.state === 'playing' && G.banner > 0) {
      ctx.globalAlpha = Math.min(1, G.banner / 30);
      text(`WORLD ${Math.ceil(G.levelNum / 3)}-${(G.levelNum - 1) % 3 + 1}`, W / 2, 190, 30, '#ffd83d', 'center');
      text('GET READY!', W / 2, 240, 16, '#fff', 'center');
      ctx.globalAlpha = 1;
    }
    if (G.state === 'clear') {
      text('COURSE CLEAR!', W / 2, 170, 30, '#ffd83d', 'center');
      if (G.clearPhase === 'tally') text('TIME BONUS  ' + String(G.time).padStart(3, '0') + ' x 20', W / 2, 222, 14, '#fff', 'center');
    }
  }

  function drawIntroHero() {
    if (!heroCanvas.width) return;
    const t = G.frame;
    hctx.setTransform(heroScale, 0, 0, heroScale, 0, 0);
    hctx.clearRect(0, 0, 320, 430);
    const glow = hctx.createRadialGradient(160, 215, 20, 160, 215, 158);
    glow.addColorStop(0, 'rgba(255,230,120,.55)');
    glow.addColorStop(1, 'rgba(255,230,120,0)');
    hctx.fillStyle = glow;
    hctx.fillRect(0, 0, 320, 430);
    const hop = Math.abs(Math.sin(t * 0.06)) * 14;
    hctx.fillStyle = 'rgba(0,0,0,.35)';
    hctx.beginPath();
    hctx.ellipse(160, 408, 95 - hop * 1.5, 13, 0, 0, Math.PI * 2);
    hctx.fill();
    Sprites.hero(hctx, 90, 48 - hop, 140, 352, { facing: 1, phase: t * 0.12 });
  }

  function render() {
    ctx.setTransform(viewScale, 0, 0, viewScale, 0, 0);
    const cam = Math.round(G.camX * viewScale) / viewScale;
    Sprites.background(ctx, cam, level.theme, G.frame, W, H);
    ctx.save();
    ctx.translate(-cam, 0);
    drawWorld(cam);
    ctx.restore();
    if (G.state === 'intro') drawIntroHero();
    else drawHud();
  }

  // ------------------------------------------------------------------ sizing
  function resize() {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    stage.style.setProperty('--u', r.width / W + 'px');
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    viewScale = canvas.width / W;
    const hr = heroCanvas.getBoundingClientRect();
    if (hr.width) {
      heroCanvas.width = Math.round(hr.width * dpr);
      heroCanvas.height = Math.round(hr.height * dpr);
      heroScale = heroCanvas.width / 320;
    }
  }

  // ------------------------------------------------------------------ input
  const KEYS = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump',
    ShiftLeft: 'run', ShiftRight: 'run', KeyX: 'run',
  };
  const inGame = () => G.state !== 'intro' && G.state !== 'gameover' && G.state !== 'paused';

  function press(k, down) {
    if (k === 'jump' && down && !input.jump) input.jumpPressed = true;
    input[k] = down;
  }

  addEventListener('keydown', e => {
    const k = KEYS[e.code];
    if (k) {
      if (inGame()) e.preventDefault();
      press(k, true);
      return;
    }
    if (e.repeat) return;
    if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
    else if (e.code === 'KeyM') toggleMute();
    else if (e.code === 'Enter') {
      if (G.state === 'intro' || G.state === 'gameover') { e.preventDefault(); startGame(); }
      else if (G.state === 'paused') { e.preventDefault(); togglePause(); }
    }
  });
  addEventListener('keyup', e => {
    const k = KEYS[e.code];
    if (!k) return;
    if (inGame()) e.preventDefault();
    press(k, false);
  });

  const onClick = (id, fn) => $(id).addEventListener('click', e => { e.currentTarget.blur(); fn(); });
  onClick('startBtn', startGame);
  onClick('againBtn', startGame);
  onClick('homeBtn', showIntro);
  onClick('quitBtn', showIntro);
  onClick('resumeBtn', togglePause);
  onClick('pauseBtn', togglePause);
  onClick('muteBtn', toggleMute);

  // Touch controls appear the first time the screen is actually touched.
  addEventListener('touchstart', () => document.body.classList.add('touch'), { passive: true });
  for (const btn of document.querySelectorAll('#touch button')) {
    const set = down => e => {
      e.preventDefault();
      press(btn.dataset.key, down);
      btn.classList.toggle('on', down);
    };
    btn.addEventListener('pointerdown', set(true));
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) btn.addEventListener(ev, set(false));
  }
  addEventListener('contextmenu', e => e.preventDefault());

  addEventListener('blur', () => {
    Object.assign(input, { left: false, right: false, jump: false, run: false });
    if (G.state === 'playing') togglePause();
  });
  addEventListener('resize', resize);

  // ------------------------------------------------------------------ main loop (fixed 60 updates/second)
  const STEP = 1000 / 60;
  let last = 0, acc = 0;
  function loop(ts) {
    requestAnimationFrame(loop);
    acc += Math.min(ts - last, 100);
    last = ts;
    while (acc >= STEP) { update(); acc -= STEP; }
    render();
  }

  showIntro();
  requestAnimationFrame(loop);
})();
