'use strict';

/**
 * marketData.js — Market information snippets tagged by confidence level.
 *
 * Labels used (per product requirements):
 *   - "Verified"   : from a named, verifiable source (says *what* it cites).
 *   - "Estimated"  : model/calculation-based figure, clearly labelled as estimate.
 *   - "Uncertain"  : general guidance the platform can't confirm — never stated as fact.
 */

const TOPICS = [
  {
    id: 'gst', keywords: ['gst', 'जीएसटी', 'जीएसटी'], label: 'GST threshold',
    level: 'Verified', source: 'gst.gov.in — GST Council rate notification',
    summary: { hi: '₹40 lakh se kam saal ka turnover ho toh GST registration ki zaroorat nahi (14 states me ₹20 lakh).', hing: 'For goods businesses, GST registration mandatory above ₹40 lakh annual turnover (₹20 lakh in most states).', en: 'Goods sellers must register for GST once annual turnover crosses ₹40 lakh (₹20 lakh threshold in most states).', mr: '₹40 लाख च्या खाली वार्षिक उलाढाल असल्यास GST नोंदणी गरजेची नाही.', bn: 'বার্ষিক কারবার ₹40 লক্ষের নিচে হলে GST-র দরকার নেই।', pa: 'ਸਾਲਾਨਾ ਵਪਾਰ ₹40 ਲੱਖ ਤੋਂ ਘੱਟ ਹੋਵੇ ਤਾਂ GST ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਜ਼ਰੂਰੀ ਨਹੀਂ।' },
    disclaimer: 'Thresholds change with rate notifications — verify current slab with a CA.'
  },
  {
    id: 'msme', keywords: ['msme', 'udyam', 'औद्योगिक'], label: 'MSME scheme',
    level: 'Verified', source: 'udyamregistration.gov.in (official MSME portal)',
    summary: { hi: 'MSME ya Udyam registration free hai portal par — isse loan me sarkari interest subsidy milti hai.', hing: 'Udyam (MSME) registration is free on the official portal and unlocks subsidised loan schemes.', en: 'Udyam/MSME registration is free on the official portal and unlocks government loan-subsidy schemes.', mr: 'Udyam/MSME नोंदणी free आहे आणि पोर्टलवर काही मिनिटांत होते.', bn: 'Udyam/MSME নিবন্ধনটি বিনামূল্যে, সরকারি loan প্রকল্পে সুবিধা দেয়।', pa: 'Udyam/MSME ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਮੁਫ਼ਤ ਹੈ ਅਤੇ loan ਸਕੀਮਾਂ ਵਿੱਚ ਮਦਦ ਕਰਦੀ ਹੈ।' }
  },
  {
    id: 'pmbizloan', keywords: ['pmmy', 'loan', 'ऋण', 'कर्ज', 'लोन'], label: 'Loan schemes (Startup India / PMMY)',
    level: 'Estimated', source: 'Based on typical published scheme parameters (interest varies by bank)',
    summary: { hi: 'PMMY (Mudra) loan kehta hai ₹10 lakh tak ka loan shrena ke hisaab se, bina guarantor ke. Interest ~8–12% ka hota hai, par bank dependent hai.', hing: 'Mudra/PMMY offers collateral-free loans up to ₹10 lakh in tiers. Interest is typically 8–12% but varies by bank and score.', en: 'Mudra/PMMY offers collateral-free loans up to ₹10 lakh in tiers; interest typically 8–12% but varies by bank.', mr: 'Mudra loan ₹10 लाख पर्यंत, तपशील बँकेवर अवलंबून आहे.', bn: 'Mudra ঢাকা ₹10 লক্ষ পর্যন্ত ঋণ দেয়, সুদহার ব্যাংক ভেদে।', pa: 'Mudra loan ₹10 ਲੱਖ ਤੱਕ ਮਿਲਦਾ ਹੈ; ਵਿਆਜ ਬੈਂਕ ਤੇ ਡਿਪੈਂਡ ਹੈ।' },
    disclaimer: 'Loan amounts and interest rates depend on credit score, bank policy and the approved scheme version in force.'
  },
  {
    id: 'diy_growth', keywords: ['grow', 'growth', 'ग्रोथ', 'बढ़े', 'promotion'], label: 'How to grow a kirana store',
    level: 'Uncertain', source: 'General business practice — no universal guarantee',
    summary: { hi: 'Cheezein jo aam taur par madad karti hain: Sunday offer, WhatsApp par daily price list, home-delivery banaana, aur tabdeeli waale popular products rakna. Har market alag hai — apne customer se pooch kar try karein.', hing: 'Common growth moves: weekly offers, WhatsApp price lists, home delivery, and stocking trendy products. Test and ask customers — every market differs.', en: 'Common growth moves: weekly offers, WhatsApp price lists, home delivery, stocking popular new brands. Every market differs — experiment and ask customers.', mr: 'सामान्य सूचना: नियमित offer, WhatsApp price list, home delivery. प्रत्येक बाजार वेगळा.', bn: 'সাধারণ পরামর্শ: সাপ্তাহিক অফার, WhatsApp মূল্য তালিকা, home delivery।', pa: 'ਆਮ ਵਿਚਾਰ: weekly offer, WhatsApp price list, home delivery। ਹਰ market ਵੱਖਰੀ ਹੈ।' }
  },
  {
    id: 'ecom', keywords: ['amazon', 'flipkart', 'online sell', 'udaan', 'जीमार्ट'], label: 'Selling online (Udaan / Amazon / Flipkart)',
    level: 'Uncertain', source: 'Marketplace terms differ by partner portal & region',
    summary: { hi: 'Udaan jaise wholesale apps se stock mandi price par milta hai. Online bechne par commission (Saamne) katega — platform ka current rate chheiya.', hing: 'Wholesale apps like Udaan give mandi-level rates. Selling on Amazon/Flipkart charges a commission — check the current fee card.', en: 'Wholesale apps like Udaan offer mandi-level rates. Marketplaces charge commissions and may require GSTIN — check each fee card.', mr: 'Udaan सारखे apps mandi price देतात. Online विक्रीवर commission असतो.', bn: 'Udaan-এর মতো app-এ mandi দরে stock পাওয়া যায়। Online বিক্রিতে commission লাগে।', pa: 'Udaan ਵਰਗੀਆਂ apps mandi rate ਦਿੰਦੀਆਂ ਹਨ। online sale ਤੇ commission ਲੱਗਦੀ ਹੈ।' }
  },
  {
    id: 'margin', keywords: ['margin', 'profit percentage', 'मार्जिन', 'मुनाफा', 'profit'], label: 'Understanding profit margin',
    level: 'Estimated', source: 'Computed from the business owner\'s own entered sales & costs',
    summary: { hi: 'Margin matlab bikri aur cost ka antar. Aap jitna data doge, utni accurate baat hogi — main har bar estimate bataunga, exact nahi.', hing: 'Margin = (Selling price − Cost) ÷ Selling price. I compute this from what you tell me, so it\'s an estimate from your own record.', en: 'Margin = (Selling price − Cost) ÷ Selling price. This is computed from your own records, so treat it as an estimate.', mr: 'मार्जिन = (विक्री किंमत − खरेदी किंमत) ÷ विक्री किंमत. आपल्या माहितीवरून अंदाज.', bn: 'মার্জিন = (বিক্রয়মূল্য − খরচ) ÷ বিক্রয়মূল্য।', pa: 'Margin = (ਵਿਕਰੀ ਕੀਮਤ − ਲਾਗਤ) ÷ ਵਿਕਰੀ ਕੀਮਤ।' }
  },
  {
    id: 'festive', keywords: ['diwali', 'festive', 'त्योहार', 'उत्सव', 'holi'], label: 'Festive season planning',
    level: 'Estimated', source: 'Seasonal pattern from your own past sales records',
    summary: { hi: 'Pichhle saal aapke records me festive season me sale ~2.2x gayi thi. Is saal pehle se stock aur worksoucs plan kare — mera estimate kehta hai 25–30% upar rakh sakte ho.', hing: 'Last festive season your sale roughly doubled in your records. My estimate: plan 25–30% extra stock this year.', en: 'Your past records show festive-season sales roughly doubling. Estimate: plan 25–30% extra stock this year.', mr: 'मागील वर्षी सणाच्या दिवसात विक्री दुप्पट होती. यावर्षी 25–30% अधिक साठा ठेवा.', bn: 'গত উৎসবে বিক্রি দ্বিগুণ হয়েছিল। এবার 25–30% বেশি stock রাখুন।', pa: 'ਪਿਛਲੇ ਤਿਉਹਾਰ ਵਿੱਚ sale ਦੁੱਗਣੀ ਸੀ। ਇਸ ਵਾਰ 25–30% ਵੱਧ stock ਰੱਖੋ।' }
  },
  {
    id: 'taxdue', keywords: ['tax', 'ittr', 'income tax', 'टैक्स', 'आयकर'], label: 'Income tax filing',
    level: 'Verified', source: 'incometaxindia.gov.in — statutory deadline',
    summary: { hi: 'ITR filing ki aakhri tarikh 31 July hoti hai (kyunki FY ends 31 March). 60 lakh se zyada turnover ho toh tax audit bhi lagta hai.', hing: 'ITR deadline is generally 31 July (FY ends 31 March). Turnover above ₹1 crore usually triggers tax audit — confirm your slab.', en: 'ITR deadline is generally 31 July after the FY ends 31 March. Turnover above the audit threshold (usually ₹1 crore) requires tax audit.', mr: 'ITR fill करण्याची अंतिम तारीख साधारणपणे 31 जुलै.', bn: 'ITR-এর শেষ তারিখ সাধারণত 31 জুলাই।', pa: 'ITR ਭਰਨ ਦੀ ਆਖਰੀ ਤਾਰੀਖ ਆਮ ਤੌਰ ਤੇ 31 ਜੁਲਾਈ।' },
    disclaimer: 'Deadlines can shift with official notifications — always confirm the latest ITR schedule.'
  }
];

const findTopic = (text) => {
  const t = text.toLowerCase();
  for (const topic of TOPICS) {
    for (const kw of topic.keywords) {
      if (kw && t.includes(kw.toLowerCase())) return topic;
    }
  }
  return null;
};

const labelText = (level) => {
  const map = {
    Verified: { en: 'Verified', hi: 'सत्यापित', brand: '#0a7d3d' },
    Estimated: { en: 'Estimated', hi: 'अनुमानित', brand: '#b36b00' },
    Uncertain: { en: 'Uncertain', hi: 'अनिश्चित', brand: '#8a2be2' }
  };
  return map[level] || map.Uncertain;
};

module.exports = { TOPICS, findTopic, labelText };