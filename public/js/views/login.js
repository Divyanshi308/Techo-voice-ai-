/* views/login.js — Google OAuth + clearly-marked demo sign-in. */

views.login = {
  render() {
    const cfg = App.config;

    const langButtons = (cfg.languages || []).filter((l) => l.enabled !== false).map((l) =>
      h('button', {
        class: 'lang-bubble',
        onclick: () => TR.setUiLang(l.code)
      }, `${l.flag} ${l.nativeName}`)
    );

    const googleBtn = h('button', {
      class: 'btn block',
      style: { background: '#fff', color: '#2b2340', boxShadow: '0 4px 12px rgba(0,0,0,.12)', border: '1.5px solid #e0e0e0' },
      onclick: async () => {
        const st = await API.get('/api/auth/google').catch(() => ({ mode: 'mock', configured: false }));
        if (st.mode === 'real' && st.url) {
          window.location.href = st.url;
        } else {
          UI.modal(`
            <h3>🎭 Google OAuth (demo mode)</h3>
            <p class="muted">Google OAuth is not connected on this demo build (no <code>GOOGLE_CLIENT_ID</code>).</p>
            <p class="small muted">Pick the demo account below — this simulates a secure Google sign-in.</p>
            <div class="mt">
              <button class="btn soft block" data-demo>${esc('Demo owner — Vijay Sharma (demo@vyaparvaani.local)')}</button>
              <button class="btn ghost block mt6" data-admin>${esc('Admin — platform admin (admin@vyaparvaani.local)')}</button>
            </div>`)
            .el.querySelector('[data-demo]').addEventListener('click', async (e) => {
              e.target.closest('.modal-backdrop').remove();
              await demoSignIn('demo@vyaparvaani.local');
            });
          const mRoot = document.getElementById('modal-root');
          const backdrop = mRoot.lastElementChild;
          if (backdrop) backdrop.querySelector('[data-admin]').addEventListener('click', async (e) => {
            e.target.closest('.modal-backdrop').remove();
            await demoSignIn('admin@vyaparvaani.local');
          });
        }
      }
    }, [
      h('span', { style: { fontWeight: 700 } }, 'G'),
      h('span', {}, t('continue_with_google'))
    ]);

    const page = h('div', { class: 'login-hero' }, [
      h('div', { class: 'login-inner' }, [
        h('div', { class: 'card login-card' }, [
          h('div', { class: 'avatar lg', style: { background: 'linear-gradient(135deg,#7c3aed,#ff5e7e)', margin: '0 auto' } }, '🗣️'),
          h('h1', { class: 'mt' }, cfg.appName || 'Techo'),
          h('p', { class: 'muted' }, t('welcome')),
          h('div', { class: 'lang-strip' }, langButtons),
          googleBtn,
          h('button', {
            class: 'btn soft block mt',
            onclick: () => demoSignIn('demo@vyaparvaani.local')
          }, `${t('demo')} → Vijay Sharma`),
          h('p', { class: 'small muted mt', style: { fontSize: '.78rem' } }, t('disclaimer_short'))
        ])
      ])
    ]);

    return page;
  }
};

async function demoSignIn(email) {
  try {
    const data = await API.post('/api/auth/demo', { email });
    App.session = { user: data.user };
    // Chrome stays English-only; conversation languages are untouched.
    TR.setUiLang('en');
    await loadAvatarCache();
    App.applyTheme();
    UI.toast('Signed in as ' + (data.user.name || ''), 'good');
    Router.navigate('/home');
  } catch (e) {
    UI.toast('Sign in failed: ' + e.message, 'bad');
  }
}

window.demoSignIn = demoSignIn;

// cache the user's active avatar + voice for shell/theme rendering
async function loadAvatarCache() {
  try {
    const p = await API.get('/api/me/preferences');
    App.avatar = p.avatar;
    App.voice = p.voice;
  } catch { /* ignore */ }
}
window.loadAvatarCache = loadAvatarCache;
