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
const emailSvc = require('./integrations/email');

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
    if (reminder.method === 'voice-call') {
      if (consented) {
        try {
          const transcript = `Voice reminder: ${reminder.title}. ${reminder.notes || ''}`.trim();
          // If scheduling already created a call record, drive that record through
          // the dial cycle; otherwise create one now.
          const existing = store.find('calls', (c) => c.reminderId === reminder.id)[0];
          if (existing && existing.status === 'scheduled') {
            telephony.simulate(existing, transcript);
          } else {
            await telephony.placeOutboundCall({
              userId: reminder.userId,
              contactId: null,
              kind: 'reminder',
              consent: true,
              scheduledAt: new Date().toISOString(),
              transcript
            });
          }
        } catch (err) {
          console.error('[reminders] voice notification failed:', err.message);
        }
      } else {
        // Not consented to voice but needs to be told something → in-app only.
        store.insert('notifications', {
          userId: reminder.userId,
          kind: 'reminder',
          title: reminder.title,
          body: reminder.notes || 'Reminder is due.',
          read: false,
          reminderId: reminder.id
        });
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
    // Notification path: email the owner when a notification email was requested
    // for this reminder/call and Resend is configured. Only fires for explicitly
    // requested emails (never guessed), so demo data stays quiet.
    if (reminder.notifyEmail && emailSvc.configured()) {
      try {
        const res = await emailSvc.send(reminder.userId, {
          to: reminder.notifyEmail,
          subject: `Techo: ${reminder.title}`,
          text: `Hi${user && user.name ? ' ' + user.name : ''},\n\nYour Techo reminder is due:\n\n  ${reminder.title}\n${reminder.notes ? '  ' + reminder.notes + '\n' : ''}\n\n— Techo`,
          consent: true
        });
        if (!res.ok) console.error('[reminders] email notify failed:', res.message || res.reason);
      } catch (err) {
        console.error('[reminders] email notify error:', err.message);
      }
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