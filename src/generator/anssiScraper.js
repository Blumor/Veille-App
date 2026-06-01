// Scraping ANSSI (cyber.gouv.fr) : le site n'expose aucun flux RSS, mais publie
// un sitemap.xml listant les actualités avec leur date (lastmod). On en extrait
// les publications récentes (rapport d'activité, panoramas, recommandations…),
// puis on récupère titre + description sur chaque page (balises meta).
const SITEMAP = 'https://cyber.gouv.fr/sitemap.xml';
const UA = { 'User-Agent': 'VeilleCyber/1.0' };

function decodeEntities(s = '') {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

async function fetchText(url) {
  const r = await fetch(url, { headers: UA, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}

const meta = (html, re) => (html.match(re) || [])[1];

/**
 * Récupère les actualités/publications ANSSI publiées dans les dernières `hours` heures.
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectANSSI(hours = 720) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  let xml;
  try { xml = await fetchText(SITEMAP); } catch { return []; }

  const entries = [...xml.matchAll(/<url>([\s\S]*?)<\/url>/g)]
    .map((m) => ({
      loc: (m[1].match(/<loc>([^<]+)<\/loc>/) || [])[1] || '',
      lm: (m[1].match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1] || '',
    }))
    .filter((e) => /\/actualites\/[^?#]+\/?$/.test(e.loc) && e.lm && new Date(e.lm) >= cutoff)
    .sort((a, b) => b.lm.localeCompare(a.lm))
    .slice(0, 20); // borne le nombre de pages récupérées

  const results = await Promise.allSettled(entries.map(async (e) => {
    const html = await fetchText(e.loc);
    const rawTitle =
      meta(html, /property=["']og:title["'][^>]*content=["']([^"']+)["']/i) ||
      meta(html, /<title>([^<]+)<\/title>/i) || '';
    const rawDesc =
      meta(html, /name=["']description["'][^>]*content=["']([^"']+)["']/i) ||
      meta(html, /property=["']og:description["'][^>]*content=["']([^"']+)["']/i) || '';

    const title = decodeEntities(rawTitle).replace(/\s*[—–-]\s*ANSSI\s*$/i, '').trim();
    if (!title) return null;
    const body = decodeEntities(rawDesc).trim();

    // Une actualité ANSSI est plutôt un signal de fond, sauf si elle parle de menace/alerte.
    const t = (title + ' ' + body).toLowerCase();
    const section = /menace|alerte|attaque|vuln[ée]rabilit|campagne|incident/.test(t) ? 'attacks' : 'culture';

    return {
      title,
      cve: null,
      severity: section === 'attacks' ? 'news' : 'culture',
      section,
      vendor: null, cvss: null, exploited: false,
      body: body || title,
      detail: body || title,
      action: null,
      sources: [{ url: e.loc, label: 'ANSSI' }],
      pubDate: new Date(e.lm),
    };
  }));

  return results.filter((r) => r.status === 'fulfilled' && r.value).map((r) => r.value);
}
