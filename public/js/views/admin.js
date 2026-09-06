/* views/admin.js — admin dashboard: stats, users, cases, experts, calls, languages, analytics. */

views.admin = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🛡️ Admin dashboard'));

    const tabs = h('div', { class: 'tabs' });
    ['stats', 'users', 'cases', 'experts', 'calls', 'languages'].forEach((k) => {
      tabs.appendChild(h('button', { class: 'tab', onclick: () => { render(k); } }, cap(k)));
    });
    el.appendChild(tabs);

    const body = h('div', {});
    el.appendChild(body);

    const render = async (section) => {
      body.innerHTML = '';
      body.appendChild(UI.skeleton(2));
      try {
        if (section === 'stats') { const d = await API.get('/api/admin/stats'); renderStats(body, d); }
        else if (section === 'users') { const d = await API.get('/api/admin/users'); renderUsers(body, d.users); }
        else if (section === 'cases') { const d = await API.get('/api/admin/cases'); renderCases(body, d.cases); }
        else if (section === 'experts') { renderExperts(body); }
        else if (section === 'calls') { const d = await API.get('/api/admin/calls'); renderCalls(body, d.calls); }
        else { renderLanguages(body); }
      } catch (e) {
        body.querySelectorAll('.skeleton').forEach((x) => x.remove());
        body.appendChild(UI.empty('🛡️', 'Access denied or error: ' + e.message));
      }
    };
    render('stats');
    return el;
  }
};

function cap(s) { return s[0].toUpperCase() + s.slice(1); }

function renderStats(body, d) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  const c = d.counts || {};
  body.appendChild(h('div', { class: 'grid3 mt' }, [
    stat('Users', c.users), stat('Chats', c.conversations), stat('Messages', c.messages),
    stat('Transactions', c.transactions), stat('Calls', c.calls), stat('Cases', c.cases),
    stat('Surveys', c.surveys), stat('Reviews', c.reviews), stat('Content', c.contentUses)
  ]));
  const rev = d.revenue || {};
  const revCard = h('div', { class: 'card mt' }, [
    h('h3', {}, 'Revenue (sample)'),
    h('div', { class: 'row wrap mt' }, [
      h('span', { class: 'tag good' }, 'Sales ₹' + fmt(d.revenue && rev.sales)),
      h('span', { class: 'tag warn' }, 'Expenses ₹' + fmt(rev.expenses)),
      h('span', { class: 'tag' }, 'Net ₹' + fmt(rev.net))
    ]),
    h('div', { class: 'mt' }, h('div', { class: 'bars' }, Object.entries(d.salesByMonth || {}).map(([m, v]) => barCol(m, v, d.salesByMonth))))
  ]);
  body.appendChild(revCard);

  const langCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Language distribution')]);
  const langData = d.languageDistribution || {};
  if (Object.keys(langData).length) {
    Object.entries(langData).forEach(([l, n]) => {
      const pct = Math.round((n / Math.max(1, Object.values(langData).reduce((a, b) => a + b, 0))) * 100);
      const row = h('div', { class: 'row mt6' }, [h('span', { style: { width: 60, fontWeight: 700 } }, l), h('div', { class: 'bar', style: { flex: 1, width: 'auto', maxWidth: 'none', height: 14, borderRadius: 8, background: 'linear-gradient(90deg,#7c3aed,#a855f7)' } }, ''), h('span', { class: 'small muted' }, n + ' (' + pct + '%)')]);
      row.querySelector('.bar').style.width = (pct * 2) + 'px';
      row.querySelector('.bar').style.flex = '0 1 auto';
      row.querySelector('.bar').style.height = '14px';
      langCard.appendChild(row);
    });
  } else {
    langCard.appendChild(UI.empty('🌐', 'No user messages yet.'));
  }
  body.appendChild(langCard);

  // Call status
  const callCard = h('div', { class: 'card mt' }, [h('h3', {}, 'Call status')]);
  Object.entries(d.callStatus || {}).forEach(([k, v]) => callCard.appendChild(h('div', { class: 'row between mt6' }, [h('span', { class: 'small' }, k), UI.statusTag(k), h('span', { class: 'tag' }, v + '')])));
  body.appendChild(callCard);
}

function barCol(m, v, buckets) {
  const max = Math.max(1, ...Object.values(buckets));
  const hgt = Math.max(4, Math.round((v / max) * 100));
  return h('div', { class: 'bar-col' }, [
    h('div', { class: 'bar', style: { height: hgt + 'px', maxWidth: 'none' } }),
    h('div', { class: 'mlbl' }, m.slice(5))
  ]);
}
function fmt(n) { return Number(n || 0).toLocaleString('en-IN'); }
function stat(lbl, n) { return h('div', { class: 'stat' }, [h('div', { class: 'num' }, n), h('div', { class: 'lbl' }, lbl)]); }

