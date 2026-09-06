/* views/language.js — Language Settings.
   18-language grid with native+English names, status badges, voice preview,
   code-switching options, response language lock, and transliteration toggle. */

views.language = {
  state: { preview: null, transliterate: false },

  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🌐 ' + TR.t('language') + ' Settings'));

    const langs = (App.config.languages || []).filter((l) => l.enabled !== false);
    const prefs = App.session.user.langPrefs || {};
    const S = this.state;

    // ── Response language lock card ──
    const lockCard = h('div', { class: 'card mt' }, [
      h('h3', {}, TR.t('response_lang')),
      h('div', { class: 'small muted mb', style: { lineHeight: 1.6 } }, 'Lock the assistant\'s reply language, or let it follow what you speak.'),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap' } }, [
        h('button', {
          class: `chip ${!prefs.lockResponseLang ? 'selected' : ''}`,
          onclick: async () => { await saveLangPrefs({ lockResponseLang: false }); views.language.render(); }
        }, '🔄 ' + TR.t('auto_detect')),
        h('button', {
          class: `chip ${prefs.lockResponseLang ? 'selected' : ''}`,
          onclick: async () => { await saveLangPrefs({ lockResponseLang: true }); views.language.render(); }
        }, '🔒 ' + TR.t('lock_response')),
        h('button', {
          class: `chip ${prefs.allowSwitch === false ? 'selected' : ''}`,
          onclick: async () => { await saveLangPrefs({ allowSwitch: prefs.allowSwitch === false ? true : false }); views.language.render(); }
        }, prefs.allowSwitch === false ? '🚫 Switch blocked' : '🔀 ' + TR.t('allow_switching'))
      ])
    ]);
    el.appendChild(lockCard);

    // ── Transcript display card ──
    const dispCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Transcript display'),
      h('div', { class: 'row', style: { gap: '8px', flexWrap: 'wrap', marginTop: '8px' } }, [
        h('button', {
          class: `chip ${prefs.showNative !== false ? 'selected' : ''}`,
          onclick: async () => { await saveLangPrefs({ showNative: true }); views.language.render(); }
        }, '📜 ' + TR.t('native_transcript')),
        h('button', {
          class: `chip ${prefs.showRoman ? 'selected' : ''}`,
          onclick: async () => { await saveLangPrefs({ showRoman: !prefs.showRoman }); views.language.render(); }
        }, '🔤 ' + TR.t('roman_transcript'))
      ])
    ]);
    el.appendChild(dispCard);

    // ── 18-language grid ──
    el.appendChild(h('div', { class: 'card mt' }, [
      h('h3', {}, TR.t('choose_language')),
      h('div', { class: 'small muted mb', style: { lineHeight: 1.5 } }, 'Each language shows its provider-aware status and a voice preview.')
    ]));

    const grid = h('div', { class: 'lang-grid' });
    for (const l of langs) {
      const entry = (typeof LangReg !== 'undefined') ? LangReg.get(l.code) : null;
      const st = l.status || 'not-configured';
      const stLabel = (typeof LangReg !== 'undefined') ? LangReg.statusBadge(st) : { cls: '', text: st };
      const isUI = App.session.user.uiLang === l.code;
      const isPref = App.session.user.preferredLang === l.code;

      const card = h('div', { class: 'lang-card' + (isUI ? ' ui-active' : '') + (isPref ? ' pref-active' : '') });

      // Header row: flag + names + badges
      const hdr = h('div', { class: 'lang-hdr' });
      hdr.appendChild(h('span', { class: 'lang-flag' }, l.flag || '🌐'));
      const names = h('div', { class: 'lang-names' });
      names.appendChild(h('span', { class: 'lang-name' }, l.name));
      names.appendChild(h('span', { class: 'lang-native' }, l.nativeName));
      hdr.appendChild(names);
      // Status badge
      const badge = h('span', { class: 'lang-badge ' + stLabel.cls }, stLabel.text);
      hdr.appendChild(badge);
      card.appendChild(hdr);

      // Provider info
      if (l.locales) {
        const provs = Object.entries(l.locales).map(([k, v]) => k + ':' + v).join(' · ');
        card.appendChild(h('div', { class: 'lang-provs small muted', style: { fontSize: '.7rem', marginTop: '2px' } }, provs));
      }

      // Sample greeting (transliterated if toggled)
      let sample = (entry && entry.sample) || '';
      if (S.transliterate && typeof LangReg !== 'undefined') {
        const tr = LangReg.transliterate(l.code, sample);
        if (tr && tr !== sample) sample += ' → ' + tr;
      }
      if (sample) card.appendChild(h('div', { class: 'lang-sample small', style: { marginTop: '4px', fontStyle: 'italic' } }, '🗣 ' + sample));

      // Action buttons
      const btns = h('div', { class: 'row', style: { gap: '4px', marginTop: '6px', flexWrap: 'wrap' } });

      // Voice preview
      btns.appendChild(h('button', { class: 'chip sm', onclick: () => {
        if (typeof Voice !== 'undefined') Voice.previewVoice(l.code);
        UI.toast('Playing ' + l.name + ' voice…', 'info');
      } }, '🔊 ' + TR.t('voice_preview')));

      // Set as UI language (UI stays English; voice + text replies stay multilingual)
      const uiLocked = l.code !== 'en';
      btns.appendChild(h('button', {
        class: 'chip sm' + (isUI ? ' selected' : '') + (uiLocked ? ' disabled' : ''),
        title: uiLocked ? 'The app interface stays in English; you can still speak and get replies in ' + l.name + '.' : 'English interface',
        disabled: uiLocked,
        onclick: async () => {
          await API.put('/api/me/preferences', { uiLang: l.code });
          App.session.user.uiLang = l.code;
          TR.setUiLang(l.code);
          UI.toast('App language → ' + l.nativeName, 'good');
          views.language.render();
        }
      }, isUI ? '✓ UI' : 'Set UI'));

      // Set as reply language
      btns.appendChild(h('button', {
        class: 'chip sm' + (isPref ? ' selected' : ''),
        onclick: async () => {
          await API.put('/api/me/preferences', { preferredLang: l.code });
          App.session.user.preferredLang = l.code;
          UI.toast('AI reply → ' + l.nativeName, 'good');
          views.language.render();
        }
      }, isPref ? '✓ Reply' : 'Set Reply'));

      card.appendChild(btns);
      grid.appendChild(card);
    }
    el.appendChild(grid);

    // Transliteration toggle
    el.appendChild(h('div', { class: 'card mt row', style: { alignItems: 'center' } }, [
      h('label', { class: 'small' }, '🔤 Transliterate Devanagari → Roman: '),
      h('button', {
        class: 'chip sm' + (S.transliterate ? ' selected' : ''),
        style: { marginLeft: '6px' },
        onclick: () => { S.transliterate = !S.transliterate; views.language.render(); }
      }, S.transliterate ? 'ON' : 'OFF')
    ]));

    // Code-switching note
    el.appendChild(h('div', { class: 'card mt' }, [
      h('h3', {}, 'Code-switching'),
      h('div', { class: 'small', style: { lineHeight: 1.6 } }, [
        'Mix languages naturally in one sentence — e.g. "Mujhe Gustakh ka invoice chahiye" (Hinglish-English).',
        ' The assistant detects each phrase and replies in your preferred language.',
        ' Web Speech (browser) supports one locale per tap; a real ASR like Deepgram enables true mid-sentence switching.'
      ])
    ]));

    return el;
  }
};

async function saveLangPrefs(patch) {
  const cur = App.session.user.langPrefs || { autoDetect: true, lockResponseLang: false, allowSwitch: true, showNative: true, showRoman: false };
  const updated = { ...cur, ...patch };
  App.session.user.langPrefs = updated;
  try { await API.put('/api/me/preferences', { langPrefs: updated }); } catch (e) { UI.toast('Save failed: ' + e.message, 'bad'); }
}
