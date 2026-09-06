/* views/surveys.js — business surveys, scheduled outbound calls, analysis, reviews. */

views.surveys = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('div', { class: 'between wrap' }, [
      h('h2', {}, '📋 ' + t('tab_surveys')),
      h('button', { class: 'btn sm', onclick: () => newSurveyModal() }, '➕ New')
    ]));

    const tabs = h('div', { class: 'tabs' });
    ['surveys', 'calls', 'reviews'].forEach((k) => {
      tabs.appendChild(h('button', { class: 'tab', onclick: () => { render(k); } }, tabLabel(k)));
    });
    el.appendChild(tabs);

    const body = h('div', {});
    el.appendChild(body);

    const render = async (section) => {
      body.innerHTML = '';
      body.appendChild(UI.skeleton(2));
      try {
        if (section === 'surveys') { const d = await API.get('/api/surveys'); renderSurveys(body, d.surveys); }
        else if (section === 'calls') { const d = await API.get('/api/calls'); renderCalls(body, d.calls); }
        else { const d = await API.get('/api/reviews'); renderReviews(body, d.reviews); }
      } catch (e) { body.querySelectorAll('.skeleton').forEach((x) => x.remove()); body.appendChild(UI.empty('📋', 'Could not load.')); }
    };
    render('surveys');
    return el;
  }
};

function tabLabel(k) { return { surveys: '📋 Surveys', calls: '📞 Calls', reviews: '⭐ Reviews' }[k] || k; }

function renderSurveys(body, surveys) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  if (!surveys.length) { body.appendChild(UI.empty('📋', t('empty'))); return; }
  surveys.forEach((s) => {
    const item = h('div', { class: 'card mt' }, [
      h('div', { class: 'between wrap' }, [
        h('h3', { style: { margin: 0 } }, s.title),
        UI.statusTag(s.status)
      ]),
      h('p', { class: 'muted small' }, s.description || ''),
      h('div', { class: 'row wrap small' }, [
        h('span', { class: 'tag' }, `${s.questions.length} Qs`),
        h('span', { class: 'tag' }, `${s.responseCount} ${t('sales') === 'Bikri' ? 'responses' : 'responses'}`),
        h('span', { class: 'tag neutral' }, (s.contacts || []).length + ' contacts')
      ]),
      h('div', { class: 'row wrap mt' }, [
        h('button', { class: 'btn sm soft', onclick: () => scheduleCalls(s) }, '📞 ' + t('edit')),
        h('button', { class: 'btn sm soft', onclick: () => simulateRespondents(s) }, '🎭 Simulate'),
        h('button', { class: 'btn sm soft', onclick: () => viewResponses(s) }, '📊 ' + t('edit')),
        h('button', { class: 'btn sm soft', onclick: () => exportCSV(s) }, '⬇️ CSV')
      ])
    ]);
    body.appendChild(item);
  });
}

function renderCalls(body, calls) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  if (!calls.length) { body.appendChild(UI.empty('📞', 'No calls yet — schedule from a survey.')); return; }
  calls.slice(0, 20).forEach((c) => {
    const sim = c.simulated || c.channel === 'mock-voice';
    body.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.4rem' } }, '📞'),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, c.contact || 'Owner/myself'),
        h('div', { class: 'small muted' }, (c.kind || 'survey') + ' · ' + new Date(c.scheduled).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + (c.durationSec ? ` · ${c.durationSec}s` : ''))
      ]),
      sim ? h('span', { class: 'tag warn' }, 'Simulated') : null,
      UI.statusTag(c.status)
    ]));
  });
}

function renderReviews(body, reviews) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  if (!reviews.length) { body.appendChild(UI.empty('⭐', 'No reviews yet — collect them via surveys.')); return; }
  reviews.forEach((r) => {
    body.appendChild(h('div', { class: 'card mt' }, [
      h('div', { class: 'between' }, [
        h('div', { class: 'row' }, [
          h('span', { style: { fontSize: '1.4rem' } }, '⭐'.repeat(r.rating) + '☆'.repeat(5 - r.rating)),
          h('span', { class: 'muted small' }, r.contact || '')
        ]),
        UI.statusTag(r.sentiment || 'neutral')
      ]),
      h('p', { class: 'mt6' }, r.text || ''),
      h('div', { class: 'small muted' }, (r.source || 'voice') + ' · ' + new Date(r.at).toLocaleDateString('en-IN'))
    ]));
  });
}