function renderUsers(body, users) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  const table = h('div', { class: 'table-wrap' });
  table.appendChild(h('table', {}, [
    h('thead', {}, h('tr', {}, ['Name', 'Email', 'Role', 'Provider', 'Created'].map((t) => h('th', {}, t)))),
    h('tbody', {}, users.map((u) => h('tr', {}, [
      h('td', { style: { fontWeight: 600 } }, u.name),
      h('td', {}, u.email),
      h('td', {}, u.role === 'admin' ? h('span', { class: 'tag' }, 'Admin') : h('span', { class: 'tag good' }, 'Owner')),
      h('td', {}, u.provider),
      h('td', {}, new Date(u.createdAt).toLocaleDateString('en-IN'))
    ])))
  ]));
  body.appendChild(table);
}

function renderCases(body, cases) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  if (!cases.length) { body.appendChild(UI.empty('🧑‍⚖️', 'No cases.')); return; }
  cases.forEach((c) => {
    body.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.4rem' } }, '🧑‍⚖️'),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, (c.consultTitle || c.summarytopic || 'Case').slice(0, 60)),
        h('div', { class: 'small muted' }, (c.user ? c.user.name : '?') + ' · ' + (c.language || '') + ' · ' + (c.expert ? c.expert.name : 'unassigned'))
      ]),
      UI.statusTag(c.status),
      h('span', { class: `tag ${c.priority === 'high' ? 'warn' : 'neutral'}` }, c.priority),
      h('button', { class: 'icon-btn sm', onclick: () => assignExpert(c), style: { fontSize: '1rem' } }, '👤')
    ]));
  });
}

async function assignExpert(c) {
  const experts = await API.get('/api/experts');
  const m = UI.modal(`<h3>Assign expert to case ${c.id.slice(-8)}</h3>`);
  const body = m.el.querySelector('.modal');
  const sel = h('select', { class: 'field' }, experts.experts.map((e) => h('option', { value: e.id }, e.name + ' (' + e.role + ')')));
  body.appendChild(sel);
  const btn = h('button', { class: 'btn block mt' }, 'Assign');
  body.appendChild(btn);
  btn.addEventListener('click', async () => {
    await API.patch('/api/admin/cases/' + c.id, { expertId: sel.value });
    m.close(); UI.toast('Assigned.'); views.admin.render();
  });
}

async function renderExperts(body) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  const data = await API.get('/api/experts');
  const experts = data.experts || [];
  experts.forEach((e) => {
    body.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.4rem' } }, '👨‍⚕️'),
      h('div', { style: { flex: 1 } }, [h('div', { style: { fontWeight: 700 } }, e.name + ' — ' + e.role), h('div', { class: 'small muted' }, (e.services || []).join(' · '))]),
      e.available ? h('span', { class: 'tag good' }, 'Available') : h('span', { class: 'tag neutral' }, 'Away'),
      h('button', { class: 'icon-btn sm', onclick: async () => {
        const ok = await UI.confirm('Delete this expert?');
        if (!ok) return;
        await API.del('/api/admin/experts/' + e.id); renderExperts(body);
      }, style: { fontSize: '1rem', color: 'var(--bad)' } }, '🗑️')
    ]));
  });
  const add = h('button', { class: 'btn block mt', onclick: async () => {
    const m = UI.modal(`<h3>Add expert</h3>`);
    const b = m.el.querySelector('.modal');
    const nameI = h('input', { placeholder: 'Name' }); const roleI = h('input', { placeholder: 'Role' });
    [['Name', nameI], ['Role', roleI]].forEach(([l, i]) => b.appendChild(h('div', { class: 'field' }, [h('label', {}, l), i])));
    const save = h('button', { class: 'btn block mt' }, 'Add'); b.appendChild(save);
    save.addEventListener('click', async () => { await API.post('/api/admin/experts', { name: nameI.value, role: roleI.value }); m.close(); renderExperts(body); });
  } }, '+ Add expert');
  body.appendChild(add);
}

function renderCalls(body, calls) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  if (!calls.length) { body.appendChild(UI.empty('📞', 'No calls.')); return; }
  calls.slice(0, 25).forEach((c) => {
    const sim = c.simulated || c.channel === 'mock-voice';
    body.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.3rem' } }, '📞'),
      h('div', { style: { flex: 1 } }, [h('div', { style: { fontWeight: 600 } }, (c.contact || '—') + ' · ' + (c.user || '')), h('div', { class: 'small muted' }, (c.kind || '') + ' · ' + (c.channel || ''))]),
      sim ? h('span', { class: 'tag warn' }, 'Simulated') : null,
      UI.statusTag(c.status)
    ]));
  });
}

async function renderLanguages(body) {
  body.querySelectorAll('.skeleton').forEach((x) => x.remove());
  const langs = App.config.languages || [];
  langs.forEach((l) => {
    body.appendChild(h('div', { class: 'list-item' }, [
      h('span', { style: { fontSize: '1.4rem' } }, l.flag),
      h('div', { style: { flex: 1 } }, [h('div', { style: { fontWeight: 700 } }, l.nativeName), h('div', { class: 'small muted' }, l.name)]),
      h('label', { class: 'switch' }, [
        h('input', { type: 'checkbox', checked: l.enabled !== false, onchange: async (e) => {
          await API.patch('/api/admin/languages/' + l.code, { enabled: e.target.checked });
          UI.toast(l.nativeName + (e.target.checked ? ' enabled' : ' disabled'));
        } }),
        h('span', { class: 'slider' })
      ])
    ]));
  });
}
