const SEVERITIES = ['critical', 'high', 'news', 'culture'];

export function extractJSON(text) {
  if (!text) return null;
  let t = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b < 0) return null;
  const raw = t.slice(a, b + 1);
  try { return JSON.parse(raw); } catch {
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch { return null; }
  }
}

function clean(s) {
  return typeof s === 'string' ? s.trim() : '';
}

function normalizeSources(sources, fallbackUrl) {
  if (Array.isArray(sources) && sources.length) {
    return sources
      .filter((s) => s?.url)
      .map((s) => ({ url: clean(s.url), label: clean(s.label) || 'Source' }));
  }
  const url = clean(fallbackUrl);
  return url ? [{ url, label: 'Source' }] : [];
}

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
          title:    clean(it.title),
          cve:      it.cve && it.cve !== 'null' ? clean(it.cve) : null,
          severity: SEVERITIES.includes(it.severity) ? it.severity : 'news',
          score:    Number.isFinite(+it.score) ? Math.max(0, Math.min(100, Math.round(+it.score))) : 0,
          corroboration: Number.isFinite(+it.corroboration) ? Math.max(1, Math.round(+it.corroboration)) : 1,
          body:     clean(it.body),
          detail:   it.detail ? clean(it.detail) : null,
          action:   clean(it.action) || null,
          sources:  normalizeSources(it.sources, it.url),
          url:      clean(it.url) || (it.sources?.[0]?.url ? clean(it.sources[0].url) : null),
          pubDate:  it.pubDate ? clean(it.pubDate) : null,
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
    title:       clean(parsed.title) || `Briefing du ${date}`,
    summary:     clean(parsed.summary) || null,
    generatedAt: new Date().toISOString(),
    sections,
  };
}
