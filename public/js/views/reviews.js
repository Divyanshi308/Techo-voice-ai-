/* views/reviews.js — Reviews & Feedback.
   Lists customer reviews, shows aggregates (avg rating, counts, sentiment),
   and lets the owner add a new feedback entry (consent-gated). */

views.reviews = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '⭐ Reviews & Feedback'));

    const addCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Add a review')]);
    const stars = h('select', { id: 'rv-rating' }, Array.from({ length: 5 }, (_, i) =>
      h('option', { value: String(i + 1), selected: i === 4 }, '★'.repeat(i + 1))));
    const text = h('input', { type: 'text', placeholder: 'What did the customer say?', id: 'rv-text', style: { flex: 1, minWidth: '150px' } });
    addCard.appendChild(h('div', { class: 'row wrap mt', style: { flexWrap: 'wrap' } }, [stars, text]));
    const addBtn = h('button', { class: 'btn mt', onclick: () => addReview(el) }, '＋ Save review');
    addCard.appendChild(h('div', {}, [addBtn]));
    el.appendChild(addCard);

    const sum = h('div', { class: 'card mt' }, [h('h3', {}, 'Summary'), UI.skeleton(2)]);
    el.appendChild(sum);
    loadSummary(sum);

    const list = h('div', { class: 'card mt' }, [h('div', { class: 'between' }, [h('h3', {}, 'All reviews'), UI.skeleton(2)])]);
    el.appendChild(list);
    loadList(list);

    el.appendChild(h('div', { class: 'small muted mt' }, 'Reviews are stored locally. Adding a review requires the review-storage consent in Privacy & Local Data.'));
    return el;
  }
};

async function loadSummary(card) {
  try {
    const r = await API.get('/api/reviews');
    const reviews = r.reviews || [];
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    const avg = reviews.length ? (reviews.reduce((s, x) => s + (Number(x.rating) || 0), 0) / reviews.length) : 0;
    const pos = reviews.filter((x) => x.sentiment === 'positive').length;
    const neg = reviews.filter((x) => x.sentiment === 'negative').length;
    const grid = h('div', { class: 'grid3 mt' }, [
      statTile('Average', (avg ? avg.toFixed(1) : '—') + ' / 5', '#7c3aed'),
      statTile('Total', String(reviews.length), '#2563eb'),
      statTile('Positive', pos + '·' + neg, '#0a9d58')
    ]);
    card.innerHTML = '';
    card.appendChild(h('div', { class: 'between' }, [h('h3', {}, 'Summary'), h('a', { class: 'small', href: '#/surveys' }, '→ Surveys')]));
    card.appendChild(grid);
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
  }
}

async function loadList(card) {
  try {
    const r = await API.get('/api/reviews');
    const reviews = r.reviews || [];
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!reviews.length) {
      card.appendChild(UI.empty('⭐', 'No reviews yet. Add one above.'));
      return;
    }
    reviews.forEach((x) => {
      card.appendChild(h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.3rem' } }, x.sentiment === 'positive' ? '😊' : (x.sentiment === 'negative' ? '😟' : '😐')),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, '★'.repeat(Number(x.rating) || 0) + (x.contact ? ' — ' + x.contact : '')),
          h('div', { class: 'small' }, x.text || '(no text)'),
          h('div', { class: 'small muted' }, new Date(x.at).toLocaleString() + ' · ' + x.source)
        ])
      ]));
    });
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('📄', 'Could not load reviews: ' + e.message));
  }
}

async function addReview(el) {
  const rating = Number(el.querySelector('#rv-rating').value || 5);
  const text = el.querySelector('#rv-text').value.trim();
  if (!text) { UI.toast('Enter some feedback text.', 'warn'); return; }
  try {
    const consent = await UI.confirm('Store this review locally? (reviews are saved on the backend, not the browser)');
    if (!consent) { UI.toast('Not saved.', 'warn'); return; }
    await API.post('/api/reviews', { rating, text, consent: true, source: 'manual' });
    UI.toast('Review saved!', 'good');
    Router.navigate('/reviews');
  } catch (e) {
    UI.toast('Error: ' + e.message, 'bad');
  }
}

function statTile(lbl, val, color) {
  return h('div', { class: 'stat' }, [
    h('div', { class: 'num', style: { color } }, val),
    h('div', { class: 'lbl' }, lbl)
  ]);
}
