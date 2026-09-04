'use strict';

/**
 * aiEngine.js — Techo's local AI engine (clearly-marked MOCK).
 *
 * This is the default provider behind aiProvider.js. It is fully
 * deterministic, offline and privacy-friendly: no external API is called.
 * The service interface mirrors what a real LLM provider would return so the
 * app can be pointed at a production LLM without changing routes/views.
 */

const language = require('./language');
const marketData = require('./marketData');
const store = require('../db');
const telephony = require('./telephony');
const calendarSvc = require('./integrations/calendar');
const emailSvc = require('./integrations/email');
const stripeSvc = require('./integrations/stripe');

/* ------------------------------------------------------------------ *
 * Per-language copy for engine phrasing
 * ------------------------------------------------------------------ */

const T = {
  hi: {
    greet: ['Namaste! Main Techo hoon. {name}ji, aaj kaama kaise chala? Sale record karna hai, expense likhna hai, ya kuch aur?'],
    help: 'Main aapki madad kar sakta hoon: sale/expense record, GST jaisi cheezan samjhana, WhatsApp promo message, reminders, aur expert se baat karvana. Bas bolie!',
    fallback: 'Maine poora samjha nahi. Thoda simple bolein. Jaise "aaj 2000 ki sale hui" ya "GST kya hai samjhao".',
    dontKnow: 'Yeh mujhe confidently nahi pata, galat batana main nahi chahta. {expert} se confirm karwa dein — wo pakka jawab dega.',
    moneyMissing: 'Kiti paise ki {kind} thi? Banao ki "aaj 2400 ki sale hui" bolkar.',
    saleOk: 'Ho gaya! {amount} rupaye ki sale likh di. Note: {note}. Agar galat hai toh bolo, main hatwa dunga.',
    expenseOk: 'Ho gaya! {amount} rupaye ka kharcha likh diya. Note: {note}.',
    yesWait: 'Confirm karein — kya yeh sahi hai? "{pending}"',
    profileLearned: 'Achhi baat, maine yeh profile me note kar liya: {fields}. Profile section me edit kar sakte hain.',
    disclaimer: 'Yaad rakhein — main AI hoon, lawyer/CA/financial adviser nahi. Sarkari paisi cheezon ke liye expert se baat karein.'
  },
  hing: {
    greet: ['Namaste boss! {name}ji main hu aapka byapar saathi. Aaj sale record karni hai, expense likhna hai, ya promotion ka kaam?'],
    help: 'Main help kar sakta hu: sale/expense record, GST waale concepts, WhatsApp promo, reminders, aur expert se baat. Bas bolo!',
    fallback: 'Thoda clear banao bhai. Jaise "aaj 2000 ki sale hui" ya "GST kya hai samjhao".',
    dontKnow: 'Bhai iske baare me main confident nahi hu, galat info Dena theek nahi. Expert se confirm kara dete hain na?',
    moneyMissing: 'Kitne ka {kind} tha? Jaise bolo "aaj 2400 ki sale hui".',
    saleOk: 'Done! {amount} ₹ ki sale likh di. Note: {note}. Galat ho toh bolna, remove kar dunga.',
    expenseOk: 'Done! {amount} ₹ ka expense likh diya. Note: {note}.',
    yesWait: 'Confirm karein: "{pending}" sahi hai na?',
    profileLearned: 'Nice, maine profile me yeh daal diya: {fields}. Edit karna ho toh Profile page kholein.',
    disclaimer: 'Dhyan rahe: main AI hoon, lawyer/CA/financial adviser nahi. Legal/financial cheezein expert se check karwao.'
  },
  en: {
    greet: ['Hi {name}! I\'m Techo, your business buddy. Need to record a sale, log an expense, or plan some promotion?'],
    help: 'I can help you record sales & expenses, explain terms like GST, draft WhatsApp promos, set reminders, and connect you with a human expert.',
    fallback: 'I didn\'t catch that. Try something like "I made a sale of 2000" or "What is GST?"',
    dontKnow: 'I\'m not confident about this and I won\'t guess. Let\'s loop in an expert for a verified answer.',
    moneyMissing: 'How much was the {kind}? Say, "I made a sale of 2400".',
    saleOk: 'Done! Recorded a sale of ₹{amount}. Note: {note}. If that\'s wrong, just tell me and I\'ll remove it.',
    expenseOk: 'Done! Recorded an expense of ₹{amount}. Note: {note}.',
    yesWait: 'Please confirm — did I get this right? "{pending}"',
    profileLearned: 'Nice, I\'ve noted that in your profile: {fields}. You can edit it anytime in the Profile page.',
    disclaimer: 'Remember: I\'m AI, not your lawyer, CA or financial adviser. For official matters, talk to a qualified expert.'
  },
  mr: {
    greet: ['Namaskar {name}ji! Main Techo. Aaj vikri nोंदायची आहे का kharcha?'],
    fallback: 'अजून स्पष्ट समजलं नाही. सांगा "आज 2000 ची विक्री झाली" असं.',
    moneyMissing: '{kind} कितीचा होता?',
    saleOk: 'झालं! {amount} ची विक्री नोंदवली. Note: {note}.',
    expenseOk: 'झालं! {amount} चा खर्च नोंदवला. Note: {note}.',
    disclaimer: 'लक्षात ठेवा — मी AI आहे, वकील/CA/आर्थिक सल्लागार नाही.'
  },
  bn: {
    greet: ['নমস্কার {name}জি! আমি Techo. আজ বিক্রি লিখব, খরচ লিখব, নাকি অন্য কিছু?'],
    fallback: 'বুঝলাম না. এমন বলুন "আজ 2000 টাকার বিক্রি হয়েছে"।',
    moneyMissing: 'কত টাকার {kind} ছিল?',
    saleOk: 'হয়ে গেছে! {amount} টাকার বিক্রি লিখে দিয়েছি। Note: {note}।',
    expenseOk: 'হয়ে গেছে! {amount} টাকার খরচ লিখে দিয়েছি। Note: {note}।',
    disclaimer: 'মনে রাখুন — আমি AI, আইনজীবী/CA/আর্থিক উপদেষ্টা নই।'
  },
  pa: {
    greet: ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ {name}ਜੀ! ਮੈਂ Techo ਹਾਂ। ਅੱਜ ਵਿਕਰੀ ਲਿਖਣੀ ਹੈ, ਖਰਚਾ ਲਿਖਣਾ ਹੈ ਜਾਂ ਹੋਰ ਕੰਮ?'],
    fallback: 'ਸਮਝ ਨਹੀਂ ਆਇਆ। ਇੰਝ ਬੋਲੋ "ਅੱਜ 2000 ਦੀ ਵਿਕਰੀ ਹੋਈ"।',
    moneyMissing: 'ਕਿੰਨੇ ਦਾ {kind} ਸੀ?',
    saleOk: 'ਹੋ ਗਿਆ! {amount} ਦੀ ਵਿਕਰੀ ਲਿਖ ਦਿੱਤੀ। Note: {note}।',
    expenseOk: 'ਹੋ ਗਿਆ! {amount} ਦਾ ਖਰਚਾ ਲਿਖ ਦਿੱਤਾ। Note: {note}।',
    disclaimer: 'ਯਾਦ ਰੱਖੋ — ਮੈਂ AI ਹਾਂ, ਵਕੀਲ/CA/ਵਿੱਤੀ ਸਲਾਹਕਾਰ ਨਹੀਂ।'
  },
  te: {
    greet: ['నమస్తే {name} గారు! మీ వ్యాపారంలో ఈరోజు ఏమి సహాయం కావాలి? అమ్మకం రాయాలా, ఖర్చు రాయాలా?'],
    help: 'మీ విక్రయాలు, ఖర్చులు రికార్డ్ చేయడం, GST వంటి విషయాలు వివరించడం, WhatsApp ప్రమోషన్ మెసేజ్, రిమైండర్లు మరియు నిపుణులతో మాట్లాడించడం వరకు సహాయం చేయగలను.',
    fallback: 'నేను అర్థం చేసుకోలేకపోయాను. సరళంగా చెప్పండి. ఉదాహరణకు "ఈరోజు 2000 అమ్మకం జరిగింది" లేదా "GST అంటే ఏమిటో వివరించండి".',
    dontKnow: 'నేను ఖచ్చితంగా తెలియకుండా చెప్పడం ఇష్టం లేదు. {expert} తో నిర్ధారించుకోండి — ఆయన/ఆమె పక్కా సమాధానం ఇస్తారు.',
    moneyMissing: '{kind} ఎంత జరిగింది? "ఈరోజు 2400 అమ్మకం జరిగింది" అని చెప్పండి.',
    saleOk: 'అయిపోయింది! ₹{amount} అమ్మకం నమోదు చేశాను. గమనిక: {note}. తప్పు అయితే చెప్పండి, తీసేస్తాను.',
    expenseOk: 'అయిపోయింది! ₹{amount} ఖర్చు నమోదు చేశాను. గమనిక: {note}.',
    yesWait: 'దయచేసి నిర్ధారించండి — సరిగ్గా అర్థం చేసుకున్నానా? "{pending}"',
    disclaimer: 'గుర్తుంచుకోండి — నేను AI ని, న్యాయవాది/CA/ఆర్థిక సలహాదారుని కాదు. అధికారిక విషయాలకు నిపుణులతో మాట్లాడండి.'
  },
  ta: {
    greet: ['வணக்கம் {name}! நான் Techo. இன்று விற்பனை பதிவு செய்யலாமா, செலவு எழுதலாமா, வேறு ஏதாவது?'],
    help: 'விற்பனை/செலவு பதிவு, GST போன்றவற்றை விளக்குதல், WhatsApp ப்ரோமோ, நினைவூட்டல்கள், நிபுணர்களுடன் இணைத்தல் என உங்களுக்கு உதவ முடியும்.',
    fallback: 'எனக்கு புரியவில்லை. "இன்று 2000 விற்பனை ஆனது" அல்லது "GST என்றால் என்ன" போல் சொல்லுங்கள்.',
    moneyMissing: '{kind} எவ்வளவு? "இன்று 2400 விற்பனை ஆனது" என்று சொல்லுங்கள்.',
    saleOk: 'முடிந்தது! ₹{amount} விற்பனை பதிவு செய்தேன். குறிப்பு: {note}. தவறென்றால் சொல்லுங்கள், நீக்குகிறேன்.',
    expenseOk: 'முடிந்தது! ₹{amount} செலவு பதிவு செய்தேன். குறிப்பு: {note}.',
    yesWait: 'சரியா? "{pending}" — உறுதிப்படுத்தவும்.',
    disclaimer: 'நினைவில் கொள்ளுங்கள் — நான் AI, வழக்கறிஞர்/CA/நிதி ஆலோசகர் அல்ல.'
  },
  gu: {
    greet: ['નમસ્તે {name}! હું Techo છું. આજે વેચાણ લખવું છે, ખર્ચ લખવો છે કે બીજું કંઈ?'],
    fallback: 'મને સમજાયું નહીં. "આજે 2000નું વેચાણ થયું" કે "GST શું છે?" એમ બોલો.',
    moneyMissing: '{kind} કેટલું હતું? "આજે 2400નું વેચાણ થયું" કહો.',
    saleOk: 'થઈ ગયું! ₹{amount}નું વેચાણ નોંધ્યું. નોંધ: {note}. ખોટું હોય તો કહો, દૂર કરીશ.',
    expenseOk: 'થઈ ગયું! ₹{amount}નો ખર્ચ નોંધ્યો. નોંધ: {note}.',
    yesWait: 'ખાતરી કરો — આ સાચું છે? "{pending}"',
    disclaimer: 'યાદ રાખો — હું AI છું, વકીલ/CA/નાણાકીય સલાહકાર નહીં.'
  },
  kn: {
    greet: ['ನಮಸ್ಕಾರ {name}! ನಾನು Techo. ಇಂದು ಮಾರಾಟ ಬರೆಯೋಣ, ಖರ್ಚು ಬರೆಯೋಣ ಅಥವಾ ಬೇರೆ ಏನಾದರೂ?'],
    fallback: 'ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. "ಇಂದು 2000 ಮಾರಾಟ ಆಯ್ತು" ಅಥವಾ "GST ಅಂದ್ರೆ ಏನು" ಎಂದು ಹೇಳಿ.',
    moneyMissing: '{kind} ಎಷ್ಟು? "ಇಂದು 2400 ಮಾರಾಟ ಆಯ್ತು" ಎಂದು ಹೇಳಿ.',
    saleOk: 'ಆಯ್ತು! ₹{amount} ಮಾರಾಟ ದಾಖಲಿಸಿದೆ. ಟಿಪ್ಪಣಿ: {note}. ತಪ್ಪಾದರೆ ಹೇಳಿ, ಅಳಿಸುತ್ತೇನೆ.',
    expenseOk: 'ಆಯ್ತು! ₹{amount} ಖರ್ಚು ದಾಖಲಿಸಿದೆ. ಟಿಪ್ಪಣಿ: {note}.',
    yesWait: 'ದಯವಿಟ್ಟು ದೃಢೀಕರಿಸಿ — ಸರಿಯಾಗಿದೆಯೇ? "{pending}"',
    disclaimer: 'ನೆನಪಿಡಿ — ನಾನು AI, ವಕೀಲ/CA/ಹಣಕಾಸು ಸಲಹೆಗಾರ ಅಲ್ಲ.'
  },
  ml: {
    greet: ['നമസ്കാരം {name}! ഞാൻ Techo ആണ്. ഇന്ന് വിൽപന രേഖപ്പെടുത്താനോ, ചെലവ് എഴുതാനോ, മറ്റെന്തെങ്കിലുമോ?'],
    fallback: 'എനിക്ക് മനസ്സിലായില്ല. "ഇന്ന് 2000 രൂപയുടെ വിൽപനയുണ്ടായി" അല്ലെങ്കിൽ "GST എന്താണ്" എന്ന് പറയൂ.',
    moneyMissing: 'എത്രയുടെ {kind} ആയിരുന്നു? "ഇന്ന് 2400 വിൽപനയായി" എന്ന് പറയൂ.',
    saleOk: 'ആയി! ₹{amount} വിൽപന രേഖപ്പെടുത്തി. കുറിപ്പ്: {note}. തെറ്റാണെങ്കിൽ പറയൂ, മായ്ക്കാം.',
    expenseOk: 'ആയി! ₹{amount} ചെലവ് രേഖപ്പെടുത്തി. കുറിപ്പ്: {note}.',
    yesWait: 'ദയവായി സ്ഥിരീകരിക്കുക — ഇത് ശരിയാണോ? "{pending}"',
    disclaimer: 'ഓർക്കുക — ഞാൻ AI ആണ്, അഭിഭാഷകൻ/CA/സാമ്പത്തിക ഉപദേഷ്ടാവ് അല്ല.'
  },
  or: {
    greet: ['ନମସ୍କାର {name}! ମୁଁ Techo। ଆଜି ବିକ୍ରି ଲେଖିବା, ଖର୍ଚ୍ଚ ଲେଖିବା କିମ୍ବା ଆଉ କିଛି?'],
    fallback: 'ମୁଁ ବୁଝିପାରିଲି ନାହିଁ। "ଆଜି 2000 ଟଙ୍କାର ବିକ୍ରି ହେଲା" କିମ୍ବା "GST କଣ?" କୁହନ୍ତୁ।',
    moneyMissing: '{kind} କେତେ ଥିଲା? "ଆଜି 2400 ଟଙ୍କାର ବିକ୍ରି ହେଲା" କୁହନ୍ତୁ।',
    saleOk: 'ହୋଇଗଲା! ₹{amount} ବିକ୍ରି ଲେଖିଲି। ନୋଟ: {note}। ଭୁଲ ହେଲେ କୁହ, ହଟାଇଦେବି।',
    expenseOk: 'ହୋଇଗଲା! ₹{amount} ଖର୍ଚ୍ଚ ଲେଖିଲି। ନୋଟ: {note}।',
    yesWait: 'ଦୟାକରି ନିଶ୍ଚିତ କରନ୍ତୁ — ଏହା ସଠିକ୍? "{pending}"',
    disclaimer: 'ମନେରଖନ୍ତୁ — ମୁଁ AI, ଓକିଲ/CA/ଆର୍ଥିକ ସଲାହକାରୀ ନୁହେଁ।'
  },
  as: {
    greet: ['নমস্কাৰ {name}! মই Techo। আজি বিক্ৰী লিখিম, খৰচ লিখিম নে আন কিবা?'],
    fallback: 'মই বুজা নাই। "আজি 2000 টকাৰ বিক্ৰী হ’ল" নে "GST কি?" কওক।',
    moneyMissing: 'কিমান টকাৰ {kind} আছিল? "আজি 2400 বিক্ৰী হ’ল" কওক।',
    saleOk: 'হ’ল! ₹{amount} বিক্ৰী লিখি দিলো। টোকা: {note}। ভুল হ’লে কওক, আঁতৰাই দিম।',
    expenseOk: 'হ’ল! ₹{amount} খৰচ লিখি দিলো। টোকা: {note}।',
    yesWait: 'দয়া কৰি নিশ্চিত কৰক — ই ঠিকনে? "{pending}"',
    disclaimer: 'মনত ৰাখিব — মই AI, উকীল/CA/আৰ্থিক উপদেষ্টা নহয়।'
  },
  ur: {
    greet: ['السلام علیکم {name}! میں Techo ہوں۔ آج فروخت لکھنی ہے، خرچ لکھنا ہے یا کوئی اور کام؟'],
    help: 'میں فروخت/خرچ ریکارڈ کرنے، GST جیسی باتیں سمجھانے، WhatsApp پرومو، یاد دہانی اور ماہر سے بات کروانے میں مدد کر سکتا ہوں۔',
    fallback: 'میں صحیح سمجھا نہیں۔ کچھ ایسا کہیں جیسے "آج 2000 کی فروخت ہوئی" یا "GST کیا ہے؟"',
    moneyMissing: '{kind} کتنی کی ہوئی؟ جیسے "آج 2400 کی فروخت ہوئی" کہیں۔',
    saleOk: 'ہو گیا! ₹{amount} کی فروخت لکھ دی۔ نوٹ: {note}۔ غلط ہو تو بتائیں، ہٹا دوں گا۔',
    expenseOk: 'ہو گیا! ₹{amount} کا خرچ لکھ دیا۔ نوٹ: {note}۔',
    yesWait: 'براہ کرم تصدیق کریں — کیا یہ درست ہے؟ "{pending}"',
    disclaimer: 'یاد رکھیں — میں AI ہوں، وکیل/CA/مالی مشیر نہیں۔'
  },
  bho: {
    greet: ['नमस्ते {name}! हम Techo आनीं। आज के बेचत, खर्चा लिखत, अउरी कुछ?'],
    fallback: 'समझ नाईखे। "आज 2000 के बेचत हो गइल" अउर "GST का होला?" ई तरे कहीं।',
    moneyMissing: '{kind} केतना के रहे? "आज 2400 के बेचत हो गइल" कहीं।',
    saleOk: 'हो गइल! ₹{amount} के बेचत लिख दिहीं। नोट: {note}। गलत होखे त कहीं, हटा दीं।',
    expenseOk: 'हो गइल! ₹{amount} के खर्चा लिख दिहीं। नोट: {note}।',
    yesWait: 'पक्का करीं ना — ई ठीक बा? "{pending}"',
    disclaimer: 'याद रखीं — हम AI बानी, वकील/CA/वित्तीय सलाहकार नाईं।'
  },
  mai: {
    greet: ['नमस्कार {name}! हम Techo छी। आज बिक्री रेकर्ड करब, खर्च लिखब, अथवा आरू किछु?'],
    fallback: 'हम ठीक सँ नहि समझलियह। "आज 2000 क बिक्री भेल" अथवा "GST की अछि?" कहू।',
    moneyMissing: '{kind} कोना रहनि? "आज 2400 क बिक्री भेल" कहू।',
    saleOk: 'भेल गेल! ₹{amount} क बिक्री रेकर्ड कयल। नोट: {note}। गलत अछि त कहू, निकालै छियह।',
    expenseOk: 'भेल गेल! ₹{amount} क खर्च लिखि लेलौं। नोट: {note}।',
    yesWait: 'कृपया पक्का करू — ई सही आछि? "{pending}"',
    disclaimer: 'याद राखू — हम AI छी, वकील/CA/वित्तीय सलाहकार नहि।'
  },
  gom: {
    greet: ['नमस्कार {name}! हांव Techo आसां। आयज विक्री मांडची आसा, खर्च मांडचो आसा, अवय आनिंक?'],
    fallback: 'म्हाका नीट समजलें ना. "आयज 2000 ची विक्री जाली" अवय "GST किदें?" अशें सांगात.',
    moneyMissing: '{kind} कितले आसलें? "आयज 2400 ची विक्री जाली" सांगात.',
    saleOk: 'जालें! ₹{amount} ची विक्री मांडली. नोट: {note}. फळत आसा जाल्यार सांगात, काडून घेतलें.',
    expenseOk: 'जालें! ₹{amount} चो खर्च मांडलो. नोट: {note}.',
    yesWait: 'खात्री करात — हो बरोबर आसा? "{pending}"',
    disclaimer: 'उगडास दवरात — हांव AI, वकील/CA/वित्तीय सल्लागार न्हय.'
  },
  ks: {
    greet: ['आदाब {name}! मी Techo छुस। अज़ि बिक्री लिकनव, खर्चे लिकनव, या बेअ कछु?'],
    help: 'मी बिक्री/खर्च रेकॉर्ड कोरनव, GST पाट कथ बोझावनव, WhatsApp प्रमो, याद दिवनव, अज़ विशेषज्ञ स॑न गल बनावनव।',
    fallback: 'मी ठीक समज नी। "अज़ 2000 की बिक्री आयि" या "GST क्या छु?" च़च़िव।',
    moneyMissing: '{kind} केस? "अज़ 2400 की बिक्री आयि" च़च़िव।',
    saleOk: 'बनि गे! ₹{amount} की बिक्री रेकॉर्ड कोर। नोट: {note}। गलति अस्य त रोज़, तालाव।',
    expenseOk: 'बनि गे! ₹{amount} च़ खर्च रेकॉर्ड कोर। नोट: {note}।',
    yesWait: 'मेहरबानी करथ, तस्दीक कोरव — ई दरुस्त छु? "{pending}"',
    disclaimer: 'याद रखव — मी AI छुस, वकील/CA/वित्तीय सलाहकार नी।'
  }
};
const FALLBACK_T = 'hing';

