/* views/settings.js — UI language, background theme, provider status, account. */

views.settings = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '⚙️ ' + t('tab_settings')));

    // UI language
    const langCard = h('div', { class: 'card mt' }, [h('h3', {}, t('language') + ' (UI)')]);
    const langs = (App.config.languages || []).filter((l) => l.enabled !== false);
    const chips = h('div', { class: 'quick-chips mt' });
    langs.forEach((l) => {
      chips.appendChild(h('button', { class: `chip ${App.session.user.uiLang === l.code ? 'selected' : ''}`, onclick: async () => {
        await API.put('/api/me/preferences', { uiLang: l.code });
        App.session.user.uiLang = l.code;
        TR.setUiLang(l.code);
        UI.toast('Language set: ' + l.nativeName);
        setTimeout(() => views.settings.render(), 300);
      } }, `${l.flag} ${l.nativeName}`));
    });
    langCard.appendChild(chips);
    el.appendChild(langCard);

    // Preferred reply language (AI responds in this)
    const replyCard = h('div', { class: 'card mt' }, [h('h3', {}, 'AI reply language (preferred)')]);
    const repChips = h('div', { class: 'quick-chips mt' });
    langs.forEach((l) => {
      repChips.appendChild(h('button', { class: `chip ${App.session.user.preferredLang === l.code ? 'selected' : ''}`, onclick: async () => {
        await API.put('/api/me/preferences', { preferredLang: l.code });
        App.session.user.preferredLang = l.code;
        UI.toast('AI will reply in ' + l.nativeName);
      } }, `${l.flag} ${l.nativeName}`));
    });
    replyCard.appendChild(repChips);
    el.appendChild(replyCard);

    // Business World scene (background pixel environment — themes & AI unchanged)
    const worldCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Business World scene'),
      h('div', { class: 'small muted' }, 'The pixel environment behind the app. This only changes the background — themes, reminders and AI behaviour stay exactly the same.')
    ]);
    const scenes = (window.PixelWorld && PixelWorld.listScenes()) || [];
    const picker = h('div', { class: 'scene-picker mt' });
    scenes.forEach((sc) => {
      const active = App.scene === sc.id;
      const btn = h('button', {
        type: 'button', 'aria-pressed': String(active),
        class: 'scene-card ' + sc.id + (active ? ' active' : ''), title: sc.desc
      }, [
        h('div', { class: 'sc-prev' }, [h('div', { class: 'sc-build' })]),
        h('div', { class: 'sc-name' }, sc.name),
        h('div', { class: 'sc-desc' }, sc.desc)
      ]);
      btn.addEventListener('click', async () => {
        try { localStorage.setItem('vv-scene', sc.id); } catch (e) { /* ignore */ }
        App.scene = sc.id;
        try { if (window.PixelWorld) PixelWorld.setScene(sc.id); } catch (e) { /* ignore */ }
        try { await API.put('/api/me/preferences', { themeId: 'scene_' + sc.id, themeCustom: null }); } catch (e) { /* ignore */ }
        App.applyTheme();
        UI.toast('Scene: ' + sc.name + '.');
        views.settings.render();
      });
      picker.appendChild(btn);
    });
    worldCard.appendChild(picker);
    el.appendChild(worldCard);

    // Background theme (Living Digital Dukaan presets)
    const themeCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Background / theme')]);
    const themes = App.config.themes || [];
    const groups = [
      { label: 'Default', ids: ['th_dukaan'] },
      { label: 'Light', ids: ['th_market', 'th_lavender', 'th_paper'] },
      { label: 'Dark', ids: ['th_dark', 'th_ocean'] },
      { label: 'Colorful', ids: ['th_sunrise', 'th_meadow', 'th_saree', 'th_chai'] }
    ];
    groups.forEach((g) => {
      themeCard.appendChild(h('div', { class: 'small muted', style: { fontWeight: 700, margin: '14px 0 6px', textTransform: 'uppercase', letterSpacing: '.03em' } }, g.label));
      const grid = h('div', { class: 'grid3' });
      const list = themes.filter((th) => g.ids.includes(th.id));
      list.forEach((th) => {
        const selected = App.session.user.themeId === th.id && !App.session.user.themeCustom;
        grid.appendChild(h('button', {
          class: 'card', style: {
            background: th.value, border: selected ? '3px solid var(--brand)' : '1px solid var(--line)',
            color: th.mode === 'dark' ? '#fff' : '#2b2340', textAlign: 'center', cursor: 'pointer', padding: 16, minHeight: 64
          },
          onclick: async () => {
            await API.put('/api/me/preferences', { themeId: th.id, themeCustom: null });
            App.session.user.themeId = th.id;
            App.session.user.themeCustom = null;
            App.applyTheme();
            UI.toast('Theme: ' + th.name);
          }
        }, th.name));
      });
      themeCard.appendChild(grid);
    });
    themeCard.appendChild(h('div', { class: 'field mt' }, [h('label', {}, 'Or upload a background image')]));
    const fileI = h('input', { type: 'file', accept: 'image/*' });
    themeCard.querySelector('.field').appendChild(fileI);
    fileI.addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = async () => {
        const css = `url(${r.result}) center/cover no-repeat`;
        await API.put('/api/me/preferences', { themeCustom: css });
        App.session.user.themeCustom = css;
        App.applyTheme();
        UI.toast('Background updated.');
      };
      r.readAsDataURL(f);
    });
    themeCard.appendChild(h('button', { class: 'btn ghost sm mt', onclick: async () => {
      await API.put('/api/me/preferences', { themeId: 'th_dukaan', themeCustom: null });
      App.session.user.themeId = 'th_dukaan'; App.session.user.themeCustom = null;
      App.applyTheme(); UI.toast('Living Digital Dukaan theme restored.');
    } }, '↺ Reset to Living Digital Dukaan'));

    // Motion & performance preferences (reduced motion + low-performance mode)
    const perf = h('div', { class: 'card mt' }, [h('h3', {}, 'Motion & performance')]);
    const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lp = h('div', { class: 'switch-row' }, [
      h('span', { style: { fontWeight: 600, flex: 1 } }, 'Low-performance mode'),
      h('span', { class: 'small muted' }, 'Disable animations & 3D effects'),
      h('label', { class: 'switch' }, [
        h('input', { type: 'checkbox', checked: !!document.getElementById('app') && /low-perf/.test(document.body.className) }),
        h('span', { class: 'slider' })
      ])
    ]);
    lp.querySelector('input').addEventListener('change', (e) => {
      if (window.App3D) App3D.setLowPerf(e.target.checked);
      try { document.body.classList.toggle('low-perf', e.target.checked); if (window.PixelWorld) PixelWorld.refresh(); } catch (err) { /* ignore */ }
      localStorage.setItem('vv-lowperf', e.target.checked ? '1' : '');
      UI.toast(e.target.checked ? 'Low-performance mode ON.' : 'Low-performance mode OFF.', 'good');
    });
    perf.appendChild(lp);
    // Reduced-motion toggle (works even when the OS prefers-motion is off)
    const rmOn = document.body.classList.contains('reduced');
    const rmRow = h('div', { class: 'switch-row' }, [
      h('span', { style: { fontWeight: 600, flex: 1 } }, 'Reduced motion'),
      h('span', { class: 'small muted' }, 'Pause ambient animation in the Business World'),
      h('label', { class: 'switch' }, [
        h('input', { type: 'checkbox', checked: rmOn }),
        h('span', { class: 'slider' })
      ])
    ]);
    rmRow.querySelector('input').addEventListener('change', (e) => {
      document.body.classList.toggle('reduced', e.target.checked);
      try { localStorage.setItem('vv-reduced', e.target.checked ? '1' : ''); } catch (err) { /* ignore */ }
      try { if (window.PixelWorld) PixelWorld.refresh(); } catch (err) { /* ignore */ }
      UI.toast(e.target.checked ? 'Reduced motion ON — world animation paused.' : 'Reduced motion OFF.', 'good');
    });
    perf.appendChild(rmRow);
    if (reducedMotion) {
      perf.appendChild(h('div', { class: 'small muted mt6' }, 'System reduced-motion is on — animations are already minimal.'));
    }
    perf.appendChild(h('div', { class: 'small muted mt6' }, 'Tip: enable low-performance mode on low-end devices or when the screen feels laggy.'));
    themeCard.appendChild(perf);
    el.appendChild(themeCard);

    // Agora / real-time voice integration (target of the "Agora Integration" nav item)
    const agoraCard = h('div', { class: 'card mt', id: 'realtime-section' }, [h('h3', {}, '🎛️ Agora Integration (real-time voice)')]);
    agoraCard.appendChild(h('div', { class: 'small muted' }, 'Agora RTC powers low-latency, real-time voice. Status below reflects the configured provider (mock/demo until AGORA_APP_ID is set).'));
    el.appendChild(agoraCard);
    renderRealtime(agoraCard);

    // Provider / architecture status
    const provCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Architecture & providers')]);
    el.appendChild(provCard);
    renderProviders(provCard);

    // Account
    const acctCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Account'),
      h('div', { class: 'small muted' }, (App.session.user.name || '') + ' · ' + (App.session.user.email || '') + ' · role: ' + (App.session.user.role || '')),
      h('button', { class: 'btn danger sm mt', onclick: async () => {
        await API.post('/api/auth/logout');
        App.session = null;
        Router.navigate('/login');
      } }, 'Log out')
    ]);
    el.appendChild(acctCard);

    // Restore saved low-performance preference
    if (window.App3D && localStorage.getItem('vv-lowperf') === '1') App3D.setLowPerf(true);
    if (localStorage.getItem('vv-reduced') === '1') document.body.classList.add('reduced');

    // If we arrived via the "Agora Integration" nav item, scroll to the realtime section
    if (App.pendingSection === 'realtime') {
      App.pendingSection = null;
      setTimeout(() => {
        const sec = document.getElementById('realtime-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    }

    return el;
  }
};

function renderRealtime(card) {
  const providers = (App.config && App.config.providers && App.config.providers.fullRegistry) || {};
  const rt = providers.realtime || {};
  const isMock = !rt.configured || String(rt.provider || '').toLowerCase().includes('mock') || String(rt.provider || '').toLowerCase().includes('browser');
  card.appendChild(h('div', { class: 'list-item' }, [
    h('span', { style: { fontSize: '1.5rem' } }, '🎛️'),
    h('div', { style: { flex: 1 } }, [
      h('div', { style: { fontWeight: 700 } }, 'Real-time voice: ' + (rt.provider || 'not configured')),
      h('div', { class: 'small muted' }, rt.note || 'Configure with AGORA_APP_ID / AGORA_APP_CERTIFICATE to enable live voice.')
    ]),
    h(isMock ? 'span' : 'span', { class: isMock ? 'tag warn' : 'tag good' }, isMock ? 'Mock/fallback' : 'Connected')
  ]));
  const env = {
    AGORA_APP_ID: !!(window.__PROVIDERS && typeof window.__PROVIDERS === 'object' ? window.__PROVIDERS.agoraConfigured : false)
  };
  card.appendChild(h('div', { class: 'small muted mt6' },
    'Agora status: ' + (env.AGORA_APP_ID ? 'configured' : 'not configured (mock/demo mode)') +
    ' — the chat "Talk to Techo" screen uses browser Web Speech until Agora is connected.'));
}

function isLight(bg) {
  if (!bg || bg === '#ffffff') return true;
  return /white|sunrise|meadow|lavender|#ffffff|#a8edea|#fed6e3/i.test(bg);
}

function renderProviders(card) {
  const providers = (App.config && App.config.providers && App.config.providers.fullRegistry) || {};
  const order = [
    { k: 'realtime', icon: '🎛️', label: 'Real-time voice (RTC)' },
    { k: 'asr', icon: '🎤', label: 'Speech-to-text (ASR)' },
    { k: 'tts', icon: '🔊', label: 'Text-to-speech (TTS)' },
    { k: 'llm', icon: '🧠', label: 'AI language model' },
    { k: 'telephony', icon: '📞', label: 'Telephony / outbound calls' },
    { k: 'avatar', icon: '👤', label: 'Avatar' },
    { k: 'humanAgent', icon: '🧑‍⚖️', label: 'Human-agent' }
  ];
  order.forEach(({ k, icon, label }) => {
    const p = providers[k] || {};
    const isMock = !p.configured || String(p.provider || '').toLowerCase().includes('mock') || String(p.provider || '').toLowerCase().includes('browser') || k === 'avatar';
    card.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.3rem' } }, icon),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, label + ': ' + p.provider),
        h('div', { class: 'small muted' }, p.note || '')
      ]),
      h(isMock ? 'span' : 'span', { class: isMock ? 'tag warn' : 'tag good' }, isMock ? 'Mock/fallback' : 'Connected')
    ]));
  });
}
