/* views/avatar-voice.js — choose avatar + voice, create custom avatar/voice, preview. */

views.avatarVoice = {
  state: { avatars: [], voices: [], custom: [] },

  async render() {
    await loadAvatarVoice(this);
    const S = this.state;
    const el = h('div', {});
    el.appendChild(h('h2', {}, t('tab_voice')));

    // Avatar section
    const avCard = h('div', { class: 'card mt' }, []);
    el.appendChild(avCard);
    renderAvatars(avCard, S, this);

    // Voice section
    const voCard = h('div', { class: 'card mt' }, []);
    el.appendChild(voCard);
    renderVoices(voCard, S);

    return el;
  }
};

async function loadAvatarVoice(view) {
  try {
    const [avatars, voices] = await Promise.all([
      API.get('/api/avatars'),
      API.get('/api/voices')
    ]);
    view.state.avatars = avatars.avatars || [];
    view.state.voices = voices.voices || [];
    const prefs = await API.get('/api/me/preferences').catch(() => null);
    if (prefs) {
      App.avatar = prefs.avatar;
      App.voice = prefs.voice;
    }
    Voice.loadVoices();
  } catch (e) { /* ignore */ }
}

function renderAvatars(card, S, view) {
  card.innerHTML = '';
  card.appendChild(h('div', { class: 'between wrap' }, [
    h('h3', {}, '👤 ' + t('avatar')),
    h('button', { class: 'btn sm soft', onclick: () => customAvatarModal(view) }, '➕ ' + t('edit'))
  ]));

  const grid = h('div', { class: 'grid3 mt' });
  const all = [...S.avatars, ...S.custom];
  if (!all.length) { card.appendChild(UI.empty('👤', t('empty'))); return; }

  all.forEach((av) => {
    const selected = App.avatar && App.avatar.id === av.id;
    const img = av.image ? av.image : null;
    const chip = h('button', {
      class: 'card', style: {
        border: selected ? '3px solid var(--brand)' : '1px solid var(--line)',
        textAlign: 'center', cursor: 'pointer', width: '100%'
      },
      onclick: () => selectAvatar(av.id)
    }, [
      img ? h('img', { src: img, style: { width: 60, height: 60, borderRadius: '50%', objectFit: 'cover' } }) : h('div', { class: 'avatar', style: { background: av.color, margin: '0 auto' } }, av.emoji),
      h('div', { style: { fontWeight: 700, marginTop: 6 } }, av.name),
      h('div', { class: 'small muted' }, (av.tagline || '')),
      selected ? h('span', { class: 'tag good mt6' }, '✓ ' + t('edit')) : h('span', { class: 'small mt6' }, '')
    ]);
    grid.appendChild(chip);
  });
  card.appendChild(grid);
}

async function selectAvatar(id) {
  App.avatar = (App.avatar && App.avatar.id === id) ? App.avatar : null;
  try {
    await API.put('/api/me/preferences', { avatarId: id });
    const prefs = await API.get('/api/me/preferences');
    App.avatar = prefs.avatar;
    UI.toast('Avatar set: ' + (prefs.avatar.name || ''), 'good');
    App.applyTheme();
  } catch (e) { UI.toast('Error: ' + e.message, 'bad'); }
}

function renderVoices(card, S) {
  card.innerHTML = '';
  card.appendChild(h('div', { class: 'between wrap' }, [
    h('h3', {}, '🔊 ' + t('voice')),
    h('button', { class: 'btn sm soft', onclick: () => customVoiceModal() }, '➕ ' + t('edit'))
  ]));

  const grid = h('div', { class: 'grid3 mt' });
  const all = S.voices;
  if (!all.length) { card.appendChild(UI.empty('🔊', t('empty'))); return; }

  const genderIcon = (g) => g === 'feminine' ? '👩' : (g === 'masculine' ? '👨' : '🧑');

  all.forEach((v) => {
    const selected = App.voice && App.voice.id === v.id;
    const chip = h('button', {
      class: 'card', style: {
        border: selected ? '3px solid var(--brand)' : '1px solid var(--line)',
        textAlign: 'center', cursor: 'pointer', width: '100%'
      },
      onclick: () => selectVoice(v.id)
    }, [
      h('div', { style: { fontSize: '1.6rem' } }, genderIcon(v.gender)),
      h('div', { style: { fontWeight: 700 } }, v.name),
      h('div', { class: 'small muted' }, (v.accent || 'Indian') + ' · ' + (v.gender || '')),
      h('div', { class: 'chip mt6', style: { display: 'inline-block' },
        onclick: (e) => { e.stopPropagation(); previewVoice(v); } }, '🔊 ' + t('preview'))
    ]);
    grid.appendChild(chip);
  });
  card.appendChild(grid);
}

function previewVoice(v) {
  const text = App.session.user.business && App.session.user.business.name
    ? `Namaste! Ye ${App.session.user.business.name} ki awaaz hai.`
    : 'Namaste! Main aapki byapar saathi hoon.';
  const lang = v.lang === 'hing' ? 'hing' : v.lang;
  Voice.speak(text, { lang, pitch: v.pitch || 1, rate: v.rate || 1 });
}

async function selectVoice(id) {
  try {
    await API.put('/api/me/preferences', { voiceId: id });
    const prefs = await API.get('/api/me/preferences');
    App.voice = prefs.voice;
    UI.toast('Voice set: ' + (prefs.voice.name || ''), 'good');
  } catch (e) { UI.toast('Error: ' + e.message, 'bad'); }
}