const lpick = (lang, key) => {
  return (T[lang] && T[lang][key]) || T[FALLBACK_T][key] || T.en[key] || '';
};
const lfill = (lang, key, vars = {}) => {
  let s = lpick(lang, key);
  for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
  return s;
};

/* ------------------------------------------------------------------ *
 * Parsing helpers (₹ amounts, relative dates/times)
 * ------------------------------------------------------------------ */

const MULT = { hundred: 100, hundredthousand: 100000, thousand: 1000, lakh: 100000, lac: 100000, crore: 1e7 };
const MULT_HI = { हजार: 1000, सौ: 100, हज़ार: 1000, हज़ारी: 1000, लाख: 100000, लाख: 100000, करोड़: 1e7, सहस्र: 1000 };
const MULT_HING = { hazar: 1000, sau: 100, lakh: 100000, lac: 100000, crore: 1e7 };

const parseMoney = (text) => {
  const clean = ` ${text.toLowerCase()} `;
  const seg = clean.split(/\s+/);
  let best = null;
  for (let i = 0; i < seg.length; i++) {
    const s = seg[i];
    let num = parseFloat(s.replace(/[₹,]/g, ''));
    if (isNaN(num) && /^[0-9,.]+$/.test(s) && s.length > 0 && parseFloat(s.replace(/,/g, '')) > 0) {
      num = parseFloat(s.replace(/,/g, ''));
    }
    if (!isNaN(num)) {
      let mult = 1;
      const next = (i + 1 < seg.length) ? seg[i + 1] : '';
      const next2 = (i + 2 < seg.length) ? seg[i + 2] : '';
      const unit = (next2 === 'hundred' && next === 'thousand') ? 'hundredthousand' : next;
      if (MULT[unit]) mult = MULT[unit];
      else if (MULT_HING[next]) mult = MULT_HING[next];
      for (const [k, v] of Object.entries(MULT_HI)) if (next === k) mult = v;
      const val = num * mult;
      if (val > 0 && (!best || val > best.amount)) best = { amount: Math.round(val), raw: s + ' ' + next };
    }
  }
  return best;
};

