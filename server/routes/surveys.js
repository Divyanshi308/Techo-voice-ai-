'use strict';

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const telephony = require('../services/telephony');
const storage = require('../services/storage');

const router = express.Router();

// Contacts available to an owner for surveys/calls (global demo directory + owner-owned)
router.get('/api/contacts', auth.requireUser, (req, res) => {
  const mine = store.find('contacts', (c) => c.ownerId === req.session.uid);
  const global = store.find('contacts', (c) => !c.ownerId);
  res.json({ contacts: [...global, ...mine] });
});

router.post('/api/contacts', auth.requireUser, (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.phone) return res.status(400).json({ error: 'name_phone_required' });
  const c = store.insert('contacts', {
    ownerId: req.session.uid, name: b.name, phone: b.phone, note: b.note || '', language: b.language || 'hi'
  });
  res.json({ ok: true, contact: c });
});

/* ------------------------------------------------------------------ *
 * Surveys
 * ------------------------------------------------------------------ */

const sanitizeSurvey = (s, user_id) => {
  const responses = store.find('surveyResponses', (r) => r.surveyId === s.id);
  const calls = store.find('calls', (c) => c.surveyId === s.id);
  return {
    ...s,
    responseCount: responses.length,
    callCount: calls.length,
    completedCalls: calls.filter((c) => c.status === 'completed').length
  };
};

router.get('/api/surveys', auth.requireUser, (req, res) => {
  const list = store
    .find('surveys', (s) => s.userId === req.session.uid)
    .map((s) => sanitizeSurvey(s, req.session.uid))
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
  res.json({ surveys: list });
});

router.post('/api/surveys', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  if (!b.title || !Array.isArray(b.questions) || !b.questions.length) {
    return res.status(400).json({ error: 'title_and_questions_required' });
  }
  const survey = store.insert('surveys', {
    userId: user.id,
    title: b.title,
    description: b.description || '',
    language: b.language || user.preferredLang || 'hing',
    status: b.status || 'active',
    consent: b.consent === true,
    questions: b.questions.map((q, i) => ({ id: `q${i + 1}`, ...q })),
    contacts: b.contacts || [],
    createdAt: new Date().toISOString()
  });
  res.json({ ok: true, survey: sanitizeSurvey(survey, user.id) });
});

router.patch('/api/surveys/:id', auth.requireUser, (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const b = req.body || {};
  const patch = {};
  if (b.title) patch.title = b.title;
  if (b.description !== undefined) patch.description = b.description;
  if (b.status) patch.status = b.status;
  if (b.questions) patch.questions = b.questions.map((q, i) => ({ id: `q${i + 1}`, ...q }));
  if (b.contacts) patch.contacts = b.contacts;
  const updated = store.update('surveys', s.id, patch);
  res.json({ ok: true, survey: sanitizeSurvey(updated, req.session.uid) });
});

router.delete('/api/surveys/:id', auth.requireUser, (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  store.remove('surveys', s.id);
  res.json({ ok: true });
});

/* ------------------------------------------------------------------ *
 * Scheduled outbound calls (consent-gated, mock telephony)
 * ------------------------------------------------------------------ */

router.post('/api/surveys/:id/schedule-calls', auth.requireUser, async (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const consent = req.body.consent === true;
  if (!consent && !(s.consent && req.body.consent === 'user' && consent)) {
    // UI always sends explicit consent per spec; require it.
    if (!consent) return res.status(403).json({ error: 'consent_required', message: 'You must explicitly consent before calling customers.' });
  }
  const contactIds = req.body.contacts || s.contacts || [];
  const calls = [];
  for (const cid of contactIds) {
    const contact = store.get('contacts', cid);
    if (!contact) continue;
    const call = await telephony.placeOutboundCall({
      userId: req.session.uid,
      contactId: cid,
      kind: 'survey',
      surveyId: s.id,
      consent: true,
      scheduledAt: req.body.scheduledAt || new Date().toISOString()
    });
    calls.push(call);
  }
  res.json({ ok: true, calls, count: calls.length });
});

router.get('/api/calls', auth.requireUser, (req, res) => {
  const calls = store
    .find('calls', (c) => c.userId === req.session.uid)
    .map((c) => ({ ...c, contact: store.get('contacts', c.contactId) ? store.get('contacts', c.contactId).name : null }))
    .sort((a, b) => (b.scheduled > a.scheduled ? 1 : -1));
  res.json({ calls });
});

