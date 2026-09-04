/* views/home.js — Techo home: night-street GIF background with a centered
 * search bar + voice mic only. No greetings, cards, or extra text blocks.
 * Search text and mic handoff flow into the chat view unchanged. */

views.home = {
  async render() {
    // Preload the home GIF only when home renders — inner pages never fetch it.
    if (!document.querySelector('link[data-techo-home-bg]')) {
      const pl = document.createElement('link');
      pl.rel = 'preload'; pl.as = 'image';
      pl.href = '/backgrounds/techo-home-bg.gif';
      pl.setAttribute('data-techo-home-bg', '1');
      document.head.appendChild(pl);
    }
    const el = h('div', { class: 'home-minimal' });

    // Visually-hidden page heading for screen readers / heading hierarchy
    el.appendChild(h('h1', { class: 'visually-hidden', style: 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0' }, 'Techo'));

    // ── Centered search + voice only ──
    const center = h('div', { class: 'home-center' }, [
      searchRow()
    ]);
    el.appendChild(center);
    center.appendChild(await avatarEntry());

    return el;
  }
};

function searchRow() {
  const input = h('input', {
    type: 'search', name: 'ask',
    placeholder: 'Ask anything — e.g. "show today sales" or "pending payments"',
    'aria-label': 'Ask the assistant'
  });
  const goBtn = h('button', {
    class: 'icon-btn', type: 'button', title: 'Ask', 'aria-label': 'Ask',
    onclick: () => submit()
  }, '→');
  const micBtn = h('button', {
    class: 'icon-btn mic-btn', type: 'button', title: 'Talk to Techo', 'aria-label': 'Talk to Techo',
    onclick: () => { App.pendingMic = true; Router.navigate('/chat'); }
  }, '🎙️');
  function submit() {
    App.pendingText = input.value.trim();
    Router.navigate('/chat');
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
  return h('div', { class: 'home-search', role: 'search' }, [input, micBtn, goBtn]);
}

// Small entry on the home page to open Avatar Studio. Shows the currently
// selected talking avatar, or a neutral prompt when none is set.
async function avatarEntry() {
  const btn = h('button', {
    class: 'home-avatar', type: 'button', 'aria-label': 'Open Avatar Studio',
    onclick: () => Router.navigate('/avatar-studio')
  }, [h('span', { class: 'home-avatar-thumb' }, '🧑‍💼')]);

  let st = null; let list = null;
  try { st = await AvatarClient.status(); list = await AvatarClient.list(); } catch (e) {}
  const configured = !!(st && st.configured);
  const selected = (list && list.selected) || {};
  const current = (list && list.avatars || []).find((a) => a.id === selected.avatarId);

  const text = h('span', { class: 'home-avatar-text' });
  if (configured && current) {
    if (current.thumbnail) btn.querySelector('.home-avatar-thumb').textContent = '';
    if (current.thumbnail) btn.querySelector('.home-avatar-thumb').appendChild(h('img', { src: current.thumbnail, alt: '' }));
    text.textContent = 'Techo talks as ' + current.name;
  } else if (configured) {
    text.textContent = 'Pick a talking avatar';
  } else {
    text.textContent = 'Avatar — set up';
  }
  btn.appendChild(text);
  btn.appendChild(h('span', { class: 'home-avatar-arrow' }, '›'));
  return btn;
}
