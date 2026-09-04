'use strict';

/**
 * agora/agentConfig.js — Agent configuration + version history.
 *
 * The owner can define how the voice-AI agent behaves (name, system prompt,
 * greeting, languages, voice, persona, human-escalation rules, consent
 * messages, etc.). Config follows a draft → published lifecycle:
 *
 *   - getActive()      returns the currently PUBLISHED config (or defaults).
 *   - getDraft()       returns the in-progress un-published editing copy.
 *   - saveDraft()      persists a draft without affecting the active/published one.
 *   - publish()        promotes the draft to published + writes a version record.
 *   - rollback()       restores a previous published version as the new active one.
 *   - history()        full version list (with timestamps + comment).
 *
 * Stored in two collections: `agentConfig` (active/draft records) and
 * `agentVersions` (append-only history).
 */

const store = require('../../db');

const AGENT_KEY = 'owner-agent';

// Sensible defaults that match the app's multilingual voice-first posture.
const DEFAULTS = {
  agentId: process.env.AGORA_AGENT_ID || '',
  name: 'Techo Voice Assistant',
  systemPrompt: 'You are Techo, a helpful voice assistant for small and medium business owners in India. You answer in the language the user speaks, help record sales and expenses, answer market questions, and escalate to a human expert when you are unsure.',
  greeting: 'Namaste! Main Techo hoon. Aap apna sawal puchhiye.',
  supportedLanguages: ['hi', 'hing', 'mr', 'bn', 'pa', 'en'],
  preferredResponseLanguage: 'auto',
  languageAutoDetect: true,
  midSentenceSwitching: true,
  codeSwitching: true,
  voiceProvider: 'agora',
  ttsVoice: '',
  speed: 1.0,
  tone: 'friendly',
  persona: 'Friendly neighbourhood business advisor',
  humanEscalation: {
    enabled: true,
    trigger: 'when unsure, legal/financial, or repeated confusion',
    maxAttempts: 2
  },
  uncertainty: {
    enabled: true,
    maxRetries: 2,
    escalationAfterRetries: true
  },
  reminders: {
    enabled: true,
    confirmBeforeSchedule: true
  },
  surveyCalls: {
    enabled: true,
    consentRequired: true,
    maxPerDay: 20
  },
  consent: {
    requireExplicit: true,
    message: 'Kya main aapka sawal record kar sakta hoon? Aapki baat sirf VyaparVaani sunega.'
  },
  knowledgeBase: {
    enabled: true,
    sources: ['market-data', 'survey-responses', 'business-profile'],
    maxContext: 12
  },
  avatar: {
    type: 'app-default',
    custom: ''
  },
  conversationHistory: {
    enabled: true,
    storeLocalOnly: true,
    retainDays: 30,
    requireConsent: true
  },
  version: 1,
  publishedAt: null
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base : Object.assign({}, base);
  if (patch && typeof patch === 'object' && !Array.isArray(patch)) {
    Object.keys(patch).forEach((k) => {
      const pv = patch[k];
      if (pv && typeof pv === 'object' && !Array.isArray(pv) && base && typeof base[k] === 'object') {
        out[k] = deepMerge(base[k], pv);
      } else {
        out[k] = pv;
      }
    });
  }
  return out;
}

function getActive() {
  const rec = store.findOne('agentConfig', (r) => r.id === AGENT_KEY && r.stage === 'published');
  const saved = store.findOne('agentConfig', (r) => r.id === AGENT_KEY && r.stage === 'saved');
  const base = saved ? saved.config : DEFAULTS;
  return deepMerge({}, rec ? rec.config : base);
}

function getDraft() {
  const draft = store.findOne('agentConfig', (r) => r.id === AGENT_KEY && r.stage === 'draft');
  const active = getActive();
  // If there is no draft yet, seed the draft from the current active config.
  if (!draft) {
    const seeded = deepMerge({}, active);
    store.insert('agentConfig', { id: AGENT_KEY, stage: 'draft', config: seeded, createdAt: new Date().toISOString() });
    return seeded;
  }
  return deepMerge({}, draft.config);
}

