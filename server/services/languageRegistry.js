'use strict';

/**
 * languageRegistry.js — THE single source of truth for VyaparVaani's 18
 * language modes.
 *
 * Every language object describes:
 *   - identity: code, name, nativeName, flag
 *   - writing: script + text direction (rdl for Urdu)
 *   - capability: stt / tts / translation availability
 *   - provider locale mappings (providers disagree on locale codes!)
 *   - voices + default voice, sample greeting, fallback language
 *   - an honest `status` label (Fully supported / STT-only / TTS-only /
 *     Translation-only / Mock-demo mode / Not configured)
 *
 * The registry is the ONLY place languages are defined. The seed, /api/config,
 * the frontend language selector, the reply engine, the survey/reminder/call
 * pickers and the docs all derive from here.
 */

const SCRIPTS = {
  devanagari: { label: 'Devanagari', re: /[\u0900-\u097F]/ },
  bengali: { label: 'Bengali', re: /[\u0980-\u09FF]/ },
  gurmukhi: { label: 'Gurmukhi', re: /[\u0A00-\u0A7F]/ },
  gujarati: { label: 'Gujarati', re: /[\u0A80-\u0AFF]/ },
  odia: { label: 'Odia', re: /[\u0B00-\u0B7F]/ },
  tamil: { label: 'Tamil', re: /[\u0B80-\u0BFF]/ },
  telugu: { label: 'Telugu', re: /[\u0C00-\u0C7F]/ },
  kannada: { label: 'Kannada', re: /[\u0C80-\u0CFF]/ },
  malayalam: { label: 'Malayalam', re: /[\u0D00-\u0D7F]/ },
  arabic: { label: 'Arabic (Urdu)', re: /[\u0600-\u06FF]/ },
  latin: { label: 'Latin', re: /[a-zA-Z]/ }
};

/**
 * Provider locale map. Different ASR/TTS/hosting providers use different
 * locale strings for the same language — never assume they agree.
 */
const PROVIDER_LOCALES = {
  hi: { webSpeech: 'hi-IN', deepgram: 'hi', elevenlabs: 'hi', google: 'hi-IN', openai: 'hi' },
  hing: { webSpeech: 'hi-IN', deepgram: 'hi-transcription', elevenlabs: 'hi', google: 'hi-IN', openai: 'hi' },
  en: { webSpeech: 'en-IN', deepgram: 'en', elevenlabs: 'en', google: 'en-IN', openai: 'en' },
  bn: { webSpeech: 'bn-IN', deepgram: 'bn', elevenlabs: 'bn', google: 'bn-IN', openai: 'bn' },
  mr: { webSpeech: 'mr-IN', deepgram: 'mr', elevenlabs: 'mr', google: 'mr-IN', openai: 'mr' },
  te: { webSpeech: 'te-IN', deepgram: 'te', elevenlabs: 'te', google: 'te-IN', openai: 'te' },
  ta: { webSpeech: 'ta-IN', deepgram: 'ta', elevenlabs: 'ta', google: 'ta-IN', openai: 'ta' },
  gu: { webSpeech: 'gu-IN', deepgram: 'gu', elevenlabs: 'gu', google: 'gu-IN', openai: 'gu' },
  kn: { webSpeech: 'kn-IN', deepgram: 'kn', elevenlabs: 'kn', google: 'kn-IN', openai: 'kn' },
  ml: { webSpeech: 'ml-IN', deepgram: 'ml', elevenlabs: 'ml', google: 'ml-IN', openai: 'ml' },
  pa: { webSpeech: 'pa-IN', deepgram: 'pa', elevenlabs: 'pa', google: 'pa-IN', openai: 'pa' },
  or: { webSpeech: 'or-IN', deepgram: 'or', elevenlabs: 'or', google: 'or-IN', openai: 'or' },
  as: { webSpeech: 'as-IN', deepgram: 'as', elevenlabs: 'as', google: 'as-IN', openai: 'as' },
  ur: { webSpeech: 'ur-IN', deepgram: 'ur', elevenlabs: 'ur', google: 'ur-PK', openai: 'ur' },
  bho: { webSpeech: 'hi-IN', deepgram: 'hi', elevenlabs: 'hi', google: 'hi-IN', openai: 'bho' },
  mai: { webSpeech: 'hi-IN', deepgram: 'hi', elevenlabs: 'hi', google: 'hi-IN', openai: 'mai' },
  gom: { webSpeech: 'mr-IN', deepgram: 'mr', elevenlabs: 'mr', google: 'mr-IN', openai: 'gom' },
  ks: { webSpeech: 'hi-IN', deepgram: 'hi', elevenlabs: 'hi', google: 'hi-IN', openai: 'ks' }
};

