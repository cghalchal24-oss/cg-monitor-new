const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

// ---------- 📌 Websites ----------
const websites = [
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
  { name: 'Balrampur Court', url: 'https://balrampur.dcourts.gov.in/' },
  { name: 'Bilaspur Court', url: 'https://bilaspur.dcourts.gov.in/' },
  { name: 'Raipur Court', url: 'https://raipur.dcourts.gov.in/' },
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

// ---------- 🔑 Keywords ----------
const keywordMap = {
  '🔴 Notification': [
    'notice','notification','press release','circular','सूचना','अधिसूचना',
    'विज्ञापन','advertisement','publication','प्रकाशन','नोटिस','आदेश','order'
  ],
  '🟢 Admit Card': [
    'admit card','hall ticket','call letter','प्रवेश पत्र','एडमिट कार्ड'
  ],
  '🔵 Result': [
    'result','score','marks','rank','परिणाम','अंक','रिजल्ट'
  ],
  '🟡 Answer Key': [
    'answer key','solution','response sheet','उत्तर कुंजी','आंसर की'
  ],
  '🟣 Merit List': [
    'merit list','selected candidate','final list','मेरिट सूची','चयन सूची'
  ],
  '⚫ Tender': [
    'tender','bid','quotation','contract','निविदा','टेंडर'
  ],
  '🟠 Recruitment': [
    'recruitment','vacancy','apply','application','career','भर्ती','रिक्ति',
    'परीक्षा कार्यक्रम','special educator','PM Shri','योजना','आवेदन','अस्थायी',
    'temporary','direct recruitment','सीधी भर्ती','court','न्यायालय','जिला',
    'अधिवक्ता','अधीनस्थ','न्यायिक','कर्मचारी','पद','पोस्ट','नियुक्ति','appointment',
    'परीक्षा','exam','test','interview','साक्षात्कार','अंकसूची'
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

// ---------- 📅 Date Extraction ----------
function extractDate(text) {
  const lowerText = text.toLowerCase();
  if (lowerText.includes('today') || lowerText.includes('आज')) return new Date();
  if (lowerText.includes('yesterday') || lowerText.includes('कल')) {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  }
  const patterns = [
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})/,
    /(\d{1,2})[-\/](\d{1,2})[-\/](\d{2})/,
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
    /(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})/i,
    /(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})/i,
    /(\d{2})[-\/](\d{2})[-\/](\d{4})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let day, month, year;
      if (pattern.source.includes('Month') || pattern.source.includes('Mon')) {
        const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
        const monthAbbr = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let monthStr = match[2];
        day = parseInt(match[1]);
        year = parseInt(match[3]);
        if (monthStr.length <= 3) month = monthAbbr.indexOf(monthStr) + 1;
        else month = monthNames.indexOf(monthStr) + 1;
        if (month === 0) continue;
      } else if (match.length === 4) {
        if (match[1].length === 4) {
          year = parseInt(match[1]);
          month = parseInt(match[2]);
          day = parseInt(match[3]);
        } else {
          day = parseInt(match[1]);
          month = parseInt(match[2]);
          year = parseInt(match[3]);
          if (year < 100) year += 2000;
        }
      }
      if (day && month && year) {
        return new Date(year, month - 1, day);
      }
    }
  }
  return null;
}

function timeAgo(date) {
  if (!date) return 'Just now';
  const now = new Date();
  const diff = now - date;
  if (diff < 0) return 'Just now';
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) {
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    return `${Math.floor(days / 7)} weeks ago`;
  }
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  if (minutes > 0) return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  return 'Just now';
}

function isRecentDate(date) {
  if (!date) return true; // if no date, keep it (will show "Just now")
  const now = new Date();
  const diffInHours = (now - date) / (1000 * 60 * 60);
  return diffInHours <= 12; // 12 hours filter
}

