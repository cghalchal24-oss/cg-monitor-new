const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ---------- 📌 सभी Websites (अब Court Sites भी जोड़ दी गई हैं) ----------
const websites = [
  // मुख्य विभाग
  { name: 'CG Vyapam', url: 'https://cgvyapam.choice.gov.in/' },
  { name: 'CGPSC', url: 'https://psc.cg.gov.in/' },
  { name: 'High Court', url: 'https://highcourt.cg.gov.in/' },
  { name: 'CG Police', url: 'https://cgpolice.gov.in/' },
  { name: 'CG Forest', url: 'https://cgforest.gov.in/' },
  { name: 'NHM CG', url: 'https://www.nhmcg.in/' },
  { name: 'CSEB', url: 'https://cseb.gov.in/' },
  { name: 'CG Jansampark', url: 'https://jansampark.cg.gov.in/' },
  { name: 'CGSSB', url: 'https://cgssb.cgstate.gov.in/' },
  { name: 'Edu Portal', url: 'https://eduportal.cg.nic.in/' },
  
  // ---------- जिला न्यायालय (District Courts) ----------
  { name: 'Balrampur Court', url: 'https://balrampur.dcourts.gov.in/' },
  { name: 'Bilaspur Court', url: 'https://bilaspur.dcourts.gov.in/' },
  { name: 'Raipur Court', url: 'https://raipur.dcourts.gov.in/' },
  { name: 'Durg Court', url: 'https://durg.dcourts.gov.in/' },
  { name: 'Bastar Court', url: 'https://bastar.dcourts.gov.in/' },
  // और भी Courts जोड़ सकते हैं – pattern: https://<district>.dcourts.gov.in/

  // 33 जिले (जिला मुख्यालय)
  ...['balod','balodabazar','balrampur','bastar','bemetara','bijapur','bilaspur',
    'dantewada','dhamtari','durg','gariaband','janjgir-champa','jashpur','kawardha',
    'kanker','kondagaon','korba','korea','mahasamund','mungeli','narayanpur',
    'raigarh','raipur','rajnandgaon','sukma','surajpur','surguja',
    'gaurela-pendra-marwahi','manendragarh-chirmiri-bharatpur',
    'mohla-manpur-ambagarhchowki','sarangarh-bilaigarh','sakti'
  ].map(d => ({
    name: d.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('-'),
    url: `https://${d}.gov.in/`
  }))
];

// ---------- 🔑 और भी Keywords (Hindi + English) ----------
const keywordMap = {
  '🔴 Notification': [
    'notice', 'notification', 'press release', 'circular', 'सूचना', 'अधिसूचना',
    'विज्ञापन', 'advertisement', 'publication', 'प्रकाशन', 'नोटिस'
  ],
  '🟢 Admit Card': [
    'admit card', 'hall ticket', 'call letter', 'प्रवेश पत्र', 'एडमिट कार्ड'
  ],
  '🔵 Result': [
    'result', 'score', 'marks', 'rank', 'परिणाम', 'अंक', 'रिजल्ट'
  ],
  '🟡 Answer Key': [
    'answer key', 'solution', 'response sheet', 'उत्तर कुंजी', 'आंसर की'
  ],
  '🟣 Merit List': [
    'merit list', 'selected candidate', 'final list', 'मेरिट सूची', 'चयन सूची'
  ],
  '⚫ Tender': [
    'tender', 'bid', 'quotation', 'contract', 'निविदा', 'टेंडर'
  ],
  '🟠 Recruitment': [
    'recruitment', 'vacancy', 'apply', 'application', 'career',
    'भर्ती', 'रिक्ति', 'परीक्षा कार्यक्रम',
    'special educator', 'PM Shri', 'योजना', 'आवेदन', 'अस्थायी', 'temporary',
    'direct recruitment', 'सीधी भर्ती', 'court', 'न्यायालय', 'जिला', 'अधिवक्ता',
    'अधीनस्थ', 'न्यायिक', 'कर्मचारी', 'पद', 'पोस्ट'
  ]
};

function detectType(title, text) {
  const combined = (title + ' ' + text).toLowerCase();
  for (const [type, keywords] of Object.entries(keywordMap)) {
    for (const kw of keywords) {
      if (combined.includes(kw)) return type;
    }
  }
  return '🔴 Notification';
}

// ---------- 📅 Date Extract ----------
function extractDate(text) {
  const patterns = [
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
    /(\d{2})[-\/](\d{2})[-\/](\d{4})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }
  return null;
}

