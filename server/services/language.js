'use strict';

/**
 * language.js — Language detection & code-switching support for 18 modes.
 *
 * Detection strategy (offline, deterministic, no external calls):
 *   1. Script detection — Devanagari, Bengali/Assamese, Gurmukhi, Gujarati,
 *      Odia, Tamil, Telugu, Kannada, Malayalam, Arabic (Urdu), Latin.
 *   2. Keyword lexicon — distinctive words per language (incl. Hinglish and
 *      script-sharing pairs like hi/mr/bho/mai/gom and bn/as).
 *   3. Roman/Hinglish inference — heavy Hindi loanwords in Roman script.
 *   4. Explicit markers — phrases like "marathi mein" override the guess.
 */

const TRANS_MAT = {
  'ा': 'a', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo',
  'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ं': 'n', 'ः': 'h', 'ँ': 'm'
};

const SCRIPTS = [
  { ids: ['bn', 'as'], re: /[\u0980-\u09FF]/ },
  { ids: ['pa'], re: /[\u0A00-\u0A7F]/ },
  { ids: ['gu'], re: /[\u0A80-\u0AFF]/ },
  { ids: ['or'], re: /[\u0B00-\u0B7F]/ },
  { ids: ['ta'], re: /[\u0B80-\u0BFF]/ },
  { ids: ['te'], re: /[\u0C00-\u0C7F]/ },
  { ids: ['kn'], re: /[\u0C80-\u0CFF]/ },
  { ids: ['ml'], re: /[\u0D00-\u0D7F]/ },
  { ids: ['ur'], re: /[\u0600-\u06FF]/ },
  { ids: ['hi', 'mr', 'bho', 'mai', 'gom', 'ks'], re: /[\u0900-\u097F]/ }
];

// Distinctive words per language (used within a shared script group).
const DISTINCT = {
  hi: ['है', 'हैं', 'क्या', 'नहीं', 'हूँ', 'आप', 'बोल', 'करें', 'जाए', 'बहुत', 'अच्छा', 'मुझे', 'चाहिए', 'दुकान', 'ग्राहक', 'माल', 'पैसा', 'कीमत', 'बिक्री', 'खर्च', 'समझ', 'और', 'ये', 'वो', 'का', 'को', 'से', 'में', 'नमस्ते', 'करना'],
  mr: ['आहे', 'नाही', 'मला', 'माझ्या', 'होय', 'दुकान', 'काय', 'पैसे', 'विक्री', 'खर्च', 'समज', 'बोला', 'हवे', 'झालं', 'झाली', 'आम्ही', 'मी', 'नोंद', 'काम', 'दुकानात'],
  bho: ['बताईं', 'रउआ', 'हई', 'चाहीं', 'भोजपुरी', 'अपना', 'पिया', 'केले', 'देहात', 'कैसन', 'मोहि'],
  mai: ['मैथिली', 'अपने', 'अछि', 'के', 'सहायता', 'सम्ह', 'हम', 'अहां', 'टा', 'नान्ह'],
  gom: ['आमच्या', 'जाली', 'कोंकणी', 'आसा', 'कसो', 'तुमी', 'धंदो', 'वेपार', 'पैशे', 'काणी', 'सगोल', 'दुकानात'],
  ks: ['कश्मीरी', 'चुह', 'छुस', 'ब्यापार', 'क्लास', 'असी', 'ह्युड', 'कॅन', 'सुन्दर', 'अछि', 'काम'],
  as: ['অসমীয়া', 'আপোনাৰ', 'ব্যৱসায়', 'কেনেকৈ', 'সহায়', 'মানি', 'নেই', 'বেছি', 'কৰিব', 'হৈছে', 'মোৰ', 'আজি', 'বিক্রি'],
  bn: ['আমি', 'কী', 'নেই', 'দোকান', 'টাকা', 'বিক্রি', 'খরচ', 'বুঝি', 'বলা', 'ভালো', 'আছে', 'আমার', 'চাই', 'হয়েছে', 'করবো', 'দিলাম']
};