/* ---------- Custom avatar modal (upload own image or configure) ---------- */
async function customAvatarModal(view) {
  const inp = (label, value, type = 'text') => h('div', { class: 'field' }, [h('label', {}, label), h('input', { type, value: value || '', step: 'any' })]);
  const nameI = inp('Name', 'My Assistant');
  const emojiI = inp('Icon (emoji)', '🤖');
  const langSel = h('div', { class: 'field' }, [h('label', {}, 'Language'), h('select', {}, (App.config.languages || []).map((l) => h('option', { value: l.code }, `${l.flag} ${l.nativeName}`)))]);
  const genSel = h('div', { class: 'field' }, [h('label', {}, 'Gender'), h('select', {}, ['feminine', 'masculine', 'neutral'].map((g) => h('option', { value: g }, g)))]);
  const toneI = inp('Tone', 'warm');
  const persI = h('div', { class: 'field' }, [h('label', {}, 'Personality')]);
  persI.appendChild(h('textarea', { value: 'helpful and encouraging' }));
  const colorI = h('div', { class: 'field' }, [h('label', {}, 'Color'), h('input', { type: 'color', value: '#7c5cff' })]);
  const fileWrap = h('div', { class: 'field' }, [h('label', {}, 'Your own image (consent: only files you own)'), h('input', { type: 'file', accept: 'image/*' })]);

  const m = UI.modal(`<h3>➕ ${t('edit')} custom avatar</h3>
    <p class="small muted">Use only an image you own or have permission to use. Techo never clones a real person's face/voice.</p>`);
  const body = m.el.querySelector('.modal');
  [nameI, emojiI, langSel, genSel, toneI, persI, colorI, fileWrap].forEach((f) => body.appendChild(f));
  const prev = h('button', { class: 'btn soft sm mt' }, '🔊 ' + t('preview'));
  body.appendChild(prev);
  let imgData = null;
  fileWrap.querySelector('input[type=file]').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 6000000) { UI.toast('Image must be < 6 MB', 'bad'); return; }
    const r = new FileReader();
    r.onload = () => { imgData = r.result; UI.toast('Image added (preview below).'); };
    r.readAsDataURL(file);
  });
  prev.addEventListener('click', () => {
    const name = nameI.querySelector('input').value || 'Assistant';
    const emoji = emojiI.querySelector('input').value || '🤖';
    const color = colorI.querySelector('input').value;
    const lang = langSel.querySelector('select').value;
    const gender = genSel.querySelector('select').value;
    const pitch = gender === 'feminine' ? 1.08 : (gender === 'masculine' ? 0.9 : 1);
    Voice.speak(`${name} bol raha hai. Mai aapki saath hoon.`, { lang, pitch });
    if (imgData) UI.toast('Image set. Press Save to keep.');
  });
  const save = h('button', { class: 'btn block mt' }, t('save'));
  body.appendChild(save);
  save.addEventListener('click', async () => {
    const payload = {
      name: nameI.querySelector('input').value,
      emoji: emojiI.querySelector('input').value || '🤖',
      lang: langSel.querySelector('select').value,
      gender: genSel.querySelector('select').value,
      tone: toneI.querySelector('input').value,
      personality: persI.querySelector('textarea').value,
      color: colorI.querySelector('input').value,
      image: imgData || null
    };
    try {
      const res = await API.post('/api/avatars/custom', payload);
      await API.put('/api/me/preferences', { avatarId: res.avatar.id });
      App.avatar = res.avatar;
      m.close(); UI.toast('Avatar saved & set.'); 
    } catch (e) { UI.toast('Save failed: ' + e.message, 'bad'); }
  });
}

/* ---------- Custom voice modal ---------- */
function customVoiceModal() {
  const inp = (label, value, type = 'text') => h('div', { class: 'field' }, [h('label', {}, label), h('input', { type, value: value || '' })]);
  const nameI = inp('Name', 'My Voice');
  const genSel = h('div', { class: 'field' }, [h('label', {}, 'Gender'), h('select', {}, ['feminine', 'masculine', 'neutral'].map((g) => h('option', { value: g }, g)))]);
  const accentI = inp('Accent', 'Indian');
  const pitchI = inp('Pitch (0.5–2)', 1, 'number');
  const rateI = inp('Rate (0.5–2)', 1, 'number');

  const m = UI.modal(`<h3>➕ ${t('edit')} custom voice</h3>
    <p class="small muted">Voices are synthesized from your device's speech engine. Snap/consent-based only — no real-person cloning.</p>`);
  const body = m.el.querySelector('.modal');
  [nameI, genSel, accentI, pitchI, rateI].forEach((f) => body.appendChild(f));
  const prev = h('button', { class: 'btn soft sm mt' }, '🔊 ' + t('preview'));
  body.appendChild(prev);
  prev.addEventListener('click', () => {
    const p = Number(pitchI.querySelector('input').value) || 1;
    const r = Number(rateI.querySelector('input').value) || 1;
    Voice.speak('Aapki awaaz taiyaar hai. Preview shalu.', { lang: 'hing', pitch: p, rate: r });
  });
  const save = h('button', { class: 'btn block mt' }, t('save'));
  body.appendChild(save);
  save.addEventListener('click', async () => {
    const payload = {
      name: nameI.querySelector('input').value,
      gender: genSel.querySelector('select').value,
      accent: accentI.querySelector('input').value,
      lang: 'hing',
      pitch: Number(pitchI.querySelector('input').value) || 1,
      rate: Number(rateI.querySelector('input').value) || 1
    };
    try {
      const res = await API.post('/api/voices/custom', payload);
      await API.put('/api/me/preferences', { voiceId: res.voice.id });
      App.voice = res.voice;
      m.close(); UI.toast('Voice saved & set.');
    } catch (e) { UI.toast('Save failed: ' + e.message, 'bad'); }
  });
}