/* ---- schedule consent-gated calls to selected contacts ---- */
async function scheduleCalls(s) {
  const contacts = await loadContacts();
  const checkboxes = [];
  const list = h('div', { class: 'mt' });
  contacts.forEach((c) => {
    const box = h('input', { type: 'checkbox', value: c.id, checked: (s.contacts || []).includes(c.id) });
    checkboxes.push(box);
    list.appendChild(h('div', { class: 'switch-row' }, [box, h('label', { style: { fontWeight: 600 } }, `${c.name} · ${c.phone}`)]));
  });

  const m = UI.modal(`<h3>📞 Schedule outbound calls</h3>
    <p class="small muted">Outbound calls need explicit consent. Mock telephony simulates the calls (no real dialing).</p>`);
  const body = m.el.querySelector('.modal');
  body.appendChild(list);
  const consentRow = h('div', { class: 'switch-row' }, [
    h('label', { class: 'switch' }, [h('input', { type: 'checkbox', id: 'call-consent' }), h('span', { class: 'slider' })]),
    h('span', { class: 'small' }, 'I consent to mock calls to these contacts')
  ]);
  body.appendChild(consentRow);
  const btn = h('button', { class: 'btn block mt' }, 'Start ' + (checkboxes.filter((b) => b.checked).length || 0) + ' calls');
  body.appendChild(btn);
  btn.addEventListener('click', async () => {
    const ok = consentRow.querySelector('input').checked;
    if (!ok) { UI.toast('Please consent first.', 'warn'); return; }
    const ids = checkboxes.filter((b) => b.checked).map((b) => b.value);
    try {
      const res = await API.post('/api/surveys/' + s.id + '/schedule-calls', { contacts: ids, consent: true });
      m.close(); UI.toast(`Scheduled ${res.count} mock call(s).`, 'good');
      setTimeout(() => views.surveys.render(), 400);
    } catch (e) { UI.toast(e.message, 'bad'); }
  });
}

async function loadContacts() {
  try {
    const res = await API.get('/api/contacts');
    return res.contacts || [];
  } catch {
    return [];
  }
}

async function simulateRespondents(s) {
  try {
    const res = await API.post('/api/surveys/' + s.id + '/simulate-respondents');
    UI.toast(`${res.created} simulated spoken responses added (demo).`, 'good');
    setTimeout(() => views.surveys.render(), 400);
  } catch (e) { UI.toast(e.message, 'bad'); }
}

async function viewResponses(s) {
  try {
    const data = await API.get('/api/surveys/' + s.id + '/responses');
    const { responses, analysis } = data;
    const m = UI.modal(`
      <h3>📊 ${esc(s.title)}</h3>
      <div class="small muted">${responses.length} responses</div>`);
    const body = m.el.querySelector('.modal');
    body.appendChild(h('p', { class: 'small' }, analysis.summary || ''));
    if (analysis.ratings) {
      Object.entries(analysis.ratings).forEach(([qid, r]) => {
        body.appendChild(h('div', { class: 'row between mt6' }, [
          h('span', {}, 'Q' + qid.replace('q', '') + ' rating'),
          h('span', { class: 'tag' }, '★ ' + r.avg + ' / 5')
        ]));
      });
    }
    for (let i = 0; i < s.questions.length; i++) {
      const q = s.questions[i];
      const res = analysis.counts[q.id];
      if (res) {
        body.appendChild(h('div', { class: 'field mt' }, [h('label', {}, q.text)]));
        Object.entries(res).filter(([, v]) => v > 0).forEach(([opt, cnt]) => {
          body.appendChild(h('div', { class: 'list-item small' }, [h('div', { style: { flex: 1 } }, opt), h('span', { class: 'tag' }, cnt + '')]));
        });
      }
    }
    if (analysis.openComments && analysis.openComments.length) {
      body.appendChild(h('div', { class: 'mt' }, [h('label', { class: 'small muted' }, 'Spoken answers → text:')]));
      analysis.openComments.forEach((c) => body.appendChild(h('div', { class: 'card-sm small muted', style: { padding: '7px 10px', background: '#faf8ff', borderRadius: 8 } }, '🗣 ' + c)));
    }
    const close = h('button', { class: 'btn ghost block mt' }, t('close') || 'Close');
    body.appendChild(close);
    close.addEventListener('click', () => m.close());
  } catch (e) { UI.toast('Failed to load responses.', 'bad'); }
}