function saveDraft(patch) {
  const current = getDraft();
  const merged = deepMerge(current, patch);
  let rec = store.findOne('agentConfig', (r) => r.id === AGENT_KEY && r.stage === 'draft');
  if (rec) {
    store.update('agentConfig', rec.id, { config: merged, updatedAt: new Date().toISOString() });
  } else {
    store.insert('agentConfig', { id: AGENT_KEY, stage: 'draft', config: merged, createdAt: new Date().toISOString() });
  }
  return deepMerge({}, merged);
}

function history() {
  return store.find('agentVersions', (r) => r.agentKey === AGENT_KEY)
    .slice()
    .sort((a, b) => (b.version - a.version));
}

function latestVersion() {
  const h = history();
  return h.length ? h[0].version : 1;
}

/**
 * Publish the current draft as a new version. `comment` is optional. Returns
 * the new published config + version record.
 */
function publish({ comment = '' } = {}) {
  const draft = getDraft();
  const version = latestVersion() + 1;
  const now = new Date().toISOString();
  const published = deepMerge({}, draft);
  published.version = version;
  published.publishedAt = now;

  // Promote: clear old published + draft, write the new published record.
  store.removeWhere('agentConfig', (r) => r.id === AGENT_KEY);
  store.insert('agentConfig', { id: AGENT_KEY, stage: 'published', config: published, publishedAt: now, createdAt: now });

  // Append to version history.
  store.insert('agentVersions', {
    agentKey: AGENT_KEY,
    version,
    config: published,
    comment: comment || `v${version}`,
    publishedAt: now,
    status: 'published'
  });

  return { config: deepMerge({}, published), version };
}

/**
 * Restore a previous published version by number. It becomes the newly
 * published (current) active config and a new version record is appended.
 * Returns null if the requested version does not exist.
 */
function rollback(version) {
  const target = store.findOne('agentVersions', (r) => r.agentKey === AGENT_KEY && r.version === Number(version));
  if (!target) return null;
  const next = latestVersion() + 1;
  const now = new Date().toISOString();
  const restored = deepMerge({}, target.config);
  restored.version = next;
  restored.publishedAt = now;

  store.removeWhere('agentConfig', (r) => r.id === AGENT_KEY);
  store.insert('agentConfig', { id: AGENT_KEY, stage: 'published', config: restored, publishedAt: now, createdAt: now });
  store.insert('agentVersions', {
    agentKey: AGENT_KEY,
    version: next,
    config: restored,
    comment: `Rollback to v${target.version}`,
    publishedAt: now,
    status: 'rollback'
  });
  return { config: deepMerge({}, restored), version: next, from: target.version };
}

function resetToDefaults() {
  store.removeWhere('agentConfig', (r) => r.id === AGENT_KEY);
  store.removeWhere('agentVersions', (r) => r.agentKey === AGENT_KEY);
  return deepMerge({}, DEFAULTS);
}

/** Non-secret, dashboard-friendly summary. */
function summary() {
  const active = getActive();
  return {
    name: active.name,
    version: active.version,
    publishedAt: active.publishedAt,
    languages: active.supportedLanguages,
    preferredResponseLanguage: active.preferredResponseLanguage,
    voiceProvider: active.voiceProvider,
    ttsVoice: active.ttsVoice,
    persona: active.persona,
    humanEscalation: active.humanEscalation,
    consentRequired: active.consent.requireExplicit,
    historyCount: history().length
  };
}

/** Diff two configs for the publish review screen (old vs new). */
function diff(oldCfg, newCfg) {
  const changed = [];
  const keys = new Set([...Object.keys(oldCfg || {}), ...Object.keys(newCfg || {})]);
  keys.forEach((k) => {
    const a = JSON.stringify(oldCfg ? oldCfg[k] : undefined);
    const b = JSON.stringify(newCfg ? newCfg[k] : undefined);
    if (a !== b) changed.push({ key: k, from: oldCfg ? oldCfg[k] : undefined, to: newCfg ? newCfg[k] : undefined });
  });
  return changed;
}

module.exports = {
  DEFAULTS, getActive, getDraft, saveDraft, publish, rollback, history, resetToDefaults, summary, diff, latestVersion
};
