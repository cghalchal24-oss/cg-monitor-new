const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ---------- 📌 42 साइटें (33 जिले + 9 विभाग + 2 नई) ----------
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
  { name: 'CGSSB', url: 'https://cgssb.cgstate.gov.in/' },          // ✅ नई
  { name: 'Edu Portal', url: 'https://eduportal.cg.nic.in/' },       // ✅ नई
  // 33 जिले
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

// ---------- 🔑 More Keywords (Hindi + English) ----------
const keywordMap = {
  '🔴 Notification': ['notice', 'notification', 'press release', 'circular', 'सूचना', 'अधिसूचना', 'अंतिम सूची'],
  '🟢 Admit Card': ['admit card', 'hall ticket', 'call letter', 'प्रवेश पत्र', 'एडमिट कार्ड'],
  '🔵 Result': ['result', 'score', 'marks', 'rank', 'परिणाम', 'अंक', 'रिजल्ट'],
  '🟡 Answer Key': ['answer key', 'solution', 'response sheet', 'उत्तर कुंजी', 'आंसर की'],
  '🟣 Merit List': ['merit list', 'selected candidate', 'final list', 'मेरिट सूची', 'चयन सूची'],
  '⚫ Tender': ['tender', 'bid', 'quotation', 'contract', 'निविदा', 'टेंडर'],
  '🟠 Recruitment': ['recruitment', 'vacancy', 'apply', 'application', 'career', 'भर्ती', 'रिक्ति', 'परीक्षा कार्यक्रम']
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

// ---------- 📅 Date Filter – सिर्फ आज/कल के Updates ----------
function isRecentDate(text) {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const datePatterns = [
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2,4})/,  // DD-MM-YYYY, DD/MM/YYYY
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,    // YYYY-MM-DD, YYYY/MM/DD
    /_(\d{4})/,                                // _2026
    /_(\d{2})_(\d{2})_(\d{4})/                 // _25_07_2026
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      let year, month, day;
      if (match[0].startsWith('_')) {
        // _2026 या _25_07_2026
        if (match.length === 2) {
          year = parseInt(match[1]);
          month = 1;
          day = 1;
        } else if (match.length === 4) {
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
        }
      } else if (match[1].length === 4) {
        // YYYY-MM-DD
        year = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        day = parseInt(match[3]);
      } else {
        // DD-MM-YYYY
        day = parseInt(match[1]);
        month = parseInt(match[2]) - 1;
        year = parseInt(match[3]);
        if (year < 100) year += 2000;
      }
      const date = new Date(year, month, day);
      if (date >= yesterday && date <= today) {
        return true;
      }
    }
  }
  return false;
}

// ---------- 📄 PDF-only Mode + Smart Scraper ----------
async function scrapeWebsite(site) {
  try {
    const { data } = await axios.get(site.url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const updateLinks = [];

    // सिर्फ PDF Links खोजें (PDF-only Mode)
    $('a[href*=".pdf"]').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && text.length > 3) {
        let fullUrl = href;
        if (!href.startsWith('http')) {
          fullUrl = site.url.endsWith('/') ? site.url + href : site.url + '/' + href;
        }
        // Date Filter: सिर्फ आज/कल के PDF
        if (isRecentDate(text) || isRecentDate(href)) {
          updateLinks.push({ href: fullUrl, text: text.substring(0, 100) });
        }
      }
    });

    // अगर कोई PDF न मिले, तो Text-based Search (लेकिन फिर भी Date Filter के साथ)
    if (updateLinks.length === 0) {
      $('a, div, span, p, h1, h2, h3, h4').each((i, el) => {
        const text = $(el).text().trim();
        if (text && text.length > 5 && text.length < 200) {
          const lower = text.toLowerCase();
          // Keywords check
          let isUpdate = false;
          for (const [type, keywords] of Object.entries(keywordMap)) {
            for (const kw of keywords) {
              if (lower.includes(kw)) isUpdate = true;
            }
          }
          if (isUpdate && isRecentDate(text)) {
            const href = $(el).find('a').attr('href') || site.url;
            let fullUrl = href;
            if (!href.startsWith('http')) {
              fullUrl = site.url.endsWith('/') ? site.url + href : site.url + '/' + href;
            }
            updateLinks.push({ href: fullUrl, text: text.substring(0, 100) });
          }
        }
      });
    }

    // Updates बनाएँ
    const updates = updateLinks.slice(0, 5).map(link => {
      const type = detectType(link.text, link.text);
      const icon = type.split(' ')[0];
      return {
        dept: site.name,
        icon: icon || '📄',
        title: link.text || 'New Update',
        time: 'just now',
        type: type,
        pdf: link.href.includes('.pdf') ? link.href : null
      };
    });

    // PDFs
    const pdfs = updateLinks
      .filter(l => l.href.includes('.pdf'))
      .slice(0, 3)
      .map(l => ({
        filename: l.href.split('/').pop() || 'document.pdf',
        status: 'Detected',
        url: l.href
      }));

    return { updates, pdfs };
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

  allUpdates = allUpdates.slice(0, 30);
  allPdfs = allPdfs.slice(0, 15);
  
  // अगर कोई Update न मिले तो खाली दिखाएँ (Demo Update नहीं)
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
