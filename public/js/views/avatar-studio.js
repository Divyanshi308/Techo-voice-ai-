/* views/avatar-studio.js — "Avatar Studio": pick the talking-head avatar that
 * visually speaks the AI's replies in the chat. Optional layer on Agora voice.
 *
 * Honest states: when the HeyGen provider is not configured it shows setup steps,
 * disables avatar selection, and tells the user voice still works without it.
 * No secrets are ever shown. */

views.avatarStudio = {
  async render() {
    const el = h('div', {});
    el.appendChild(h('h2', {}, '🧑‍💼 ' + t('nav_dk_avatar_studio')));
    el.appendChild(h('p', { class: 'small muted' }, 'Pick a talking-head avatar that reads Techo’s replies aloud. It sits on top of your Agora voice engine — voice keeps working even without an avatar.'));

    let st = null;
    let list = null;
    try {
      st = await AvatarClient.status();
      list = await AvatarClient.list();
    } catch (e) { el.appendChild(UI.empty('🧑‍💼', 'Could not load avatar studio. Try again.')); return el; }

    if (!st.configured) {
      el.appendChild(h('div', { class: 'card mt' }, [
        h('div', { class: 'between' }, [h('h3', {}, 'Talking-head avatar — not configured'), h('span', { class: 'tag neutral' }, 'Not configured')]),
        h('p', { class: 'small muted mt6' }, 'Voice conversations keep working — the avatar is an optional visual layer. Set the HeyGen key to enable it.')
      ]));
      el.appendChild(setupPanel(st.setup));
      return el;
    }

    const avail = st.availability || {};
    el.appendChild(h('div', { class: 'card mt' }, [
      h('div', { class: 'between' }, [
        h('h3', {}, 'Talking-head avatar'),
        h('span', { class: avail.videoGeneration === false ? 'tag warn' : 'tag good' }, avail.videoGeneration === false ? 'Video paused (no credits)' : 'Configured')
      ]),
      h('p', { class: 'small muted mt6' }, avail.videoGeneration === false
        ? 'The HeyGen account has no video-generation credits left, so talking videos are paused on this deployment. Avatar selection and voice conversations keep working — only video rendering needs credits.'
        : 'Select an avatar. During a voice conversation, Techo renders the chosen avatar speaking each reply.')
    ]));

    const grid = h('div', { class: 'grid3 mt' });
    const selected = (list && list.selected) || {};
    (list && list.avatars && list.avatars.length ? list.avatars : defaultAvatars()).forEach((a) => grid.appendChild(avatarCard(a, selected.avatarId === a.id)));
    el.appendChild(grid);
    return el;
  }
};

function defaultAvatars() {
  return [
    { id: 'Alexa-Athena-20220701', name: 'Alexa', gender: 'female', desc: 'Friendly professional assistant' },
    { id: 'Chris-Chen-20221216', name: 'Chris', gender: 'male', desc: 'Warm business mentor' },
    { id: 'Mia-Marceau-20220824', name: 'Mia', gender: 'female', desc: 'Calm, clear presenter' },
    { id: 'Jake-Morgan-20230224', name: 'Jake', gender: 'male', desc: 'Energetic advisor' },
    { id: 'Nora-Lee-20230309', name: 'Nora', gender: 'female', desc: 'Polished executive' },
    { id: 'Peter-Parker-20221110', name: 'Peter', gender: 'male', desc: 'Casual, trustworthy' }
  ];
}

function avatarCard(a, isSelected) {
  const card = h('div', { class: 'scene-card' + (isSelected ? ' active' : ''), style: { textAlign: 'left' } }, [
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } }, [
      h('div', { class: 'avatar-circle', 'aria-hidden': 'true' }, a.thumbnail ? h('img', { src: a.thumbnail, alt: '' }) : initials(a.name)),
      h('div', { style: { flex: 1 } }, [
        h('div', { style: { fontWeight: 700 } }, a.name),
        h('div', { class: 'small muted' }, (a.desc || '') + (a.gender ? ' · ' + a.gender : ''))
      ])
    ]),
    h('button', {
      class: 'btn sm mt6' + (isSelected ? ' ghost' : ''), style: { width: '100%' },
      onclick: async () => {
        const r = await AvatarClient.select({ avatarId: a.id });
        if (r && r.ok) { UI.toast('Avatar set to ' + a.name + '.', 'good'); views.avatarStudio.render().then(() => {}); }
        else UI.toast('Could not select avatar.', 'bad');
      }
    }, isSelected ? '✓ Selected' : 'Select')
  ]);
  return card;
}

function initials(name) {
  const n = (name || '?').trim();
  const el = document.createElement('div');
  el.className = 'avatar-initials';
  el.textContent = n.slice(0, 2).toUpperCase();
  return el;
}

function setupPanel(steps) {
  const box = h('div', { class: 'card mt small muted' });
  box.appendChild(h('div', { style: { fontWeight: 700, marginBottom: 4 } }, 'Setup steps'));
  const ol = h('ol', { style: { margin: '4px 0 0 18px', padding: 0 } });
  (steps || []).forEach((s) => ol.appendChild(h('li', { style: { marginBottom: 4 } }, s)));
  box.appendChild(ol);
  return box;
}
