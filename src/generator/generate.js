import { collectRSSItems } from './rssCollector.js';
import { collectNVDCves } from './nvdCollector.js';
import { collectKEV } from './kevCollector.js';
import { collectRansomware } from './ransomwareCollector.js';
import { collectGitHubAdvisories } from './githubAdvisories.js';
import { collectHackerNews } from './hnCollector.js';
import { collectANSSI } from './anssiScraper.js';
import { enrichEPSS } from './epss.js';
import { enrichDetails } from './enrich.js';
import { clusterItems } from './cluster.js';
import { composeItem, composeSummary, composeSynthese, itemAuthority } from './compose.js';
import { normalizeReport } from '../lib/schema.js';

export function todayISO() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const HOURS = { daily: 24, weekly: 168, monthly: 720 };

// ── Titres des rapports (reflètent la période couverte) ─────────────────────────
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const D = (iso) => new Date(iso + 'T12:00:00');
const frFull  = (iso) => D(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const frDay   = (iso) => D(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
const frDayY  = (iso) => D(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

function weekRange(iso) {
  const end = D(iso);
  const start = new Date(end); start.setDate(end.getDate() - 7);
  const startISO = start.toISOString().slice(0, 10);
  return `Semaine du ${frDay(startISO)} au ${frDayY(iso)}`;
}
function monthCovered(iso) {
  // Rapport mensuel généré le 1er → couvre le mois précédent.
  const d = D(iso); d.setDate(1); d.setDate(0); // dernier jour du mois précédent
  return cap(d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
}

const TITLES = {
  daily:   (d) => `Briefing du ${frFull(d)}`,
  weekly:  (d) => weekRange(d),
  monthly: (d) => `Veille cyber — ${monthCovered(d)}`,
};

/**
 * Génère un rapport en agrégeant les flux RSS, l'API NVD et le catalogue CISA KEV.
 * Rédaction par gabarits déterministes (aucune clé API requise).
 * @param {'daily'|'weekly'|'monthly'} type
 * @param {string} [dateISO]
 */
export async function generateReport(type, dateISO = todayISO()) {
  if (!HOURS[type]) {
    throw new Error(`Type inconnu : ${type} (attendu daily | weekly | monthly)`);
  }
  const hours = HOURS[type];

  // Collecte multi-sources en parallèle (chaque connecteur tolère ses propres pannes).
  const [rssItems, nvdItems, kevItems, ransomItems, ghItems, hnItems, anssiItems] =
    await Promise.all([
      collectRSSItems(hours),
      collectNVDCves(hours),
      collectKEV(hours),
      collectRansomware(hours),
      collectGitHubAdvisories(hours),
      collectHackerNews(hours),
      collectANSSI(hours),
    ]);

  const collected = [
    ...kevItems, ...nvdItems, ...ghItems, ...rssItems,
    ...ransomItems, ...anssiItems, ...hnItems,
  ];
  if (!collected.length) {
    throw new Error('Aucun article collecté — vérifie ta connexion réseau.');
  }

  // Regroupe les articles d'une même info (même CVE / titres proches) pour
  // mesurer le recoupement multi-sources.
  const clusters = clusterItems(collected, itemAuthority);
  // Enrichit les vulnérabilités avec leur probabilité d'exploitation (EPSS).
  await enrichEPSS(clusters);
  // Rédige + score chaque item représentatif.
  const all = clusters.map(composeItem);

  // Regroupe par section + tri par score d'importance décroissant.
  const bySection = { vulns: [], attacks: [], culture: [] };
  for (const it of all) (bySection[it.section] ?? bySection.culture).push(it);
  for (const id of Object.keys(bySection)) {
    bySection[id].sort((a, b) => {
      const dscore = (b.score || 0) - (a.score || 0);
      if (dscore !== 0) return dscore;
      return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
    });
  }

  // Sections selon le type. La synthèse (hebdo/mensuel) est rédigée.
  const isSynthesis = type === 'weekly' || type === 'monthly';
  const limit = type === 'daily' ? 15 : 25;
  const FR_EXTRA = type === 'daily' ? 10 : 15; // garantit la couverture France

  // Top par score, MAIS on ne coupe jamais les items « France » (jusqu'à FR_EXTRA en plus) :
  // l'utilisateur doit pouvoir suivre la cyber FR en continu via le filtre France.
  const pick = (arr) => {
    const top = arr.slice(0, limit);
    const inTop = new Set(top);
    const frExtra = arr.filter((it) => it.region === 'fr' && !inTop.has(it)).slice(0, FR_EXTRA);
    return [...top, ...frExtra].sort((a, b) => (b.score || 0) - (a.score || 0));
  };

  const sectionDefs = isSynthesis
    ? [
        { id: 'synthese', items: composeSynthese(all, type, dateISO) },
        { id: 'vulns',    items: pick(bySection.vulns) },
        { id: 'attacks',  items: pick(bySection.attacks) },
        { id: 'culture',  items: pick(bySection.culture) },
      ]
    : [
        { id: 'vulns',    items: pick(bySection.vulns) },
        { id: 'attacks',  items: pick(bySection.attacks) },
        { id: 'culture',  items: pick(bySection.culture) },
      ];

  const sections = sectionDefs.filter((s) => s.items.length);
  if (!sections.length) {
    throw new Error("Aucune section non vide — pas assez d'articles collectés.");
  }

  // Enrichit les descriptions maigres des items réellement affichés (scraping page source).
  await enrichDetails(sections.flatMap((s) => s.items));

  const raw = {
    date: dateISO,
    title: TITLES[type](dateISO),
    summary: composeSummary(all, type),
    sections: sections.map((s) => ({
      id: s.id,
      items: s.items.map((it) => ({
        title: it.title,
        cve: it.cve ?? null,
        severity: it.severity,
        score: it.score ?? 0,
        corroboration: it.corroboration ?? 1,
        region: it.region ?? 'intl',
        body: it.body,
        detail: it.detail ?? null,
        action: it.action ?? null,
        sources: it.sources ?? [],
        url: it.sources?.[0]?.url ?? null,
        pubDate: it.pubDate ? new Date(it.pubDate).toISOString() : null,
      })),
    })),
  };

  return normalizeReport(raw, type, dateISO);
}