function newSurveyModal() {
  const titleI = h('div', { class: 'field' }, [h('label', {}, 'Title')]); titleI.appendChild(h('input', { value: '' }));
  const descI = h('div', { class: 'field' }, [h('label', {}, 'Description')]); descI.appendChild(h('textarea', { value: '' }));
  const questionsWrap = h('div', { class: 'mt' }, []);
  const qBoxes = [];

  const addQ = () => {
    const type = h('select', {}, ['choice', 'voice', 'rating'].map((x) => h('option', { value: x }, x)));
    const text = h('input', { placeholder: 'Question text', style: { flex: 1 } });
    qBoxes.push({ type, text });
    const row = h('div', { class: 'row mt6' }, [type, text, h('button', { class: 'icon-btn sm', onclick: () => { row.remove(); }, style: { color: 'var(--bad)' } }, '✕')]);
    questionsWrap.appendChild(row);
  };

  const m = UI.modal(`<h3>➕ New survey</h3>`);
  const body = m.el.querySelector('.modal');
  [titleI, descI].forEach((f) => body.appendChild(f));
  body.appendChild(h('div', { class: 'field' }, [h('label', {}, 'Questions'), questionsWrap]));
  body.appendChild(h('button', { class: 'btn soft sm', onclick: addQ }, '+ Add question'));
  addQ(); addQ(); addQ();

  const langSel = h('div', { class: 'field mt' }, [h('label', {}, 'Language'), h('select', {}, (App.config.languages || []).map((l) => h('option', { value: l.code }, `${l.flag} ${l.nativeName}`)))]);
  body.appendChild(langSel);

  const consentRow = h('div', { class: 'switch-row' }, [
    h('label', { class: 'switch' }, [h('input', { type: 'checkbox', id: 'sv-consent' }), h('span', { class: 'slider' })]),
    h('span', { class: 'small' }, 'I consent to collect & record spoken answers')
  ]);
  body.appendChild(consentRow);

  const save = h('button', { class: 'btn block mt' }, t('save'));
  body.appendChild(save);
  save.addEventListener('click', async () => {
    if (!consentRow.querySelector('input').checked) { UI.toast('Consent required to record spoken answers.', 'warn'); return; }
    const questions = qBoxes.filter((q) => q.text.value.trim()).map((q) => ({
      type: q.type.value === 'rating' ? 'rating' : (q.type.value === 'voice' ? 'voice' : 'choice'),
      text: q.text.value,
      options: q.type.value === 'choice' ? ['Option 1', 'Option 2', 'Option 3'] : undefined
    }));
    if (!titleI.querySelector('input').value || !questions.length) { UI.toast('Title and at least one question needed.', 'warn'); return; }
    try {
      await API.post('/api/surveys', {
        title: titleI.querySelector('input').value,
        description: descI.querySelector('textarea').value,
        language: langSel.querySelector('select').value,
        consent: true,
        questions,
        contacts: []
      });
      m.close(); UI.toast('Survey created.'); views.surveys.render();
    } catch (e) { UI.toast('Failed: ' + e.message, 'bad'); }
  });
}

async function exportCSV(s) {
  try {
    const r = await API.post('/api/surveys/' + s.id + '/export', {});
    const url = r.url;
    window.open(url, '_blank');
    UI.toast('CSV exported: ' + r.rows + ' rows.', 'good');
  } catch (e) {
    if (e.status === 400 && e.data && e.data.error === 'no_responses') {
      UI.toast('No responses to export yet. Simulate some first.', 'warn');
    } else {
      UI.toast('Export failed: ' + e.message, 'bad');
    }
  }
}