const HING = ['bhai', 'bhaiya', 'kar', 'karo', 'kya', 'kaise', 'aap', 'aapka', 'mujhe', 'chahiye', 'paisa', 'bahut', 'accha', 'samjhao', 'batao', 'kyu', 'nahi', 'bolo', 'bol', 'hai', 'ho', 'raha', 'rahi', 'mein', 'ke', 'ki', 'hoga', 'karna', 'karte', 'dhanwad', 'shukriya', 'yaar', 'behen', 'jaldi'];

const LEXICON = {
  hi: DISTINCT.hi,
  mr: DISTINCT.mr,
  bn: DISTINCT.bn,
  pa: ['ਮੈਂ', 'ਕੀ', 'ਨਹੀਂ', 'ਦੁਕਾਨ', 'ਪੈਸੇ', 'ਵਿਕਰੀ', 'ਖਰਚ', 'ਸਮਝ', 'ਬੋਲ', 'ਵਧੀਆ', 'ਹੈ', 'ਮੇਰਾ', 'ਚਾਹੀਦਾ', 'ਕੰਮ'],
  ur: ['ہے', 'کیا', 'نہیں', 'میں', 'دکان', 'پیسے', 'فروخت', 'خرچ', 'سمجھ', 'بولوں', 'مدد', 'کاروبار', 'کس', 'آپ'],
  gu: ['છે', 'ને', 'છું', 'દુકાન', 'પૈસા', 'વેચાણ', 'ખર્ચ', 'સમજ', 'બોલો', 'મદદ', 'વ્યાપાર', 'કેવી', 'કરું'],
  kn: ['ಇದೆ', 'ಇಲ್ಲ', 'ಅಂಗಡಿ', 'ಹಣ', 'ಮಾರಾಟ', 'ಖರ್ಚು', 'ಅರ್ಥ', 'ಮಾತನಾಡಿ', 'ಸಹಾಯ', 'ವ್ಯಾಪಾರ', 'ಏನು'],
  ml: ['ആണ്', 'ഇല്ല', 'കട', 'പണം', 'വില്പന', 'ചെലവ്', 'മനസ്സിലായി', 'സംസാരിക്കു', 'സഹായം', 'ബിസിനസ്സ്', 'എന്ത്'],
  te: ['ఉంది', 'లేదు', 'దుకాణం', 'డబ్బు', 'అమ్మకం', 'ఖర్చు', 'అర్థం', 'మాట్లాడు', 'సహాయం', 'వ్యాపారం', 'ఏమిటి'],
  ta: ['உள்ளது', 'இல்லை', 'கடை', 'பணம்', 'விற்பனை', 'செலவு', 'புரிகிறது', 'பேசு', 'உதவி', 'வணிகம்', 'என்ன'],
  or: ['ଅଛି', 'ନାହିଁ', 'ଦୋକାନ', 'ଟଙ୍କା', 'ବିକ୍ରି', 'ଖର୍ଚ', 'ବୁଝେ', 'କଥା', 'ସାହାଯ୍ୟ', 'ବ୍ୟବସାୟ', 'କେମିତି'],
  as: DISTINCT.as,
  bho: DISTINCT.bho,
  mai: DISTINCT.mai,
  gom: DISTINCT.gom,
  ks: DISTINCT.ks,
en: ['the', 'is', 'are', 'what', 'how', 'please', 'help', 'need', 'want', 'business', 'sale', 'expense', 'profit', 'customer', 'stock', 'order', 'money', 'price', 'hello', 'hi', 'thanks', 'thank']
};

const ALL = ['hi', 'hing', 'en', 'bn', 'mr', 'te', 'ta', 'gu', 'kn', 'ml', 'pa', 'or', 'as', 'ur', 'bho', 'mai', 'gom', 'ks'];

