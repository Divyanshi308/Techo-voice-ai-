/* app.js — bootstraps the SPA: session, config, theme, navigation shell. */

window.views = {};

// Voice state bus: the real voice/pipeline code (chat.js, avatar-voice.js)
// publishes its honest state here; Avatar Mode and chat persona UI mirror it.
window.VoiceBus = {
  state: 'idle', level: 0, persona: null,
  subs: new Set(),
  set(s) { if (this.state !== s) { this.state = s; this._emit(); } },
  setState(s) { this.set(s); },
  setLevel(l) { this.level = l; },
  micOn() { this.set('listening'); },
  micOff() { this.set('idle'); },
  onPersona(p) { this.persona = p; this._emit(); },
  onPersonaChange(fn) { this._personaFn = fn; },
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
  _emit() {
    this.subs.forEach((fn) => { try { fn({ state: this.state, level: this.level, persona: this.persona }); } catch (e) { /* ignore */ } });
    if (this._personaFn && this.persona) { try { this._personaFn(this.persona); } catch (e) { /* ignore */ } }
  }
};

const App = {
  config: null,
  session: null, // { user }
  currentView: null,
  scene: 'dukaan',
  pendingMic: false,   // home mic → autostart chat mic
  pendingText: null,   // home search → prefill chat input

  async boot() {
    const cfg = await API.get('/api/config').catch(() => null);
    App.config = cfg || { languages: [], themes: [], prompts: [], appName: 'Techo' };

    // Try to restore session silently
    try {
      const me = await API.get('/api/auth/me');
      App.session = me;
    } catch { App.session = null; }

    // UI chrome is English-only by default in the redesign. The conversation-language
    // feature (18 languages, language registry, reply-language settings)
    // is fully preserved — only the app chrome is pinned to English unless the
    // user has explicitly chosen a UI language.
TR.setUiLang('en');

    // Set document title
    document.title = 'Techo';

    App.applyTheme();
    App.initWorld();
    App.pendingMic = false;
    App.pendingText = null;

    Router.register('/login', () => App.enter('login', views.login.render.bind(views.login)));
    Router.register('/home', () => App.enter('home', views.home.render.bind(views.home)));
    Router.register('/chat', () => App.enter('chat', views.chat.render.bind(views.chat)));
    Router.register('/profile', () => App.enter('profile', views.profile.render.bind(views.profile)));
    Router.register('/voice', () => App.enter('voice', views.avatarVoice.render.bind(views.avatarVoice)));
    Router.register('/reminders', () => App.enter('reminders', views.reminders.render.bind(views.reminders)));
    Router.register('/surveys', () => App.enter('surveys', views.surveys.render.bind(views.surveys)));
    Router.register('/support', () => App.enter('support', views.support.render.bind(views.support)));
    Router.register('/privacy', () => App.enter('privacy', views.privacy.render.bind(views.privacy)));
    Router.register('/settings', () => App.enter('settings', views.settings.render.bind(views.settings)));
    Router.register('/admin', () => App.enter('admin', views.admin.render.bind(views.admin)));
    Router.register('/sales', () => App.enter('sales', views.sales.render.bind(views.sales)));
    Router.register('/marketing', () => App.enter('marketing', views.marketing.render.bind(views.marketing)));
    Router.register('/history', () => App.enter('history', views.history.render.bind(views.history)));
    Router.register('/reviews', () => App.enter('reviews', views.reviews.render.bind(views.reviews)));
    Router.register('/language', () => App.enter('language', views.language.render.bind(views.language)));
    Router.register('/agora', () => App.enter('agora', views.agora.render.bind(views.agora)));
    Router.register('/integrations', () => App.enter('integrations', views.integrations.render.bind(views.integrations)));
    Router.register('/avatar-studio', () => App.enter('avatar-studio', views.avatarStudio.render.bind(views.avatarStudio)));
    Router.register('/agent-config', () => App.enter('agent-config', views.agentConfig.render.bind(views.agentConfig)));

    Router.addDefault((path) => {
      // unknown route → home or login
      if (App.session) Router.navigate('/home');
      else Router.navigate('/login');
    });

    Router.start();
  },

  isAuthed() { return !!App.session; },

  guard() {
    if (!App.session) { Router.navigate('/login'); return false; }
    return true;
  },

  async enter(name, renderFn) {
    // Stop any active voice session when leaving the assistant screen
    if (App.currentView !== 'chat' && name !== 'chat' &&
        typeof Voice !== 'undefined') {
      try { Voice.stopListening(); Voice.stopSpeaking(); Voice.detachLevel(); } catch (e) { /* noop */ }
      if (window.__personaStrip && window.__personaStrip.cancel) window.__personaStrip.cancel();
    }
    App.currentView = name;
    const mount = document.getElementById('app');
    if (name === 'login') {
      mount.innerHTML = '';
      const el = renderFn ? await renderFn() : h('div', {}, '...');
      if (el) mount.appendChild(el);
      return;
    }
    if (!App.guard()) return;
    mount.innerHTML = '';
    const shell = buildShell(name);
    mount.appendChild(shell);
    const content = shell.querySelector('.content-mount');
    if (renderFn) {
      const el = await renderFn(content);
      if (el) content.appendChild(el);
    } else {
      content.appendChild(h('div', { class: 'center' }, 'Loading…'));
    }
    window.scrollTo(0, 0);
  },

  applyTheme() {
    const bg = document.getElementById('bg-layer');
    const custom = App.session && App.session.user.themeCustom;
    const themeId = App.session && App.session.user.themeId;
    // "scene_*" themeId values are used to persist the Business World scene;
    // they are not real themes, so fall back to the dark default backdrop.
    if (themeId && themeId.indexOf('scene_') === 0) {
      document.body.classList.add('theme-dark');
      bg.style.background = '#070C16';
      return;
    }
    const theme = (App.config.themes || []).find((th) => th.id === themeId);
    // Set light/dark body mode (also used by the clay design)
    document.body.classList.toggle('theme-dark', !!(theme && theme.mode === 'dark'));
    if (custom) {
      bg.style.background = custom;
      return;
    }
    if (theme) bg.style.background = theme.value;
    else bg.style.background = '#070C16';
  },

  // Pixel canvas retired in the Techo theme (solid dark base, no animation).
  // The engine file is still shipped; this stays a no-op so the GIF remains
  // the only animated background (home page only).
  initWorld() {
    const el = document.getElementById('pixel-world');
    if (el) el.style.display = 'none';
  },

  navItems() {
    const user = App.session && App.session.user;
    // Full "Living Digital Dukaan" sidebar navigation (spec labels preserved)
    const all = [
      { key: 'home', hash: '/home', icon: '🏠', label: t('nav_dk_home') },
      { key: 'chat', hash: '/chat', icon: '🎙️', label: t('nav_dk_chat') },
      { key: 'profile', hash: '/profile', icon: '🧾', label: t('nav_dk_profile') },
      { key: 'sales', hash: '/sales', icon: '💰', label: t('nav_dk_sales') },
      { key: 'marketing', hash: '/marketing', icon: '📣', label: t('nav_dk_marketing') },
      { key: 'reminders', hash: '/reminders', icon: '⏰', label: t('nav_dk_reminders') },
      { key: 'surveys', hash: '/surveys', icon: '📋', label: t('nav_dk_surveys') },
      { key: 'reviews', hash: '/reviews', icon: '⭐', label: t('nav_dk_reviews') },
      { key: 'history', hash: '/history', icon: '🕘', label: t('nav_dk_history') },
      { key: 'language', hash: '/language', icon: '🌐', label: t('nav_dk_language') },
      { key: 'support', hash: '/support', icon: '🙋', label: t('nav_dk_support') },
      { key: 'voice', hash: '/voice', icon: '👤', label: t('nav_dk_voice') },
      { key: 'agora', hash: '/agora', icon: '🎛️', label: t('nav_dk_agora') },
      { key: 'integrations', hash: '/integrations', icon: '🔗', label: t('nav_dk_integrations') },
      { key: 'agent-config', hash: '/agent-config', icon: '⚙️', label: t('nav_dk_agent_config') },
      { key: 'privacy', hash: '/privacy', icon: '🔒', label: t('nav_dk_privacy') },
      { key: 'settings', hash: '/settings', icon: '⚙️', label: t('nav_dk_settings') }
    ];
    if (user && user.role === 'admin') {
      all.push({ key: 'admin', hash: '/admin', icon: '🛡️', label: t('nav_dk_admin') });
    }
    // Compact bottom nav (mobile) + overflow into "More"
    const keys = ['home', 'chat', 'profile', 'surveys'];
    const primary = all.filter((i) => keys.includes(i.key));
    const more = all.filter((i) => !keys.includes(i.key));
    return { all, primary, more };
  }
};