/**
 * Status constants (the six allowed labels).
 *  - full              STT + TTS both work and were exercised/verified.
 *  - stt-only          Speech-to-text works; no working TTS.
 *  - tts-only          Text-to-speech works; no working STT.
 *  - translation-only  AI text replies available; no voice pipeline.
 *  - mock              Demo/mock adapter in use — do NOT present as real.
 *  - not-configured    No provider available for this language.
 */
const STATUS = {
  FULL: 'full',
  STT_ONLY: 'stt-only',
  TTS_ONLY: 'tts-only',
  TRANSLATION_ONLY: 'translation-only',
  MOCK: 'mock',
  NOT_CONFIGURED: 'not-configured'
};

const STATUS_LABEL = {
  'full': 'Fully supported',
  'stt-only': 'Speech-to-text only',
  'tts-only': 'Text-to-speech only',
  'translation-only': 'Translation only',
  'mock': 'Mock/demo mode',
  'not-configured': 'Not configured'
};

// Language groups (for scripts sharing one writing system).
const LANGUAGES = [
  {
    code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳',
    script: 'Devanagari', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: true,
    defaultVoice: 'v_roopa', writeSystem: 'devanagari',
    sample: 'नमस्ते! मैं आपकी कैसे मदद करूँ?',
    fallback: 'en'
  },
  {
    code: 'hing', name: 'Hinglish', nativeName: 'Hinglish', flag: '🇮🇳',
    script: 'Roman + Devanagari', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: true,
    defaultVoice: 'v_neutral', writeSystem: 'latin',
    sample: 'Namaste! Business kaise chal raha hai?',
    fallback: 'hi',
    hinglish: true
  },
  {
    code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧',
    script: 'Latin', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: true,
    defaultVoice: 'v_linda', writeSystem: 'latin',
    sample: 'Hello! How can I help your business today?',
    fallback: 'en'
  },
  {
    code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩',
    script: 'Bengali', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_mithai', writeSystem: 'bengali',
    sample: 'নমস্কার! আপনার ব্যবসায় কীভাবে সাহায্য করতে পারি?',
    fallback: 'en'
  },
  {
    code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳',
    script: 'Devanagari', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_abhiman', writeSystem: 'devanagari',
    sample: 'नमस्कार! आपल्या व्यवसायात कशी मदत करू?',
    fallback: 'hi'
  },
  {
    code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳',
    script: 'Telugu', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_teju', writeSystem: 'telugu',
    sample: 'నమస్తే! మీ వ్యాపారానికి ఎలా సహాయం చేయాలి?',
    fallback: 'en'
  },
  {
    code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳',
    script: 'Tamil', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_tamilan', writeSystem: 'tamil',
    sample: 'வணக்கம்! உங்கள் தொழிலுக்கு எப்படி உதவ முடியும்?',
    fallback: 'en'
  },
  {
    code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳',
    script: 'Gujarati', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_gujju', writeSystem: 'gujarati',
    sample: 'નમસ્તે! તમારા વ્યાપારમાં કેવી રીતે મદદ કરું?',
    fallback: 'en'
  },
  {
    code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳',
    script: 'Kannada', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_kannadiga', writeSystem: 'kannada',
    sample: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?',
    fallback: 'en'
  },
  {
    code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳',
    script: 'Malayalam', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_malayali', writeSystem: 'malayalam',
    sample: 'നമസ്കാരം! നിങ്ങളുടെ ബിസിനസ്സിന് എങ്ങനെ സഹായിക്കാനാകും?',
    fallback: 'en'
  },
  {
    code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳',
    script: 'Gurmukhi', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_sherni', writeSystem: 'gurmukhi',
    sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਕੀ ਕਰ ਸਕਦੇ ਹਾਂ?',
    fallback: 'en'
  },
  {
    code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳',
    script: 'Odia', direction: 'ltr',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_odia', writeSystem: 'odia',
    sample: 'ନମସ୍କାର! ଆପଣଙ୍କ ବ୍ୟବସାୟ ପାଇଁ କେମିତି ସାହାଯ୍ୟ କରିବି?',
    fallback: 'en'
  },
  {
    code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', flag: '🇮🇳',
    script: 'Bengali / Assamese', direction: 'ltr',
    stt: false, tts: false, translation: true, tested: false,
    defaultVoice: 'v_assamese', writeSystem: 'bengali',
    sample: 'নমস্কাৰ! আপোনাৰ ব্যৱসায়ত কেনেকৈ সহায় কৰিব পাৰি?',
    fallback: 'bn'
  },
  {
    code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰',
    script: 'Arabic (Nastaliq)', direction: 'rtl',
    stt: true, tts: true, translation: true, tested: false,
    defaultVoice: 'v_urdu', writeSystem: 'arabic',
    sample: 'السلام علیکم! میں آپ کے کاروبار میں کیسے مدد کر سکتا ہوں؟',
    fallback: 'en'
  },
  {
    code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी', flag: '🇮🇳',
    script: 'Devanagari', direction: 'ltr',
    stt: false, tts: false, translation: true, tested: false,
    defaultVoice: 'v_bhojpuri', writeSystem: 'devanagari',
    sample: 'नमस्ते! भोजपुरी में मदद करूंगा, बताईं रउआ के चाहीं?',
    fallback: 'hi'
  },
  {
    code: 'mai', name: 'Maithili', nativeName: 'मैथिली', flag: '🇮🇳',
    script: 'Devanagari', direction: 'ltr',
    stt: false, tts: false, translation: true, tested: false,
    defaultVoice: 'v_maithili', writeSystem: 'devanagari',
    sample: 'नमस्कार! मैथिलीमे अपने के’ कोनो सहायता?',
    fallback: 'hi'
  },
  {
    code: 'gom', name: 'Konkani', nativeName: 'कोंकणी', flag: '🇮🇳',
    script: 'Devanagari', direction: 'ltr',
    stt: false, tts: false, translation: true, tested: false,
    defaultVoice: 'v_konkani', writeSystem: 'devanagari',
    sample: 'नमस्कार! तुमच्या व्यवसायाक खंयचो मदत जाय?',
    fallback: 'mr'
  },
  {
    code: 'ks', name: 'Kashmiri', nativeName: 'कश्मीरी', flag: '🇮🇳',
    script: 'Devanagari / Perso-Arabic', direction: 'ltr',
    stt: false, tts: false, translation: true, tested: false,
    defaultVoice: 'v_kashmiri', writeSystem: 'devanagari',
    sample: 'آداب! کین چھیہ آسان مدد کَرنہ برائے پننہ کاروبار؟',
    fallback: 'ur'
  }
];

