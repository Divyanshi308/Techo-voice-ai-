/* views/marketing.js — Marketing Studio.
   Generates promotional content drafts (WhatsApp promo, caption, follow-up,
   reminder) in the owner's language using the AI engine, with copy + WhatsApp. */

views.marketing = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '📣 Marketing Studio'));

    const bizCard = h('div', { class: 'card mt' }, [
      h('div', { class: 'row wrap', style: { flexWrap: 'wrap', gap: 10 } }, [
        h('select', { id: 'mk-kind' }, [
          h('option', { value: 'whatsapp-promo' }, 'WhatsApp promo'),
          h('option', { value: 'caption' }, 'Social caption'),
          h('option', { value: 'follow-up' }, 'Customer follow-up'),
          h('option', { value: 'reminder' }, 'Reminder message')
        ]),
        h('select', { id: 'mk-lang' }, (App.config.languages || []).filter((l) => l.enabled !== false).map((l) =>
          h('option', { value: l.code }, `${l.flag} ${l.nativeName} (${l.code})`))),
        h('button', { id: 'mk-go', class: 'btn' }, '✨ Generate')
      ])
    ]);
    el.appendChild(bizCard);

    const outCard = h('div', { class: 'card mt' }, [
      h('h3', {}, 'Draft'),
      h('div', { id: 'mk-out', class: 'muted small' }, 'Pick a type + language, then Generate. (Drafts use the built-in demo engine; API-ready via /api/content/generate.)')
    ]);
    el.appendChild(outCard);

    bizCard.querySelector('#mk-go').addEventListener('click', async () => {
      const kind = bizCard.querySelector('#mk-kind').value;
      const lang = bizCard.querySelector('#mk-lang').value || App.session.user.preferredLang || 'hing';
      const box = outCard.querySelector('#mk-out');
      box.className = 'small muted';
      box.textContent = 'Generating…';
      try {
        const r = await API.post('/api/content/generate', { kind, lang });
        const draft = h('div', {}, [
          h('pre', { style: { whiteSpace: 'pre-wrap', fontFamily: 'inherit', margin: 0, lineHeight: 1.5 } }, r.content.text),
          h('div', { class: 'row wrap mt', style: { flexWrap: 'wrap' } }, [
            h('button', { class: 'chip', onclick: async () => { try { await navigator.clipboard.writeText(r.content.text); UI.toast('Copied!'); } catch { UI.toast('Copy failed — select text above.', 'warn'); } } }, '📋 Copy'),
            h('button', { class: 'chip', onclick: () => openWhatsApp(r.content.text) }, '💬 WhatsApp'),
            h('button', { class: 'chip', onclick: async () => { try { await API.post('/api/content/use', { kind, lang }); UI.toast('Saved to usage log (demo).', 'good'); } catch (e) { UI.toast(e.message, 'warn'); } } }, '✓ Mark used')
          ])
        ]);
        box.className = '';
        box.innerHTML = '';
        box.appendChild(draft);
      } catch (e) {
        box.className = 'small muted';
        box.textContent = 'Error: ' + e.message;
      }
    });

    const tipCard = h('div', { class: 'card mt' }, [
      h('h3', {}, '💡 Tips'),
      h('div', { class: 'small', style: { lineHeight: 1.6 } }, [
        '• Say things like "WhatsApp promo likho" in Talk to Techo to draft in conversation.',
        '• Follow-ups feel personal when they include the customer’s name + delivery.',
        '• You can copy a draft and paste it directly into any app.',
        '• All drafts are clearly demo output until a real LLM is connected.'
      ])
    ]);
    el.appendChild(tipCard);

    return el;
  }
};

function openWhatsApp(text) {
  const url = 'https://wa.me/?text=' + encodeURIComponent(text);
  window.open(url, '_blank');
}
