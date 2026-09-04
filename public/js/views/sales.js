/* views/sales.js — Sales & Expenses dashboard.
   Reads transactions recorded by voice/text chat, shows running totals,
   lets owners add a quick manual record and delete/edit entries. */

views.sales = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '💰 Sales & Expenses'));

    const sumCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Overview'),
      UI.skeleton(2)
    ]);
    el.appendChild(sumCard);
    loadSummary(sumCard);

    const addCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Add record (manual)')]);
    const addWrap = h('div', { class: 'row wrap mt', style: { flexWrap: 'wrap' } }, [
      h('select', { id: 'tx-type' }, [
        h('option', { value: 'sale' }, 'Sale'),
        h('option', { value: 'expense' }, 'Expense'),
        h('option', { value: 'payment' }, 'Payment')
      ]),
      h('input', { id: 'tx-amt', type: 'number', min: '0', placeholder: 'Amount (₹)', style: { width: '130px' } }),
      h('input', { id: 'tx-note', type: 'text', placeholder: 'Note (e.g. biscuits stock)', style: { flex: 1, minWidth: '140px' } }),
      h('button', { id: 'tx-add', class: 'btn' }, '＋ Add')
    ]);
    addCard.appendChild(addWrap);
    addWrap.querySelector('#tx-add').addEventListener('click', addManual);
    el.appendChild(addCard);

    const listCard = h('div', { class: 'card mt' }, [
      h('div', { class: 'between' }, [h('h3', {}, 'Transactions'), UI.skeleton(2)])
    ]);
    el.appendChild(listCard);
    loadList(listCard);

    return el;
  }
};

async function loadSummary(card) {
  try {
    const data = await API.get('/api/chat/data');
    const txs = data.transactions || [];
    let sales = 0, expenses = 0, payments = 0;
    txs.forEach((x) => {
      const amt = Number(x.amount) || 0;
      if (x.type === 'sale') sales += amt;
      else if (x.type === 'expense') expenses += amt;
      else if (x.type === 'payment') payments += amt;
    });
    const net = sales - expenses;
    const grid = h('div', { class: 'grid3 mt' }, [
      statTile('Sales', '₹' + fmt(sales), '#0a9d58'),
      statTile('Expenses', '₹' + fmt(expenses), '#e08600'),
      statTile('Net', '₹' + fmt(net), net >= 0 ? '#7c3aed' : '#d64545')
    ]);
    const pending = h('div', { class: 'small muted mt' }, 'Pending payments: ₹' + fmt(payments || 0) + ' · ' + txs.length + ' records total');
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'between' }, [h('h3', {}, 'Overview'), h('a', { class: 'small', href: '#/home' }, '→')]));
    card.appendChild(grid);
    card.appendChild(pending);
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('📉', 'Could not load transactions.'));
  }
}

async function loadList(card) {
  try {
    const data = await API.get('/api/chat/data');
    const txs = (data.transactions || []).sort((a, b) => (b.at > a.at ? 1 : -1));
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    const head = card.querySelector('.between');
    if (!txs.length) {
      card.appendChild(UI.empty('💰', 'No records yet — record a sale or expense by voice in Talk to Techo, or add one above.'));
      return;
    }
    txs.forEach((x) => {
      const up = h('button', { class: 'chip' }, '✎');
      const del = h('button', { class: 'chip', style: { color: 'var(--bad)' } }, '🗑');
      const row = h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.3rem' } }, x.type === 'sale' ? '⬆' : (x.type === 'expense' ? '⬇' : '🔄')),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, (x.note || x.type) + ' — ₹' + fmt(x.amount || 0)),
          h('div', { class: 'small muted' }, new Date(x.at).toLocaleString())
        ]),
        UI.statusTag(x.type === 'sale' ? 'sale' : (x.type === 'payment' ? 'payment' : 'expense')),
        up, del
      ]);
      up.addEventListener('click', () => editRow(x, row, up, del));
      del.addEventListener('click', async () => {
        const ok = await UI.confirm('Delete this record?');
        if (!ok) return;
        try { await API.del('/api/transactions/' + x.id); UI.toast('Deleted.', 'good'); refreshList(card, head); }
        catch (e) { UI.toast('Error: ' + e.message, 'bad'); }
      });
      card.appendChild(row);
    });
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('📉', 'Could not load transactions. Please try again.'));
  }
}

function editRow(x, row, up, del) {
  const amt = h('input', { type: 'number', value: x.amount, style: { width: '100px' } });
  const note = h('input', { type: 'text', value: x.note || '', style: { flex: 1, minWidth: '120px' } });
  const save = h('button', { class: 'btn sm good' }, 'Save');
  save.addEventListener('click', async () => {
    try { await API.put('/api/transactions/' + x.id, { amount: amt.value, note: note.value }); UI.toast('Saved.', 'good'); }
    catch (e) { UI.toast('Error: ' + e.message, 'bad'); }
  });
  const editCard = h('div', { class: 'row wrap mt', style: { flexWrap: 'wrap' } }, [amt, note, save]);
  row.parentNode.insertBefore(editCard, row.nextSibling);
  up.remove();
}

function refreshList(card, head) {
  card.querySelectorAll('.list-item').forEach((x) => x.remove());
  loadList(card, head);
}

function statTile(lbl, val, color) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'num', style: { color } }, val),
    h('div', { class: 'lbl' }, lbl)
  ]);
}
function fmt(n) { return Number(n || 0).toLocaleString('en-IN'); }

async function addManual(e) {
  e.preventDefault();
  const el = e.target.parentNode;
  const type = el.querySelector('#tx-type').value;
  const amount = Number(el.querySelector('#tx-amt').value);
  const note = el.querySelector('#tx-note').value;
  if (!amount || amount <= 0) { UI.toast('Enter a valid amount.', 'warn'); return; }
  // Reuse the chat confirmation flow so the record lands in sales/expenses.
  const text = `Record a ${type} of ${amount} rupees for ${note || type}`;
  try {
    UI.toast('Recording…', 'info');
    await API.post('/api/chat', { text, mode: 'text' });
    UI.toast('Recorded!', 'good');
    document.querySelector('#tx-amt').value = '';
    document.querySelector('#tx-note').value = '';
    setTimeout(() => Router.navigate('/sales'), 400);
  } catch (err) {
    UI.toast('Error: ' + err.message, 'bad');
  }
}
