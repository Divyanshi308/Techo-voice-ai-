'use strict';

/**
 * seed.js — Populates the store with realistic sample data on first run.
 * Re-runnable: it only inserts if the marker (settings.seeded) is absent.
 */

const store = require('./db');
const crypto = require('crypto');

const seedId = (prefix, seedString) => {
  const hash = crypto.createHash('sha1').update(seedString).digest('hex').slice(0, 10);
  return `${prefix}_${hash}`;
};

const languageRegistry = require('./services/languageRegistry');

// All 18 language modes come from the single canonical registry.
const LANGUAGES = languageRegistry.LANGUAGES.map(({ code, name, nativeName, flag, script, direction, sample, fallback }) => ({
  code, name, nativeName, flag, script, direction, sample, fallback,
  speech: languageRegistry.localeFor(code, 'webSpeech') || `${code}-IN`,
  enabled: true
}));

const AVATARS = [
  {
    id: 'av_didi', name: 'Didi Didi', lang: 'hi', gender: 'feminine', tone: 'warm',
    personality: 'Big-sister energy. Encouraging, practical, Hindi first.',
    color: '#ff5e7e', emoji: '🌺', tagline: 'Aap ka sabse bada cheerleader',
    systemPrompt: 'You are Didi, a warm, encouraging assistant who replies in warm Hindi with simple words.'
  },
  {
    id: 'av_bhaiya', name: 'Bhaiya', lang: 'hi', gender: 'masculine', tone: 'friendly',
    personality: 'The helpful neighbourhood elder brother. Humourous but to the point.',
    color: '#4f7cff', emoji: '🙏', tagline: 'Chinta mat karo, main hoon na',
    systemPrompt: 'You are Bhaiya, a friendly, no-nonsense assistant who replies in simple Hindi with a light touch of humour.'
  },
  {
    id: 'av_bhabhi', name: 'Bhabhi', lang: 'hi', gender: 'feminine', tone: 'caring',
    personality: 'Caring, organised and loves family businesses.',
    color: '#26d0a9', emoji: '🧿', tagline: 'Business aur ghar, dono sambhalo',
    systemPrompt: 'You are Bhabhi, a caring, organised assistant focusing on family businesses. Reply in Hindi/Hinglish.'
  },
  {
    id: 'av_dada', name: 'Dada', lang: 'bn', gender: 'masculine', tone: 'wise',
    personality: 'Calm Bengali uncle. Wise words, chai metaphors included.',
    color: '#8e5bff', emoji: '🎭', tagline: 'Dekhen to ki bhalo hoy',
    systemPrompt: 'You are Dada, a calm, wise assistant who replies in gentle Bengali.'
  },
  {
    id: 'av_kaka', name: 'Kaka', lang: 'mr', gender: 'masculine', tone: 'practical',
    personality: 'Straight-talking Marathi uncle. Gets to the point, loves the tiffin.',
    color: '#ff9f43', emoji: '🎩', tagline: 'Aab nibandha, fakt thamb',
    systemPrompt: 'You are Kaka, a practical, straight-talking assistant who replies in Marathi.'
  },
  {
    id: 'av_chacha', name: 'Chacha', lang: 'pa', gender: 'masculine', tone: 'energetic',
    personality: 'Punjabi uncle with a big laugh and quick answers.',
    color: '#00b8d4', emoji: '🚜', tagline: 'Business chhelle, tension nahi',
    systemPrompt: 'You are Chacha, an energetic Punjabi assistant who replies in Punjabi/Hinglish.'
  },
  {
    id: 'av_meanji', name: 'Meenakshi', lang: 'en', gender: 'feminine', tone: 'professional',
    personality: 'Bright, cheerful and professional US-English style.',
    color: '#fb7b54', emoji: '✨', tagline: 'Let\'s grow your business',
    systemPrompt: 'You are Meenakshi, a bright, professional assistant who replies in clear English.'
  }
];

