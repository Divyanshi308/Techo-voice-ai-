/* views/support.js — human-escalation workflow & expert directory. */

views.support = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🙋 ' + t('cases')));

    // Escalate form
    const formCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Escalate to a human expert'),
      h('p', { class: 'small muted' }, 'For legal, financial or complex questions a full case summary (your message, language, transcript, business details & AI recommendation) is handed to a qualified expert.'),
      h('div', { class: 'field mt' }, [h('label', {}, 'Your question / situation')])
    ]);
    const area = h('textarea', { placeholder: 'Describe the situation... e.g. GST registration or lease contract question' });
    formCard.querySelector('.field').appendChild(area);

    const catSel = h('div', { class: 'field' }, [h('label', {}, 'Category'), h('select', {}, ['legal', 'finance', 'marketing', 'general'].map((c) => h('option', { value: c }, c)))]);
    const langSel = h('div', { class: 'field' }, [h('label', {}, 'Language'), h('select', {}, (App.config.languages || []).map((l) => h('option', { value: l.code }, `${l.flag} ${l.nativeName}`)))]);
    const grid = h('div', { class: 'grid2 mt' }, [catSel, langSel]);
    formCard.appendChild(grid);
    formCard.appendChild(h('div', { class: 'switch-row' }, [
      h('label', { class: 'switch' }, [h('input', { type: 'checkbox', id: 'esc-consent' }), h('span', { class: 'slider' })]),
      h('span', { class: 'small' }, 'I consent to share this case & recording with a qualified expert')
    ]));
    const btn = h('button', { class: 'btn block mt' }, 'Create case & notify expert');
    formCard.appendChild(btn);
    btn.addEventListener('click', async () => {
      if (!formCard.querySelector('#esc-consent').checked) { UI.toast('Consent required to escalate.', 'warn'); return; }
      if (!area.value.trim()) { UI.toast('Please describe your question.', 'warn'); return; }
      try {
        const res = await API.post('/api/cases', {
          message: area.value.trim(),
          category: catSel.querySelector('select').value,
          language: langSel.querySelector('select').value,
          consent: true
        });
        UI.toast('Case created: ' + res.case.id, 'good');
        area.value = '';
        loadCases(listCard);
      } catch (e) { UI.toast('Failed: ' + e.message, 'bad'); }
    });
    el.appendChild(formCard);

    // My cases
    const listCard = h('div', { class: 'card mt' }, [h('h3', {}, 'My cases'), UI.skeleton(2)]);
    el.appendChild(listCard);
    await loadCases(listCard);

    // Experts directory
    const expCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Experts'), UI.skeleton(2)]);
    el.appendChild(expCard);
    await loadExperts(expCard);

    return el;
  }
};

async function loadCases(card) {
  try {
    const data = await API.get('/api/cases');
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    const cases = data.cases || [];
    if (!cases.length) { card.appendChild(UI.empty('🙋', 'No cases yet.')); return; }
    cases.forEach((c) => {
      const item = h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.4rem' } }, '🧑‍⚖️'),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, c.consultTitle || c.summary.topic),
          h('div', { class: 'small muted' }, '#' + c.id.slice(-8) + ' · ' + (c.language || '') + ' · ' + (c.expert ? c.expert.name : 'unassigned')),
          h('div', { class: 'small muted' }, (c.summary.recommendation || '').slice(0, 90))
        ]),
        UI.statusTag(c.status),
        h('button', { class: 'icon-btn sm', onclick: () => viewCase(c), style: { fontSize: '1rem' } }, '→')
      ]);
      card.appendChild(item);
    });
  } catch (e) { card.querySelectorAll('.skeleton').forEach((x) => x.remove()); }
}

async function viewCase(c) {
  try {
    const data = await API.get('/api/cases/' + c.id);
    const full = data.case;
    const m = UI.modal(`
      <h3>${esc(full.consultTitle || 'Case')}</h3>
      <div class="small muted">#${esc(full.id)} · priority ${esc(full.priority)}</div>`);
    const body = m.el.querySelector('.modal');
    body.appendChild(h('div', { class: 'field mt' }, [h('label', {}, 'Transcript / message'), h('div', { class: 'small muted', style: { background: '#faf8ff', padding: 10, borderRadius: 8 } }, esc(full.transcript))]));
    body.appendChild(h('div', { class: 'field' }, [h('label', {}, 'AI recommendation'), h('div', { class: 'small muted', style: { background: '#faf8ff', padding: 10, borderRadius: 8 } }, esc(full.summary.recommendation))]));
    if (full.timeline && full.timeline.length) {
      body.appendChild(h('div', { class: 'small muted mt' }, 'Timeline:'));
      full.timeline.forEach((tn) => body.appendChild(h('div', { class: 'small muted', style: { padding: '3px 0' } }, '• ' + esc(tn.note))));
    }
    const close = h('button', { class: 'btn ghost block mt' }, 'Close');
    body.appendChild(close);
    close.addEventListener('click', () => m.close());
  } catch (e) { UI.toast('Failed to load case.', 'bad'); }
}

async function loadExperts(card) {
  try {
    const data = await API.get('/api/experts');
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    const experts = data.experts || [];
    if (!experts.length) { card.appendChild(UI.empty('👨‍⚕️', 'No experts.')); return; }
    experts.forEach((e) => {
      card.appendChild(h('div', { class: 'list-item' }, [
        h('div', { class: 'avatar sm', style: { background: '#7c5cff' } }, '👨‍⚕️'),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, e.name + ' — ' + e.role),
          h('div', { class: 'small muted' }, (e.services || []).join(' · ')),
          h('div', { class: 'small muted' }, (e.lang || []).join(', ') + ' · ' + (e.hourly || ''))
        ]),
        e.available ? h('span', { class: 'tag good' }, 'Available') : h('span', { class: 'tag neutral' }, 'Away')
      ]));
    });
  } catch (e) { card.querySelectorAll('.skeleton').forEach((x) => x.remove()); }
}