// ---------- 🔍 PDF URL से Year/Month Extract करें ----------
function extractYearMonthFromUrl(url) {
  const match = url.match(/\/uploads\/(\d{4})\/(\d{1,2})\//);
  if (match) {
    const year = parseInt(match[1]);
    const month = parseInt(match[2]);
    return { year, month };
  }
  return null;
}

// ---------- ✅ Check if PDF is recent (based on URL year/month) ----------
function isRecentPdfByUrl(url) {
  const ym = extractYearMonthFromUrl(url);
  if (!ym) return true; // No date in URL – keep it (fallback)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1-12

  // Allow current year and previous 2 months
  if (ym.year === currentYear) {
    // if month is within current month or previous 2 months
    const monthDiff = currentMonth - ym.month;
    if (monthDiff >= 0 && monthDiff <= 2) return true;
  } else if (ym.year === currentYear - 1) {
    // If year is previous year, allow only if month is near Dec? Actually we want last 2 months only
    // But to keep it simple, allow if year is current year or previous year and month is in last 2 months overall.
    // Better: calculate total month difference.
    const totalMonths = (currentYear - ym.year) * 12 + (currentMonth - ym.month);
    if (totalMonths >= 0 && totalMonths <= 2) return true;
  }
  return false; // older than 2 months
}

// ---------- 🎯 Scan Single Page ----------
async function extractUpdatesFromPage(pageUrl, siteName) {
  try {
    const { data } = await axios.get(pageUrl, { timeout: 8000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    const $ = cheerio.load(data);
    const updates = [];
    const pdfs = [];

    const selectors = [
      'div','li','p','table','tr','td','section','article',
      '.notice','.news','.notification','.announcement','.recruitment',
      '.advertisement','.alert','.update','.latest','.important',
      '.tender','.result','.admit','.merit','.answer','.content'
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

      // PDF Link
      const pdfLink = $(el).find('a[href*=".pdf"]').first();
      let pdfHref = pdfLink.attr('href') || null;
      if (pdfHref && !pdfHref.startsWith('http')) {
        pdfHref = pageUrl.endsWith('/') ? pageUrl + pdfHref : pageUrl + '/' + pdfHref;
      }

      // 🆕 PDF URL Year/Month Filter
      if (pdfHref && !isRecentPdfByUrl(pdfHref)) {
        return; // Skip if PDF is older than 2 months based on URL
      }

      const pageLink = pageUrl;
      const dateObj = extractDate(text);
      if (!isRecentDate(dateObj)) return; // Skip if text date is older than 12 hours (optional)

      const timeStr = dateObj ? timeAgo(dateObj) : 'Just now';
      const type = detectType(text, text);
      const icon = type.split(' ')[0];
      const title = text.substring(0, 180).trim();

      updates.push({
        dept: siteName,
        icon: icon || '📄',
        title: title,
        time: timeStr,
        type: type,
        pdf: pdfHref,
        link: pageLink
      });

      if (pdfHref) {
        const filename = pdfHref.split('/').pop() || 'document.pdf';
        pdfs.push({ filename, status: 'Detected', url: pdfHref });
      }
    });

    return { updates: updates.slice(0, 15), pdfs: pdfs.slice(0, 10) };
  } catch (err) {
    return { updates: [], pdfs: [] };
  }
}

// ---------- 🔥 Smart Scraper – 6 Paths ----------
async function scrapeWebsite(site) {
  console.log(`🔍 Scanning: ${site.name} (${site.url})`);
  let allUpdates = [], allPdfs = [];

  const homeResult = await extractUpdatesFromPage(site.url, site.name);
  allUpdates = allUpdates.concat(homeResult.updates);
  allPdfs = allPdfs.concat(homeResult.pdfs);

  const commonPaths = ['notice', 'recruitment', 'admit-card', 'answer-key', 'merit-list', 'vacancy'];
  for (const path of commonPaths) {
    const pageUrl = site.url.endsWith('/') ? site.url + path : site.url + '/' + path;
    try {
      const result = await extractUpdatesFromPage(pageUrl, site.name);
      if (result.updates.length > 0) {
        allUpdates = allUpdates.concat(result.updates);
        allPdfs = allPdfs.concat(result.pdfs);
        console.log(`  ✅ ${site.name} → /${path}: ${result.updates.length} updates (recent)`);
      }
    } catch {}
  }

  // Remove duplicates
  const seen = new Set();
  const uniqueUpdates = allUpdates.filter(u => {
    const key = u.title.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { updates: uniqueUpdates.slice(0, 20), pdfs: allPdfs.slice(0, 15) };
}

// ---------- 🌐 Scan All ----------
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

  allUpdates = allUpdates.slice(0, 50);
  allPdfs = allPdfs.slice(0, 30);
  history.unshift({
    time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    desc: `✅ Scanned ${websites.length} websites, ${allUpdates.length} updates (filtered)`,
    type: 'scan'
  });

  return { updates: allUpdates, pdfs: allPdfs, history: history.slice(0, 20), totalSites: websites.length };
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
      return res.json({ updates: [], pdfs: [], history: [{ time: 'now', desc: 'Error', type: 'error' }], totalSites: websites.length });
    }
  }
  res.json(cache.data);
});

app.get('/api/download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'URL required' });
  try {
    // Check if PDF exists
    const headRes = await axios.head(url, { timeout: 5000 });
    if (headRes.status !== 200) {
      return res.status(404).json({ error: 'PDF not found on server' });
    }
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
    if (err.response && err.response.status === 404) {
      res.status(404).json({ error: 'PDF not found on server' });
    } else {
      res.status(500).json({ error: 'Download failed' });
    }
  }
});

app.get('/', (req, res) => {
  res.send('✅ CG Smart Monitor API is running');
});

app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
