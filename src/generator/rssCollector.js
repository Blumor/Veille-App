import Parser from 'rss-parser';

const parser = new Parser({
  timeout: 10000,
  headers: { 'User-Agent': 'VeilleCyber/1.0' },
  customFields: { item: ['description', 'content:encoded'] },
});

// Sources gratuites, fiables, à large couverture mondiale de la cybersécurité.
// Promise.allSettled tolère les flux temporairement indisponibles.
const FEEDS = [
  // --- Presse & actualité cyber (international) ---
  { url: 'https://feeds.feedburner.com/TheHackersNews',         label: 'The Hacker News'   },
  { url: 'https://www.bleepingcomputer.com/feed/',              label: 'BleepingComputer'  },
  { url: 'https://www.securityweek.com/feed/',                  label: 'SecurityWeek'      },
  { url: 'https://krebsonsecurity.com/feed/',                   label: 'Krebs on Security' },
  { url: 'https://www.darkreading.com/rss.xml',                 label: 'Dark Reading'      },
  { url: 'https://therecord.media/feed/',                       label: 'The Record'        },
  { url: 'https://www.helpnetsecurity.com/feed/',               label: 'Help Net Security' },
  { url: 'https://www.infosecurity-magazine.com/rss/news/',     label: 'Infosecurity Mag'  },
  { url: 'https://securityaffairs.com/feed',                    label: 'Security Affairs'  },
  { url: 'https://gbhackers.com/feed/',                         label: 'GBHackers'         },
  { url: 'https://www.theregister.com/security/headlines.atom', label: 'The Register'      },
  { url: 'https://cyberscoop.com/feed/',                        label: 'CyberScoop'        },

  // --- Presse cyber francophone ---
  { url: 'https://www.zataz.com/feed/',                         label: 'Zataz'             },
  { url: 'https://cyberattaque.org/feed/',                      label: 'Cyberattaque.org'  },
  { url: 'https://www.numerama.com/cyberguerre/feed/',          label: 'Numerama'          },
  { url: 'https://www.it-connect.fr/feed/',                     label: 'IT-Connect'        },
  { url: 'https://www.undernews.fr/feed',                       label: 'UnderNews'         },
  { url: 'https://www.silicon.fr/feed',                         label: 'Silicon.fr'        },
  { url: 'https://www.globalsecuritymag.fr/spip.php?page=backend', label: 'Global Sec Mag' },

  // --- Autorités & CERT (avis officiels) ---
  { url: 'https://www.cert.ssi.gouv.fr/alerte/feed/',           label: 'CERT-FR Alertes'   },
  { url: 'https://www.cert.ssi.gouv.fr/avis/feed/',             label: 'CERT-FR Avis'      },
  { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml', label: 'CISA Advisories' },
  { url: 'https://isc.sans.edu/rssfeed_full.xml',               label: 'SANS ISC'          },

  // --- Recherche & threat intelligence éditeurs ---
  { url: 'https://blog.talosintelligence.com/rss/',             label: 'Cisco Talos'       },
  { url: 'https://www.welivesecurity.com/en/rss/feed/',         label: 'ESET WeLiveSec.'   },
  { url: 'https://unit42.paloaltonetworks.com/feed/',           label: 'Unit 42'           },
  { url: 'https://googleprojectzero.blogspot.com/feeds/posts/default', label: 'Project Zero' },

  // --- Analyse & culture ---
  { url: 'https://www.schneier.com/feed/atom/',                 label: 'Schneier on Sec.'  },
];

// Éditeurs / produits répandus, pour une rédaction plus précise (vendor extraction).
const VENDORS = [
  'Microsoft', 'Windows', 'Exchange', 'Outlook', 'Office', 'Azure', 'SharePoint',
  'Cisco', 'Fortinet', 'FortiOS', 'FortiGate', 'Palo Alto', 'PAN-OS', 'GlobalProtect',
  'VMware', 'vCenter', 'ESXi', 'Ivanti', 'Citrix', 'NetScaler', 'Juniper', 'SonicWall',
  'Zyxel', 'F5', 'BIG-IP', 'Apache', 'Atlassian', 'Confluence', 'Jira', 'Oracle', 'Java',
  'Adobe', 'Acrobat', 'Google', 'Chrome', 'Android', 'Apple', 'iOS', 'macOS', 'Safari',
  'Linux', 'OpenSSL', 'WordPress', 'Drupal', 'GitLab', 'GitHub', 'Jenkins', 'Spring',
  'Node.js', 'PHP', 'MongoDB', 'Elastic', 'Docker', 'Kubernetes', 'Zoom', 'MOVEit',
  'WinRAR', '7-Zip', 'Veeam', 'ConnectWise', 'ScreenConnect', 'PaperCut', 'QNAP', 'Synology',
];

function stripHTML(html = '') {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function extractVendor(text) {
  for (const v of VENDORS) {
    const re = new RegExp(`\\b${v.replace(/[.+]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) return v;
  }
  return null;
}

function truncateAtSentence(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const last = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('.\n'));
  return last > max * 0.6 ? cut.slice(0, last + 1) : cut + '…';
}

function extractCVE(text) {
  const m = text.match(/CVE-\d{4}-\d{4,7}/i);
  return m ? m[0].toUpperCase() : null;
}

// Termes (EN + FR) signalant une attaque / un incident / une compromission.
const ATTACK_RE = /breach|leak|ransomware|attack|malware|phishing|incident|intrusion|botnet|ddos|stealer|infostealer|data theft|exfiltrat|extortion|espionage|spyware|hacked|data sale|attaque|attaqu|fuite|piratage|piraté|rançongiciel|ran[çc]on|compromis|vol de donn|donn[ée]es vol|exfiltrat|extorsion|espionnage|cyberattaque|hame[çc]onnage/;

function guessSeverity(title, body, cve) {
  const t = (title + ' ' + body).toLowerCase();
  if (/critical|critique|actively exploit|exploitation active|zero.?day|0.?day|cvss[:\s]*(9|10)/.test(t)) return 'critical';
  if (cve || /\bhigh\b|élevé|exploit|rce|remote code|injection|bypass|privilege esc/.test(t)) return 'high';
  if (ATTACK_RE.test(t)) return 'news';
  return 'culture';
}

function guessSection(title, body, cve) {
  const t = (title + ' ' + body).toLowerCase();
  if (cve || /cve-|vuln[ée]rabilit|vulnerabilit|faille|patch|correctif|exploit|overflow|injection|\brce\b|bypass|zero.?day|0.?day/.test(t)) return 'vulns';
  if (ATTACK_RE.test(t)) return 'attacks';
  return 'culture';
}

/**
 * Collecte les items RSS des dernières `hours` heures depuis les flux cyber.
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectRSSItems(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);
  const raw = [];

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const parsed = await parser.parseURL(feed.url);
      return { feed, items: parsed.items || [] };
    })
  );

  for (const res of results) {
    if (res.status !== 'fulfilled') continue;
    const { feed, items } = res.value;
    for (const it of items) {
      const pubDate = it.pubDate ? new Date(it.pubDate) : new Date();
      if (pubDate < cutoff) continue;

      const rawBody = stripHTML(
        it['content:encoded'] || it.content || it.contentSnippet || it.summary || ''
      );
      const title = (it.title || '').trim();
      const cve = extractCVE(title + ' ' + rawBody);
      const section = guessSection(title, rawBody, cve);
      const severity = guessSeverity(title, rawBody, cve);
      const vendor = extractVendor(title + ' ' + rawBody.slice(0, 300));

      raw.push({
        title,
        cve,
        severity,
        section,
        vendor,
        cvss: null,
        exploited: false,
        body: truncateAtSentence(rawBody || title, 500),
        detail: rawBody.slice(0, 1400) || null,
        action: null,
        sources: [{ url: it.link || '', label: feed.label }],
        pubDate,
      });
    }
  }

  // Déduplique par titre (60 premiers chars)
  const seen = new Set();
  const SEV_ORDER = { critical: 0, high: 1, news: 2, culture: 3 };

  return raw
    .filter(({ title }) => {
      const key = title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => {
      const ds = SEV_ORDER[a.severity] - SEV_ORDER[b.severity];
      return ds !== 0 ? ds : b.pubDate - a.pubDate;
    });
}