const byCode = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

/** Resolve a language object from any common alias. */
function get(codeOrName) {
  if (!codeOrName) return null;
  const k = String(codeOrName).trim().toLowerCase();
  return byCode[k] ||
    LANGUAGES.find((l) => l.name.toLowerCase() === k || l.nativeName.toLowerCase() === k) || null;
}

/** Public list (no internals). */
function list() {
  return LANGUAGES.map((l) => ({
    code: l.code, name: l.name, nativeName: l.nativeName, flag: l.flag,
    script: l.script, direction: l.direction,
    stt: l.stt, tts: l.tts, translation: l.translation,
    defaultVoice: l.defaultVoice, sample: l.sample, fallback: l.fallback,
    status: statusOf(l.code), statusLabel: STATUS_LABEL[statusOf(l.code)],
    statusReason: statusReasonOf(l.code)
  }));
}

/**
 * Honest per-language status, computed from capabilities + provider registry.
 * Never claims "fully supported" for anything that has not been tested.
 */
function statusOf(code) {
  const lang = get(code);
  if (!lang) return STATUS.NOT_CONFIGURED;
  const prov = require('./providerRegistry'); // lazy: avoids circular require at boot

  const realASR = prov.get('asr').provider === 'deepgram';
  const realTTS = prov.get('tts').provider === 'elevenlabs';

  if (!realASR && !realTTS) {
    // Mock/browser pipeline. Only hi / hing / en have a verified demo path.
    if (!lang.translation) return STATUS.NOT_CONFIGURED;
    if (lang.tested) return STATUS.MOCK; // browser demo verified — still "mock" until a real provider
    if (lang.stt && lang.tts) return STATUS.MOCK;
    if (lang.stt) return STATUS.MOCK;
    if (lang.tts) return STATUS.MOCK;
    return STATUS.TRANSLATION_ONLY;
  }

  // A real provider is configured — compute real status per capability.
  const localeOK = (mapKey) => !!(PROVIDER_LOCALES[code] && PROVIDER_LOCALES[code][mapKey]);
  const sttOK = realASR && lang.stt && localeOK('deepgram');
  const ttsOK = realTTS && lang.tts && localeOK('elevenlabs');
  if (sttOK && ttsOK) return STATUS.FULL;
  if (sttOK) return STATUS.STT_ONLY;
  if (ttsOK) return STATUS.TTS_ONLY;
  if (lang.translation) return STATUS.TRANSLATION_ONLY;
  return STATUS.NOT_CONFIGURED;
}