const parseDueDate = (text, now = Date.now()) => {
  const t = text.toLowerCase();
  const oneDay = 86400000;
  if (/(aaj|today|आज|आज)/.test(t)) return { due: new Date(now + 1 * 3600000).toISOString(), human: 'today' };
  if (/(kal|tomorrow|कल)/.test(t)) return { due: new Date(now + oneDay).toISOString(), human: 'tomorrow' };
  if (/(parso|parson|day after)/.test(t)) return { due: new Date(now + 2 * oneDay).toISOString(), human: 'day after tomorrow' };
  const dn = t.match(/(\d+)\s*(din|day|days)/);
  if (dn) return { due: new Date(now + parseInt(dn[1], 10) * oneDay).toISOString(), human: `in ${dn[1]} days` };
  // next weekday
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  for (let i = 0; i < days.length; i++) {
    if (t.includes(days[i]) || t.includes(days[i].slice(0, 3))) {
      const cur = new Date(now);
      const target = (i - cur.getDay() + 7) % 7;
      const addDays = target === 0 ? 7 : target;
      return { due: new Date(now + addDays * oneDay).toISOString(), human: days[i] };
    }
  }
  return null;
};

const parseTimeOfDay = (text, baseISO) => {
  const base = new Date(baseISO || Date.now());
  const h = text.toLowerCase().match(/(\d{1,2})\s*baje|(\d{1,2})\s*(saamne|shaam|subah|morning|evening|sham)/);
  const ampm = text.toLowerCase().match(/\b(\d{1,2})([:. ](\d{2}))?\s*(am|pm|baje)?\b/);
  let hour = null, minute = 0;
  if (h) hour = parseInt(h[1] || h[2], 10);
  const dimMatch = text.toLowerCase().match(/(\d{1,2})\s+(am|pm)/);
  if (dimMatch) {
    hour = parseInt(dimMatch[1], 10);
    if (dimMatch[2] === 'pm' && hour < 12) hour += 12;
  }
  if (hour == null) return null;
  base.setHours(hour, minute, 0, 0);
  return base.toISOString();
};

/* ------------------------------------------------------------------ *
 * Intents (multilingual keyword sets)
 * ------------------------------------------------------------------ */

const hasAny = (text, words) => {
  const t = text.toLowerCase();
  return words.some((w) => t.includes(w.toLowerCase()));
};

const tokenBoundary = new Set(['yes', 'yep', 'yeah', 'ok', 'fine', 'haan', 'ha', 'han', 'hankha', 'nope', 'no', 'theek', 'done', 'sahi', 'thik', 'nehi', 'nahi', 'galt', 'wrong']);
// Whole-word affirmative/negative for short & ambiguous words only
const hasAffirm = (text) => {
  const t = text.toLowerCase();
  const tokens = t.split(/\s+/).map((w) => w.replace(/[^a-z\u0900-\u097F]/g, ''));
  return tokens.some((w) => ['yes', 'yep', 'yeah', 'ok', 'fine', 'haan', 'ha', 'han', 'hankha', 'thik', 'theek', 'sahi', 'done'].includes(w));
};
const hasNegate = (text) => {
  const t = text.toLowerCase();
  const tokens = t.split(/\s+/).map((w) => w.replace(/[^a-z\u0900-\u097F]/g, ''));
  return tokens.some((w) => ['no', 'nope', 'nahi', 'nahin', 'nehi', 'nhi', 'galat', 'wrong', 'मत'].includes(w));
};