const VOICES = [
  { id: 'v_roopa', name: 'Roopa', lang: 'hi', gender: 'feminine', accent: 'Hindi', personality: 'warm', pitch: 1.05, rate: 1, browserHint: 'hi-IN female voice if available' },
  { id: 'v_arjun', name: 'Arjun', lang: 'hi', gender: 'masculine', accent: 'Hindi', personality: 'steady', pitch: 0.9, rate: 1, browserHint: 'hi-IN male voice if available' },
  { id: 'v_neeta', name: 'Neeta', lang: 'hi', gender: 'feminine', accent: 'Hindi', personality: 'cheerful', pitch: 1.15, rate: 1.05, browserHint: 'hi-IN female voice if available' },
  { id: 'v_mithai', name: 'Mithai', lang: 'bn', gender: 'feminine', accent: 'Bengali', personality: 'sweet', pitch: 1.1, rate: 0.98, browserHint: 'bn-IN voice if available' },
  { id: 'v_abhiman', name: 'Abhiman', lang: 'mr', gender: 'masculine', accent: 'Marathi', personality: 'direct', pitch: 0.92, rate: 1, browserHint: 'mr-IN voice if available' },
  { id: 'v_sherni', name: 'Sherni', lang: 'pa', gender: 'feminine', accent: 'Punjabi', personality: 'bold', pitch: 1.0, rate: 1.05, browserHint: 'pa-IN voice if available' },
  { id: 'v_linda', name: 'Linda', lang: 'en', gender: 'feminine', accent: 'Indian-English', personality: 'warm', pitch: 1.0, rate: 1, browserHint: 'en-IN voice if available' },
  { id: 'v_vicky', name: 'Vicky', lang: 'en', gender: 'masculine', accent: 'Indian-English', personality: 'casual', pitch: 0.9, rate: 1.02, browserHint: 'en-IN voice if available' },
  { id: 'v_neutral', name: 'Naya', lang: 'hing', gender: 'neutral', accent: 'Hindi-English', personality: 'balanced', pitch: 1.0, rate: 1, browserHint: 'any available voice' }
];

const EXPERTS = [
  { id: 'exp_1', name: 'CA Priya Deshmukh', role: 'Chartered Accountant', services: ['GST', 'TDS', 'Tax filing', 'Books of accounts'], lang: ['en', 'hi', 'mr'], available: true, hourly: '₹1,200/hr', verified: true },
  { id: 'exp_2', name: 'Adv. Rohan Gupta', role: 'Business Lawyer', services: ['Contracts', 'Shop registration', 'Disputes', 'Licences'], lang: ['en', 'hi'], available: true, hourly: '₹1,500/hr', verified: true },
  { id: 'exp_3', name: 'Md. Farhan Ali', role: 'Marketing Consultant', services: ['WhatsApp promo', 'Social media', 'Local SEO'], lang: ['en', 'hi', 'bn'], available: true, hourly: '₹900/hr', verified: true },
  { id: 'exp_4', name: 'CA Sunita Verma', role: 'Financial Adviser', services: ['Loan readiness', 'Cash flow', 'Investments'], lang: ['en', 'hi', 'pa'], available: false, hourly: '₹1,000/hr', verified: true }
];

const CONTACTS = [
  { id: 'ctc_1', name: 'Ramesh Kumar', phone: '+91 98290 11111', note: 'Buys monthly grocery for family', language: 'hi' },
  { id: 'ctc_2', name: 'Sita Devi', phone: '+91 98290 22222', note: 'Regular dal & atta buyer', language: 'hi' },
  { id: 'ctc_3', name: 'Arun Sharma', phone: '+91 98290 33333', note: 'Owns nearby chai stall', language: 'hing' },
  { id: 'ctc_4', name: 'Mohammed Irfan', phone: '+91 98290 44444', note: 'Buys snacks in bulk on weekends', language: 'hi' },
  { id: 'ctc_5', name: 'Gurpreet Singh', phone: '+91 98290 55555', note: 'Party supplies customer', language: 'pa' },
  { id: 'ctc_6', name: 'Nandini Sen', phone: '+91 98290 66666', note: 'Ordered gift hampers for Diwali', language: 'bn' }
];

