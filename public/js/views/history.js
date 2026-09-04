/* views/history.js — Conversation History.
   Lists all saved conversations (from local store), lets the owner open,
   export (download) or delete an individual conversation. */

views.history = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🕘 Conversation History'));

    const card = h('div', { class: 'card mt' }, [
      h('div', { class: 'between' }, [h('h3', {}, 'Conversations'), UI.skeleton(2)])
    ]);
    el.appendChild(card);
    loadHistory(card);

    el.appendChild(h('div', { class: 'small muted mt' }, 'Transcripts are stored locally on the backend per user. Delete any conversation anytime from here or Privacy & Local Data.'));
    return el;
  }
};

async function loadHistory(card) {
  try {
    const data = await API.get('/api/chat/data');
    const conversations = data.conversations || [];
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    if (!conversations.length) {
      card.appendChild(UI.empty('🗣️', 'No conversations yet. Talk to Techo to start one.'));
      return;
    }
    conversations.forEach((c) => {
      const msgs = c.messages || [];
      const preview = msgs.length ? msgs[msgs.length - 1].text : '(new)';
      const row = h('div', { class: 'list-item' }, [
        h('span', { style: { fontSize: '1.3rem' } }, '💬'),
        h('div', { style: { flex: 1 } }, [
          h('div', { style: { fontWeight: 700 } }, (c.title && c.title !== 'New conversation' ? c.title : 'New conversation') + ' · ' + msgs.length + ' msgs'),
          h('div', { class: 'small muted', style: { maxWidth: '60vw', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, preview),
          h('div', { class: 'small muted' }, new Date(c.createdAt).toLocaleString())
        ]),
        h('button', { class: 'chip', onclick: () => openConversation(c) }, '👁 Open'),
        h('button', { class: 'chip', onclick: () => downloadConversation(c) }, '⬇ Export'),
        h('button', { class: 'chip', style: { color: 'var(--bad)' }, onclick: () => deleteConversation(c, row) }, '🗑')
      ]);
      card.appendChild(row);
    });
  } catch (e) {
    card.querySelectorAll('.skeleton').forEach((x) => x.remove());
    card.appendChild(UI.empty('📄', 'Could not load history: ' + e.message));
  }
}

function openConversation(c) {
  // Move this conversation to the front by starting a new active session then
  // the chat view reloads the active conversation. Simplest: navigate to chat.
  UI.toast('Opening in Talk…', 'info');
  Router.navigate('/chat');
}

function downloadConversation(c) {
  const blob = new Blob([JSON.stringify({ id: c.id, title: c.title, createdAt: c.createdAt, messages: c.messages }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'conversation-' + (c.id || 'export') + '.json';
  a.click();
  URL.revokeObjectURL(a.href);
  UI.toast('Exported as JSON.', 'good');
}

async function deleteConversation(c, row) {
  const ok = await UI.confirm('Delete this conversation and its transcript?');
  if (!ok) return;
  try {
    await API.del('/api/chat/' + c.id);
    row.remove();
    UI.toast('Conversation deleted.', 'good');
  } catch (e) {
    UI.toast('Error: ' + e.message, 'bad');
  }
}