const LANG_NAMES = Object.fromEntries(ALL.map((c) => [c, { full: c, short: c }]));

const ALLOWED = new Set(ALL);

// Common-usage roman-word sets for code-switched Hindi→Roman (Hinglish).
function cleanTok(t) {
  return t.toLowerCase().replace(/[^a-z\u0900-\u09FF\u0A00-\u0A7F\u0A80-\u0AFF\u0B00-\u0BFF\u0C00-\u0DFF\u0600-\u06FF]/g, '');
}

/**
 * Detect the dominant language of a whole utterance.
 * @returns {{lang, confident, scores, segments}}
 */
function detectSegments(text) {
  if (!text) return { lang: 'en', confident: false, scores: {}, segments: [] };
  const tokens = text.toLowerCase().split(/\s+/);
  const scores = Object.fromEntries(ALL.map((l) => [l, 0]));
  let romanTokens = 0;
  let hasDevanagari = false;

  for (const raw of tokens) {
    const t = cleanTok(raw);
    if (!t) continue;
    if (/[a-z]/.test(t)) romanTokens++;
    // Script hits: every language sharing the script gets a base score, then
    // distinctive words tip the balance inside a shared script group.
    for (const s of SCRIPTS) {
      if (!s.re.test(t)) continue;
      s.ids.forEach((id) => { scores[id] += 3; });
      if (s.ids.length === 2) {
        // Bengali / Assamese share the Bengali script
        if (DISTINCT.as.some((w) => t.includes(w))) { scores.as += 3; scores.bn -= 1; }
        else if (DISTINCT.bn.some((w) => t.includes(w))) { scores.bn += 2; scores.as -= 1; }
      } else if (s.ids.length === 6) {
        // Devanagari family: hi, mr, bho, mai, gom, ks
        let matched = false;
        for (const d of ['mr', 'bho', 'mai', 'gom', 'ks']) {
          if (DISTINCT[d].some((w) => t.includes(w))) { scores[d] += 3; matched = true; }
        }
        if (!matched) scores.hi += 1; // generic Devanagari → Hindi bias
      }
    }
    // Lexical hits
    for (const lang of ALL) {
      if (LEXICON[lang] && LEXICON[lang].some((w) => t.includes(w))) scores[lang] += 1;
    }
  }

  // Hinglish inference: roman script with heavy Hindi loanwords
  if (romanTokens > 0) {
    const hingHits = tokens.filter((t) => HING.includes(cleanTok(t))).length;
    if (hingHits > 0) {
      scores.hing += hingHits * 1.5;
      if (scores.hing >= scores.hi && scores.hing > 0) scores.hing += 1;
    } else {
      // Pure Roman script with no Hindi loanwords → English
      scores.en += 1;
    }
  }

  const keyLang = (text) => {
    // Explicit markers override statistical guess (English + native names).
    const low = text.toLowerCase();
    if (/मराठी|marathi mein|marathi mai|marathi me/.test(low)) return 'mr';
    if (/অসমীয়া|assamese|asamiya/.test(low)) return 'as';
    if (/বাংলা|bengali|bangla/.test(low)) return 'bn';
    if (/मैथिली|maithili/.test(low)) return 'mai';
    if (/कोंकणी|konkani/.test(low)) return 'gom';
    if (/कश्मीरी|kashmiri/.test(low)) return 'ks';
    if (/भोजपुरी|bhojpuri/.test(low)) return 'bho';
    if (/हिन्दी|हिंदी|hindi mein|hindi mai|hindi me/.test(low)) return 'hi';
    if (/தமிழ்|tamil/.test(low)) return 'ta';
    if (/తెలుగు|telugu/.test(low)) return 'te';
    if (/ગુજરાતી|gujarati/.test(low)) return 'gu';
    if (/ಕನ್ನಡ|kannada/.test(low)) return 'kn';
    if (/മലയാളം|malayalam/.test(low)) return 'ml';
    if (/ਪੰਜਾਬੀ|punjabi|panjabi/.test(low)) return 'pa';
    if (/ଓଡ଼ିଆ|odia|oriya/.test(low)) return 'or';
    if (/اردو|urdu/.test(low)) return 'ur';
    if (/(hindi|hinglish|english)/.test(low)) {
      if (/english/.test(low)) return 'en';
      if (/hinglish/.test(low)) return 'hing';
      return 'hi';
    }
    return null;
  };

  const marker = keyLang(text);
  if (marker) scores[marker] += 10;

  const sorted = Object.entries(scores).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  const top = sorted.length ? sorted[0][0] : (romanTokens > 0 ? 'en' : 'en');
  const topScore = sorted.length ? sorted[0][1] : 0;

  // segments hint: per-token script/group classification
  const segments = tokens.map((t) => {
    const c = cleanTok(t);
    if (/[\u0980-\u09FF]/.test(c)) return { token: t, lang: scores.as >= scores.bn && scores.as > 0 ? 'as' : 'bn' };
    if (/[\u0A00-\u0A7F]/.test(c)) return { token: t, lang: 'pa' };
    if (/[\u0A80-\u0AFF]/.test(c)) return { token: t, lang: 'gu' };
    if (/[\u0B00-\u0B7F]/.test(c)) return { token: t, lang: 'or' };
    if (/[\u0B80-\u0BFF]/.test(c)) return { token: t, lang: 'ta' };
    if (/[\u0C00-\u0C7F]/.test(c)) return { token: t, lang: 'te' };
    if (/[\u0C80-\u0CFF]/.test(c)) return { token: t, lang: 'kn' };
    if (/[\u0D00-\u0D7F]/.test(c)) return { token: t, lang: 'ml' };
    if (/[\u0600-\u06FF]/.test(c)) return { token: t, lang: 'ur' };
    if (/[\u0900-\u097F]/.test(c)) {
      let best = 'hi';
      for (const d of ['mr', 'bho', 'mai', 'gom', 'ks']) {
        if (DISTINCT[d].some((w) => c.includes(w))) { best = d; break; }
      }
      return { token: t, lang: best };
    }
    if (/[a-z]/.test(c)) {
      return { token: t, lang: LEXICON.en.includes(c) && HING.includes(c) ? 'en' : (HING.includes(c) ? 'hing' : 'roman') };
    }
    return { token: t, lang: 'roman' };
  });

  return { lang: top, topScore, scores, segments };
}