const INTENTS = {
  greeting: { hi: ['नमस्ते', 'नमस्कार', 'हेलो', 'प्रणाम'], hing: ['namaste', 'namaskar', 'hello', 'hi ', 'bhai sun', 'pranam'], en: ['hello', ' hi ', 'hey', 'good morning', 'good evening'], bn: ['নমস্কার', 'হ্যালো'], pa: ['ਸਤ ਸ੍ਰੀ ਅਕਾਲ'], mr: ['नमस्कार', 'नमस्ते'] },
  concept: { hi: ['क्या है', 'समझाओ', 'मतलब', 'अर्थ', 'कैसे', 'क्यों'], hing: ['kya hai', 'samjhao', 'matlab', 'kaise', 'kyun', 'kya hota', 'explain', 'meaning', 'define'], en: ['what is', 'explain', 'meaning', 'how does', 'define'], mr: ['काय आहे', 'समजाव'], bn: ['কী', 'বুঝিয়েছি'], pa: ['ਕੀ ਹੈ', 'ਸਮਝਾਓ'] },
  market: { hi: ['gst', 'जीएसटी', 'msme', 'loan', 'कर्ज', 'लोन', 'tax', 'टैक्स', 'मार्केट', 'बाजार'], hing: ['gst', 'msme', 'udyam', 'loan', 'tax', 'itr', 'tax audit', 'turnover', 'margin', 'profit', 'digital pay', 'upi'], en: ['gst', 'msme', 'udyam', 'loan', 'tax', 'turnover', 'margin', 'inflation', 'market'], mr: ['gst', 'कर्ज', 'msme', 'uttara'], bn: ['gst', 'লোন', 'msme', 'ট্যাক্স'], pa: ['gst', 'ਲੋਨ', 'msme', 'ਟੈਕਸ'] },
  sale: { hi: ['बिक्री', 'बेचा', 'बिका', 'बिक गया', 'सेल हुई'], hing: ['sale hui', 'sale ki', 'becha', 'bika', 'sell', 'sold', 'bik gayi', 'record sale'], en: ['sale', 'sold', 'sell', 'sale of'], mr: ['विक्री झाली', 'विकली'], bn: ['বিক্রি হয়েছে', 'বিক্রি'], pa: ['ਵਿਕਰੀ', 'ਵਿਕ ਗਈ'] },
  expense: { hi: ['खर्च', 'खरीदा', 'लिया', 'दिया'], hing: ['kharch', 'expense', 'kharida', 'spent', 'spend', 'pay kiya', 'udi jodi'], en: ['expense', 'spent', 'spend', 'paid', 'cost'], mr: ['खर्च', 'खरेदी'], bn: ['খরচ'], pa: ['ਖਰਚਾ', 'ਖਰੀਦ'] },
  content: { hi: ['व्हाट्सएप', 'प्रोमो', 'प्रमोशन', 'कैप्शन', 'फॉलोअप'], hing: ['whatsapp', 'promo', 'promotion', 'message likho', 'caption', 'caption banao', 'social media', 'follow-up', 'reminder message', 'ad likho', 'offer message'], en: ['whatsapp', 'promo', 'promotion', 'caption', 'social media', 'follow-up', 'ad ', 'message for'], bn: ['promo', 'ক্যাপশন', 'whatsapp'], pa: ['promo', 'caption'], mr: ['promo', 'कॅप्शन', 'whatsapp'] },
  reminder: { hi: ['रिमाइंडर', 'याद', 'अलार्म', 'रिमाइंड', 'याद दिलाओ', 'टाइमर'], hing: ['remind', 'reminder', 'yad dilaao', 'yaad', 'alarm', 'lagao', 'timer', 'notify', 'yaad dilana'], en: ['remind', 'reminder', 'remind me', 'notify', 'alarm'], bn: ['রিমাইন্ডার', 'মনে করাও'], pa: ['ਯਾਦ', 'reminder'], mr: ['स्मरणपत्र', 'आठवण'] },
  escalate: { hi: ['वकील', 'कानून', 'कोर्ट', 'केस', 'विशेषज्ञ', 'अधिवक्ता', 'कानूनी'], hing: ['lawyer', 'vakil', 'law', 'legal', 'court', 'contract', 'expert', 'ca se', 'mujhe baat', 'call expert', 'humans se'], en: ['lawyer', 'legal', 'court', 'contract', 'expert', 'consult', 'advisor', 'escalate'], bn: ['উকিল', 'আইনি', 'কোর্ট'], pa: ['ਵਕੀਲ', 'ਕਾਨੂੰਨੀ', 'ਕੋਰਟ'], mr: ['वकील', 'कायदा', 'कोर्ट'] },
  confirm: { hi: ['हाँ', 'हां', 'ठीक है', 'करो', 'कर दो', 'हैं'], hing: ['haan', 'ha', 'hankha', 'yes', 'done', 'kar do', 'sahi hai', 'ok', 'theek'], en: ['yes', 'yep', 'yeah', 'ok', 'fine', 'confirmed', 'do it'], bn: ['হ্যাঁ', 'ঠিক আছে'], pa: ['ਹਾਂ', 'ਠੀਕ ਹੈ'], mr: ['होय', 'हो', 'करा'] },
  reject: { hi: ['नहीं', 'गलत', 'नही'], hing: ['nahi', 'nope', 'no ', 'galat', 'wrong', 'mat karo'], en: ['no', 'nope', 'wrong'], bn: ['না'], pa: ['ਨਹੀਂ'], mr: ['नाही', 'नको'] },
  help: { hi: ['मदद', 'सहायता'], hing: ['help', 'madad', 'guide'], en: ['help', 'assist'], bn: ['সাহায্য'], pa: ['ਮਦਦ'] }
};

/* ------------------------------------------------------------------ *
 * Content generators (promo / caption / follow-up / reminder)
 * ------------------------------------------------------------------ */

