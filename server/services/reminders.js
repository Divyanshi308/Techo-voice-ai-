'use strict';

/**
 * reminders.js — Reminder scheduler.
 *
 * A background tick scans pending reminders. When a reminder falls due it is
 * marked `due`, and — only when the owner has consented to voice reminders —
 * a mock outbound "voice notification" call is placed through telephony.js.
 * Nothing is ever dialled or triggered without consent.
 */

const store = require('../db');
const telephony = require('./telephony');

const TICK_MS = 15000;
let timer = null;

const tick = async () => {
  const now = Date.now();
  const due = store.find('reminders', (r) =>
    r && r.status === 'pending' && r.due && new Date(r.due).getTime() <= now
  );
  for (const reminder of due) {
    const user = store.get('users', reminder.userId);
    const consented = !!(user && user.consents && user.consents.reminders);
    store.update('reminders', reminder.id, { status: 'due' });
    if (reminder.method === 'voice-call' && consented) {
      try {
        await telephony.placeOutboundCall({
          userId: reminder.userId,
          contactId: null, // notifies the owner
          kind: 'reminder',
          consent: true,
          scheduledAt: new Date().toISOString(),
          transcript: `Voice reminder: ${reminder.title}.`
        });
      } catch (err) {
        console.error('[reminders] voice notification failed:', err.message);
      }
    } else {
      // in-app notification only
      store.insert('notifications', {
        userId: reminder.userId,
        kind: 'reminder',
        title: reminder.title,
        body: reminder.notes || 'Reminder is due.',
        read: false,
        reminderId: reminder.id
      });
    }
  }
};

const start = () => {
  if (timer) return;
  timer = setInterval(() => { void tick(); }, TICK_MS);
  void tick();
};

const stop = () => {
  if (timer) clearInterval(timer);
  timer = null;
};

module.exports = { start, stop, tick };