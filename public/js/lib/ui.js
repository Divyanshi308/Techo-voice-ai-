/* ui.js — small DOM + shared UI helpers (toasts, modal, badges, esc). */

const h = (tag, attrs = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v);
  }
  (Array.isArray(children) ? children : [children]).forEach((c) => {
    if (c == null || c === false) return;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(c) : c);
  });
  return el;
};

const UI = {
  toast(message, type = 'good', ms = 4000) {
    const box = document.getElementById('toasts');
    const el = h('div', { class: `toast ${type}`, html: `<span>${esc(message)}</span>` });
    box.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, ms);
  },
  esc: esc,
  modal(html, { label, focusId } = {}) {
    const root = document.getElementById('modal-root');
    const prevFocus = document.activeElement;
    const backdrop = h('div', { class: 'modal-backdrop' });
    backdrop.innerHTML = modalShell(html);
    const modalEl = backdrop.querySelector('.modal');
    modalEl.setAttribute('role', 'dialog');
    modalEl.setAttribute('aria-modal', 'true');
    if (label) modalEl.setAttribute('aria-label', label);
    root.appendChild(backdrop);

    // Keyboard: Escape closes; Tab traps focus inside the modal.
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
      if (e.key === 'Tab') {
        const focusables = modalEl.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || document.activeElement === modalEl || !modalEl.contains(document.activeElement)) {
            e.preventDefault(); last.focus();
          }
        } else if (document.activeElement === last || !modalEl.contains(document.activeElement)) {
          e.preventDefault(); first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);

    const close = (val) => {
      document.removeEventListener('keydown', onKey);
      backdrop.remove();
      if (prevFocus && typeof prevFocus.focus === 'function') prevFocus.focus();
      if (onCloseCb) onCloseCb(val);
    };
    let onCloseCb = null;
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(null); });
    // Focus the requested element (or first focusable) once rendered.
    if (focusId) {
      const el = modalEl.querySelector('#' + focusId) || modalEl.querySelector('#modal-root input, #modal-root button, #modal-root textarea');
      if (el) el.focus();
    }
    const api = {
      el: backdrop,
      onClose(fn) { onCloseCb = fn; },
      close
    };
    backdrop.closeModal = api;
    return api;
  },
  confirm(text) {
    return new Promise((resolve) => {
      const m = UI.modal(`
        <h3>${esc(text)}</h3>
        <div class="row" style="justify-content:flex-end;gap:10px;margin-top:14px">
          <button class="btn ghost sm" data-act="no">${t('cancel')}</button>
          <button class="btn danger sm" data-act="yes">${t('yes')}</button>
        </div>`);
      m.el.querySelector('[data-act=yes]').addEventListener('click', () => { m.close(true); });
      m.el.querySelector('[data-act=no]').addEventListener('click', () => { m.close(false); });
      m.onClose((v) => resolve(v === true));
    });
  },
  skeleton(rows = 3) {
    return h('div', { class: 'mt' }, Array.from({ length: rows }, () =>
      h('div', { class: 'skeleton', style: { height: '46px', width: '100%', marginBottom: '10px' } })));
  },
  empty(icon, text) {
    return h('div', { class: 'empty' }, [h('div', { class: 'big' }, icon), h('p', { class: 'muted' }, text)]);
  },
  levelTag(level) {
    const map = {
      Verified: ['tag good', '✓ Verified'],
      Estimated: ['tag warn', '~ Estimated'],
      Uncertain: ['tag uncertain', '? Uncertain']
    };
    const [cls, txt] = map[level] || ['tag neutral', level];
    return h('span', { class: cls }, txt);
  },
  statusTag(status) {
    const map = {
      pending: ['tag neutral', 'Pending'], due: ['tag warn', 'Due'],
      completed: ['tag good', 'Done'], 'in-progress': ['tag', 'In progress'],
      'no-answer': ['tag warn', 'No answer'], failed: ['tag', 'Failed'],
      dialing: ['tag', 'Dialing…'], ringing: ['tag', 'Ringing…'],
      scheduled: ['tag', 'Scheduled'], open: ['tag warn', 'Open'],
      assigned: ['tag', 'Assigned'], 'in-review': ['tag', 'In review'],
      resolved: ['tag good', 'Resolved'], closed: ['tag neutral', 'Closed'],
      active: ['tag good', 'Active'], draft: ['tag neutral', 'Draft']
    };
    const [cls, txt] = map[status] || ['tag neutral', status];
    return h('span', { class: cls }, txt);
  }
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function modalShell(inner) {
  return `<div class="modal">${inner}</div>`;
}

window.h = h;
window.UI = UI;
window.esc = esc;