function buildShell(activeKey) {
  const user = App.session.user;
  const avatar = App.avatar || {};
  const avColor = avatar.color || '#312E81';
  const avEmoji = avatar.emoji || '🤖';

  const { all, primary, more } = App.navItems();

  // Nav item builder (works for both sidebar + bottom nav)
  const navItem = (item) => h('a', {
    class: `nav-item side-item ${activeKey === item.key ? 'active' : ''}`,
    href: `#${item.hash}`,
    title: item.label,
    'aria-current': activeKey === item.key ? 'page' : null,
    onclick: () => {
      if (item.section) App.pendingSection = item.section;
      closeSidebar();
    }
  }, [h('span', { class: 'ni' }, item.icon), h('span', { class: 'side-label' }, item.label)]);

  // ── Sidebar brand ──
  const sbBrand = h('a', { class: 'sb-brand', href: '#/home', onclick: () => closeSidebar() }, [
    h('span', { class: 'logo' }, '🗣️'),
    h('span', {}, App.config.appName || 'Techo')
  ]);
  const brand = h('a', { class: 'brand', href: '#/home', onclick: () => closeSidebar() }, [
    h('span', { class: 'logo' }, '🗣️'),
    h('span', {}, App.config.appName || 'Techo')
  ]);

  // ── Topbar ──
  const lang = App.session.user.uiLang || 'en';
  const langEntry = (App.config.languages || []).find((l) => l.code === lang);
  const avatarSwitch = h('button', {
    class: 'avatar-switch', type: 'button', title: 'Open Avatar Mode',
    onclick: () => { if (window.AvatarMode) window.AvatarMode.open(); }
  }, [h('span', { class: 'sw-dot' }), h('span', { class: 'sw-text' }, 'Avatar')]);
  const topRight = h('div', { class: 'row', style: { marginLeft: 'auto' } }, [
    avatarSwitch,
    h('button', {
      class: 'icon-btn', type: 'button', title: 'Language', 'aria-label': 'Language', onclick: () => Router.navigate('/language')
    }, '🌐'),
    h('button', { class: 'icon-btn', type: 'button', title: t('tab_settings'), 'aria-label': t('tab_settings'), onclick: () => Router.navigate('/settings') }, '⚙️'),
    h('button', {
      class: 'avatar sm', type: 'button', title: user.name || 'User', 'aria-label': 'Open settings for ' + (user.name || 'user'),
      style: { background: avColor, cursor: 'pointer' },
      onclick: () => Router.navigate('/settings')
    }, avEmoji)
  ]);
  const hamburger = h('button', { class: 'hamburger', 'aria-label': 'Open menu', onclick: () => openSidebar() }, '☰');
  const topbar = h('div', { class: 'topbar' }, [hamburger, brand, h('div', { class: 'spacer' }), topRight]);

  // ── Sidebar (grouped, collapsible rail) ──
  const GROUPS = [
    { head: 'Operating', keys: ['home', 'chat', 'profile', 'voice'] },
    { head: 'Business', keys: ['sales', 'marketing', 'reminders', 'surveys', 'reviews', 'history'] },
    { head: 'Reach & AI', keys: ['language', 'support', 'agora', 'agent-config', 'integrations'] },
    { head: 'System', keys: ['privacy', 'settings', 'admin'] }
  ];
  const collapseBtn = h('button', {
    class: 'side-collapse', type: 'button', title: 'Collapse sidebar',
    'aria-label': 'Collapse sidebar',
    onclick: (e) => { e.stopPropagation(); toggleRail(); }
  }, '«');
  const groupEls = [];
  GROUPS.forEach((g) => {
    const items = all.filter((i) => g.keys.includes(i.key));
    if (!items.length) return;
    groupEls.push(h('div', { class: 'side-head' }, g.head));
    items.forEach((item) => groupEls.push(navItem(item)));
  });
  const sidebar = h('nav', {
    class: 'sidebar', 'aria-label': 'Main navigation',
    onclick: (e) => { if (e.target.closest('a')) closeSidebar(); }
  }, [
    sbBrand,
    collapseBtn,
    ...groupEls
  ]);

  // ── Bottom nav (mobile) ──
  const moreBtn = h('a', {
    class: `nav-item ${primary.every((p) => p.key !== activeKey) && more.some((m) => m.key === activeKey) ? 'active' : ''}`,
    href: '#', onclick: (e) => { e.preventDefault(); openMore(more); }
  }, [h('span', { class: 'ni' }, '⋯'), h('span', {}, t('tab_more'))]);
  const bottomNav = h('nav', { class: 'navbar' }, [...primary.map(navItem), moreBtn]);

  const content = h('main', { class: 'content-mount', id: 'main-content', tabindex: '-1' });

  // Skip-to-content link (visually hidden until focused)
  const skip = h('a', {
    href: '#main-content', class: 'skip-link',
    onclick: (e) => { e.preventDefault(); const m = document.getElementById('main-content'); if (m) { m.focus(); m.scrollIntoView(); } }
  }, 'Skip to content');

  const shellOuter = h('div', { class: 'app-shell' }, [skip, sidebar, h('div', {}, [topbar, content])]);
  shellOuter.appendChild(bottomNav);

  // Close on escape
  window.closeSidebar = closeSidebar;
  return shellOuter;
}

