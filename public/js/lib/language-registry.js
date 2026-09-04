/* language-registry.js — client-side mirror of the server's canonical
   language registry. Used for instant transcript language detection, TTS
   locale selection, RTL layout and Devanagari→Roman transliteration, so the
   voice screen never waits on the network. The server registry at
   /api/languages remains the source of truth for provider status. */

const LangReg = (() => {
  const LANGUAGES = [
    { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', flag: '🇮🇳', script: 'Devanagari', direction: 'ltr', ws: 'devanagari', webSpeech: 'hi-IN', sample: 'नमस्ते! मैं आपकी कैसे मदद करूँ?', fallback: 'en' },
    { code: 'hing', name: 'Hinglish', nativeName: 'Hinglish', flag: '🇮🇳', script: 'Roman + Devanagari', direction: 'ltr', ws: 'latin', webSpeech: 'hi-IN', sample: 'Namaste! Business kaise chal raha hai?', fallback: 'hi', hinglish: true },
    { code: 'en', name: 'English', nativeName: 'English', flag: '🇬🇧', script: 'Latin', direction: 'ltr', ws: 'latin', webSpeech: 'en-IN', sample: 'Hello! How can I help your business today?', fallback: 'en' },
    { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', flag: '🇧🇩', script: 'Bengali', direction: 'ltr', ws: 'bengali', webSpeech: 'bn-IN', sample: 'নমস্কার! আপনার ব্যবসায় কীভাবে সাহায্য করতে পারি?', fallback: 'en' },
    { code: 'mr', name: 'Marathi', nativeName: 'मराठी', flag: '🇮🇳', script: 'Devanagari', direction: 'ltr', ws: 'devanagari', webSpeech: 'mr-IN', sample: 'नमस्कार! आपल्या व्यवसायात कशी मदत करू?', fallback: 'hi' },
    { code: 'te', name: 'Telugu', nativeName: 'తెలుగు', flag: '🇮🇳', script: 'Telugu', direction: 'ltr', ws: 'telugu', webSpeech: 'te-IN', sample: 'నమస్తే! మీ వ్యాపారానికి ఎలా సహాయం చేయాలి?', fallback: 'en' },
    { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்', flag: '🇮🇳', script: 'Tamil', direction: 'ltr', ws: 'tamil', webSpeech: 'ta-IN', sample: 'வணக்கம்! உங்கள் தொழிலுக்கு எப்படி உதவ முடியும்?', fallback: 'en' },
    { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી', flag: '🇮🇳', script: 'Gujarati', direction: 'ltr', ws: 'gujarati', webSpeech: 'gu-IN', sample: 'નમસ્તે! તમારા વ્યાપારમાં કેવી રીતે મદદ કરું?', fallback: 'en' },
    { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ', flag: '🇮🇳', script: 'Kannada', direction: 'ltr', ws: 'kannada', webSpeech: 'kn-IN', sample: 'ನಮಸ್ಕಾರ! ನಿಮ್ಮ ವ್ಯಾಪಾರಕ್ಕೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?', fallback: 'en' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം', flag: '🇮🇳', script: 'Malayalam', direction: 'ltr', ws: 'malayalam', webSpeech: 'ml-IN', sample: 'നമസ്കാരം! നിങ്ങളുടെ ബിസിനസ്സിന് എങ്ങനെ സഹായിക്കാനാകും?', fallback: 'en' },
    { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', flag: '🇮🇳', script: 'Gurmukhi', direction: 'ltr', ws: 'gurmukhi', webSpeech: 'pa-IN', sample: 'ਸਤ ਸ੍ਰੀ ਅਕਾਲ! ਤੁਹਾਡੇ ਕਾਰੋਬਾਰ ਲਈ ਕੀ ਕਰ ਸਕਦੇ ਹਾਂ?', fallback: 'en' },
    { code: 'or', name: 'Odia', nativeName: 'ଓଡ଼ିଆ', flag: '🇮🇳', script: 'Odia', direction: 'ltr', ws: 'odia', webSpeech: 'or-IN', sample: 'ନମସ୍କାର! ଆପଣଙ୍କ ବ୍ୟବସାୟ ପାଇଁ କେମିତି ସାହାଯ୍ୟ କରିବି?', fallback: 'en' },
    { code: 'as', name: 'Assamese', nativeName: 'অসমীয়া', flag: '🇮🇳', script: 'Bengali / Assamese', direction: 'ltr', ws: 'bengali', webSpeech: 'as-IN', sample: 'নমস্কাৰ! আপোনাৰ ব্যৱসায়ত কেনেকৈ সহায় কৰিব পাৰি?', fallback: 'bn' },
    { code: 'ur', name: 'Urdu', nativeName: 'اردو', flag: '🇵🇰', script: 'Arabic (Nastaliq)', direction: 'rtl', ws: 'arabic', webSpeech: 'ur-IN', sample: 'السلام علیکم! میں آپ کے کاروبار میں کیسے مدد کر سکتا ہوں؟', fallback: 'en' },
    { code: 'bho', name: 'Bhojpuri', nativeName: 'भोजपुरी', flag: '🇮🇳', script: 'Devanagari', direction: 'ltr', ws: 'devanagari', webSpeech: 'hi-IN', sample: 'नमस्ते! भोजपुरी में मदद करूंगा, बताईं रउआ के चाहीं?', fallback: 'hi' },
    { code: 'mai', name: 'Maithili', nativeName: 'मैथिली', flag: '🇮🇳', script: 'Devanagari', direction: 'ltr', ws: 'devanagari', webSpeech: 'hi-IN', sample: 'नमस्कार! मैथिलीमे अपने के’ कोनो सहायता?', fallback: 'hi' },
    { code: 'gom', name: 'Konkani', nativeName: 'कोंकणी', flag: '🇮🇳', script: 'Devanagari', direction: 'ltr', ws: 'devanagari', webSpeech: 'mr-IN', sample: 'नमस्कार! तुमच्या व्यवसायाक खंयचो मदत जाय?', fallback: 'mr' },
    { code: 'ks', name: 'Kashmiri', nativeName: 'कश्मीरी', flag: '🇮🇳', script: 'Devanagari / Perso-Arabic', direction: 'ltr', ws: 'devanagari', webSpeech: 'hi-IN', sample: 'आदाब! मी आपण्यास मदद करनव?', fallback: 'ur' }
  ];

  const byCode = Object.fromEntries(LANGUAGES.map((l) => [l.code, l]));

  function get(codeOrName) {
    if (!codeOrName) return null;
    const k = String(codeOrName).toLowerCase();
    return byCode[k] || LANGUAGES.find((l) => l.name.toLowerCase() === k || l.nativeName === codeOrName) || null;
  }

  function label(code) {
    const l = get(code);
    return l ? `${l.name} — ${l.nativeName}` : code;
  }

  function isRTL(code) {
    const l = get(code);
    return !!(l && l.direction === 'rtl');
  }

  function dirAttr(code) {
    return isRTL(code) ? 'rtl' : 'ltr';
  }

  /* ---- script detection (mirror of server/src) ------------------------ */

  const DISTINCT = {
    mr: ['आहे', 'नाही', 'मला', 'माझ्या', 'होय', 'काय', 'विक्री', 'झालं', 'झाली', 'दुकानात'],
    bho: ['बताईं', 'रउआ', 'भोजपुरी', 'हई', 'चाहीं'],
    mai: ['मैथिली', 'अछि', 'सहायता', 'अहां'],
    gom: ['आमच्या', 'जाली', 'कोंकणी', 'आसा', 'कसो', 'सगोल'],
    ks: ['कश्मीरी', 'छुस', 'चुह', 'क्लास']
  };
  const HING = ['bhai', 'bhaiya', 'kar', 'karo', 'kya', 'kaise', 'aap', 'mujhe', 'chahiye', 'paisa', 'bahut', 'accha', 'samjhao', 'batao', 'kyu', 'nahi', 'bolo', 'bol', 'hai', 'ho', 'raha', 'rahi', 'mein', 'ke', 'ki', 'karna', 'karte', 'dhanwad', 'shukriya'];

  const SCRIPT_RE = [
    { ids: ['bn', 'as'], re: /[\u0980-\u09FF]/ },
    { ids: ['pa'], re: /[\u0A00-\u0A7F]/ },
    { ids: ['gu'], re: /[\u0A80-\u0AFF]/ },
    { ids: ['or'], re: /[\u0B00-\u0B7F]/ },
    { ids: ['ta'], re: /[\u0B80-\u0BFF]/ },
    { ids: ['te'], re: /[\u0C00-\u0C7F]/ },
    { ids: ['kn'], re: /[\u0C80-\u0CFF]/ },
    { ids: ['ml'], re: /[\u0D00-\u0D7F]/ },
    { ids: ['ur'], re: /[\u0600-\u06FF]/ },
    { ids: ['deva'], re: /[\u0900-\u097F]/ }
  ];

  function moreHas(g) { return g === 'mr' || g === 'bho' || g === 'mai' || g === 'gom' || g === 'ks'; }

  function detectToken(token) {
    for (const s of SCRIPT_RE) {
      if (!s.re.test(token)) continue;
      if (s.ids[0] === 'deva') {
        for (const d of ['mr', 'bho', 'mai', 'gom', 'ks']) {
          if (DISTINCT[d].some((w) => token.includes(w))) return d;
        }
        return 'hi';
      }
      if (s.ids.length === 2) {
        if (/মোৰ|বিক্রি|হ’ল|অসমীয়া/.test(token)) return 'as';
        return 'bn';
      }
      return s.ids[0];
    }
    if (/[a-z]/i.test(token)) return HING.includes(token.toLowerCase()) ? 'hing' : 'roman';
    return 'roman';
  }

  // Client-side utterance guess. `en` vs `hing` handled conservatively.
  function guessLang(text) {
    if (!text || !text.trim()) return 'en';
    const low = text.toLowerCase();
    if (/[\u0980-\u09FF]/.test(low)) return /মোৰ|বিক্রি|হ’ল|অসমীয়া|আপোনাৰ/.test(low) ? 'as' : 'bn';
    if (/[\u0A00-\u0A7F]/.test(low)) return 'pa';
    if (/[\u0A80-\u0AFF]/.test(low)) return 'gu';
    if (/[\u0B00-\u0B7F]/.test(low)) return 'or';
    if (/[\u0B80-\u0BFF]/.test(low)) return 'ta';
    if (/[\u0C00-\u0C7F]/.test(low)) return 'te';
    if (/[\u0C80-\u0CFF]/.test(low)) return 'kn';
    if (/[\u0D00-\u0D7F]/.test(low)) return 'ml';
    if (/[\u0600-\u06FF]/.test(low)) return 'ur';
    if (/[\u0900-\u097F]/.test(low)) {
      const more = { mr: 0, bho: 0, mai: 0, gom: 0, ks: 0 };
      const tokens = text.split(/\s+/);
      for (const raw of tokens) {
        const t = raw.replace(/[^a-z\u0900-\u097F]/g, '');
        for (const d of Object.keys(more)) {
          if (DISTINCT[d].some((w) => t.includes(w))) more[d]++;
        }
      }
      let best = 'hi', bestN = 0;
      for (const d of Object.keys(more)) {
        if (more[d] > bestN) { best = d; bestN = more[d]; }
      }
      return best;
    }
    const tokens = low.split(/\s+/);
    const hingHits = tokens.filter((t) => HING.includes(t.replace(/[^a-z]/g, ''))).length;
    if (hingHits >= 1) return 'hing';
    return 'en';
  }

  /* ---- Devanagari → Roman transliteration (demo-grade) ---------------- */
  const TC = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd',
    'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y',
    'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l'
  };
  const TV = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };
  const TM = { 'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h', 'ँ': 'm' };
  const HALANT = '\u094D';

  function transliterate(code, text) {
    const l = get(code);
    if (!l) return null;
    if (l.ws !== 'devanagari') return l.ws === 'latin' ? text : null;
    if (!/[\u0900-\u097F]/.test(text)) return text;
    let out = '';
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const two = text.substr(i, 2);
      if (TV[two]) { out += TV[two]; i++; }
      else if (TV[ch]) out += TV[ch];
      else if (TC[ch]) {
        const next = text[i + 1];
        if (next === HALANT) { out += TC[ch]; i++; }
        else if (next && TM[next]) { out += TC[ch] + TM[next]; i++; }
        else out += (i >= text.length - 1) ? TC[ch] : TC[ch] + 'a';
      } else if (TM[ch]) out += TM[ch];
      else if (/[\u0900-\u097F]/.test(ch)) out += ch;
      else out += ch;
    }
    return out;
  }

  function statusBadge(status) {
    const map = {
      'full': { cls: 'st-full', text: 'Fully supported' },
      'stt-only': { cls: 'st-stt', text: 'Speech-to-text only' },
      'tts-only': { cls: 'st-tts', text: 'Text-to-speech only' },
      'translation-only': { cls: 'st-tr', text: 'Translation only' },
      'mock': { cls: 'st-mock', text: 'Mock/demo mode' },
      'not-configured': { cls: 'st-off', text: 'Not configured' }
    };
    return map[status] || map['not-configured'];
  }

  return { LANGUAGES, get, label, isRTL, dirAttr, guessLang, transliterate, statusBadge };
})();

window.LangReg = LangReg;