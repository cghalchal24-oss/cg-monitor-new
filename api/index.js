const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');  // ← CORS जोड़ा गया

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // ← सभी Domains को Allow करता है

// ---------- 33 जिले + मुख्य विभाग + Jansampark ----------
const websites = [
  { name: 'CG Vyapam', url: 'https://cgvyapam.choice.gov.in/' },
  { name: 'CGPSC', url: 'https://psc.cg.gov.in/' },
  { name: 'High Court', url: 'https://highcourt.cg.gov.in/' },
  { name: 'CG Police', url: 'https://cgpolice.gov.in/' },
  { name: 'CG Forest', url: 'https://cgforest.gov.in/' },
  { name: 'NHM CG', url: 'https://www.nhmcg.in/' },
  { name: 'CSEB', url: 'https://cseb.gov.in/' },
  { name: 'CG Jansampark', url: 'https://jansampark.cg.gov.in/' },
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

const keywordMap = {
  '🔴 Notification': ['notice', 'notification', 'press release', 'circular'],
  '🟢 Admit Card': ['admit card', 'hall ticket', 'call letter'],
  '🔵 Result': ['result', 'score', 'marks', 'rank'],
  '🟡 Answer Key': ['answer key', 'solution', 'response sheet'],
  '🟣 Merit List': ['merit list', 'selected candidate', 'final list'],
  '⚫ Tender': ['tender', 'bid', 'quotation', 'contract'],
  '🟠 Recruitment': ['recruitment', 'vacancy', 'apply', 'application', 'career']
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

async function scrapeWebsite(site) {
  try {
    const { data } = await axios.get(site.url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    const $ = cheerio.load(data);
    const updateLinks = [];
    $('a').each((i, el) => {
      const href = $(el).attr('href');
      const text = $(el).text().trim();
      if (href && text && text.length > 3) {
        const lower = text.toLowerCase();
        if (lower.includes('pdf') || lower.includes('notice') || lower.includes('result') ||
            lower.includes('recruitment') || lower.includes('tender') || lower.includes('admit') ||
            lower.includes('answer') || lower.includes('merit') || lower.includes('vacancy')) {
          let fullUrl = href;
          if (!href.startsWith('http')) {
            fullUrl = site.url.endsWith('/') ? site.url + href : site.url + '/' + href;
          }
          updateLinks.push({ href: fullUrl, text: text.substring(0, 80) });
        }
      }
    });

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
    return { updates: [], pdfs: [] };
  }
}

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
  history.unshift({
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    desc: `✅ Scanned ${websites.length} websites, ${allUpdates.length} updates`,
    type: 'scan'
  });

  return {
    updates: allUpdates,
    pdfs: allPdfs,
    history: history.slice(0, 15),
    totalSites: websites.length
  };
}

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