// Conservative whole-utterance detector with prior-language memory.
const detectLang = (text, previousLang) => {
  if (!text || !text.trim()) return { lang: previousLang || 'en', confident: false };
  const res = detectSegments(text);
  const confident = res.topScore >= 2;
  return { lang: res.lang, confident, scores: res.scores, segments: res.segments };
};

/**
 * Decide which language the assistant should REPLY in.
 *
 * @param {object} opts
 *   - preferred:   user-chosen default reply language (preferredLang)
 *   - detected:    language detected in the user's latest message (or 'auto')
 *   - detectedConfident
 *   - lock:        lockResponseLang  (fixed response language)
 *   - allowSwitch: "Allow language switching" preference
 * @returns {{replyLang, mode}}
 */
function resolveReplyLang({ preferred, detected, detectedConfident, lock, allowSwitch }) {
  const pref = preferred && ALLOWED.has(preferred) ? preferred : 'en';
  if (lock && ALLOWED.has(preferred)) return { replyLang: pref, mode: 'locked' };
  if (allowSwitch !== false && detected && ALLOWED.has(detected) && detected !== 'auto') {
    if (detectedConfident) return { replyLang: detected, mode: 'follow' };
  }
  return { replyLang: pref, mode: 'preferred' };
}

module.exports = { detectLang, detectSegments, LANG_NAMES, ALL, resolveReplyLang, SCRIPTS };