const THEMES = [
  // ── Living Digital Dukaan (default) ──
  { id: 'th_dukaan', name: 'Living Digital Dukaan', type: 'gradient', mode: 'light',
    value: 'radial-gradient(1200px 700px at 12% -10%, rgba(255,255,255,0.65), transparent 55%), linear-gradient(150deg,#fff7ed 0%,#ffedd5 45%,#ede9fe 100%)' },
  { id: 'th_market', name: 'Soft Marketplace', type: 'gradient', mode: 'light',
    value: 'radial-gradient(1200px 700px at 85% -10%, rgba(255,255,255,0.7), transparent 55%), linear-gradient(150deg,#fef3c7 0%,#fde68a 30%,#c7f9e8 100%)' },
  { id: 'th_lavender', name: 'Lavender', type: 'gradient', mode: 'light',
    value: 'linear-gradient(135deg,#a8edea 0%,#fed6e3 100%)' },
  { id: 'th_paper', name: 'Minimal', type: 'solid', mode: 'light', value: '#fffafa' },
  // ── Dark / low light ──
  { id: 'th_dark', name: 'Dukaan Night', type: 'gradient', mode: 'dark',
    value: 'radial-gradient(1100px 700px at 15% -10%, rgba(49,46,129,0.5), transparent 55%), linear-gradient(160deg,#1e1b4b 0%,#312e81 55%,#2b1a4a 100%)' },
  // ── Colorful presets (light, warm bazaar) ──
  { id: 'th_sunrise', name: 'Sunrise', type: 'gradient', mode: 'light',
    value: 'linear-gradient(135deg,#ff9a44 0%,#fc6076 55%,#ff5e7e 100%)' },
  { id: 'th_meadow', name: 'Meadow', type: 'gradient', mode: 'light',
    value: 'linear-gradient(135deg,#11998e 0%,#38ef7d 100%)' },
  { id: 'th_ocean', name: 'Ocean', type: 'gradient', mode: 'dark',
    value: 'linear-gradient(135deg,#2b5876 0%,#4e4376 100%)' },
  { id: 'th_saree', name: 'Saree Pink', type: 'gradient', mode: 'light',
    value: 'linear-gradient(135deg,#f857a6 0%,#ff5858 100%)' },
  { id: 'th_chai', name: 'Chai Caramel', type: 'gradient', mode: 'light',
    value: 'linear-gradient(135deg,#b06ab3 0%,#4568dc 100%)' }
];

