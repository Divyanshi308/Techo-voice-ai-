/* views/privacy.js — privacy controls: view/download/delete data + consent switches. */

views.privacy = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🔒 ' + t('tab_privacy')));
    el.appendChild(h('div', { class: 'card mt' }, [
      h('p', { class: 'small muted' }, t('disclaimer_short')),
      h('p', { class: 'small muted' }, 'You can view, download, or delete your transcripts, recordings, transactions, surveys, reviews, reminders and cases below.')
    ]));

    // Consent switches
    const consentCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Permissions / Consent')]);
    el.appendChild(consentCard);
    await loadConsents(consentCard);

    // Data summary
    const dataCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'My data'),
      UI.skeleton(2)
    ]);
    el.appendChild(dataCard);
    await loadData(dataCard);

    // Local activity/audit log
    const auditCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Local activity log (audit)'), UI.skeleton(1)]);
    el.appendChild(auditCard);
    loadAudit(auditCard);

    return el;
  }
};

const CONSENT_LABELS = {
  transcriptStore: { icon: '📝', label: 'Store chat transcripts' },
  voiceNote: { icon: '🎤', label: 'Record my voice' },
  calls: { icon: '📞', label: 'Make/record calls to customers' },
  reminders: { icon: '⏰', label: 'Voice-call reminders' },
  contactOthers: { icon: '👥', label: 'Contact people on my behalf' },
  dataForReviews: { icon: '⭐', label: 'Save & analyze reviews' },
  aiAnalysis: { icon: '🤖', label: 'Let AI analyze my business data' }
};

async function loadConsents(card) {
  try {
    const data = await API.get('/api/privacy/consents');
    const consents = data.consents || {};
    for (const key of Object.keys(CONSENT_LABELS)) {
      const meta = CONSENT_LABELS[key];
      const on = consents[key] === true;
      const row = h('div', { class: 'switch-row' }, [
        h('span', { style: { fontSize: '1.2rem' } }, meta.icon + ' ' + meta.label),
        h('div', { class: 'spacer' }),
        h('label', { class: 'switch' }, [
          h('input', { type: 'checkbox', checked: on, onchange: async (e) => {
            try {
              await API.put('/api/privacy/consents', { [key]: e.target.checked });
              App.session.user.consents = App.session.user.consents || {};
              App.session.user.consents[key] = e.target.checked;
              UI.toast(e.target.checked ? 'Enabled: ' + meta.label : 'Disabled: ' + meta.label);
            } catch (err) { e.target.checked = on; UI.toast('Failed to update consent.', 'bad'); }
          } }),
          h('span', { class: 'slider' })
        ])
      ]);
      card.appendChild(row);
    }
  } catch (e) { card.appendChild(UI.empty('🔒', 'Could not load consents.')); }
}

async function loadData(card) {
  try {
    const data = await API.get('/api/privacy/data');
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    const counts = h('div', { class: 'grid3 mt' }, [
      stat(t('conversations'), data.transcripts.length),
      stat(t('reminders'), data.reminders.length),
      stat(t('transactions'), data.transactions.length),
      stat('Calls', data.calls.length),
      stat('Surveys', data.surveys.length),
      stat('Reviews', data.reviews.length)
    ]);
    card.appendChild(counts);

    const actions = h('div', { class: 'row wrap mt' }, [
      h('button', { class: 'btn sm soft', onclick: () => window.open('/api/privacy/export', '_blank') }, '⬇️ Download (JSON)'),
      h('button', { class: 'btn sm soft', onclick: () => viewTranscripts(data.transcripts) }, '👁 View transcripts'),
      h('button', { class: 'btn sm warn', onclick: () => deleteScope('transcripts') }, '🗑 Delete transcripts'),
      h('button', { class: 'btn sm warn', onclick: () => deleteScope('recordings') }, '🗑 Delete recordings'),
      h('button', { class: 'btn sm danger', onclick: () => deleteScope('all') }, '🗑 Delete all')
    ]);
    card.appendChild(actions);
  } catch (e) { card.querySelectorAll('.skeleton').forEach((x) => x.remove()); }
}

function stat(lbl, n) { return h('div', { class: 'stat' }, [h('div', { class: 'num' }, n), h('div', { class: 'lbl' }, lbl)]); }

function viewTranscripts(transcripts) {
  const m = UI.modal(`<h3>📝 Transcripts</h3><div class="small muted">${transcripts.length} messages</div>`);
  const body = m.el.querySelector('.modal');
  transcripts.slice(0, 40).forEach((x) => {
    body.appendChild(h('div', { class: 'small muted', style: { padding: '6px 0', borderBottom: '1px solid var(--line)' } }, `[${x.role}] ${esc(x.text) || '(empty)'}`));
  });
  const close = h('button', { class: 'btn ghost block mt' }, 'Close');
  body.appendChild(close); close.addEventListener('click', () => m.close());
}

async function deleteScope(scope) {
  const ok = await UI.confirm(scope === 'all' ? 'Delete ALL your data (transcripts, calls, transactions, surveys, reviews, reminders, cases)? This cannot be undone.' : 'Delete ' + scope + '? This cannot be undone.');
  if (!ok) return;
  try {
    const res = await API.post('/api/privacy/delete', { scope });
    UI.toast((res.deleted && Object.values(res.deleted).join(', ')) || 'Deleted.', 'good');
    setTimeout(() => views.privacy.render(), 400);
  } catch (e) { UI.toast('Failed: ' + e.message, 'bad'); }
}

async function loadAudit(card) {
  try {
    const r = await API.get('/api/audit/logs?limit=15');
    const logs = r.logs || [];
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!logs.length) {
      card.appendChild(h('div', { class: 'small muted' }, 'No recent activity yet. Uploading a voice note or exporting a survey logs an entry here.'));
      return;
    }
    logs.forEach((l) => {
      card.appendChild(h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.2rem' } }, l.action === 'audio.upload' ? '🎤' : '📤'),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 600 } }, l.action),
          h('div', { class: 'small muted' }, l.file || '')
        ]),
        h('div', { class: 'small muted' }, new Date(l.at).toLocaleString())
      ]));
    });
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(h('div', { class: 'small muted' }, 'Could not load audit log.'));
  }
}
