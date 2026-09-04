'use strict';

/**
 * routes/languages.js — language system endpoints (registry + detection +
 * demo conversations). Language data itself lives in the canonical registry.
 */

const express = require('express');
const store = require('../db');
const auth = require('../auth');
const languageRegistry = require('../services/languageRegistry');
const language = require('../services/language');

const router = express.Router();

// Full public registry (18 modes, provider-aware status, provider locales,
// voices, sample greetings). Used by the language selector + preview UI.
router.get('/api/languages', (req, res) => {
  const storedLangs = store.all('languages');
  const disabled = new Set(storedLangs.filter((l) => l.enabled === false).map((l) => l.code));
  const languages = languageRegistry.list().map((l) => ({
    ...l,
    enabled: !disabled.has(l.code),
    locales: languageRegistry.PROVIDER_LOCALES[l.code] || {},
    voices: store.all('voices').filter((v) => v.lang === l.code),
    writeSystem: languageRegistry.get(l.code).writeSystem,
    tested: languageRegistry.get(l.code).tested
  }));
  res.json({ languages });
});

// Server-authoritative language detection for a spoken/typed utterance.
router.post('/api/language/detect', (req, res) => {
  const { text, previousLang } = req.body || {};
  if (!text || !String(text).trim()) {
    return res.json({ lang: previousLang || 'en', confident: false, error: 'empty' });
  }
  const result = language.detectLang(String(text).trim(), previousLang);
  const entry = languageRegistry.get(result.lang);
  res.json({
    ...result,
    name: entry ? entry.name : null,
    nativeName: entry ? entry.nativeName : null,
    direction: entry ? entry.direction : 'ltr'
  });
});

// Per-language voice previews (consent is handled on the client via SpeechSynthesis).
router.get('/api/language/voices', (req, res) => {
  const voices = store.all('voices');
  res.json({
    voices: voices.map((v) => ({
      id: v.id, name: v.name, lang: v.lang, gender: v.gender,
      accent: v.accent, personality: v.personality, pitch: v.pitch, rate: v.rate
    })),
    providers: languageRegistry.PROVIDER_LOCALES
  });
});

// Demo conversations for all 18 modes — one starter per language so the voice
// AI can be exercised before any real provider is connected.
router.get('/api/demo/conversations', (req, res) => {
  res.json({ conversations: DEMO });
});

const DEMO = [
  { lang: 'hi', name: 'Hindi', example: 'मुझे रोज़ की बिक्री और खर्च का हिसाब चाहिए', note: 'Greeting + record sale' },
  { lang: 'hing', name: 'Hinglish', example: 'Mujhe apne kapde ke business ke liye WhatsApp promotion banana hai', note: 'Mixed Hindi-English' },
  { lang: 'en', name: 'English', example: 'I want to grow my shop with better marketing', note: 'English-only' },
  { lang: 'bn', name: 'Bengali', example: 'আমার দোকানের বিক্রি বাড়াতে চাই', note: 'Bengali-only' },
  { lang: 'mr', name: 'Marathi', example: 'माझ्या दुकानात आज 2000 ची विक्री झाली', note: 'Record a sale' },
  { lang: 'te', name: 'Telugu', example: 'నా దుకాణంలో నేడు 2000 అమ్మకం జరిగింది', note: 'Record a sale' },
  { lang: 'ta', name: 'Tamil', example: 'என் கடையில் இன்று 2000 விற்பனை நடந்தது', note: 'Record a sale' },
  { lang: 'gu', name: 'Gujarati', example: 'મારી દુકાનમાં આજે 2000નું વેચાણ થયું', note: 'Record a sale' },
  { lang: 'kn', name: 'Kannada', example: 'ನನ್ನ ಅಂಗಡಿಯಲ್ಲಿ ಇಂದು 2000 ಮಾರಾಟವಾಯಿತು', note: 'Record a sale' },
  { lang: 'ml', name: 'Malayalam', example: 'എൻ്റെ കടയിൽ ഇന്ന് 2000 രൂപയുടെ വിൽപ്പന നടന്നു', note: 'Record a sale' },
  { lang: 'pa', name: 'Punjabi', example: 'ਮੇਰੀ ਦੁਕਾਨ ਵਿੱਚ ਅੱਜ 2000 ਦੀ ਵਿਕਰੀ ਹੋਈ', note: 'Record a sale' },
  { lang: 'or', name: 'Odia', example: 'ମୋ ଦୋକାନରେ ଆଜି 2000 ଟଙ୍କାର ବିକ୍ରି ହେଲା', note: 'Record a sale' },
  { lang: 'as', name: 'Assamese', example: 'মোৰ দোকানত আজি 2000 টকাৰ বিক্ৰী হ’ল', note: 'Record a sale' },
  { lang: 'ur', name: 'Urdu', example: 'میری دکان میں آج 2000 کی فروخت ہوئی', note: 'Urdu RTL' },
  { lang: 'bho', name: 'Bhojpuri', example: 'रउआ भोजपुरी में 2000 के बेचत बताईं', note: 'Bhojpuri' },
  { lang: 'mai', name: 'Maithili', example: 'हम मैथिली में आज 2000 क बिक्री चाहै छी', note: 'Maithili' },
  { lang: 'gom', name: 'Konkani', example: 'आमच्या दुकानात आज 2000 ची विक्री जाली', note: 'Konkani' },
  { lang: 'ks', name: 'Kashmiri', example: 'म्यन कश्मीरी में 2000 की बिक्री दरकरार', note: 'Kashmiri' }
];

module.exports = router;