function openSidebar() {
  document.querySelector('.sidebar') && document.querySelector('.sidebar').classList.add('open');
}
function closeSidebar() {
  document.querySelector('.sidebar') && document.querySelector('.sidebar').classList.remove('open');
}

// Collapsible rail: condensed sidebar so the pixel world has more room.
window.toggleRail = function () {
  const sb = document.querySelector('.sidebar');
  if (!sb) return;
  const collapsed = sb.classList.toggle('collapsed');
  try { localStorage.setItem('vv-rail', collapsed ? '1' : '0'); } catch (e) { /* ignore */ }
  const btns = sb.querySelectorAll('.side-collapse');
  btns.forEach((b) => { b.textContent = collapsed ? '»' : '«'; });
};
(function applyRailPref() {
  try {
    if (localStorage.getItem('vv-rail') === '1') {
      const sb = document.querySelector('.sidebar');
      if (sb) sb.classList.add('collapsed');
    }
  } catch (e) { /* ignore */ }
})();

function openMore(more) {
  const m = UI.modal(`<h3>${t('tab_more')}</h3>`);
  const wrap = m.el.querySelector('.modal');
  more.forEach((item) => {
    const a = h('a', {
      class: 'list-item', href: `#${item.hash}`,
      onclick: () => { if (item.section) App.pendingSection = item.section; m.close(); }
    }, [
      h('span', { style: { fontSize: '1.4rem' } }, item.icon),
      h('span', { style: { flex: 1, fontWeight: 600 } }, item.label),
      h('span', { class: 'muted' }, '→')
    ]);
    wrap.appendChild(a);
  });
}

// ---- bootstrap (all scripts are deferred, so DOM is ready here) ----
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => App.boot());
} else {
  App.boot();
}
