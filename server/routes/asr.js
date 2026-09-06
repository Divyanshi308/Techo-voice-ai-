'use strict';

/**
 * asr.js — Speech-to-text status + an (optional) Deepgram-backed transcribe
 * endpoint. The default live voice path uses Agora's conversational agent
 * (Agora-cloud ASR+LLM+TTS), so browser ASR here is a fallback only: when
 * DEEPGRAM_API_KEY is configured this can transcribe uploaded audio/blobs;
 * otherwise it reports "not configured" honestly instead of pretending.
 */

const express = require('express');
const auth = require('../auth');

const router = express.Router();

function deepgramConfigured() {
  return !!process.env.DEEPGRAM_API_KEY;
}

router.get('/api/asr/status', auth.requireUser, (req, res) => {
  res.json({ ok: true, configured: deepgramConfigured(), provider: deepgramConfigured() ? 'deepgram' : 'agora-agent', mode: deepgramConfigured() ? 'deepgram-rest' : 'agent-default' });
});

router.post('/api/asr/transcribe', auth.requireUser, async (req, res) => {
  if (!deepgramConfigured()) {
    return res.status(501).json({ ok: false, configured: false, message: 'ASR not configured — set DEEPGRAM_API_KEY on the server. The live Agora voice agent uses its own built-in ASR, so this endpoint is optional.' });
  }
  const lang = req.body && req.body.lang ? String(req.body.lang) : 'en-in';
  const audio = (req.body && req.body.audio) || '';
  if (!audio) return res.status(400).json({ ok: false, error: 'no_audio', message: 'Missing "audio" payload (base64).' });
  try {
    const buf = Buffer.from(String(audio), 'base64');
    const resp = await fetch('https://api.deepgram.com/v1/listen?model=nova-2&smart_format=true&language=' + encodeURIComponent(lang), {
      method: 'POST',
      headers: { 'Authorization': 'Token ' + process.env.DEEPGRAM_API_KEY, 'Content-Type': 'audio/webm' },
      body: buf
    });
    const data = await resp.json();
    const text = ((data.results && data.results.channels && data.results.channels[0] && data.results.channels[0].alternatives && data.results.channels[0].alternatives[0] && data.results.channels[0].alternatives[0].transcript) || '').trim();
    res.json({ ok: true, text, lang, provider: 'deepgram' });
  } catch (e) {
    res.json({ ok: false, error: 'provider_error', message: 'Deepgram transcribe failed: ' + e.message });
  }
});

module.exports = router;