// ---------- 🔥 अल्टीमेट स्मार्ट स्क्रैपर ----------
async function scrapeWebsite(site) {
  try {
    console.log(`🔍 Scanning: ${site.name} (${site.url})`);
    const { data } = await axios.get(site.url, {
      timeout: 12000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const updates = [];
    const pdfs = [];

    // 1. Specific classes जो अक्सर Updates में होते हैं
    const selectors = [
      'div', 'li', 'p', 'table', 'tr', 'td', 'section', 'article',
      '.notice', '.news', '.notification', '.announcement', '.recruitment',
      '.advertisement', '.alert', '.update', '.latest', '.important',
      '.tender', '.result', '.admit', '.merit', '.answer'
    ];
    $('body').find(selectors.join(',')).each((i, el) => {
      const text = $(el).text().trim();
      if (!text || text.length < 10 || text.length > 800) return;
      
      const lower = text.toLowerCase();
      let isUpdate = false;
      for (const [type, keywords] of Object.entries(keywordMap)) {
        for (const kw of keywords) {
          if (lower.includes(kw)) { isUpdate = true; break; }
        }
        if (isUpdate) break;
      }
      if (!isUpdate) return;

      // PDF Link ढूँढें
      const pdfLink = $(el).find('a[href*=".pdf"]').first();
      let pdfHref = pdfLink.attr('href') || null;
      if (pdfHref && !pdfHref.startsWith('http')) {
        pdfHref = site.url.endsWith('/') ? site.url + pdfHref : site.url + '/' + pdfHref;
      }

      // Page URL (Visit Link)
      const pageUrl = site.url;

      // Date Extract
      const date = extractDate(text);

      // Type Detect
      const type = detectType(text, text);
      const icon = type.split(' ')[0];

      const title = text.substring(0, 180).trim();

      updates.push({
        dept: site.name,
        icon: icon || '📄',
        title: title,
        time: date ? `${date}` : 'just now',
        type: type,
        pdf: pdfHref,
        link: pageUrl   // ✅ Visit Link (Page URL)
      });

      if (pdfHref) {
        const filename = pdfHref.split('/').pop() || 'document.pdf';
        pdfs.push({ filename, status: 'Detected', url: pdfHref });
      }
    });

    // Limit
    const uniqueUpdates = updates.slice(0, 10);
    const uniquePdfs = pdfs.slice(0, 8);

    return { updates: uniqueUpdates, pdfs: uniquePdfs };
  } catch (err) {
    console.error(`❌ ${site.name} error:`, err.message);
    return { updates: [], pdfs: [] };
  }
}

// ---------- सभी साइटों को Scan करें ----------
async function scrapeAll() {
  const results = await Promise.all(websites.map(site => scrapeWebsite(site)));
  let allUpdates = [], allPdfs = [], history = [];

  results.forEach((result, index) => {
    if (result.updates.length > 0) {
      allUpdates = allUpdates.concat(result.updates);
      history.push({
        time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        desc: `${websites[index].name}: ${result.updates.length} update(s)`,
        type: 'scan'
      });
    }
    if (result.pdfs.length > 0) {
      allPdfs = allPdfs.concat(result.pdfs);
    }
  });

  allUpdates = allUpdates.slice(0, 35);
  allPdfs = allPdfs.slice(0, 20);
  
  history.unshift({
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    desc: `✅ Scanned ${websites.length} websites, ${allUpdates.length} updates found`,
    type: 'scan'
  });

  return {
    updates: allUpdates,
    pdfs: allPdfs,
    history: history.slice(0, 15),
    totalSites: websites.length
  };
}

// ---------- CACHE ----------
let cache = { data: null, timestamp: null };

app.get('/api/updates', async (req, res) => {
  const now = Date.now();
  if (!cache.timestamp || (now - cache.timestamp) > 180000) {
    try {
      const result = await scrapeAll();
      cache.data = result;
      cache.timestamp = now;
    } catch (err) {
      console.error('Scraping error:', err);
      if (cache.data) return res.json(cache.data);
      return res.json({
        updates: [],
        pdfs: [],
        history: [{ time: 'now', desc: 'Error fetching updates', type: 'error' }],
        totalSites: websites.length
      });
    }
  }
  res.json(cache.data);
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    const response = await axios({
      method: 'get',
      url: url,
      responseType: 'stream',
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });
    const filename = url.split('/').pop() || 'document.pdf';
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.data.pipe(res);
  } catch (err) {
    res.status(500).json({ error: 'Download failed' });
  }
});

app.get('/', (req, res) => {
  res.send('✅ CG Smart Monitor API is running');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