const CONTENT = {
  hindi: {
    promo: (biz) => `🌟 ${biz} — Aaj ka Khaas Offer!\n\n1) ${'Weekend Discount'} — ${biz} par special prices\n2) Kareeb 100+ items fresh stock mein\n\n👉 Call ya WhatsApp karein, delivery bhi available!\n\n#${biz.replace(/\s+/g, '')} #Offer #KiranaStyle`,
    caption: (biz) => `Fresh stock, sasta daam, aur bada muskaan — yeh hai ${biz} ka vaada! 🛍️\nAb aapke ghar tak delivery. Order karo aaj hi.`,
    followUp: (customer) => `${customer} ji, ${'aapka pichhla order'} ready hai. Kya aaj evening tak chahiye? Reply "haan" karein.`,
    reminderMsg: (title) => `⏰ ${title} — yaad rahe! Techo reminded you.`
  },
  hinglish: {
    promo: (biz) => `🌟 ${biz} — Aaj ka Special Offer!\n\n✅ Fresh stock arrived\n✅ Home delivery available\n✅ Bada discount on today's order\n\nDM ya call karo — offer galti nahi rahega!`,
    caption: (biz) => `New stock, best prices, zero tension 😄 Shop from ${biz} today. Delivery to your door!`,
    followUp: (customer) => `Hii ${customer} ji! Aapne pichhli baar ${'hamari dukaan'} se manga tha. Aaj koi naya item chahiye? Home delivery time se milega.`,
    reminderMsg: (title) => `⏰ ${title} — yaad dilaya Techo ne!`
  },
  english: {
    promo: (biz) => `🎉 ${biz} — Weekend Special!\n\nFresh stock, home delivery & great prices for this weekend. Order today!\n\nWhatsApp us for the full offer list.`,
    caption: (biz) => `Fresh stock, fair prices and doorstep delivery — that's ${biz}! 🛍️ DM to order.`,
    followUp: (customer) => `Hello ${customer}! Just checking in from ${'our store'}. Anything you'd like delivered this week? We deliver within the day.`,
    reminderMsg: (title) => `⏰ Reminder: ${title}`
  },
  marathi: {
    promo: (biz) => `🌟 ${biz} — आजचा खास offer!\n\nनवीन stock, घरपोच delivery!\nताबडतोब ऑर्डर करा.`,
    caption: (biz) => `नवीन stock, योग्य दर — ${biz}!`,
    followUp: (customer) => `${customer} ji, गेल्या वेळी तुम्ही आमच्याकडून विकत घेतले होते. आज काही नवीन हवे का?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  bengali: {
    promo: (biz) => `🌟 ${biz} — আজকের বিশেষ অফার!\n\nনতুন stock, বাড়িতে ডেলিভারি!\nএখনই অর্ডার করুন.`,
    caption: (biz) => `নতুন stock, সাশ্রয়ী দাম — ${biz}!`,
    followUp: (customer) => `${customer} জি, আগের বার আপনি কিনেছিলেন। আজ নতুন কিছু লাগবে?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  punjabi: {
    promo: (biz) => `🌟 ${biz} — ਅੱਜ ਦਾ ਖਾਸ offer!\n\nਨਵਾਂ stock, ਘਰ ਬੈਠੇ delivery!\nਹੁਣੇ order ਕਰੋ.`,
    caption: (biz) => `ਨਵਾਂ stock, ਵਧੀਆ rates — ${biz}!`,
    followUp: (customer) => `${customer} ਜੀ, ਪਿਛਲੀ ਵਾਰ ਤੁਸੀਂ ਸਾਡੇ ਤੋਂ ਲਿਆ ਸੀ। ਅੱਜ ਕੁਝ ਨਵਾਂ ਚਾਹੀਦਾ?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  telugu: {
    promo: (biz) => `🌟 ${biz} — ఈరోజు ప్రత్యేక ఆఫర్!\n\nకొత్త stock, ఇంటికే డెలివరీ!\nఇప్పుడే ఆర్డర్ చేయండి.`,
    caption: (biz) => `కొత్త stock, మంచి ధరలు — ${biz}!`,
    followUp: (customer) => `${customer} గారు, చివరిసారి మీరు కొన్నారు. ఈరోజు కొత్తగా ఏమైనా కావాలా?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  tamil: {
    promo: (biz) => `🌟 ${biz} — இன்றைய சிறப்பு வாய்ப்பு!\n\nபுதிய stock, வீட்டிற்கே டெலிவரி!\nஇப்போதே ஆர்டர் செய்யுங்கள்.`,
    caption: (biz) => `புதிய stock, சிறந்த விலை — ${biz}!`,
    followUp: (customer) => `${customer} அவர்களே, கடைசியாக வாங்கினீர்கள். இன்று புதிதாக ஏதாவது வேண்டுமா?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  gujarati: {
    promo: (biz) => `🌟 ${biz} — આજનો ખાસ offer!\n\nનવો stock, ઘરે જ ડિલિવરી!\nહમણાં જ ઓર્ડર કરો.`,
    caption: (biz) => `નવો stock, સારા ભાવ — ${biz}!`,
    followUp: (customer) => `${customer} જી, છેલ્લી વાર ખરીદ્યું હતું. આજે નવું કંઈ જોઈએ?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  kannada: {
    promo: (biz) => `🌟 ${biz} — ಇಂದಿನ ವಿಶೇಷ ಆಫರ್!\n\nಹೊಸ stock, ಮನೆ ಬಾಗಿಲಿಗೆ delivery!\nಈಗೇ ಆರ್ಡರ್ ಮಾಡಿ.`,
    caption: (biz) => `ಹೊಸ stock, ಉತ್ತಮ ದರ — ${biz}!`,
    followUp: (customer) => `${customer} ಅವರೇ, ಕೊನೆಯ ಬಾರಿ ಖರೀದಿಸಿದ್ದೀರಿ. ಇಂದು ಹೊಸದು ಬೇಕೇ?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  malayalam: {
    promo: (biz) => `🌟 ${biz} — ഇന്നത്തെ പ്രത്യേക ഓഫർ!\n\nപുതിയ stock, വീട്ടിൽ തന്നെ ഡെലിവറി!\nഇപ്പോൾ തന്നെ ഓർഡർ ചെയ്യൂ.`,
    caption: (biz) => `പുതിയ stock, മികച്ച വില — ${biz}!`,
    followUp: (customer) => `${customer}, കഴിഞ്ഞ തവണ വാങ്ങിയിരുന്നു. ഇന്ന് പുതിയതൊന്നും വേണോ?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  odia: {
    promo: (biz) => `🌟 ${biz} — ଆଜିର ବିଶେଷ ଅଫର!\n\nନୂଆ stock, ଘରେ ଡେଲିଭରି!\nବର୍ତ୍ତମାନ ଅର୍ଡର କରନ୍ତୁ.`,
    caption: (biz) => `ନୂଆ stock, ଭଲ ଦର — ${biz}!`,
    followUp: (customer) => `${customer}, ଗତ ଥର କିଣିଥିଲେ। ଆଜି ନୂଆ କିଛି ଦରକାର?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  assamese: {
    promo: (biz) => `🌟 ${biz} — আজিৰ বিশেষ অফাৰ!\n\nনতুন stock, ঘৰতে ডেলিভাৰী!\nএতিয়াই অৰ্ডাৰ কৰক.`,
    caption: (biz) => `নতুন stock, ভাল দাম — ${biz}!`,
    followUp: (customer) => `${customer}, যোৱা বাৰ আনিছিল। আজি নতুন একো লাগে নে?`,
    reminderMsg: (title) => `⏰ ${title}`
  },
  urdu: {
    promo: (biz) => `🌟 ${biz} — آج کا خصوصی آفر!\n\nنئی stock، گھر پر ڈیلیوری!\nابھی آرڈر کریں.`,
    caption: (biz) => `نئی stock، اچھے دام — ${biz}!`,
    followUp: (customer) => `${customer} صاحب، پچھلی بار خریدا تھا۔ آج کچھ نیا چاہیے؟`,
    reminderMsg: (title) => `⏰ ${title}`
  }
};
const CONTENT_LANG = { hi: 'hindi', hing: 'hinglish', en: 'english', mr: 'marathi', bn: 'bengali', pa: 'punjabi', te: 'telugu', ta: 'tamil', gu: 'gujarati', kn: 'kannada', ml: 'malayalam', or: 'odia', as: 'assamese', ur: 'urdu', bho: 'hindi', mai: 'hindi', gom: 'hindi', ks: 'hindi' };

/* ------------------------------------------------------------------ *
 * Concept explanations (financial literacy, simple words)
 * ------------------------------------------------------------------ */

const CONCEPTS = {
  gst: {
    hi: 'GST yaani "Goods and Services Tax" — ek tarah ka tax jo har kharidne-farokht par lagta hai. Jaise aap maal khareedte ho toh uspe GST dete ho, aur bechte ho toh customers se lete ho. Simple example: ₹100 ka maal kharida, usme 5% GST yani ₹5. Jab becho toh wahi ₹5 sarkar ko dena hota hai. Registration turnover ₹40 lakh (sayad kamu) se zyada par zaroori. Iske liye CA se baat karna best rahega.',
    hing: 'GST matlab Goods and Services Tax — har khareeda-ikrade par lage wala tax. TUM kharidte ho toh dete ho, bechte ho toh customers se lete ho. Simple: ₹100 ka maal, 5% GST = ₹5 jo kharidne par pay karte ho. Registration ₹40 lakh turnover se upar zaroori. Exact ke liye CA ko dikhao.',
    en: 'GST = Goods and Services Tax, a value-added tax on most goods/supplies. You pay it when you buy, collect it from customers when you sell, and remit the difference to the government. Registration becomes mandatory when turnover crosses a threshold (₹40 lakh for goods in most states). Confirm your exact position with a CA.',
    mr: 'GST म्हणजे Goods and Services Tax. खरेदी-विक्रीवर आकारला जाणारा कर. नोंदणी उलाढाल ₹40 लाखांवर गेल्यावर आवश्यक.',
    bn: 'GST মানে Goods and Services Tax — কেনা-বেচায় লাগে। Turnover ₹40 লক্ষের উপরে registration বাধ্যতামূলক।',
    pa: 'GST = Goods and Services Tax। ਵਪਾਰ ਤੇ ਲੱਗਣ ਵਾਲਾ ਟੈਕਸ। ₹40 ਲੱਖ ਦੇ ਬਾਅਦ ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਜ਼ਰੂਰੀ।',
    te: 'GST అంటే Goods and Services Tax — కొనుగోలు-అమ్మకాలపై వచ్చే పన్ను. ₹40 లక్షలకు పైగా టర్నోవర్ ఉంటే రిజిస్ట్రేషన్ తప్పనిసరి.',
    ta: 'GST என்றால் Goods and Services Tax — கொள்முதல்-விற்பனை மீதான வரி. ₹40 லட்சத்திற்கு மேல் விற்றுமுதல் எனில் பதிவு கட்டாயம்.',
    gu: 'GST એટલે Goods and Services Tax — ખરીદી-વેચાણ પરનો કર. ₹40 લાખથી વધુ turnover પર રજિસ્ટ્રેશન જરૂરી.',
    kn: 'GST ಅಂದರೆ Goods and Services Tax — ಖರೀದಿ-ಮಾರಾಟದ ಮೇಲಿನ ತೆರಿಗೆ. ₹40 ಲಕ್ಷಕ್ಕಿಂತ ಹೆಚ್ಚು turnover ಇದ್ದರೆ ನೋಂದಣಿ ಕಡ್ಡಾಯ.',
    ml: 'GST എന്നാൽ Goods and Services Tax — വാങ്ങലും വിൽപനയും ഉൾപ്പെടുന്ന നികുതി. ₹40 ലക്ഷത്തിന് മുകളിൽ turnover ഉണ്ടെങ്കിൽ രജിസ്ട്രേഷൻ നിർബന്ധം.',
    or: 'GST ଅର୍ଥାତ୍ Goods and Services Tax — କିଣିବା-ବିକିବାର ଟିକସ। ₹40 ଲକ୍ଷରୁ ଅଧିକ turnover ହେଲେ ପଞ୍ଜୀକରଣ ଜରୁରୀ।',
    as: 'GST অৰ্থাৎ Goods and Services Tax — কিনা-বেচাৰ ওপৰত জা-কৰ। ₹40 লাখৰ ওপৰত turnover হ’লে ৰেজিষ্ট্ৰেচন বাধ্যতামূলক।',
    ur: 'GST مطلب Goods and Services Tax — خرید و فروخت پر لگنے والا ٹیکس۔ ₹40 لاکھ سے زیادہ ٹرن اوور پر رجسٹریشن ضروری۔'
  },
  margin: {
    hi: 'Margin matlab kharidne ki keemat aur bechne ki keemat ka farak. Example: ₹80 ka maal, ₹100 mein becha → margin = ₹20 (20%). Profit ka hisaab: saari bikri mein se saare kharch nikal dein jo bachta hai woh profit.',
    hing: 'Margin = selling price minus cost price. ₹80 ka maal, ₹100 me becha → ₹20 ya 20% margin. Profit = kul bikri minus kul kharch.',
    en: 'Margin = selling price − cost price as a % of selling price. ₹80 cost sold at ₹100 gives ₹20 (20%) margin. Profit = total sales − total expenses.',
    mr: 'मार्जिन = विक्री किंमत − मालाची किंमत. उदा. ₹80 चा माल ₹100 ला विकला ⇒ ₹20 (20%) मार्जिन.',
    bn: 'মার্জিন = বিক্রয়মূল্য − খরচ। ₹80-র মাল ₹100-এ বিক্রি ⇒ ₹20 (20%) মুনাফা।',
    pa: 'Margin = ਵਿਕਰੀ ਕੀਮਤ − ਲਾਗਤ। ₹80 ਦਾ ਮਾਲ ₹100 ਵਿੱਚ ਵਿਕਿਆ ⇒ ₹20 (20%) margin।'
  },
  profittax: {
    hi: 'Income tax business ke profit par lagta hai, na ki pura turnover par. Profit nikaalne ke liye saare janee kharch (stock, rent, bijli, staff) minus karein. Turnover ₹1 crore se zyada ho toh tax audit zaroori ho sakti hai.',
    hing: 'Tax business ke NET profit par lagta hai, turnover par nahi. Profit = sale − sab expenses. Turnover ₹1 crore upar → tax audit possible. CA se confirm.',
    en: 'Income tax is paid on net profit, not on total turnover. Profit = sales − all expenses. Turnover above the audit threshold (typically ₹1 crore for goods) may require a tax audit.',
    mr: 'टॅक्स नफ्यावर लागतो, उलाढालीवर नाही.',
    bn: 'ট্যাক্স মুনাফার উপর ধার্য হয়, turnover-র উপর না।',
    pa: 'ਟੈਕਸ ਨਫੇ ਤੇ ਲੱਗਦਾ ਹੈ, turnover ਤੇ ਨਹੀਂ।'
  },
  default: {
    hi: 'Yeh ek business/finance concept hai. Simple bhasha mein: dhan ka hisaab-kitaab samajhna sabse zaroori hai. Exact jawab ke liye apna data bhejna ho toh profile mein bharo, ya expert se poocho.',
    hing: 'Yeh business concept hai bhai. Exact ya confirmed jawab ke liye expert se baat karo, main galat info kabhi nahi dunga.',
    en: 'This is a business/finance concept. For a verified answer, consult a professional — I won\'t guess on something I\'m not sure about.',
    mr: 'व्यावसायिक संकल्पना. निश्चित उत्तरासाठी तज्ज्ञांचा सल्ला घ्या.',
    bn: 'একটি ব্যবসা-আর্থিক ধারণা। নিশ্চিত উত্তর চাইলে বিশেষজ্ঞের পরামর্শ নিন।',
    pa: 'ਇੱਕ ਵਪਾਰਕ ਸੰਕਲਪ। ਪੱਕਾ ਜਵਾਬ ਲਈ expert ਨੂੰ ਪੁੱਛੋ।',
    te: 'ఇది వ్యాపార/ఆర్థిక భావన. ఖచ్చితమైన సమాధానం కోసం నిపుణుల సలహా తీసుకోండి.',
    ta: 'இது ஒரு வணிக/நிதி கருத்து. உறுதியான பதிலுக்கு நிபுணரை அணுகவும்.',
    gu: 'આ એક વ્યાપાર/નાણાકીય ખ્યાલ છે. ચોક્કસ જવાબ માટે નિષ્ણાતની સલાહ લો.',
    kn: 'ಇದು ಒಂದು ವ್ಯಾಪಾರ/ಹಣಕಾಸು ಪರಿಕಲ್ಪನೆ. ಖಚಿತ ಉತ್ತರಕ್ಕೆ ತಜ್ಞರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
    ml: 'ഇതൊരു ബിസിനസ്സ്/സാമ്പത്തിക ആശയമാണ്. ഉറപ്പുള്ള ഉത്തരത്തിന് വിദഗ്ദ്ധരെ സമീപിക്കുക.',
    or: 'ଏହା ଏକ ବ୍ୟବସାୟ/ଆର୍ଥିକ ଧାରଣା। ନିଶ୍ଚିତ ଉତ୍ତର ପାଇଁ ବିଶେଷଜ୍ଞଙ୍କ ପରାମର୍ଶ ନିଅନ୍ତୁ।',
    as: 'এই এটা ব্যৱসায়/আৰ্থিক ধাৰণা। নিশ্চিত উত্তৰৰ বাবে বিশেষজ্ঞৰ পৰামৰ্শ লওক।',
    ur: 'یہ ایک کاروباری/مالی تصور ہے۔ یقینی جواب کے لیے ماہر سے مشورہ لیں۔'
  }
};
const conceptKey = (text) => {
  const t = text.toLowerCase();
  if (t.includes('gst')) return 'gst';
  if (t.includes('margin') || t.includes('profit') || t.includes('मार्जिन') || t.includes('मुनाफा')) return 'margin';
  if (t.includes('tax') || t.includes('itr') || t.includes('audit') || t.includes('टैक्स')) return 'profittax';
  return 'default';
};

/* ------------------------------------------------------------------ *
 * Business-profile field extraction
 * ------------------------------------------------------------------ */

const extractProfileFields = (text, business = {}) => {
  const t = text.toLowerCase();
  const updates = {};
  const notes = [];

  const nameMatch = t.match(/(?:business|dukaan|shop|store|vyapar)\s+(?:ka|ki)\s+naam\s+(?:hai|is)\s+([\w\u0900-\u097F.&' ]{3,40})/) ||
    t.match(/(?:mera|hamara|hamari)\s+(?:business|dukaan|shop|vyapar)\s+([\w\u0900-\u097F.&' ]{3,40})\s+(?:hai|ka naam)/) ||
    t.match(/naam\s+([\w\u0900-\u097F.&' ]{3,40})\s+(?:rakha|hai)/);
  if (nameMatch) { updates.name = nameMatch[1].trim(); notes.push(`Business name: ${updates.name}`); }

  const cityMatch = t.match(/\b(?:in|par|mein|me|में|मध्ये)\s+([a-z][a-z ,.\u0900-\u097F]{3,25})\b/i) ||
    t.match(/location\s+([\w\u0900-\u097F ]{3,30})/i);
  if (cityMatch && /[a-z\u0900-\u097F]/.test(cityMatch[1])) { updates.location = cityMatch[1].trim(); notes.push(`Location: ${updates.location}`); }

  const prodMatch = t.match(/(?:products?|maal|stock|items?)\s*(?:mein|par)?\s*(?:dalte|rakhte|hain|hai|bikte)?\s*[:,-]?\s*([^\n,.।]{3,60})/i);
  if (prodMatch) { updates.products = prodMatch[1].trim(); notes.push(`Products: ${updates.products}`); }

  const custMatch = t.match(/(\d+)\s*(?:customer|grahak|regulars?)/i);
  if (custMatch) { updates.customers = custMatch[0]; notes.push(`Customers: ${custMatch[0]}`); }

  return { updates, notes };
};

/* ------------------------------------------------------------------ *
 * Context / conversation state (per user, in-memory)
 * ------------------------------------------------------------------ */

const ctxByUser = new Map(); // userId -> { lang, pending, lastAction }

const getCtx = (userId) => {
  if (!ctxByUser.has(userId)) ctxByUser.set(userId, { lang: 'hing', pending: null, lastAction: null });
  return ctxByUser.get(userId);
};

/* ------------------------------------------------------------------ *
 * Main message handler
 * ------------------------------------------------------------------ */

const handleMessage = async ({ user, text, mode = 'chat', detectedLang }) => {
  const ctx = getCtx(user.id);
  const userLang = user.preferredLang || 'hing';
  const prefs = user.langPrefs || {};
  const detection = language.detectLang(text, ctx.lang);
  const resolved = language.resolveReplyLang({
    preferred: userLang,
    detected: detection.confident ? detection.lang : 'auto',
    detectedConfident: detection.confident,
    lock: prefs.lockResponseLang,
    allowSwitch: prefs.allowSwitch
  });
  const speakLang = resolved.replyLang;
  ctx.lang = speakLang;

  const actions = [];
  const toolCalls = [];
  const meta = { kind: 'chat', detected: detection.lang, detectedConfident: detection.confident, replyLang: speakLang, replyLangMode: resolved.mode, transcript: text };
  const lower = text.toLowerCase();

  // --- 1. Pending-confirmation flow ----------------------------------
  if (ctx.pending && hasAffirm(text)) {
    const p = ctx.pending;
    ctx.pending = null;
    if (p.type === 'transaction') {
      store.insert('transactions', { userId: user.id, type: p.transactionType, amount: p.amount, note: p.note, topic: p.topic || 'general', at: new Date().toISOString(), via: mode === 'voice' ? 'voice' : 'text' });
      actions.push({ type: 'transaction', payload: { ...p } });
      meta.kind = p.transactionType === 'sale' ? 'sale-recorded' : 'expense-recorded';
      meta.amount = p.amount; meta.note = p.note;
      return { reply: lfill(speakLang, p.transactionType === 'sale' ? 'saleOk' : 'expenseOk', { amount: p.amount, note: p.note }), replyLang: speakLang, actions, toolCalls, meta, intents: [p.transactionType] };
    }
    if (p.type === 'reminder') {
      store.insert('reminders', { userId: user.id, title: p.title, notes: p.notes, due: p.due, humanDue: p.humanDue, priority: p.priority || 'medium', status: 'pending', kind: p.kind || 'todo', method: p.method || (user.consents && user.consents.reminders ? 'voice-call' : 'in-app'), consent: !!(user.consents && user.consents.reminders), createdAt: new Date().toISOString() });
      actions.push({ type: 'reminder', payload: p });
      meta.kind = 'reminder-set'; meta.due = p.humanDue;
      return { reply: `⏰ Done! Reminder "${p.title}" ${p.humanDue || ''} ke liye set (${p.method})`, replyLang: speakLang, actions, toolCalls, meta, intents: ['reminder'] };
    }
    if (p.type === 'email') {
      const r = await emailSvc.send(user.id, { to: p.to, subject: p.subject, text: p.text, consent: true });
      actions.push({ type: 'email', payload: { ...p, result: r.ok ? 'sent' : r.reason } });
      meta.kind = r.ok ? 'email-sent' : 'email-failed';
      if (r.ok) return { reply: `📧 Email bhej diya ${p.to} ko — "${p.subject}". Sent list Integrations page par dikhega.`, replyLang: speakLang, actions, toolCalls, meta, intents: ['email'] };
      return { reply: `📧 Email nahi bheja ja saka (${r.message || r.reason}). ${r.setup ? 'Integrations page par setup steps dekhein.' : ''}`, replyLang: speakLang, actions, toolCalls, meta, intents: ['email'] };
    }
    if (p.type === 'calendar-event') {
      const r = await calendarSvc.createEvent(user.id, { title: p.title, start: p.start, end: p.end, description: p.notes });
      actions.push({ type: 'calendar-event', payload: { ...p, result: r.ok ? 'created' : (r.reason || 'not-configured') } });
      meta.kind = r.ok ? 'calendar-created' : 'calendar-failed';
      if (r.ok) return { reply: `📅 Meeting calendar me add ho gayi — "${p.title}".`, replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar'] };
      // Graceful fallback: keep it as a local reminder so nothing is lost.
      store.insert('reminders', { userId: user.id, title: p.title, notes: p.notes, due: p.start, humanDue: p.human, priority: 'medium', status: 'pending', kind: 'todo', method: 'in-app', consent: true, createdAt: new Date().toISOString() });
      return { reply: `📅 Google Calendar connected nahi hai, isliye maine ise local reminder me save kar diya ("${p.title}"). Connect karne ke liye Integrations page dekhein.`, replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar', 'reminder'] };
    }
  }
  if (ctx.pending && hasNegate(text)) {
    ctx.pending = null;
    return { reply: 'No problem — cancel kar diya. Kuch aur?', replyLang: speakLang, actions: [], toolCalls, meta, intents: ['cancel'] };
  }

  // --- 2. Greeting -----------------------------------------------------
  if (!text.trim() || hasAny(lower, INTENTS.greeting.hi) || hasAny(lower, INTENTS.greeting.hing) || hasAny(lower, INTENTS.greeting.en) || hasAny(lower, INTENTS.greeting.bn) || hasAny(lower, INTENTS.greeting.pa) || hasAny(lower, INTENTS.greeting.mr)) {
    const first = user.name.split(' ')[0] || 'Boss';
    return { reply: lfill(speakLang, 'greet', { name: first }), replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'greeting' }, intents: ['greeting'] };
  }

  // --- 3. Help ---------------------------------------------------------
  if (hasAny(lower, INTENTS.help.hi) || hasAny(lower, INTENTS.help.hing) || hasAny(lower, INTENTS.help.en) || hasAny(lower, INTENTS.help.bn) || hasAny(lower, INTENTS.help.pa)) {
    return { reply: lpick(speakLang, 'help'), replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'help' }, intents: ['help'] };
  }

  // --- 4. Escalation to human expert -----------------------------------
  const escalWords = [...INTENTS.escalate.hi, ...INTENTS.escalate.hing, ...INTENTS.escalate.en, ...INTENTS.escalate.bn, ...INTENTS.escalate.pa, ...INTENTS.escalate.mr];
  if (hasAny(lower, escalWords)) {
    const category = hasAny(lower, ['lawyer', 'vakil', 'court', 'contract', 'legal', 'lease', 'वकील', 'कानून', 'कोर्ट', 'കോ'] )
      ? 'legal'
      : hasAny(lower, ['ca', 'gst', 'tax', 'audit', 'accountant', 'loan'])
        ? 'finance'
        : 'marketing';
    const priority = hasAny(lower, ['urgent', 'jaldi', 'immediately', 'सेवा']) ? 'high' : 'medium';
    const caseRecord = {
      userId: user.id, status: 'open', priority, category, language: speakLang,
      transcript: text,
      consultTitle: text.slice(0, 60),
      summary: {
        userMessage: text, topic: 'Needs human consultation', facts: [],
        recommendation: `Assigned to a vetted ${category} expert for a confirmable answer.`
      },
      expertId: null, assigned: null, createdAt: new Date().toISOString(),
      consent: !!(user.consents && user.consents.calls)
    };
    store.insert('cases', caseRecord);
    actions.push({ type: 'case', payload: caseRecord });
    toolCalls.push({ name: 'escalate', args: { caseId: caseRecord.id } });
    meta.kind = 'escalated'; meta.caseId = caseRecord.id;
    const experts = store.find('experts', (e) => e.available);
    const names = experts.slice(0, 2).map((e) => `${e.name} (${e.role})`).join(', ');
    return {
      reply: `Main yahan verified jawab nahi de sakta is liye maine turant case bana diya (${caseRecord.id}). ${names ? `Available expert: ${names}.` : ''} "Support" tab me aap progress dekh sakte ho.`,
      replyLang: speakLang, actions, toolCalls, meta, intents: ['escalate']
    };
  }

  // --- 5. Record transaction (sale/expense) -----------------------------
  const isSale = hasAny(lower, [...INTENTS.sale.hi, ...INTENTS.sale.hing, ...INTENTS.sale.en, ...INTENTS.sale.mr, ...INTENTS.sale.bn, ...INTENTS.sale.pa]);
  const isExpense = hasAny(lower, [...INTENTS.expense.hi, ...INTENTS.expense.hing, ...INTENTS.expense.en, ...INTENTS.expense.mr, ...INTENTS.expense.bn, ...INTENTS.expense.pa]);
  // Amount-less sales questions ("what were my sales last week?") belong to the
  // payments overview (§6b), not to recording — route them through.
  const isPaymentsQuery = hasAny(lower, ['last week', 'revenue', 'top products', 'payments overview', 'kitni sale hui', 'pichhle hafte']) && !parseMoney(text);
  if ((isSale || isExpense) && !isPaymentsQuery && !hasAny(lower, INTENTS.concept.hi) && !hasAny(lower, INTENTS.concept.hing) && !hasAny(lower, INTENTS.concept.en)) {
    const money = parseMoney(text);
    const type = isSale && !isExpense ? 'sale' : 'expense';
    if (!money) {
      return { reply: lfill(speakLang, 'moneyMissing', { kind: type === 'sale' ? 'sale' : 'expense' }), replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'need-amount', txType: type }, intents: [type, 'need-amount'] };
    }
    const note = text.replace(/[₹0-9,.\s]{2,}/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || (type === 'sale' ? 'Sale recorded via voice' : 'Expense recorded via voice');
    ctx.pending = { type: 'transaction', transactionType: type, amount: money.amount, note, topic: guessTopic(text) };
    const q = lfill(speakLang, 'yesWait', { pending: `${type === 'sale' ? 'sale' : 'expense'} of ₹${money.amount} (${note})` });
    return { reply: q, replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'confirm-transaction', amount: money.amount, note, txType: type }, intents: [type] };
  }

  // --- 6. Reminder -------------------------------------------------------
  if (hasAny(lower, INTENTS.reminder.hi) || hasAny(lower, INTENTS.reminder.hing) || hasAny(lower, INTENTS.reminder.en) || hasAny(lower, INTENTS.reminder.bn) || hasAny(lower, INTENTS.reminder.pa) || hasAny(lower, INTENTS.reminder.mr)) {
    const when = parseDueDate(text);
    let title = text.replace(/(remind|reminder|yaad dillao|yaad|lagao|को remind)/i, '').replace(/[.,!?]/g, '').trim().slice(0, 50);
    if (!title || title.toLowerCase().startsWith('me')) title = 'Business task';
    if (!when) {
      return { reply: 'Kis time par yaad dilana hai? Jaise "kal shaam 5 baje" batao.', replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'need-time' }, intents: ['reminder'] };
    }
    const withTime = parseTimeOfDay(text, when.due) || when.due;
    ctx.pending = { type: 'reminder', title, notes: text, due: withTime, humanDue: when.human, kind: guessTopic(text) || 'todo' };
    return { reply: lfill(speakLang, 'yesWait', { pending: `Reminder "${title}" — ${when.human}` }), replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'confirm-reminder', title, due: when.human }, intents: ['reminder'] };
  }

  // --- 6b. Integrations: calendar / email / payments ("Give it a Voice") ---
  const calWords = ['meeting', 'appointment', 'calendar', 'calender', 'schedule', 'reschedule', 'call karna hai', 'milna hai'];
  const mailWords = ['email', 'e-mail', 'mail bhejo', 'mail karo', 'mail kar'];
  const payWords = ['sales last week', 'last week sales', 'revenue', 'top products', 'payments overview', 'kitni sale hui', 'pichhle hafte'];
  if (hasAny(lower, calWords)) {
    const when = parseDueDate(text);
    const withTime = (when && (parseTimeOfDay(text, when.due) || when.due)) || null;
    let title = text.replace(/(add|book|schedule|reschedule|set|arrange|rakho|lagao|fix karo)/i, '')
      .replace(/(meeting|appointment|call|calendar|calender)/gi, '').replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60) || 'Business meeting';
    if (/^(show|list|dikhao|batao|mere|meri|this|upcoming)/i.test(title) || !withTime) {
      // List upcoming events (or explain setup).
      const r = await calendarSvc.listUpcoming(user.id, 5);
      meta.kind = 'calendar-list';
      if (!r.configured) return { reply: '📅 Google Calendar abhi connected nahi hai. Integrations page par 4 setup steps hain — connect karte hi main meetings dikha aur add kar dunga. Tab tak local reminders kaam karenge.', replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar'] };
      if (r.reason) return { reply: '📅 Calendar connect hai par list nahi la saka. Dobara connect karke try karein (Integrations page).', replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar'] };
      if (!r.events.length) return { reply: '📅 Aane wale koi meetings nahi mile. "Kal shaam 5 baje supplier se meeting" bolkar add kar sakte ho.', replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar'] };
      const lines = r.events.map((e) => `• ${e.title} — ${e.start}`).join('\n');
      return { reply: `📅 Aane wali meetings:\n${lines}`, replyLang: speakLang, actions, toolCalls, meta, intents: ['calendar'] };
    }
    ctx.pending = { type: 'calendar-event', title, notes: text, start: withTime, end: withTime, human: when.human };
    return { reply: lfill(speakLang, 'yesWait', { pending: `Meeting "${title}" — ${when.human}` }), replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'confirm-calendar', title, due: when.human }, intents: ['calendar'] };
  }
  if (hasAny(lower, mailWords)) {
    const toMatch = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
    const to = toMatch ? toMatch[0] : null;
    const subjMatch = text.match(/(?:about|regarding|subject|ke baare me|par)\s+([^.,!?]{3,80})/i);
    const subject = subjMatch ? subjMatch[1].trim() : '';
    if (!to) {
      return { reply: '📧 Email kise bhejna hai? Jaise bolo "supplier@example.com ko stock delay ke baare me email bhejo".', replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'need-email-to' }, intents: ['email'] };
    }
    if (!subject) {
      ctx.pending = { type: 'email-await-subject', to };
      return { reply: `📧 ${to} ko email — subject/body kya likhun? Poora text bolo.`, replyLang: speakLang, actions: [], toolCalls, meta: { ...meta, kind: 'need-email-body', to }, intents: ['email'] };
    }
    ctx.pending = { type: 'email', to, subject, text: subject };
    return { reply: lfill(speakLang, 'yesWait', { pending: `Email to ${to} — "${subject}"` }), replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'confirm-email', to, subject }, intents: ['email'] };
  }
  if (ctx.pending && ctx.pending.type === 'email-await-subject' && text.trim().length > 3) {
    const p = ctx.pending;
    ctx.pending = { type: 'email', to: p.to, subject: text.trim().slice(0, 80), text: text.trim() };
    return { reply: lfill(speakLang, 'yesWait', { pending: `Email to ${p.to} — "${text.trim().slice(0, 80)}"` }), replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'confirm-email', to: p.to }, intents: ['email'] };
  }
  if (hasAny(lower, payWords)) {
    const r = await stripeSvc.overview(user.id, 7);
    meta.kind = 'payments-overview';
    if (r.reason) return { reply: '💳 Payments summary abhi nahi la saka. Thodi der me try karein.', replyLang: speakLang, actions, toolCalls, meta, intents: ['payments'] };
    const tag = r.demo ? ' (demo — Stripe not configured, local ledger se)' : ' (Stripe test mode)';
    const top = (r.top || []).map((x) => `${x.note}: ₹${x.total}`).join(', ');
    return { reply: `💳 Pichhle ${r.rangeDays} din${tag}: sale ₹${r.sales}, kharch ₹${r.expenses}, net ₹${r.net}.${top ? ' Top: ' + top + '.' : ''}`, replyLang: speakLang, actions, toolCalls, meta, intents: ['payments'] };
  }

  // --- 7. Market info (verified/estimated/uncertain) ---------------------
  const marketTopic = marketData.findTopic(text);
  if (marketTopic || hasAny(lower, [...INTENTS.market.hi, ...INTENTS.market.hing, ...INTENTS.market.en])) {
    const topic = marketTopic || marketData.TOPICS[0];
    let summary = topic.summary[speakLang] || topic.summary.hing || topic.summary.en;
    if (hasAny(lower, INTENTS.concept.hi) || hasAny(lower, INTENTS.concept.hing) || hasAny(lower, INTENTS.concept.en)) {
      summary = CONCEPTS[conceptKey(text)][speakLang] || CONCEPTS[conceptKey(text)][FALLBACK_T] || CONCEPTS.default.en;
      const level = conceptKey(text) === 'default' ? 'Uncertain' : 'Estimated';
      meta.market = { topic: topic.id, label: topic.label, level, source: topic.source, disclaimer: topic.disclaimer || '' };
      actions.push({ type: 'explain', payload: { topic: topic.label, plain: summary, level } });
      return {
        reply: `${summary}\n\n📌 Confidence: ${level}\n${topic.disclaimer || 'Consult an expert before acting.'}`,
        replyLang: speakLang, actions, toolCalls, meta, intents: ['market', 'concept']
      };
    }
    meta.market = { topic: topic.id, label: topic.label, level: topic.level, source: topic.source, disclaimer: topic.disclaimer || '' };
    actions.push({ type: 'market', payload: { topic: topic.label, level: topic.level, source: topic.source, summary } });
    const badge = marketData.labelText(topic.level).en;
    return {
      reply: `${summary}\n\n🏷️ ${badge} — ${topic.source}${topic.disclaimer ? '\n⚠️ ' + topic.disclaimer : ''}`,
      replyLang: speakLang, actions, toolCalls, meta, intents: ['market']
    };
  }

  // --- 8. Concept explanation (financial literacy) ------------------------
  if (hasAny(lower, INTENTS.concept.hi) || hasAny(lower, INTENTS.concept.hing) || hasAny(lower, INTENTS.concept.en) || hasAny(lower, INTENTS.concept.mr) || hasAny(lower, INTENTS.concept.bn) || hasAny(lower, INTENTS.concept.pa)) {
    const key = conceptKey(text);
    const plain = CONCEPTS[key][speakLang] || CONCEPTS[key][FALLBACK_T] || CONCEPTS.default.en;
    actions.push({ type: 'explain', payload: { topic: key, plain, level: key === 'default' ? 'Uncertain' : 'Estimated' } });
    return { reply: `${plain}\n\n${lpick(speakLang, 'disclaimer')}`, replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'explain', concept: key }, intents: ['concept'] };
  }

  // --- 9. Content generation ----------------------------------------------
  if (hasAny(lower, INTENTS.content.hi) || hasAny(lower, INTENTS.content.hing) || hasAny(lower, INTENTS.content.en) || hasAny(lower, INTENTS.content.bn) || hasAny(lower, INTENTS.content.pa) || hasAny(lower, INTENTS.content.mr)) {
    const bizName = (user.business && user.business.name) || 'My Store';
    const set = CONTENT[CONTENT_LANG[speakLang] || 'hinglish'];
    let text = '', kind = 'promo';
    if (hasAny(lower, [...INTENTS.content.hi, ...INTENTS.content.hing, ...INTENTS.content.en].filter((w) => /whatsapp|promo|promotion|प्रोमो|प्रमोशन|offer message|ad /.test(w)))) { text = set.promo(bizName); kind = 'whatsapp-promo'; }
    else if (/caption|कैप्शन|कॅप्शन/.test(lower)) { text = set.caption(bizName); kind = 'caption'; }
    else if (/follow|फॉलोअप|follow-up/.test(lower)) {
      const customer = (store.find('contacts', (c) => c.userId === user.id)[0]) ? null : null;
      const c = store.all('contacts')[0];
      text = set.followUp(c ? c.name : 'Customer');
      kind = 'follow-up';
    } else { text = set.promo(bizName); kind = 'promo'; }
    actions.push({ type: 'content', payload: { kind, text } });
    return { reply: text, replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'content', contentKind: kind }, intents: [kind] };
  }

  // --- 10. Profile learning + fallback ------------------------------------
  const profile = user.business || {};
  const { updates, notes } = extractProfileFields(text, profile);
  if (Object.keys(updates).length) {
    const patch = {};
    for (const [k, v] of Object.entries(updates)) {
      if (k === 'products') {
        if (!patch.products) patch.products = (profile.products || []).slice();
        if (typeof v === 'string' && !patch.products.includes(v)) patch.products.push(v);
      } else { patch[k] = v; }
    }
    if (patch.notes === undefined && notes.length) {
      patch.notes = (profile.notes || []).concat(notes);
    }
    store.update('users', user.id, { business: { ...profile, ...patch } });
    actions.push({ type: 'profile', payload: updates });
    meta.profileLearned = updates;
    return { reply: lfill(speakLang, 'profileLearned', { fields: notes.join(', ') }), replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'profile-learned' }, intents: ['profile'] };
  }

  // Fallback: acknowledge uncertainty, suggest expert
  actions.push({ type: 'ai-consult', payload: { confidence: 0.15 } });
  return {
    reply: `${lpick(speakLang, 'fallback')}\n${lpick(speakLang, 'disclaimer')}`,
    replyLang: speakLang, actions, toolCalls, meta: { ...meta, kind: 'fallback', confidence: 0.15 }, intents: ['fallback']
  };
};

/* ------------------------------------------------------------------ */

const guessTopic = (text) => {
  const t = text.toLowerCase();
  if (hasAny(t, ['hamper', 'diwali', 'festive', 'gift', 'त्योहार'])) return 'festive';
  if (hasAny(t, ['party', 'snacks', 'chips'])) return 'party-supply';
  if (hasAny(t, ['stock', 'maal', 'inventory', 'order'])) return 'inventory';
  if (hasAny(t, ['bijli', 'rent', 'electricity', 'salary', 'staff'])) return 'utilities';
  return 'general';
};

/* ------------------------------------------------------------------ */

const summarizeConversation = (messages, business) => {
  const fields = { name: null, location: null, industry: null, products: null, customers: null, challenges: null, sales: null, expenses: null };
  for (const m of messages) {
    if (!m || m.role !== 'user') continue;
    const p = extractProfileFields(m.text, business).updates;
    if (p.name) fields.name = p.name;
    if (p.location) fields.location = p.location;
    if (p.products) fields.products = p.products;
    if (p.customers) fields.customers = p.customers;
  }
  return fields;
};

const generateContent = (kind, lang, bizName, customerName) => {
  const set = CONTENT[CONTENT_LANG[lang] || 'hinglish'] || CONTENT.hinglish;
  const name = bizName || 'My Store';
  switch (kind) {
    case 'whatsapp-promo':
    case 'promo':
      return { kind: 'whatsapp-promo', text: set.promo(name), lang };
    case 'caption':
      return { kind: 'caption', text: set.caption(name), lang };
    case 'follow-up':
      return { kind: 'follow-up', text: set.followUp(customerName || 'Dear Customer'), lang };
    case 'reminder':
      return { kind: 'reminder', text: set.reminderMsg('Your task'), lang };
    default:
      return { kind: 'promo', text: set.promo(name), lang };
  }
};

module.exports = { handleMessage, summarizeConversation, parseMoney, extractProfileFields, generateContent };

/* eslint-disable no-unused-vars */
const _ = { telephony }; // reserved for future voice-notification features
/* eslint-enable no-unused-vars */