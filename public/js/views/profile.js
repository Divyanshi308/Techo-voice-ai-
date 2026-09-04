/* views/profile.js — business profile (voice-extracted), editable, transaction ledger. */

views.profile = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, t('business_profile')));

    const card = h('div', { class: 'card mt' }, [UI.skeleton(4)]);
    el.appendChild(card);
    await loadProfile(card);

    // Ledger
    const ledger = h('div', { class: 'card mt' }, [
      h('h3', {}, t('transactions')),
      UI.skeleton(2)
    ]);
    el.appendChild(ledger);
    await loadLedger(ledger);

    // ESLint-style helper to refresh header avatar after edits
    App.applyTheme();
    return el;
  }
};

async function loadProfile(card) {
  try {
    const data = await API.get('/api/profile');
    const p = data.profile || {};
    const auto = data.autoExtracted || {};

    const row = (label, value) => h('div', { class: 'field' }, [
      h('label', {}, label),
      h('div', { class: 'card-solid muted', style: { padding: '10px 12px', borderRadius: 12, background: '#faf8ff' } }, value || '—')
    ]);

    const products = (p.products || []).map((x) => typeof x === 'string' ? x : JSON.stringify(x));
    const customers = Array.isArray(p.customers) ? p.customers.join(', ') : p.customers;
    const challenges = Array.isArray(p.challenges) ? p.challenges.join(', ') : p.challenges;

    card.innerHTML = '';
    card.appendChild(h('div', { class: 'between wrap' }, [
      h('h3', {}, t('business_profile')),
      h('div', { class: 'row' }, [
        h('span', { class: 'tag good' }, autoExtractedTag(auto)),
        h('button', { class: 'btn sm soft', onclick: () => editModal(card, data) }, '✏️ ' + t('edit'))
      ])
    ]));

    card.appendChild(row('🏬 Name', p.name));
    card.appendChild(row('📍 ' + t('business_profile'), p.location || p.industry || ''));
    const a = h('div', { class: 'grid2 mt' });
    a.appendChild(row('🏭 Industry', p.industry));
    a.appendChild(row('📅 Established', p.established));
    card.appendChild(a);

    card.appendChild(h('label', { class: 'field' }, [h('span', {}, '🛒 Products'), products.map((x) => h('div', { class: 'card-solid small', style: { padding: '7px 10px', borderRadius: 8, marginBottom: 6, background: '#faf8ff' } }, x))]));

    const b = h('div', { class: 'grid2 mt' });
    b.appendChild(row('👥 Customers', customers));
    b.appendChild(row('😓 Challenges', challenges));
    card.appendChild(b);

    const c = h('div', { class: 'grid3 mt' });
    c.appendChild(row('📈 Monthly sales', '₹' + fmtNum(p.monthlySales)));
    c.appendChild(row('📉 Monthly expenses', '₹' + fmtNum(p.monthlyExpenses)));
    c.appendChild(row('% Margin', p.avgMargin));
    card.appendChild(c);

    card.appendChild(h('div', { class: 'small muted mt' }, '✨ Voice-extracted fields shown: ' + Object.values(auto).filter(Boolean).length + ' — you can edit all below.'));
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('📒', 'Could not load profile.'));
  }
}

function fmtNum(n) { return Number(n || 0).toLocaleString('en-IN'); }
function autoExtractedTag(auto) {
  const count = Object.values(auto).filter(Boolean).length;
  if (count) return `✨ ${count} auto-extracted`;
  return '—';
}