/* ------------------------------------------------------------------ *
 * Call attendance → spoken answers → text transcript → analysis
 * ------------------------------------------------------------------ */

router.post('/api/calls/:id/attended', auth.requireUser, (req, res) => {
  const call = store.get('calls', req.params.id);
  if (!call || call.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const { answers, transcript } = req.body || {};
  let responseId = null;
  if (call.surveyId) {
    const record = store.insert('surveyResponses', {
      surveyId: call.surveyId,
      contactId: call.contactId,
      answers: answers || [],
      source: 'voice-call',
      at: new Date().toISOString(),
      status: 'completed'
    });
    responseId = record.id;
    const survey = store.get('surveys', call.surveyId);
    if (survey) {
      // analyze free-text answers → suggestion + review fragment (consent-gated by owner's stored setting later)
      const texts = (answers || []).map((a) => a.value).filter((v) => typeof v === 'string');
      const suggestion = store.insert('surveyInsights', {
        surveyId: survey.id,
        contactId: call.contactId,
        note: texts.join(' | ') || (transcript || ''),
        at: new Date().toISOString()
      });
      res.json({ ok: true, call: store.get('calls', call.id), responseId, insightId: suggestion.id });
      return;
    }
  }
  store.update('calls', call.id, { status: 'completed', at: new Date().toISOString(), transcript: transcript || '' });
  res.json({ ok: true, call: store.get('calls', call.id), responseId });
});

// Simulation helper (clearly a mock/dev tool): auto-answers a survey's remaining contacts
router.post('/api/surveys/:id/simulate-respondents', auth.requireUser, (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const contactIds = s.contacts || [];
  const seeds = [
    { choiceIdx: 0, voice: 'Sunday ko thoda jaldi delivery chahiye.', rating: 4 },
    { choiceIdx: 1, voice: 'Lays ka stock hamesha rehna chahiye, kabhi kabhi nahi milta.', rating: 3 },
    { choiceIdx: 2, voice: 'Discount pe offer ho toh zyada order karte.', rating: 5 },
    { choiceIdx: 3, voice: 'Sab theek hai, bas naye products bhi lao.', rating: 4 }
  ];
  const created = [];
  contactIds.forEach((cid, i) => {
    const contact = store.get('contacts', cid);
    if (!contact) return;
    const seed = seeds[i % seeds.length];
    const answers = s.questions.map((q) => {
      if (q.type === 'choice') return { questionId: q.id, type: 'choice', value: q.options[seed.choiceIdx % q.options.length] };
      if (q.type === 'rating') return { questionId: q.id, type: 'rating', value: seed.rating };
      return { questionId: q.id, type: 'voice', value: seed.voice };
    });
    created.push(store.insert('surveyResponses', {
      surveyId: s.id, contactId: cid, answers, source: 'simulation', at: new Date().toISOString(), status: 'completed'
    }));
  });
  res.json({ ok: true, created: created.length, note: 'Simulated sample responses for demo (mock data).' });
});

/* ------------------------------------------------------------------ *
 * Responses + insights
 * ------------------------------------------------------------------ */

router.get('/api/surveys/:id/responses', auth.requireUser, (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  const responses = store.find('surveyResponses', (r) => r.surveyId === s.id);
  const insights = store.find('surveyInsights', (i) => i.surveyId === s.id);
  const analysis = analyze(s, responses);
  res.json({ responses, insights, analysis });
});

// API-ready export: build a CSV of all responses for a survey, store locally,
// and return a downloadable file URL (via /api/audio/export/...).
router.post('/api/surveys/:id/export', auth.requireUser, (req, res) => {
  const s = store.get('surveys', req.params.id);
  if (!s || s.userId !== req.session.uid) return res.status(404).json({ error: 'not_found' });
  let responses = store.find('surveyResponses', (r) => r.surveyId === s.id);
  // optional filter by status
  if (req.body && req.body.status && req.body.status !== 'all') {
    responses = responses.filter((r) => r.status === req.body.status);
  }
  const rows = responses.map((r) => {
    const contact = store.get('contacts', r.contactId);
    const row = {
      surveyId: s.id,
      survey: s.title,
      respondent: contact ? contact.name : (r.contactId || ''),
      source: r.source || '',
      status: r.status || '',
      answeredAt: r.at || ''
    };
    for (const q of s.questions) {
      const ans = (r.answers || []).find((a) => a.questionId === q.id);
      row[q.text || q.id] = ans ? (ans.type === 'rating' ? String(ans.value) : String(ans.value)) : '';
    }
    return row;
  });
  if (!rows.length) {
    return res.status(400).json({ error: 'no_responses', message: 'No responses to export yet.' });
  }
  const csv = storage.toCSV(rows);
  const url = storage.saveExport(req.session.uid, {
    buffer: Buffer.from(csv, 'utf8'),
    name: `survey-${s.id}-${Date.now()}.csv`
  });
  storage.audit(req.session.uid, { action: 'survey.export', surveyId: s.id, rows: rows.length, file: url });
  res.json({ ok: true, url, rows: rows.length });
});

function analyze(survey, responses) {
  const out = { counts: {}, ratings: {}, openComments: [], summary: '' };
  for (const q of survey.questions) {
    if (q.type === 'choice') {
      out.counts[q.id] = {};
      for (const opt of q.options) out.counts[q.id][opt] = 0;
    }
    if (q.type === 'rating') out.ratings[q.id] = { total: 0, sum: 0, avg: 0 };
  }
  for (const r of responses) {
    for (const a of r.answers || []) {
      if (a.type === 'choice' && out.counts[a.questionId]) out.counts[a.questionId][a.value] = (out.counts[a.questionId][a.value] || 0) + 1;
      if (a.type === 'rating' && out.ratings[a.questionId]) {
        out.ratings[a.questionId].sum += Number(a.value) || 0;
        out.ratings[a.questionId].total += 1;
      }
      if (a.type === 'voice') out.openComments.push(a.value);
    }
  }
  for (const k of Object.keys(out.ratings)) {
    const r = out.ratings[k];
    r.avg = r.total ? Math.round((r.sum / r.total) * 10) / 10 : 0;
  }
  const positive = ['achha', 'badhiya', 'good', 'nice', 'theek', 'best', 'great'];
  const concern = ['nahi', 'kam', 'thoda', 'zada', 'jaldi', 'stock', 'missing', 'late', 'problem'];
  const posHits = out.openComments.filter((c) => positive.some((p) => String(c).toLowerCase().includes(p))).length;
  const conHits = out.openComments.filter((c) => concern.some((p) => String(c).toLowerCase().includes(p))).length;
  out.summary = out.openComments.length
    ? `Analyzed ${out.openComments.length} spoken responses → ${posHits} positive signals, ${conHits} actionable concerns. Common theme: ${out.openComments[0] ? out.openComments[0].slice(0, 60) : ''}.`
    : 'No spoken answers yet — run calls or simulate respondents to see analysis.';
  out.sentiment = responses.length ? (posHits >= conHits ? 'positive' : 'needs-attention') : 'none';
  return out;
}

/* ------------------------------------------------------------------ *
 * Reviews
 * ------------------------------------------------------------------ */

router.get('/api/reviews', auth.requireUser, (req, res) => {
  const reviews = store
    .find('reviews', (r) => r.userId === req.session.uid)
    .map((r) => ({ ...r, contact: r.contactId && store.get('contacts', r.contactId) ? store.get('contacts', r.contactId).name : null }))
    .sort((a, b) => (b.at > a.at ? 1 : -1));
  res.json({ reviews });
});

router.post('/api/reviews', auth.requireUser, (req, res) => {
  const user = store.get('users', req.session.uid);
  const b = req.body || {};
  if (b.consent !== true) {
    if (!(user.consents && user.consents.dataForReviews)) {
      return res.status(403).json({ error: 'consent_required', message: 'Please enable review storage in Settings → Privacy.' });
    }
  }
  const review = store.insert('reviews', {
    userId: req.session.uid,
    surveyId: b.surveyId || null,
    contactId: b.contactId || null,
    rating: Math.max(1, Math.min(5, Number(b.rating) || 5)),
    text: b.text || '',
    source: b.source || 'manual',
    at: new Date().toISOString(),
    status: 'published',
    sentiment: b.sentiment || inferSentiment(b.text || '')
  });
  res.json({ ok: true, review });
});

function inferSentiment(text) {
  const good = ['badhiya', 'achha', 'good', 'best', 'great', 'nice'];
  const bad = ['bad', 'kharab', 'problem', 'late', 'bahut bura'];
  const t = String(text).toLowerCase();
  if (good.some((g) => t.includes(g))) return 'positive';
  if (bad.some((g) => t.includes(g))) return 'negative';
  return 'neutral';
}

module.exports = router;