const seed = () => {
  if (store.get('settings', 'global')) {
    console.log('[seed] already seeded, skipping.');
    return;
  }

  const now = new Date().toISOString();

  const users = [
    {
      id: 'usr_demo', email: 'demo@vyaparvaani.local', name: 'Vijay Sharma', role: 'owner',
      provider: 'demo', picture: '', phone: '+91 98290 00000',
      preferredLang: 'en', uiLang: 'en',
      avatarId: 'av_didi', voiceId: 'v_roopa',
      themeId: 'th_dukaan', themeCustom: null,
      langPrefs: { autoDetect: true, lockResponseLang: false, allowSwitch: true, showNative: true, showRoman: false },
      bio: 'Owner of Sharma Kirana & General Store since 2009',
      consents: {
        transcriptStore: true, voiceNote: true, calls: true, reminders: true,
        contactOthers: true, dataForReviews: true, aiAnalysis: true
      },
      business: {
        name: 'Sharma Kirana & General Store',
        location: 'M.I. Road, Jaipur, Rajasthan 302001',
        industry: 'Retail — Kirana / grocery',
        established: 2009,
        products: ['Atta, dal & grains', 'Snacks & biscuits', 'Beverages & cold drinks', 'Household essentials', 'Gift hampers (festive)'],
        customers: ['~150 regular walk-in families', '25 monthly order customers', '5 small chai stalls & vendors'],
        challenges: ['Big supermarkets nearby', 'Online sellers undercutting price', 'Cash-flow gaps before festivals', 'No time for social media marketing'],
        monthlySales: 480000,
        monthlyExpenses: 355000,
        avgMargin: '22%',
        bestSellers: ['Ashirwad Aata', 'Patanjali products', 'Lays & chips'],
        suppliers: ['Metro Cash & Carry', 'Bikanerwala Distributors', 'Local mandi'],
        notes: []
      },
      createdAt: now
    },
    {
      id: 'usr_admin', email: 'admin@vyaparvaani.local', name: 'Admin - Techo', role: 'admin',
      provider: 'demo', picture: '', phone: '',
      preferredLang: 'en', uiLang: 'en', avatarId: 'av_meanji', voiceId: 'v_linda',
      themeId: 'th_dukaan', themeCustom: null, bio: 'Platform administrator',
      consents: { transcriptStore: true, voiceNote: true, calls: true, reminders: true, contactOthers: true, dataForReviews: true, aiAnalysis: true },
      business: { name: 'Techo Platform', notes: [] },
      createdAt: now
    }
  ];

  const conversations = [
    {
      id: seedId('cv', 'demo-1'), userId: 'usr_demo', title: 'Diwali stock planning',
      createdAt: '2026-01-15T10:20:00.000Z',
      messages: [
        { role: 'user', text: 'Diwali aane wala hai, gift hampers ka stock badhau kya?', lang: 'hi', detected: 'hi', at: '2026-01-15T10:20:00.000Z' },
        { role: 'assistant', text: 'Hanji! Diwali mein gift hampers 2–3 guna zyada bikte hain. Pichle saal aapne ~40 hampers beche. Is baar 60-70 hampers ka stock rakhein, aur chhota pack ₹299 wala bhi rakhein — woh sabse zyada chalta hai.', lang: 'hi', at: '2026-01-15T10:20:05.000Z' }
      ]
    },
    {
      id: seedId('cv', 'demo-2'), userId: 'usr_demo', title: 'Margin & pricing help',
      createdAt: '2026-02-02T16:45:00.000Z',
      messages: [
        { role: 'user', text: 'GST kya hai aur mujhe registration karna chahiye?', lang: 'hing', detected: 'hing', at: '2026-02-02T16:45:00.000Z' },
        { role: 'assistant', text: 'GST matlab Goods and Services Tax — yeh woh tax hai jo aap khareed par dete ho aur apne customers se lete ho. Agar aapki saal ki bikri ₹40 lakh se upar hai, toh registration zaroori hai. Aapki ~₹57 lakh hai, toh CA se registration karwa lena. Main CA se baat karwa dein, bolo toh?', lang: 'hing', at: '2026-02-02T16:45:06.000Z' }
      ]
    }
  ];

  const transactions = [
    { id: seedId('tx', 's1'), userId: 'usr_demo', type: 'sale', amount: 2400, note: 'Gift hamper (Diwali pre-order)', topic: 'festive', at: '2026-03-02T11:00:00.000Z', via: 'voice', source: 'sample' },
    { id: seedId('tx', 's2'), userId: 'usr_demo', type: 'sale', amount: 1180, note: 'Party snacks for Irfan bhai', topic: 'party-supply', at: '2026-03-05T18:30:00.000Z', via: 'voice', source: 'sample' },
    { id: seedId('tx', 's3'), userId: 'usr_demo', type: 'sale', amount: 4650, note: 'Weekly store billing (mix)', topic: 'retail', at: '2026-03-09T20:15:00.000Z', via: 'voice', source: 'sample' },
    { id: seedId('tx', 'e1'), userId: 'usr_demo', type: 'expense', amount: 12500, note: 'Stock from Metro — atta & dal', topic: 'inventory', at: '2026-03-03T09:00:00.000Z', via: 'voice', source: 'sample' },
    { id: seedId('tx', 'e2'), userId: 'usr_demo', type: 'expense', amount: 3200, note: 'Electricity bill', topic: 'utilities', at: '2026-03-06T15:00:00.000Z', via: 'voice', source: 'sample' },
    { id: seedId('tx', 'e3'), userId: 'usr_demo', type: 'expense', amount: 4500, note: 'Udaan.com re-stock — biscuits & chips', topic: 'inventory', at: '2026-03-11T12:45:00.000Z', via: 'voice', source: 'sample' }
  ];

  const reminders = [
    { id: seedId('rm', 'r1'), userId: 'usr_demo', title: 'GST deposit (March)', notes: 'File and pay GST return for February.', due: '2026-03-20T18:00:00.000Z', priority: 'high', status: 'pending', kind: 'payment', method: 'voice-call', consent: true, createdAt: now },
    { id: seedId('rm', 'r2'), userId: 'usr_demo', title: 'Order Udaan stock', notes: 'Order snacks before Sunday rush.', due: '2026-03-14T10:00:00.000Z', priority: 'medium', status: 'pending', kind: 'todo', method: 'voice-call', consent: true, createdAt: now },
    { id: seedId('rm', 'r3'), userId: 'usr_demo', title: 'Follow up Nandini Sen (hamper)', notes: 'Confirm festive hamper delivery details.', due: '2026-03-16T12:00:00.000Z', priority: 'medium', status: 'pending', kind: 'follow-up', method: 'call', consent: true, createdAt: now },
    { id: seedId('rm', 'r4'), userId: 'usr_demo', title: 'Shop rent', notes: 'Pay monthly rent to landlord.', due: '2026-04-01T10:00:00.000Z', priority: 'low', status: 'pending', kind: 'payment', method: 'voice-call', consent: true, createdAt: now }
  ];

  const surveys = [
    {
      id: seedId('sv', 'sv1'), userId: 'usr_demo', title: 'Customer Preference Survey',
      description: 'Kis cheez ki demand badh rahi hai — hear it straight from customers.',
      language: 'hi', status: 'active', consent: true,
      questions: [
        { id: 'q1', type: 'choice', text: 'Aap humari dukaan se sabse zyada kya kharidte ho?', options: ['Atta & dal', 'Snacks', 'Cold drinks', 'Gift hampers'] },
        { id: 'q2', type: 'voice', text: 'Koi chhoti si complaint ya suggest batao' },
        { id: 'q3', type: 'rating', text: 'Dukaan ki service kitni acchi hai (1-5)?' }
      ],
      contacts: ['ctc_1', 'ctc_2', 'ctc_4', 'ctc_6'],
      createdAt: '2026-02-20T08:00:00.000Z'
    },
    {
      id: seedId('sv', 'sv2'), userId: 'usr_demo', title: 'Diwali Hamper Feedback'
      , description: 'Diwali 2025 hampers ki feedback.', language: 'hing', status: 'completed', consent: true,
      questions: [
        { id: 'q1', type: 'rating', text: 'Rates the Diwali hamper' },
        { id: 'q2', type: 'choice', text: 'Again next year?', options: ['Yes', 'Maybe', 'No'] }
      ],
      contacts: ['ctc_5', 'ctc_6'],
      createdAt: '2025-11-05T09:00:00.000Z'
    }
  ];

  const surveyResponses = [
    { id: seedId('sr', 'sr1'), surveyId: seedId('sv', 'sv1'), contactId: 'ctc_1', answers: [
      { questionId: 'q1', value: 'Atta & dal', type: 'choice' },
      { questionId: 'q2', value: 'Sunday ko door chahiye hota hai, stock rakhna', type: 'voice' },
      { questionId: 'q3', value: 4, type: 'rating' }
    ], source: 'voice-call', at: '2026-03-01T11:20:00.000Z', status: 'completed' },
    { id: seedId('sr', 'sr2'), surveyId: seedId('sv', 'sv1'), contactId: 'ctc_4', answers: [
      { questionId: 'q1', value: 'Snacks', type: 'choice' },
      { questionId: 'q2', value: 'Prices thode kam hote toh aur lete. Lays stock hamesha rehna chahiye.', type: 'voice' },
      { questionId: 'q3', value: 4, type: 'rating' }
    ], source: 'voice-call', at: '2026-03-02T16:40:00.000Z', status: 'completed' },
    { id: seedId('sr', 'sr3'), surveyId: seedId('sv', 'sv1'), contactId: 'ctc_6', answers: [
      { questionId: 'q1', value: 'Gift hampers', type: 'choice' },
      { questionId: 'q2', value: 'Hampers mein thoda premium chocolate daalo', type: 'voice' },
      { questionId: 'q3', value: 5, type: 'rating' }
    ], source: 'voice-call', at: '2026-03-03T18:10:00.000Z', status: 'completed' },
    { id: seedId('sr', 'sr4'), surveyId: seedId('sv', 'sv2'), contactId: 'ctc_5', answers: [
      { questionId: 'q1', value: 4, type: 'rating' },
      { questionId: 'q2', value: 'Maybe', type: 'choice' }
    ], source: 'voice-call', at: '2025-11-10T12:00:00.000Z', status: 'completed' }
  ];

  const calls = [
    { id: seedId('cl', 'c1'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_1', kind: 'survey', status: 'completed', channel: 'mock-voice', durationSec: 96, consent: true, scheduled: '2026-03-01T10:50:00.000Z', at: '2026-03-01T11:00:00.000Z', transcript: 'Ramesh: Sunday ko door chahiye hota hai, stock rakhna\ndidi: Recorded!' },
    { id: seedId('cl', 'c2'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_2', kind: 'survey', status: 'no-answer', channel: 'mock-voice', consent: true, scheduled: '2026-03-01T11:30:00.000Z', at: null, transcript: '' },
    { id: seedId('cl', 'c3'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_4', kind: 'survey', status: 'completed', channel: 'mock-voice', durationSec: 122, consent: true, scheduled: '2026-03-02T16:30:00.000Z', at: '2026-03-02T16:40:00.000Z', transcript: 'Irfan: Prices thode kam hote toh aur lete. Lays stock hamesha rehna chahiye.' },
    { id: seedId('cl', 'c4'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_6', kind: 'survey', status: 'completed', channel: 'mock-voice', durationSec: 84, consent: true, scheduled: '2026-03-03T18:00:00.000Z', at: '2026-03-03T18:10:00.000Z', transcript: 'Nandini: Hampers mein thoda premium chocolate daalo' }
  ];

  const reviews = [
    { id: seedId('rv', 'rv1'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_1', rating: 4, text: 'Bahut badhiya service, bhagwan kare aur baanthe. Sunday ko door stock karna.', source: 'voice', at: '2026-03-01T11:25:00.000Z', status: 'published', sentiment: 'positive' },
    { id: seedId('rv', 'rv2'), userId: 'usr_demo', surveyId: seedId('sv', 'sv1'), contactId: 'ctc_4', rating: 4, text: 'Achhi dukaan hai, par Lays ka stock kabhi kabhi khatam rehta hai.', source: 'voice', at: '2026-03-02T16:45:00.000Z', status: 'published', sentiment: 'positive' },
    { id: seedId('rv', 'rv3'), userId: 'usr_demo', surveyId: seedId('sv', 'sv2'), contactId: 'ctc_5', rating: 4, text: 'Hamper theek tha, thoda aur premium hota toh best.', source: 'voice', at: '2025-11-10T12:10:00.000Z', status: 'published', sentiment: 'positive' }
  ];

  const cases = [
    {
      id: seedId('cs', 'cs1'), userId: 'usr_demo', status: 'assigned', priority: 'medium',
      category: 'compliance', language: 'hi', transcript: 'Kya mujhe abhi GST me shop register karna pad raha hai? Pichhli baar CA bola toh maine confuse ho gaya.',
      summary: {
        userMessage: 'GST registration necessary?', topic: 'GST registration', facts: ['Annual turnover ~₹57L', 'Business: kirana store, Jaipur'],
        recommendation: 'Consult CA clean books for GST registration before next return deadline.'
      },
      expertId: 'exp_1', assigned: '2026-03-04T09:00:00.000Z', createdAt: '2026-03-04T08:55:00.000Z', consent: true, consultTitle: 'GST registration query'
    },
    {
      id: seedId('cs', 'cs2'), userId: 'usr_demo', status: 'open', priority: 'high',
      category: 'legal', language: 'hing', transcript: 'Landlord naya contract bana raha hai, maine sign karna hai par samajh nahi aya.',
      summary: {
        userMessage: 'New shop lease contract', topic: 'Lease contract review', facts: ['Rent ₹18k/month', 'Monthly renewable'],
        recommendation: 'Get contract reviewed by a lawyer before signing.'
      },
      expertId: 'exp_2', assigned: null, createdAt: '2026-03-06T14:20:00.000Z', consent: true, consultTitle: 'Shop lease contract review'
    }
  ];

  const prompts = [
    { id: seedId('pr', 'p1'), label: 'Sale record', icon: '💰', text: 'Boss, aaj ki sale batao' },
    { id: seedId('pr', 'p2'), label: 'Expense record', icon: '🧾', text: 'Aaj ka expense likh do' },
    { id: seedId('pr', 'p3'), label: 'WhatsApp promo', icon: '💬', text: 'Mere WhatsApp customers ke liye promo message likho' },
    { id: seedId('pr', 'p4'), label: 'Concept samjhao', icon: '🎓', text: 'GST kya hai, chhota hai simple samjhao' },
    { id: seedId('pr', 'p5'), label: 'Reminder set', icon: '⏰', text: 'Kal sham ko reminder lagao' },
    { id: seedId('pr', 'p6'), label: 'Human expert', icon: '🙋', text: 'Mujhe kisi expert se baat karni hai' }
  ];

  users.forEach((u) => store.insert('users', u));
  conversations.forEach((c) => store.insert('conversations', c));
  transactions.forEach((t) => store.insert('transactions', t));
  reminders.forEach((r) => store.insert('reminders', r));
  surveys.forEach((s) => store.insert('surveys', s));
  surveyResponses.forEach((r) => store.insert('surveyResponses', r));
  calls.forEach((c) => store.insert('calls', c));
  reviews.forEach((r) => store.insert('reviews', r));
  cases.forEach((c) => store.insert('cases', c));
  EXPERTS.forEach((e) => store.insert('experts', e));
  AVATARS.forEach((a) => store.insert('avatars', a));
  VOICES.forEach((v) => store.insert('voices', v));
  CONTACTS.forEach((c) => store.insert('contacts', c));
  THEMES.forEach((t) => store.insert('themes', t));
  store.insert('languages', { code: null }); // placeholder removed below
  store.removeWhere('languages', () => true);
  LANGUAGES.forEach((l) => store.insert('languages', l));
  store.insert('prompts', { label: 'x', icon: 'x', text: 'x' });
  store.removeWhere('prompts', () => true);
  prompts.forEach((p) => store.insert('prompts', p));

  store.insert('settings', {
    id: 'global',
    seeded: true,
    appName: 'Techo',
    disclaimer: 'Techo is a helpful AI assistant. It is NOT a replacement for a qualified lawyer, chartered accountant, financial adviser, or other professional. For official matters please consult a registered professional.',
    privacy: {
      recordingConsentRequired: true,
      dataRetentionDays: 365,
      callsUseMockTelephony: true
    },
    mockMode: true,
    mockNotes: {
      speech: 'Real speech-to-text uses your browser Web Speech API when available. Otherwise a clearly-marked text fallback is shown.',
      ai: 'AI engine is a local rule-based mock engine (no external AI API). The service interface (server/services/aiProvider.js) is API-ready to swap in a real LLM.',
      voice: 'Voices use your device/browser TTS voices. All avatars are generated/safe illustrations — no real person is cloned.'
    }
  });

  console.log('[seed] sample data seeded.');
};

/**
 * refreshDemoData() — runs on every boot (idempotent).
 *
 * Keeps the demo owner's dashboard alive for the live demo: when the last 7
 * days hold no transactions, it seeds a handful of clearly-labelled sample
 * records (source:'sample', "(demo)") so the Payments / Sales pages never show
 * empty zeros. Also re-arms one pending voice reminder so the "Simulated call"
 * flow has something to demo. Only touches usr_demo — never real users.
 */
function refreshDemoData() {
  const user = store.get('users', 'usr_demo');
  if (!user) return;
  // Product default: English UI + English-first replies for the demo account
  // (multilingual voice input stays on). Existing installs seeded hing/hi.
  if (user.preferredLang !== 'en' || user.uiLang !== 'en') {
    store.update('users', 'usr_demo', { preferredLang: 'en', uiLang: 'en' });
    console.log('[seed] demo owner language preferences reset to English defaults.');
  }
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  const iso = (ms) => new Date(ms).toISOString();
  const recent = store.find('transactions', (t) => t.userId === 'usr_demo' && new Date(t.at || 0).getTime() >= now - 7 * DAY);
  if (recent.length === 0) {
    const samples = [
      { type: 'sale', amount: 2150, note: 'Daily store billing (demo)', at: now - 1 * DAY },
      { type: 'sale', amount: 990, note: 'Snacks order — tea stall (demo)', at: now - 2 * DAY },
      { type: 'expense', amount: 6400, note: 'Metro restock — dal & atta (demo)', at: now - 3 * DAY },
      { type: 'sale', amount: 3120, note: 'Festive hamper pre-order (demo)', at: now - 4 * DAY },
      { type: 'expense', amount: 1700, note: 'Udaan.com re-stock (demo)', at: now - 5 * DAY }
    ];
    samples.forEach((s, i) => {
      store.insert('transactions', {
        id: seedId('tx', 'recent-' + i + '-' + user.id), userId: 'usr_demo',
        type: s.type, amount: s.amount, note: s.note, topic: s.type === 'sale' ? 'retail' : 'inventory',
        at: iso(s.at), via: 'voice', source: 'sample'
      });
    });
    console.log('[seed] demo ledger refreshed with recent sample records.');
  }
  const dueSoon = store.find('reminders', (r) => r.userId === 'usr_demo' && r.status === 'pending').length;
  if (dueSoon < 2) {
    store.insert('reminders', {
      id: seedId('rm', 'demo-reminder'), userId: 'usr_demo',
      title: 'Metro restock call (demo)', notes: 'Re-order dal & atta before weekend rush.',
      due: iso(now + 1 * DAY), humanDue: 'tomorrow 10:00', priority: 'medium', kind: 'todo',
      method: 'voice-call', consent: true, status: 'pending', createdAt: iso(now)
    });
    console.log('[seed] demo reminder re-armed.');
  }
}

module.exports = { seed, refreshDemoData, LANGUAGES, AVATARS, VOICES, EXPERTS, THEMES };