async function loadLedger(card) {
  try {
    const data = await API.get('/api/chat/data');
    const txs = (data.transactions || []).slice(0, 12);
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!txs.length) {
      card.appendChild(UI.empty('🧾', t('empty')));
      return;
    }
    const tabs = h('div', { class: 'tabs' });
    let filter = 'all';
    const makeBtn = (label, key) => h('button', {
      class: `tab ${filter === key ? 'active' : ''}`,
      onclick: () => { filter = key; renderList(txs.filter((x) => key === 'all' || x.type === key)); }
    }, label);
    tabs.appendChild(makeBtn('All', 'all'));
    tabs.appendChild(makeBtn(t('sales'), 'sale'));
    tabs.appendChild(makeBtn(t('expenses'), 'expense'));
    card.appendChild(tabs);

    const list = h('div', {});
    card.appendChild(list);
    const renderList = (items) => {
      list.innerHTML = '';
      if (!items.length) { list.appendChild(UI.empty('🧾', t('empty'))); return; }
      items.forEach((x) => {
        const positive = x.type === 'sale';
        list.appendChild(h('div', { class: 'list-item' }, [
          h('span', { style: { fontSize: '1.3rem' } }, positive ? '💰' : '🧾'),
          h('div', { style: { flex: 1 } }, [
            h('div', { style: { fontWeight: 600 } }, x.note || (positive ? 'Sale' : 'Expense')),
            h('div', { class: 'small muted' }, new Date(x.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + (x.via === 'voice' ? ' · nvk 🎤' : ''))
          ]),
          h('div', { style: { fontWeight: 700, color: positive ? 'var(--good)' : 'var(--warn)' } }, (positive ? '+' : '−') + '₹' + fmtNum(x.amount)),
          h('button', { class: 'icon-btn sm', onclick: async () => {
            const ok = await UI.confirm('Delete this transaction?');
            if (ok) { await API.del('/api/transactions/' + x.id); UI.toast('Deleted.'); renderList(items); }
          } }, '🗑️')
        ]));
      });
    };
    renderList(txs.filter((x) => filter === 'all' || x.type === filter));
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
  }
}

function editModal(card, data) {
  const p = data.profile || {};
  const inp = (label, value) => h('div', { class: 'field' }, [h('label', {}, label), h('input', { value: value || '' })]);
  const nameI = inp('🏬 Name', p.name);
  const locI = inp('📍 Location', p.location);
  const indI = inp('🏭 Industry', p.industry);
  const estI = inp('📅 Established', p.established);
  const salesI = inp('📈 Monthly sales (₹)', p.monthlySales);
  const expI = inp('📉 Monthly expenses (₹)', p.monthlyExpenses);
  const marginI = inp('% Margin', p.avgMargin);
  const prodI = inp('🛒 Products (comma separated)', Array.isArray(p.products) ? p.products.join(', ') : p.products);
  const custI = inp('👥 Customers', Array.isArray(p.customers) ? p.customers.join(', ') : p.customers);
  const challI = inp('😓 Challenges', Array.isArray(p.challenges) ? p.challenges.join(', ') : p.challenges);

  const m = UI.modal(`
    <h3>✏️ ${t('edit')} ${t('business_profile')}</h3>`);
  const body = m.el.querySelector('.modal');
  [nameI, locI, indI, estI, salesI, expI, marginI, prodI, custI, challI].forEach((f) => body.appendChild(f));
  const save = h('button', { class: 'btn block mt' }, t('save'));
  body.appendChild(save);
  save.addEventListener('click', async () => {
    const payload = {
      name: nameI.querySelector('input').value,
      location: locI.querySelector('input').value,
      industry: indI.querySelector('input').value,
      established: estI.querySelector('input').value,
      monthlySales: Number(salesI.querySelector('input').value) || 0,
      monthlyExpenses: Number(expI.querySelector('input').value) || 0,
      avgMargin: marginI.querySelector('input').value,
      products: prodI.querySelector('input').value.split(',').map((s) => s.trim()).filter(Boolean),
      customers: custI.querySelector('input').value.split(',').map((s) => s.trim()).filter(Boolean),
      challenges: challI.querySelector('input').value.split(',').map((s) => s.trim()).filter(Boolean)
    };
    try {
      await API.put('/api/profile', payload);
      m.close(); UI.toast('Profile saved.'); views.profile.render();
    } catch (e) { UI.toast('Save failed: ' + e.message, 'bad'); }
  });
  const cancel = h('button', { class: 'btn ghost block mt6' }, t('cancel'));
  cancel.addEventListener('click', () => m.close());
  body.appendChild(cancel);
}
