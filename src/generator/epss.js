// Enrichissement EPSS (FIRST.org, gratuit, sans clé) : probabilité qu'une CVE
// soit exploitée dans les 30 prochains jours (0–1). Sert à prioriser les
// vulnérabilités par risque réel d'exploitation.
const URL = 'https://api.first.org/data/v1/epss';
const UA = { 'User-Agent': 'VeilleCyber/1.0' };
const BATCH = 80;

/**
 * Ajoute le champ `epss` (0–1) aux items possédant une CVE. Mutation en place.
 * @param {object[]} items
 * @returns {Promise<object[]>}
 */
export async function enrichEPSS(items) {
  const cves = [...new Set(items.filter((i) => i.cve).map((i) => i.cve))];
  if (!cves.length) return items;

  const score = new Map();
  for (let i = 0; i < cves.length; i += BATCH) {
    const batch = cves.slice(i, i + BATCH);
    try {
      const r = await fetch(`${URL}?cve=${batch.join(',')}`, {
        headers: UA, signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) continue;
      const data = await r.json();
      for (const e of data.data || []) score.set(e.cve, parseFloat(e.epss));
    } catch { /* tolère un lot en échec */ }
  }

  for (const it of items) {
    if (it.cve && score.has(it.cve)) it.epss = score.get(it.cve);
  }
  return items;
}
