/* 3d.js — lightweight CSS 3D interactions with zero dependencies.
   - Pointer-tracked 3D tilt on elements marked with class "tilt".
   - Subtle parallax drift for the floating background orbs (#bg-3d).
   Works on pointer devices; falls back gracefully on touch (no tilt). */

(function () {
  'use strict';

  const MAX_TILT = 10;        // degrees
  const REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function tiltEl(el) {
    if (REDUCED) return;
    const rectState = { w: 0, h: 0, x: 0, y: 0 };
    const updateRect = () => {
      const r = el.getBoundingClientRect();
      rectState.w = r.width; rectState.h = r.height; rectState.x = r.left + r.width / 2; rectState.y = r.top + r.height / 2;
    };

    let raf = null;
    const apply = (rx, ry) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        el.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`;
        raf = null;
      });
    };

    el.addEventListener('pointermove', (e) => {
      updateRect();
      const px = (e.clientX - rectState.x) / rectState.w;   // -0.5..0.5
      const py = (e.clientY - rectState.y) / rectState.h;
      apply(-py * MAX_TILT, px * MAX_TILT);
    });
    el.addEventListener('pointerleave', () => {
      el.style.transform = '';
    });
  }

  // Pointer-tilt on "tilt" elements is intentionally DISABLED in the
  // "Living Digital Dukaan" redesign (no orb, no card shaking). It stays a
  // no-op so nothing moves under the mouse; theme/legacy code setting the
  // class still renders flat. Kept exported for API compatibility only.
  function autoEnable() {
    return;
  }

  // Toggle low-performance mode (disables tilt + parallax + orb float).
  function setLowPerf(flag) {
    document.body.classList.toggle('low-perf', !!flag);
  }
  function isLowPerf() { return document.body.classList.contains('low-perf'); }

  // Background orb parallax tied to pointer.
  function parallax() {
    if (REDUCED) return;
    const layer = document.getElementById('bg-3d');
    if (!layer) return;
    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;
    window.addEventListener('pointermove', (e) => {
      if (isLowPerf()) return;
      cx = (e.clientX / window.innerWidth - 0.5) * 30;
      cy = (e.clientY / window.innerHeight - 0.5) * 30;
      if (raf) return;
      raf = requestAnimationFrame(() => {
        tx += (cx - tx) * 0.06;
        ty += (cy - ty) * 0.06;
        layer.style.setProperty('--px', tx.toFixed(1) + 'px');
        layer.style.setProperty('--py', ty.toFixed(1) + 'px');
        raf = null;
      });
    });
  }

  function boot() {
    autoEnable();
    parallax();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.App3D = { setLowPerf, isLowPerf };
})();