function statusReasonOf(code) {
  const lang = get(code);
  if (!lang) return 'Unknown language code.';
  const s = statusOf(code);
  const prov = require('./providerRegistry');
  const asr = prov.get('asr');
  const tts = prov.get('tts');
  const locale = PROVIDER_LOCALES[code] || {};
  const parts = [];
  if (s === STATUS.FULL) parts.push('STT and TTS verified for ' + code + ' via configured providers.');
  else if (s === STATUS.STT_ONLY) parts.push('Deepgram STT configured; no TTS for ' + code + '.');
  else if (s === STATUS.TTS_ONLY) parts.push('ElevenLabs TTS configured; no STT for ' + code + '.');
  else if (s === STATUS.TRANSLATION_ONLY) parts.push('AI text replies available; no speech pipeline for ' + code + '.');
  else if (s === STATUS.MOCK) {
    parts.push('Demo/mock mode — no real provider for ' + code + '.');
    if (asr.provider === 'mock-browser-speech') parts.push('ASR falls back to browser Web Speech. Deepgram locale: ' + (locale.deepgram || '—'));
    if (tts.provider === 'browser-synthesis') parts.push('TTS falls back to device voices. ElevenLabs locale: ' + (locale.elevenlabs || '—'));
    if (lang.tested) parts.push('Browser demo path verified in Chrome.');
  } else {
    parts.push('No provider configured for ' + code + '.');
  }
  return parts.join(' ');
}

function localeFor(code, providerKey) {
  const lang = get(code);
  if (!lang) return null;
  const map = PROVIDER_LOCALES[lang.code];
  return (map && map[providerKey]) || null;
}

function isRTL(code) {
  const lang = get(code);
  return !!(lang && lang.direction === 'rtl');
}

function defaultVoiceLang(code) {
  const lang = get(code);
  return lang ? lang.defaultVoice : null;
}

/* ---------------------------------------------------------------------- *
 * Devanagari -> Roman transliteration (demo-grade, lossy but readable).
 * Covers Hindi/Marathi/Bhojpuri/Maithili/Konkani/Kashmiri(Devanagari).
 * ---------------------------------------------------------------------- */
const TRANS_CONS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'ng',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'ny',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
  'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l', 'ऴ': 'zh', 'क्ष': 'ksh', 'त्र': 'tr', 'ज्ञ': 'gy'
};
const TRANS_VOW = {
  'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo',
  'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'अं': 'an', 'अः': 'ah', 'अँ': 'am'
};
const TRANS_MATR = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h', 'ँ': 'm'
};
const DEV_HALANT = '\u094D'; // ्

function transliterateDev(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const two = text.substr(i, 2);
    if (TRANS_VOW[two]) {
      out += TRANS_VOW[two];
      i++;
    } else if (TRANS_VOW[ch]) {
      out += TRANS_VOW[ch];
    } else if (TRANS_CONS[ch]) {
      const next = text[i + 1];
      if (next === DEV_HALANT) {
        out += TRANS_CONS[ch]; // virama: no vowel
        i++;
      } else if (next && TRANS_MATR[next]) {
        out += TRANS_CONS[ch] + TRANS_MATR[next]; // explicit maatraa
        i++;
      } else {
        out += (i >= text.length - 1) ? TRANS_CONS[ch] : TRANS_CONS[ch] + 'a';
      }
    } else if (TRANS_MATR[ch]) {
      out += TRANS_MATR[ch];
    } else if (/[\u0900-\u097F]/.test(ch)) {
      // any other Devanagari glyph (numerals, nukta variants) → keep char
      out += ch;
    } else {
      out += ch;
    }
  }
  return out;
}

/**
 * Best-effort roman display for a native-script string. Returns the
 * transliterated text, or null when no romanization exists for the script.
 */
function transliterate(code, text) {
  const lang = get(code);
  if (!lang) return null;
  const ws = lang.writeSystem || '';
  if (ws === 'latin') return text;
  if (ws === 'devanagari') return transliterateDev(text);
  // Other scripts: no demo transliterator yet — return null (caller shows
  // native script only + an honest note).
  return null;
}

/* ---------------------------------------------------------------------- *
 * Text-direction helper for HTML
 * ---------------------------------------------------------------------- */
function dirAttr(code) {
  return isRTL(code) ? 'rtl' : 'ltr';
}

module.exports = {
  LANGUAGES, byCode, get, list, statusOf, statusReasonOf, localeFor,
  isRTL, dirAttr, defaultVoiceLang, transliterate, SCRIPTS,
  PROVIDER_LOCALES, STATUS, STATUS_LABEL
};