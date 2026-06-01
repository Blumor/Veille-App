/**
 * Extraction tolérante du JSON renvoyé par le modèle + normalisation.
 * Garantit qu'un rapport stocké respecte toujours la même forme.
 */

const SEVERITIES = ['critical', 'high', 'news', 'culture'];

export function extractJSON(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < 0) return null;
  const raw = t.slice(a, b + 1);
  try {
    return JSON.parse(raw);
  } catch {
    // seconde tentative : retire les virgules traînantes
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1'));
    } catch {
      return null;
    }
  }
}

function clean(s) {
  return typeof s === 'string' ? s.trim() : '';
}

/**
 * Normalise un rapport brut en structure stable et stockable.
 * @param {object} parsed - objet issu du modèle
 * @param {'daily'|'weekly'} type
 * @param {string} dateISO
 */
export function normalizeReport(parsed, type, dateISO) {
  if (!parsed || !Array.isArray(parsed.sections)) {
    throw new Error('Rapport invalide : champ "sections" manquant.');
  }
  const date = clean(parsed.date) || dateISO;

  const sections = parsed.sections
    .map((sec) => ({
      id: clean(sec.id) || 'autres',
      items: (Array.isArray(sec.items) ? sec.items : [])
        .map((it) => ({
          title: clean(it.title),
          cve: it.cve && it.cve !== 'null' ? clean(it.cve) : null,
          severity: SEVERITIES.includes(it.severity) ? it.severity : 'news',
          body: clean(it.body),
          action: clean(it.action) || null,
          url: clean(it.url) || null,
        }))
        .filter((it) => it.title && it.body),
    }))
    .filter((sec) => sec.items.length);

  if (!sections.length) {
    throw new Error('Rapport invalide : aucune section exploitable.');
  }

  return {
    id: `${type}-${date}`,
    type,
    date,
    title: clean(parsed.title) || `Briefing du ${date}`,
    summary: clean(parsed.summary) || null,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
