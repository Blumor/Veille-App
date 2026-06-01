import { collectRSSItems } from './rssCollector.js';
import { collectNVDCves } from './nvdCollector.js';
import { collectKEV } from './kevCollector.js';
import { clusterItems } from './cluster.js';
import { composeItem, composeSummary, composeSynthese, itemAuthority } from './compose.js';
import { normalizeReport } from '../lib/schema.js';

export function todayISO() {
  const d = new Date();
  return new Date(d - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

const HOURS = { daily: 24, weekly: 168, monthly: 720 };

const TITLES = {
  daily:   (d) => `Briefing Cyber — ${d}`,
  weekly:  (d) => `Veille Cyber — Semaine du ${d}`,
  monthly: (d) => `Veille Cyber — Mois au ${d}`,
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

  const [rssItems, nvdItems, kevItems] = await Promise.all([
    collectRSSItems(hours),
    collectNVDCves(hours),
    collectKEV(hours),
  ]);

  const collected = [...kevItems, ...nvdItems, ...rssItems];
  if (!collected.length) {
    throw new Error('Aucun article collecté — vérifie ta connexion réseau.');
  }

  // Regroupe les articles d'une même info (même CVE / titres proches) pour
  // mesurer le recoupement multi-sources, puis rédige chaque item représentatif.
  const clusters = clusterItems(collected, itemAuthority);
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

  const sectionDefs = isSynthesis
    ? [
        { id: 'synthese', items: composeSynthese(all, type, dateISO) },
        { id: 'vulns',    items: bySection.vulns.slice(0, limit) },
        { id: 'attacks',  items: bySection.attacks.slice(0, limit) },
        { id: 'culture',  items: bySection.culture.slice(0, limit) },
      ]
    : [
        { id: 'vulns',    items: bySection.vulns.slice(0, limit) },
        { id: 'attacks',  items: bySection.attacks.slice(0, limit) },
        { id: 'culture',  items: bySection.culture.slice(0, limit) },
      ];

  const sections = sectionDefs.filter((s) => s.items.length);
  if (!sections.length) {
    throw new Error("Aucune section non vide — pas assez d'articles collectés.");
  }

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
