/* pixel-world.js — retired Techo canvas engine (kept for reference; init skipped).
 *
 * Renders a dense, living pixel-art business street on stacked Canvas 2D layers
 * (no WebGL, works offline, zero external assets). Art direction follows three
 * binding reference images: sunset market street, daylight building panorama,
 * and a detailed market stall interior.
 *
 *   - dukaan    : Dukaan Market — sunset market street (default)
 *   - office    : Startup Block — dusk skyline, office towers
 *   - district  : Business District — daylight commercial street
 *
 * Each scene = 4 parallax layers (sky + distant skyline / mid buildings /
 * storefront street row / walkway + foreground). Layers are pre-rendered;
 * animated elements repaint per frame (clouds, window flicker, steam, string
 * lights, sign glow, delivery cart). No crowds, no people, no vehicles, no
 * flashing, no screen shake.
 *
 * Honest performance handling:
 *   - prefers-reduced-motion / body.reduced  → single static composite frame
 *   - body.low-perf                          → static frame
 *   - document hidden                        → animation paused
 *   - small screens                          → fewer animated details
 */

const PixelWorld = (() => {
  'use strict';

  const GW = 560;
  const GH = 340;
  const LAYER_NAMES = ['sky', 'buildings', 'shop', 'fore'];
  const MOBILE = typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;

  let _seed = 1337;
  function rand() { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; }
  function resetSeed(s) { _seed = s || 1337; }

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }
  function r(ctx, x, y, w, h, c) {
    if (c) ctx.fillStyle = c;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
  function o(ctx, x, y, w, h, c) {
    ctx.strokeStyle = c;
    ctx.strokeRect(Math.round(x) + 0.5, Math.round(y) + 0.5, Math.round(w) - 1, Math.round(h) - 1);
  }

  // --- scene palettes (binding: reference images) --------------------------
  const SCENES = {
    dukaan: {
      name: 'Dukaan Market',
      tagline: 'Aap ka byapar saathi',
      desc: 'Warm sunset market street',
      class: 'sc-dukaan',
      time: 'sunset',
      // saturated sunset sky — ref 1: purple → magenta → orange → gold
      sky: ['#2A1040', '#4A1848', '#7A2A4A', '#B04838', '#D87830', '#E8A830', '#F0C840'],
      sun: { x: 0.72, y: 108, r: 20, c: '#FFE080', glow: '#F0A030', glow2: '#E08828' },
      // bg buildings — tall silhouettes against sunset
      bg: { base: '#1E1030', roof: '#160C28', win: '#FFD060', win2: '#FF8C40', antenna: '#160C28' },
      // mid buildings — warm dark tones
      mid: ['#3E1E38', '#4A2A3A', '#5C3242', '#4C2838', '#3A2434', '#522E40'],
      midRoof: '#221430', midWin: '#1E1028', midWinLit: '#FFD060', midWinWarm: '#FF8C40',
      // shop storefront row — warm market tones
      shop: {
        brick: '#A05838', brick2: '#8A4A30', brick3: '#B86840',
        cream: '#EFD9B4', wood: '#7A4A2A', wood2: '#5E3820',
        awnTeal: '#2E8880', awnCream: '#E8D4B8', awnRed: '#C84A3A',
        sign: '#D04A38', signBlue: '#2E78A0', signText: '#FFF4D6',
        glow: '#FFB040', glowWarm: '#FF8C40', produce: '#3E7A4A'
      },
      street: { walk: '#3A3240', walk2: '#4A3E4A', road: '#2A2028', line: '#FFD060', side: '#1E1820' }
    },

    office: {
      name: 'Startup Block',
      tagline: 'Aap ka byapar saathi',
      desc: 'Dusk skyline office towers',
      class: 'sc-office',
      time: 'dusk',
      sky: ['#0A0E28', '#101840', '#182258', '#222E68', '#2E3E88', '#3E5898', '#4A6AA5'],
      sun: { x: 0.14, y: 68, r: 12, c: '#D8E8F8', glow: '#6A88C0', glow2: '#4A68A8' },
      bg: { base: '#0E1230', roof: '#0A0E28', win: '#FFD060', win2: '#78D0E0', antenna: '#0A0E28' },
      mid: ['#141E40', '#1C2850', '#222E58', '#1A2648', '#202C5A', '#283468'],
      midRoof: '#0E1230', midWin: '#0C1028', midWinLit: '#FFD060', midWinWarm: '#78D0E0',
      shop: {
        brick: '#8A4A48', brick2: '#784038', brick3: '#985850',
        cream: '#E8DCC8', wood: '#6A4830', wood2: '#503828',
        awnTeal: '#2E8880', awnCream: '#E0D0BC', awnRed: '#A04840',
        sign: '#6A3048', signBlue: '#2868A0', signText: '#FFF3D8',
        glow: '#FFB040', glowWarm: '#FF8C40', produce: '#3E7A4A'
      },
      street: { walk: '#1A2040', walk2: '#222850', road: '#101428', line: '#6A88C0', side: '#0E1028' }
    },

    district: {
      name: 'Business District',
      tagline: 'Aap ka byapar saathi',
      desc: 'Daylight commercial street',
      class: 'sc-district',
      time: 'day',
      sky: ['#80CCE8', '#98D8F0', '#B0E2F4', '#C8ECF8', '#DCF4FC', '#EFF8FF'],
      sun: { x: 0.86, y: 50, r: 28, c: '#FFFFF0', glow: '#F8F0C8', glow2: '#E8E0B8' },
      bg: { base: '#8898B0', roof: '#7888A0', win: '#4A5A78', win2: '#586888', antenna: '#7888A0' },
      mid: ['#C8785C', '#D89068', '#B86848', '#E8A878', '#C88868', '#D09870'],
      midRoof: '#A86848', midWin: '#4A5570', midWinLit: '#6080A0', midWinWarm: '#F0C840',
      shop: {
        brick: '#B86040', brick2: '#A05030', brick3: '#C87050',
        cream: '#F0E4C8', wood: '#8A5A38', wood2: '#6A4028',
        awnTeal: '#2E8880', awnCream: '#F0E0C8', awnRed: '#C84A3A',
        sign: '#C84A38', signBlue: '#2E78A0', signText: '#FFF4D6',
        glow: '#FFB040', glowWarm: '#FF8C40', produce: '#3E8A4A'
      },
      street: { walk: '#C0BCB0', walk2: '#B0ACA0', road: '#8A8880', line: '#F0E8C8', side: '#70706A' }
    }
  };

  const SCENE_ORDER = ['dukaan', 'office', 'district'];

  // --- state ---------------------------------------------------------------
  let current = null;
  let rootSel = null;
  let layerBase = {};
  let layerAnim = {};
  let animState = {};
  let rafId = 0;
  let staticBaked = {};
  let clouds = [];
  let staticPc = null;

  // --- drawing primitives ---------------------------------------------------
  function pw(v) { return v | 0; }

  function band(ctx, y, h, c) { r(ctx, 0, pw(y), GW, pw(h) + 1, c); }

  function gradV(ctx, x, y, w, h, c1, c2) {
    const g = ctx.createLinearGradient(0, pw(y), 0, pw(y + h));
    g.addColorStop(0, c1); g.addColorStop(1, c2);
    ctx.fillStyle = g; ctx.fillRect(pw(x), pw(y), pw(w), pw(h) + 1);
  }

  // --- building painters ---------------------------------------------------
  function paintSky(ctx, s) {
    const n = s.sky.length;
    const h = Math.round(GH * 0.32);
    for (let i = 0; i < n; i++) {
      band(ctx, h * i / n, h / n + 1, s.sky[i]);
    }
    // sun/moon
    const sun = s.sun;
    ctx.globalAlpha = 0.3;
    r(ctx, sun.x * GW - sun.r * 2, sun.y - sun.r * 2, sun.r * 4, sun.r * 4, sun.glow2);
    ctx.globalAlpha = 0.5;
    r(ctx, sun.x * GW - sun.r * 1.3, sun.y - sun.r * 1.3, sun.r * 2.6, sun.r * 2.6, sun.glow);
    ctx.globalAlpha = 1;
    r(ctx, sun.x * GW - sun.r, sun.y - sun.r, sun.r * 2, sun.r * 2, sun.c);
    // stars (dusk/sunset only)
    if (s.time === 'dusk' || s.time === 'sunset') {
      resetSeed(42);
      const n2 = s.time === 'dusk' ? 50 : 24;
      for (let i = 0; i < n2; i++) {
        const sx = rand() * GW, sy = rand() * h * 0.65;
        ctx.globalAlpha = 0.2 + rand() * 0.7;
        r(ctx, sx, sy, 1, 1, '#E8F0FF');
        if (rand() > 0.8) r(ctx, sx, sy, 2, 1, '#E8F0FF');
      }
      ctx.globalAlpha = 1;
    }
  }

  function paintBgSkyline(ctx, s) {
    // Tall background skyscrapers — reaching high (up to y=30 for tallest)
    const baseY = Math.round(GH * 0.38);
    resetSeed(s.time === 'day' ? 200 : 100);
    let x = -4;
    while (x < GW + 8) {
      const w = 16 + rand() * 26;
      const tall = rand();
      const hgt = tall > 0.85 ? 100 + rand() * 35 :
                  tall > 0.6  ? 60 + rand() * 30 :
                  tall > 0.3  ? 35 + rand() * 25 :
                               18 + rand() * 18;
      const top = baseY - hgt;
      // building body
      r(ctx, x, top, w, hgt + 2, s.bg.base);
      // roofline
      r(ctx, x, top, w, 2, s.bg.roof);
      // antenna/spire on tall ones
      if (hgt > 70 && rand() > 0.5) {
        r(ctx, x + w / 2, top - 6, 1, 8, s.bg.antenna);
        r(ctx, x + w / 2 - 1, top - 6, 3, 1, s.bg.antenna);
        if (rand() > 0.5) r(ctx, x + w / 2, top - 10, 1, 4, s.bg.antenna);
      }
      // water tank on some
      if (hgt > 40 && rand() > 0.55) {
        const tw = 6, th = 4;
        r(ctx, x + w / 2 - tw / 2, top - th - 1, tw, th, s.bg.roof);
        r(ctx, x + w / 2 - 1, top - th - 3, 2, 2, s.bg.roof);
      }
      // window grid — DENSE warm lights
      const cols = Math.max(1, Math.floor((w - 3) / 5));
      const rows = Math.max(1, Math.floor((hgt - 5) / 7));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const lx = x + 2 + cx * 5, ly = top + 3 + cy * 7;
          if (rand() > 0.35) {
            r(ctx, lx, ly, 2, 2, rand() > 0.4 ? s.bg.win : s.bg.win2);
          }
        }
      }
      x += w + 1 + rand() * 2;
    }
  }

  function paintMidBuildings(ctx, s) {
    const baseY = Math.round(GH * 0.78);
    resetSeed(s.time === 'day' ? 300 : 150);
    let x = -6;
    let idx = 0;
    while (x < GW + 14) {
      const w = 24 + rand() * 20;
      const hgt = 46 + rand() * 52;
      const top = baseY - hgt;
      const col = s.mid[idx % s.mid.length];
      idx++;
      // facade
      r(ctx, x, top, w, hgt, col);
      // cornice
      r(ctx, x - 1, top, w + 2, 3, s.midRoof);
      r(ctx, x, top + 3, w, 1, 'rgba(255,255,255,0.06)');
      // rooftop greenery
      if (rand() > 0.5) {
        r(ctx, x + 2, top - 2, w - 4, 3, '#3E7A4A');
        for (let gx = x + 3; gx < x + w - 4; gx += 4) {
          r(ctx, gx, top - 3, 2, 2, rand() > 0.5 ? '#4A8A54' : '#2E6A3A');
        }
      }
      // water tank
      if (rand() > 0.4) {
        r(ctx, x + w / 2 - 3, top - 5, 7, 5, s.midRoof);
        r(ctx, x + w / 2 - 1, top - 7, 3, 2, s.midRoof);
      }
      // small balcony
      if (rand() > 0.6 && hgt > 55) {
        const by = top + 18;
        r(ctx, x + 4, by, 8, 3, s.midRoof);
        r(ctx, x + 4, by + 1, 1, 2, s.midRoof);
        r(ctx, x + 11, by + 1, 1, 2, s.midRoof);
        if (rand() > 0.5) r(ctx, x + 6, by - 1, 3, 2, '#3E7A4A');
      }
      // wall sign
      if (rand() > 0.5) {
        const sw = Math.min(w - 8, 18);
        r(ctx, x + (w - sw) / 2, top + 8, sw, 5, s.shop.sign);
        for (let i = 0; i < sw / 4; i++) r(ctx, x + (w - sw) / 2 + 2 + i * 3, top + 9, 2, 3, s.shop.signText);
      }
      // window grid — DENSE, many lit
      const cols = Math.max(1, Math.floor((w - 6) / 7));
      const rows = Math.max(2, Math.floor((hgt - 20) / 9));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const lx = x + 4 + cx * 7, ly = top + 14 + cy * 9;
          // window frame
          r(ctx, lx, ly, 3, 4, s.midWin);
          r(ctx, lx + 1, ly + 1, 1, 2, s.midWin);
          if (rand() > 0.45) {
            r(ctx, lx, ly, 3, 3, rand() > 0.5 ? s.midWinLit : s.midWinWarm);
          }
        }
      }
      x += w + 1;
    }
  }

  function awning(ctx, x, y, w, c1, c2) {
    const n = Math.max(3, Math.round(w / 7));
    const seg = w / n;
    for (let i = 0; i < n; i++) {
      r(ctx, pw(x + i * seg), pw(y), Math.ceil(seg) + 1, 6, i % 2 ? c2 : c1);
    }
    r(ctx, pw(x), pw(y + 5), pw(w), 1, 'rgba(0,0,0,0.25)');
  }

  function signBoard(ctx, x, y, w, bg, fg, text, glowColor) {
    // hanger
    r(ctx, pw(x + w / 2 - 0.5), pw(y - 5), 1, 5, '#2A1E30');
    r(ctx, pw(x + w / 2 - 2), pw(y - 6), 4, 1, '#2A1E30');
    // glow behind sign (neon effect from reference)
    if (glowColor) {
      ctx.globalAlpha = 0.4;
      r(ctx, pw(x - 2), pw(y - 2), pw(w + 4), pw(13), glowColor);
      ctx.globalAlpha = 0.2;
      r(ctx, pw(x - 4), pw(y - 4), pw(w + 8), pw(17), glowColor);
      ctx.globalAlpha = 1;
    }
    // board
    r(ctx, pw(x), pw(y), pw(w), 9, bg);
    r(ctx, pw(x), pw(y + 8), pw(w), 2, 'rgba(0,0,0,0.35)');
    // text pixels (simplified letterforms)
    const tw = Math.max(3, Math.floor(w / (text.length + 1)));
    for (let i = 0; i < text.length; i++) {
      const tx = pw(x + 2 + i * (tw + 1));
      // blocky letter representation
      r(ctx, tx, pw(y + 2), 2, 5, fg);
      if (i % 2 === 0) r(ctx, tx + 2, pw(y + 3), 2, 3, fg);
      if (text[i] !== ' ') { r(ctx, tx, pw(y + 2), tw - 1, 1, fg); }
    }
  }

  function drawProducts(ctx, x0, y0, w, h) {
    // dense product shelves — reference 3 style
    const rows = Math.floor(h / 8);
    for (let row = 0; row < rows; row++) {
      const sy = y0 + 3 + row * 8;
      // shelf
      r(ctx, x0 + 1, sy + 5, w - 2, 1, 'rgba(0,0,0,0.3)');
      // products on shelf
      let px2 = x0 + 2;
      while (px2 < x0 + w - 3) {
        const pw2 = 2 + Math.floor(rand() * 2);
        const ph = 3 + Math.floor(rand() * 3);
        const colors = ['#F59E0B', '#22C55E', '#EF4444', '#FDE68A', '#14B8A6', '#8B5CF6', '#F87171', '#FCD34D'];
        const c = colors[Math.floor(rand() * colors.length)];
        r(ctx, px2, sy + 5 - ph, pw2, ph, c);
        if (rand() > 0.6) r(ctx, px2, sy + 5 - ph, pw2, 1, '#FFF');
        px2 += pw2 + 1;
      }
    }
  }

  function paintShopRow(ctx, s) {
    const SH = s.shop;
    const baseY = Math.round(GH * 0.78);
    const topY = baseY - 76;

    // sidewalk
    r(ctx, 0, baseY, GW, 10, s.street.walk);
    r(ctx, 0, baseY, GW, 1, s.street.walk2);
    r(ctx, 0, baseY - 1, GW, 1, 'rgba(255,255,255,0.06)');

    // ===== SHOP A — General Store "DUKAAN" (left) =====
    const ax = 16, aw = 110, atop = topY + 4;
    r(ctx, ax, atop, aw, baseY - atop, SH.brick);
    r(ctx, ax, atop, aw, 3, SH.brick2); // cornice top
    awning(ctx, ax + 3, atop + 4, aw - 6, SH.awnTeal, SH.awnCream);
    // big display window with dense shelves (reference 3 style)
    r(ctx, ax + 4, atop + 12, 58, 38, '#241A28');
    r(ctx, ax + 5, atop + 13, 56, 36, '#2E2228');
    resetSeed(s.time === 'day' ? 500 : 400);
    drawProducts(ctx, ax + 6, atop + 14, 54, 34);
    o(ctx, ax + 4, atop + 12, 58, 38, '#151A22');
    r(ctx, ax + 33, atop + 12, 1, 38, '#151A22');
    // warm light spill from window
    ctx.globalAlpha = 0.4;
    r(ctx, ax + 4, baseY + 2, 58, 3, SH.glow);
    ctx.globalAlpha = 0.2;
    r(ctx, ax + 2, baseY + 4, 62, 2, SH.glow);
    ctx.globalAlpha = 1;
    // door
    r(ctx, ax + 68, atop + 20, 18, baseY - atop - 20, SH.wood);
    r(ctx, ax + 69, atop + 21, 16, baseY - atop - 22, SH.wood2);
    r(ctx, ax + 72, atop + 26, 6, 5, '#E8D4B8'); // window in door
    r(ctx, ax + 82, atop + 44, 2, 3, SH.glow); // knob
    // signboard
    signBoard(ctx, ax + aw / 2 - 22, topY - 18, 44, SH.sign, SH.signText, 'DUKAAN', '#FFB040');
    // crates + sacks at door
    r(ctx, ax + 88, baseY - 10, 10, 10, '#B45309');
    r(ctx, ax + 99, baseY - 12, 8, 12, '#C75914');
    r(ctx, ax + 88, baseY - 10, 10, 2, '#FDE68A');
    r(ctx, ax + 93, baseY - 12, 12, 12, '#B45309');
    r(ctx, ax + 93, baseY - 12, 12, 2, '#FDE68A');
    r(ctx, ax + 108, baseY - 8, 8, 8, '#C75914');
    // sacks
    r(ctx, ax + 6, baseY - 6, 8, 6, '#C9A24A');
    r(ctx, ax + 16, baseY - 8, 8, 8, '#D8BC62');
    r(ctx, ax + 12, baseY - 6, 10, 6, '#C9A24A');

    // ===== SHOP B — Chai Stall (center-left) =====
    const bx = 130, bw2 = 80, btop = topY + 10;
    r(ctx, bx, btop, bw2, baseY - btop, SH.wood);
    r(ctx, bx - 1, btop, 3, baseY - btop, SH.wood2);
    // cloth awning
    awning(ctx, bx + 2, btop + 5, bw2 - 4, SH.awnRed, SH.awnCream);
    // counter
    r(ctx, bx + 8, baseY - 22, bw2 - 16, 8, SH.cream);
    r(ctx, bx + 8, baseY - 14, bw2 - 16, 2, SH.brick2);
    // pot + cups
    r(ctx, bx + 16, baseY - 28, 10, 7, '#3E7A4A');
    r(ctx, bx + 18, baseY - 29, 6, 2, '#2E6A3A');
    r(ctx, bx + 32, baseY - 27, 8, 6, SH.glow); // stove glow
    r(ctx, bx + 46, baseY - 22, 4, 4, SH.wood);
    r(ctx, bx + 52, baseY - 22, 4, 4, SH.wood);
    r(ctx, bx + 58, baseY - 22, 4, 4, SH.wood);
    // menu board
    r(ctx, bx + bw2 - 24, btop + 12, 20, 16, '#241A28');
    r(ctx, bx + bw2 - 23, btop + 13, 18, 14, '#2E2228');
    for (let i = 0; i < 4; i++) r(ctx, bx + bw2 - 21, btop + 15 + i * 3, 14, 1, SH.cream);
    // hanging sign
    signBoard(ctx, bx + bw2 / 2 - 18, btop - 18, 36, SH.sign, SH.signText, 'CHAI', '#2EE8D8');
    // hanging bulbs
    r(ctx, bx + 12, btop + 6, 2, 2, '#FDE68A');
    r(ctx, bx + 50, btop + 6, 2, 2, '#FDE68A');
    r(ctx, bx + 68, btop + 6, 2, 2, '#FDE68A');

    // ===== SHOP C — Fresh Produce (center-right) =====
    const cx = 214, cw = 88, ctop = topY + 4;
    r(ctx, cx, ctop, cw, baseY - ctop, '#B86040');
    r(ctx, cx, ctop, cw, 3, '#A05030');
    awning(ctx, cx + 2, ctop + 4, cw - 4, SH.awnCream, SH.awnRed);
    // wooden crates with produce — dense display (reference 3 style)
    for (let cr = 0; cr < 5; cr++) {
      const cxx = cx + 6 + cr * 16, cyy = baseY - 30;
      r(ctx, cxx, cyy, 14, 12, SH.wood);
      r(ctx, cxx + 1, cyy + 1, 12, 10, SH.wood2);
      const prods = ['#3E7A4A', '#F59E0B', '#EF4444', '#22C55E', '#F87171'];
      const p = prods[cr % 5];
      r(ctx, cxx + 2, cyy + 2, 4, 3, p);
      r(ctx, cxx + 7, cyy + 2, 4, 3, prods[(cr + 1) % 5]);
      r(ctx, cxx + 2, cyy + 6, 9, 3, prods[(cr + 2) % 5]);
    }
    // baskets in front
    r(ctx, cx + cw - 20, baseY - 14, 12, 8, '#B45309');
    r(ctx, cx + cw - 20, baseY - 16, 12, 2, '#C75914');
    r(ctx, cx + cw - 8, baseY - 12, 8, 8, '#C9A24A');
    // sign
    signBoard(ctx, cx + cw / 2 - 18, ctop - 18, 36, SH.sign, SH.signText, 'FRESH', '#22C55E');
    // product shelves in window
    r(ctx, cx + 4, ctop + 12, 48, 28, '#241A28');
    r(ctx, cx + 5, ctop + 13, 46, 26, '#2E2228');
    resetSeed(600);
    drawProducts(ctx, cx + 6, ctop + 14, 44, 24);

    // ===== SHOP D — Courier "PARCEL" (right) =====
    const dx = 306, dw = 120, dtop = topY + 4;
    r(ctx, dx, dtop, dw, baseY - dtop, SH.brick2);
    r(ctx, dx, dtop, dw, 3, SH.brick);
    awning(ctx, dx + 3, dtop + 4, dw - 6, SH.awnTeal, SH.awnCream);
    // counter with parcels — reference 3 style
    r(ctx, dx + 6, dtop + 12, 48, 34, SH.wood);
    r(ctx, dx + 7, dtop + 13, 46, 32, SH.wood2);
    // parcels on shelf
    resetSeed(700);
    drawProducts(ctx, dx + 8, dtop + 14, 44, 30);
    o(ctx, dx + 6, dtop + 12, 48, 34, '#151A22');
    // door
    r(ctx, dx + 58, dtop + 18, 22, baseY - dtop - 18, SH.wood);
    r(ctx, dx + 59, dtop + 19, 20, baseY - dtop - 20, SH.wood2);
    r(ctx, dx + 75, dtop + 40, 2, 3, SH.glow);
    // signboard
    signBoard(ctx, dx + dw / 2 - 22, dtop - 18, 44, SH.sign, SH.signText, 'PARCEL', '#FFD060');
    // package stacks
    r(ctx, dx + 84, baseY - 14, 10, 14, '#B45309');
    r(ctx, dx + 84, baseY - 14, 10, 2, '#FDE68A');
    r(ctx, dx + 96, baseY - 12, 10, 12, '#C75914');
    r(ctx, dx + 96, baseY - 12, 10, 2, '#FDE68A');
    r(ctx, dx + 88, baseY - 16, 12, 16, '#B45309');
    r(ctx, dx + 88, baseY - 16, 12, 2, '#FDE68A');
    // delivery cart beside shop
    r(ctx, dx + 108, baseY - 4, 14, 6, '#5E3820');
    r(ctx, dx + 110, baseY - 8, 10, 4, SH.wood);
    r(ctx, dx + 110, baseY - 8, 10, 2, '#FDE68A');
    r(ctx, dx + 106, baseY - 1, 2, 5, '#3A2820');
    r(ctx, dx + 122, baseY - 1, 2, 5, '#3A2820');

    // string lights across shopfronts
    r(ctx, 16, topY - 4, 412, 1, '#3A2030');
    for (let i = 0; i < 14; i++) {
      r(ctx, 20 + i * 30, topY - 3, 1, 3, '#3A2030');
    }

    // banner across top
    r(ctx, 8, topY - 22, 90, 10, SH.sign);
    for (let i = 0; i < 9; i++) r(ctx, 14 + i * 9, topY - 19, 6, 4, SH.signText);
  }

  function paintStreet(ctx, s) {
    const baseY = Math.round(GH * 0.78);
    const roadY = baseY + 10;
    // kerb
    r(ctx, 0, baseY + 8, GW, 2, s.street.side);
    // road — cobblestone texture (reference shows paved street)
    r(ctx, 0, roadY, GW, GH - roadY, s.street.road);
    // cobblestone pattern
    resetSeed(950);
    for (let cy = roadY + 2; cy < GH - 4; cy += 6) {
      for (let cx = (cy % 12 === 0 ? 0 : 8); cx < GW; cx += 16) {
        const shade = rand() > 0.5 ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.06)';
        r(ctx, cx + rand() * 3, cy, 12, 4, shade);
      }
    }
    r(ctx, 0, roadY + 2, GW, 1, 'rgba(255,255,255,0.06)');
    // dashed center line
    ctx.globalAlpha = 0.6;
    for (let x = 12; x < GW - 20; x += 48) r(ctx, x, roadY + 14, 24, 2, s.street.line);
    // edge lines
    r(ctx, 0, roadY + 4, GW, 1, s.street.line);
    r(ctx, 0, roadY + 24, GW, 1, s.street.line);
    ctx.globalAlpha = 1;
    // zebra crossing
    for (let i = 0; i < 6; i++) r(ctx, 36 + i * 8, roadY + 2, 4, 14, s.street.line);
    // notice board
    r(ctx, 460, baseY - 2, 40, 18, '#241A28');
    r(ctx, 461, baseY - 1, 38, 16, '#2E2228');
    r(ctx, 463, baseY + 1, 34, 12, '#EFD9B4');
    for (let i = 0; i < 4; i++) r(ctx, 466, baseY + 3 + i * 3, 28, 1, '#B45309');
    r(ctx, 478, baseY - 4, 1, 3, s.street.side); // post
    // lamp post (left)
    r(ctx, 148, baseY - 30, 2, 30, s.street.side);
    r(ctx, 144, baseY - 31, 10, 2, s.street.side);
    r(ctx, 145, baseY - 28, 2, 5, s.street.side);
    r(ctx, 153, baseY - 28, 2, 4, s.street.side);
    r(ctx, 146, baseY - 26, 6, 5, s.shop.glow);
    ctx.globalAlpha = 0.2;
    r(ctx, 138, baseY - 20, 20, 14, s.shop.glow);
    ctx.globalAlpha = 1;
    // ===== FOREGROUND MARKET STALLS (reference shows wooden stalls at street level) =====
    // Stall A — wooden cart stall with awning (left-center)
    r(ctx, 86, baseY - 4, 28, 10, '#7A4A2A');    // cart body
    r(ctx, 88, baseY - 8, 24, 4, '#5E3820');      // roof frame
    awning(ctx, 86, baseY - 10, 28, s.shop.awnRed, s.shop.awnCream); // striped awning
    r(ctx, 90, baseY - 4, 4, 4, '#F59E0B');       // product
    r(ctx, 96, baseY - 4, 4, 4, '#22C55E');       // product
    r(ctx, 102, baseY - 4, 4, 4, '#EF4444');      // product
    r(ctx, 84, baseY + 4, 2, 6, '#3A2820');       // wheel
    r(ctx, 114, baseY + 4, 2, 6, '#3A2820');      // wheel
    // Stall B — wooden crate display (right-center)
    r(ctx, 410, baseY - 6, 22, 8, '#7A4A2A');
    r(ctx, 412, baseY - 8, 18, 2, '#5E3820');
    awning(ctx, 410, baseY - 10, 22, s.shop.awnCream, s.shop.awnTeal);
    r(ctx, 414, baseY - 5, 4, 3, '#F59E0B');
    r(ctx, 420, baseY - 5, 4, 3, '#3E7A4A');
    r(ctx, 426, baseY - 5, 4, 3, '#F87171');
    // More sacks and crates along sidewalk
    r(ctx, 120, baseY + 4, 10, 8, '#C9A24A');
    r(ctx, 122, baseY + 3, 6, 2, '#D8BC62');
    r(ctx, 155, baseY + 5, 8, 6, '#B45309');
    r(ctx, 155, baseY + 5, 8, 2, '#FDE68A');
    r(ctx, 390, baseY + 4, 8, 8, '#C9A24A');
    r(ctx, 392, baseY + 3, 4, 2, '#D8BC62');
    // flower pots along sidewalk
    resetSeed(800);
    for (let i = 0; i < 4; i++) {
      const px2 = 130 + i * 12;
      r(ctx, px2, baseY + 5, 5, 5, '#7A4A2A');
      r(ctx, px2 + 1, baseY + 4, 3, 2, '#3E7A4A');
    }
    // delivery cycle parked (left)
    r(ctx, 66, baseY + 7, 14, 3, '#2A1E28');
    r(ctx, 64, baseY + 8, 3, 7, '#2A1E28');
    r(ctx, 78, baseY + 8, 3, 7, '#2A1E28');
    r(ctx, 66, baseY + 2, 4, 12, '#2A1E28');
    r(ctx, 72, baseY + 3, 6, 8, '#2A1E28');
    r(ctx, 72, baseY + 3, 6, 2, '#FDE68A');
    // wires
    ctx.globalAlpha = 0.35;
    r(ctx, 149, baseY - 28, 311, 1, s.street.side);
    ctx.globalAlpha = 1;
    // street name
    r(ctx, 230, baseY - 8, 56, 7, '#241A28');
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < 5; i++) r(ctx, 235 + i * 10, baseY - 6, 6, 3, s.shop.cream);
    ctx.globalAlpha = 1;
  }

  // --- scene builders -------------------------------------------------------
  function buildScene(name) {
    const s = SCENES[name];
    resetSeed(name === 'dukaan' ? 1337 : name === 'office' ? 2674 : 3987);
    current = name;

    for (const ln of LAYER_NAMES) {
      layerBase[ln] = makeCanvas(GW, GH);
      layerAnim[ln] = makeCanvas(GW, GH);
    }
    staticBaked = {};
    clouds = [];

    // SKY layer — static base
    const skyCtx = layerBase.sky.getContext('2d');
    paintSky(skyCtx, s);
    paintBgSkyline(skyCtx, s);

    // BUILDINGS layer — static base
    const bldCtx = layerBase.buildings.getContext('2d');
    paintMidBuildings(bldCtx, s);

    // SHOP layer — static base
    const shopCtx = layerBase.shop.getContext('2d');
    paintShopRow(shopCtx, s);

    // FORE layer — static base
    const foreCtx = layerBase.fore.getContext('2d');
    paintStreet(foreCtx, s);

    // Init animated elements state
    animState = {
      windows: [],
      steam: [],
      cloudX: 0,
      lightsPhase: 0,
      cartX: 0,
      signPulse: 0
    };

    // Collect animated window positions
    resetSeed(name === 'dukaan' ? 5500 : name === 'office' ? 6600 : 7700);
    const baseY = Math.round(GH * 0.78);
    let wx = -6;
    while (wx < GW + 14) {
      const w = 24 + rand() * 20;
      const hgt = 46 + rand() * 52;
      const top = baseY - hgt;
      const cols = Math.max(1, Math.floor((w - 6) / 7));
      const rows = Math.max(2, Math.floor((hgt - 20) / 9));
      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          if (rand() > 0.45) {
            animState.windows.push({
              x: wx + 4 + cx * 7, y: top + 14 + cy * 9,
              w: 3, h: 3, warm: rand() > 0.5,
              speed: 1 + rand() * 3
            });
          }
        }
      }
      wx += w + 1;
    }

    // Cloud init
    resetSeed(name === 'dukaan' ? 9999 : name === 'office' ? 8888 : 7777);
    const nClouds = MOBILE ? 2 : 4;
    for (let i = 0; i < nClouds; i++) {
      clouds.push({
        x: rand() * GW * 1.4 - GW * 0.2,
        y: 15 + rand() * 40,
        w: 30 + rand() * 30,
        h: 10 + rand() * 8,
        speed: 3 + rand() * 5
      });
    }

    // Steam sources — reference shows prominent wisps from multiple shops
    animState.steam = [
      { x: 66, y: baseY - 50, count: 4 },   // above DUKAAN door area
      { x: 146, y: baseY - 42, count: 5 },   // CHAI stall (strongest)
      { x: 254, y: baseY - 38, count: 4 },   // FRESH produce
      { x: 340, y: baseY - 46, count: 3 },   // PARCEL entrance
      { x: 380, y: baseY - 40, count: 3 }    // extra ambient
    ];

    buildStaticPc();
  }

  function buildStaticPc() {
    staticPc = makeCanvas(GW, GH);
    const c = staticPc.getContext('2d');
    c.imageSmoothingEnabled = false;
    for (const ln of LAYER_NAMES) c.drawImage(layerBase[ln], 0, 0);
  }

  // --- animation -----------------------------------------------------------
  function paintAnim(ln, t) {
    const c = layerAnim[ln].getContext('2d');
    c.clearRect(0, 0, GW, GH);
    const st = animState;
    const stiff = t * 0.001;

    if (ln === 'sky') {
      // clouds
      for (const cl of clouds) {
        cl.x += cl.speed * 0.008;
        if (cl.x > GW + 40) cl.x = -cl.w - 10;
        const cx = Math.round(cl.x), cy = Math.round(cl.y);
        c.globalAlpha = 0.6;
        r(c, cx, cy, cl.w, cl.h, SCENES[current].bg.base);
        r(c, cx + 2, cy - 2, cl.w - 4, cl.h, SCENES[current].bg.base);
        c.globalAlpha = 0.35;
        r(c, cx, cy + 2, cl.w, 3, SCENES[current].haze);
        c.globalAlpha = 1;
      }
    }

    if (ln === 'buildings') {
      // animated windows
      for (const wt of st.windows) {
        const on = Math.floor(stiff * wt.speed + wt.x * 0.3) % 6 > 1;
        c.clearRect(wt.x, wt.y, wt.w, wt.h);
        c.fillStyle = on
          ? (wt.warm ? SCENES[current].midWinLit : SCENES[current].midWinWarm)
          : SCENES[current].midWin;
        c.fillRect(wt.x, wt.y, wt.w, wt.h);
      }
    }

    if (ln === 'shop') {
      // string lights
      for (let i = 0; i < 14; i++) {
        const lx = 20 + i * 30;
        const ly = Math.round(GH * 0.78) - 76 - 3;
        const on = Math.floor(stiff * 5 + i * 3) % 10 > 2;
        c.clearRect(lx - 1, ly - 1, 4, 6);
        r(c, lx, ly, 1, 3, '#3A2030');
        r(c, lx - 0.5, ly + 3, 2, 2, on ? '#FDE68A' : '#8A6A3A');
        if (on && current !== 'district') {
          c.globalAlpha = 0.12;
          r(c, lx - 2, ly + 5, 6, 4, '#FDE68A');
          c.globalAlpha = 1;
        }
      }
      // steam — prominent white wisps (reference shows large visible steam)
      for (const src of st.steam) {
        for (let j = 0; j < src.count; j++) {
          const phase = (stiff * 0.35 + j * 0.18) % 1;
          const sy = src.y - phase * 22;
          const sx = src.x + Math.sin(phase * 5 + j) * 4;
          const a = Math.max(0, 1 - phase);
          // main wisp — larger and brighter
          c.globalAlpha = 0.55 * a;
          r(c, sx, sy, 3, 3, '#F0E8DA');
          c.globalAlpha = 0.4 * a;
          r(c, sx + 2, sy - 2, 3, 2, '#F0E8DA');
          c.globalAlpha = 0.25 * a;
          r(c, sx - 1, sy + 3, 4, 2, '#F0E8DA');
          c.globalAlpha = 0.12 * a;
          r(c, sx + 1, sy - 4, 3, 2, '#E8E0D0');
          c.globalAlpha = 1;
        }
      }
      // sign glow pulse
      st.signPulse += 0.015;
      const gp = 0.08 + Math.sin(st.signPulse) * 0.04;
      c.globalAlpha = gp;
      r(c, 26, Math.round(GH * 0.78) - 96, 44, 12, SCENES[current].shop.glow);
      r(c, 148, Math.round(GH * 0.78) - 94, 36, 12, SCENES[current].shop.glow);
      r(c, 346, Math.round(GH * 0.78) - 96, 36, 12, SCENES[current].shop.glow);
      r(c, 362, Math.round(GH * 0.78) - 96, 44, 12, SCENES[current].shop.glow);
      c.globalAlpha = 1;
      // hanging sign sway (small)
      const sway = Math.sin(stiff * 1.2) * 0.8;
      c.clearRect(238, Math.round(GH * 0.78) - 76 - 24, 56, 12);
      r(c, 266, Math.round(GH * 0.78) - 76 - 25, 1, 5, '#2A1E30');
      r(c, 264, Math.round(GH * 0.78) - 76 - 26, 4, 1, '#2A1E30');
      r(c, 240 + sway, Math.round(GH * 0.78) - 76 - 22, 50, 10, SCENES[current].shop.sign);
      for (let i = 0; i < 5; i++) r(c, 246 + sway + i * 8, Math.round(GH * 0.78) - 76 - 19, 6, 4, SCENES[current].shop.signText);
    }

    if (ln === 'fore') {
      // delivery cart drift
      st.cartX += 0.003;
      const cx = Math.round(414 + Math.sin(st.cartX) * 12);
      const cy = Math.round(GH * 0.78) - 4;
      c.clearRect(cx - 2, cy - 10, 18, 12);
      r(c, cx, cy - 4, 14, 6, '#5E3820');
      r(c, cx + 2, cy - 8, 10, 4, SCENES[current].shop.wood);
      r(c, cx + 2, cy - 8, 10, 2, '#FDE68A');
      r(c, cx - 2, cy - 1, 2, 5, '#3A2820');
      r(c, cx + 12, cy - 1, 2, 5, '#3A2820');
    }
  }

  // --- compositing ---------------------------------------------------------
  function composeLayer(ln, t) {
    const cv = rootSel.querySelector('.pw-layer.pw-' + ln + ':not(.pw-static-canvas)');
    if (!cv) return;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, GW, GH);
    c.imageSmoothingEnabled = false;
    c.drawImage(layerBase[ln], 0, 0);
    paintAnim(ln, t);
    c.drawImage(layerAnim[ln], 0, 0);
  }

  function bakeStatic() {
    staticBaked = {};
    for (const ln of LAYER_NAMES) {
      const cv = makeCanvas(GW, GH);
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      c.drawImage(layerBase[ln], 0, 0);
      // bake anim at stiff=0
      const t0 = 0;
      const tc = layerAnim[ln].getContext('2d');
      tc.clearRect(0, 0, GW, GH);
      if (ln === 'sky') {
        for (const cl of clouds) {
          tc.globalAlpha = 0.6;
          r(tc, cl.x, cl.y, cl.w, cl.h, SCENES[current].bg.base);
          tc.globalAlpha = 0.35;
          r(tc, cl.x, cl.y + 2, cl.w, 3, SCENES[current].haze);
          tc.globalAlpha = 1;
        }
      }
      if (ln === 'shop') {
        // lights on
        for (let i = 0; i < 14; i++) {
          const lx = 20 + i * 30;
          const ly = Math.round(GH * 0.78) - 79;
          r(tc, lx, ly, 1, 3, '#3A2030');
          r(tc, lx - 0.5, ly + 3, 2, 2, '#FDE68A');
        }
        // signs
        const sy = Math.round(GH * 0.78);
        r(tc, 26, sy - 96, 44, 12, SCENES[current].shop.glow);
        r(tc, 148, sy - 94, 36, 12, SCENES[current].shop.glow);
        r(tc, 346, sy - 96, 36, 12, SCENES[current].shop.glow);
        r(tc, 362, sy - 96, 44, 12, SCENES[current].shop.glow);
        // steam at t=0
        for (const src of animState.steam || []) {
          for (let j = 0; j < src.count; j++) {
            const phase = j * 0.18 % 1;
            const sy2 = src.y - phase * 22;
            const sx = src.x + Math.sin(phase * 5 + j) * 4;
            const a = 1 - phase;
            tc.globalAlpha = 0.55 * a;
            r(tc, sx, sy2, 3, 3, '#F0E8DA');
            tc.globalAlpha = 0.4 * a;
            r(tc, sx + 2, sy2 - 2, 3, 2, '#F0E8DA');
            tc.globalAlpha = 0.25 * a;
            r(tc, sx - 1, sy2 + 3, 4, 2, '#F0E8DA');
            tc.globalAlpha = 1;
          }
        }
      }
      c.drawImage(layerAnim[ln], 0, 0);
      staticBaked[ln] = cv;
    }
  }

  function frame(t) {
    if (!rootSel || document.hidden) return;
    const stiff = t * 0.001;
    for (const ln of LAYER_NAMES) {
      composeLayer(ln, stiff);
    }
    rafId = requestAnimationFrame(frame);
  }

  // --- public API ---------------------------------------------------------
  function init(sel) {
    rootSel = typeof sel === 'string' ? document.querySelector(sel) : sel;
    if (!rootSel) return;
    rootSel.innerHTML = '';
    const prevStatic = rootSel.querySelector('.pw-static-canvas');
    if (prevStatic) prevStatic.remove();
    for (const ln of LAYER_NAMES) {
      const cv = makeCanvas(GW, GH);
      cv.className = 'pw-layer pw-' + ln;
      cv.width = GW; cv.height = GH;
      rootSel.appendChild(cv);
    }
    const want = getSavedScene();
    buildScene(want);
    refresh();
  }

  function getSavedScene() {
    try {
      const v = localStorage.getItem('vv-scene');
      if (v && SCENES[v]) return v;
      const t = document.body.dataset.theme || '';
      const m = /^scene_(.+)$/.exec(t);
      if (m && SCENES[m[1]]) return m[1];
    } catch (e) { /* silent */ }
    return 'dukaan';
  }

  function setScene(id) {
    if (!SCENES[id]) return;
    stop();
    buildScene(id);
    refresh();
    try { localStorage.setItem('vv-scene', id); } catch (e) { /* silent */ }
  }

  function refresh() {
    if (!rootSel) return;
    const reduced = document.body.classList.contains('reduced') ||
      document.body.classList.contains('low-perf') ||
      (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    removeStatic();
    stop();
    if (reduced) {
      bakeStatic();
      const cv = makeCanvas(GW, GH);
      cv.className = 'pw-static-canvas pw-layer';
      cv.width = GW; cv.height = GH;
      const c = cv.getContext('2d');
      c.imageSmoothingEnabled = false;
      for (const ln of LAYER_NAMES) {
        if (staticBaked[ln]) c.drawImage(staticBaked[ln], 0, 0);
      }
      for (const el of rootSel.querySelectorAll('.pw-layer:not(.pw-static-canvas)')) el.style.display = 'none';
      rootSel.appendChild(cv);
      return;
    }
    for (const el of rootSel.querySelectorAll('.pw-layer:not(.pw-static-canvas)')) el.style.display = '';
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  function removeStatic() {
    const el = rootSel && rootSel.querySelector('.pw-static-canvas');
    if (el) el.remove();
  }

  return {
    init,
    setScene,
    refresh,
    listScenes: () => SCENE_ORDER.map((id) => ({ id, name: SCENES[id].name, desc: SCENES[id].desc, class: SCENES[id].class })),
    getSceneMeta: (id) => (SCENES[id] ? { id, name: SCENES[id].name, desc: SCENES[id].desc, time: SCENES[id].time } : null),
    current: () => current,
    GW,
    GH
  };
})();

if (typeof window !== 'undefined') window.PixelWorld = PixelWorld;