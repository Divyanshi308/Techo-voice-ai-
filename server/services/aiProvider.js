'use strict';

/**
 * aiProvider.js — API-ready AI provider interface.
 *
 * The app talks to this module, never to the mock logic directly. Swapping in
 * a real LLM means replacing `generate()`'s body (e.g. call an LLM API with
 * the same `request` shape) — routes and the frontend stay unchanged.
 */

const aiEngine = require('./aiEngine');

const PROVIDER = {
  name: 'techo-local-ai',
  kind: 'mock', // → 'openai' | 'gemini' | ... when wired to a real API
  model: 'techo-engine-v1',
  notes: 'Deterministic rule-based engine. No external API, no data leaves the server.'
};

/**
 * Generate an assistant reply.
 * @param {object} request { user, text, mode, detectedLang }
 * @returns {Promise<{reply, replyLang, actions, toolCalls, meta, intents, model}>}
 */
const generate = async (request) => {
  const result = await aiEngine.handleMessage(request);
  return { ...result, model: PROVIDER.model, provider: PROVIDER.kind };
};

const summarizeConversation = (messages, business) => aiEngine.summarizeConversation(messages, business);

module.exports = { generate, summarizeConversation, PROVIDER };