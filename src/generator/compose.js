/**
 * Rédaction par gabarits déterministes (aucun LLM, aucun coût).
 * Transforme les items structurés (RSS / NVD / KEV) en synthèse française :
 *  - une phrase d'accroche claire par item        → composeItem()
 *  - un résumé exécutif du rapport                 → composeSummary()
 *  - une vraie synthèse rédigée (hebdo / mensuel)  → composeSynthese()
 */

const PERIOD = {
  daily:   { window: 'les dernières 24 heures', noun: 'journée', of: 'de la journée' },
  weekly:  { window: 'les 7 derniers jours',    noun: 'semaine', of: 'de la semaine' },
  monthly: { window: 'le dernier mois',         noun: 'mois',    of: 'du mois'       },
};

const plural = (n, sing, plur = sing + 's') => (n > 1 ? plur : sing);

function frDateShort(pubDate) {
  if (!pubDate) return null;
  const d = pubDate instanceof Date ? pubDate : new Date(pubDate);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
}

// ── phrase d'accroche par item ────────────────────────────────────────────────
function leadSentence(item) {
  const src = item.sources?.[0]?.label;
  switch (item.section) {
    case 'vulns': {
      const sev = item.severity === 'critical' ? 'critique' : 'élevée';
      const cve = item.cve ? ` ${item.cve}` : '';
      const prod = item.vendor ? ` affectant ${item.vendor}` : '';
      const cvss = item.cvss ? ` (score CVSS ${item.cvss})` : '';
      let lead = `Vulnérabilité ${sev}${cve}${prod}${cvss}.`;
      if (item.exploited) {
        lead += item.ransomware
          ? ' Activement exploitée, y compris dans des campagnes de rançongiciel (catalogue CISA KEV).'
          : ' Activement exploitée dans la nature (catalogue CISA KEV).';
      }
      return lead;
    }
    case 'attacks':
      return `Incident de sécurité${src ? ` rapporté par ${src}` : ''}.`;
    default:
      return `Signal de veille${src ? ` — ${src}` : ''}.`;
  }
}

// ── action recommandée par défaut ───────────────────────────────────────────────
function defaultAction(item) {
  if (item.action) return item.action;
  if (item.section === 'vulns') {
    if (item.exploited) {
      const due = item.kevDue ? ` Échéance CISA : ${item.kevDue}.` : '';
      return `Priorité maximale : appliquer le correctif éditeur sans délai et rechercher des signes de compromission.${due}`;
    }
    return "Vérifier l'exposition du parc et appliquer le correctif éditeur dès sa disponibilité.";
  }
  if (item.section === 'attacks') {
    return "Surveiller les indicateurs de compromission associés et contrôler les actifs exposés.";
  }
  return null;
}

// ── score d'importance (0-100) ──────────────────────────────────────────────────
// Le score repose sur trois piliers :
//   1. l'autorité de l'organisation qui publie (une info d'une autorité nationale
//      ou d'un labo de recherche pèse, même sans attaque) ;
//   2. le recoupement : une info reprise par plusieurs médias est fiable et marquante ;
//   3. la gravité, lorsqu'il s'agit d'une menace (vulnérabilité / attaque).

// Poids d'autorité par source (organisation publiant l'information).
const AUTHORITY = {
  // Autorités nationales & agences
  'CISA KEV': 50, 'CISA Advisories': 50, 'CERT-FR Alertes': 50, 'CERT-FR Avis': 48,
  // Recherche / threat intelligence éditeurs
  'Project Zero': 46, 'Cisco Talos': 42, 'Unit 42': 42, 'ESET WeLiveSec.': 40,
  // Presse spécialisée de référence
  'Krebs on Security': 36, 'The Record': 34, 'BleepingComputer': 32, 'SANS ISC': 34,
  'The Hacker News': 30, 'SecurityWeek': 30, 'Dark Reading': 28, 'Schneier on Sec.': 30,
  'Infosecurity Mag': 26, 'Help Net Security': 24,
  // Bases référentielles
  'NVD': 24, 'CVE Details': 16,
};
const DEFAULT_AUTH = 18;

// Indices d'exploitation active dans le texte (titre + contenu) hors KEV.
const EXPLOIT_RE = /actively exploit|exploited in (the wild|attacks)|under (active )?exploitation|being exploited|exploitation active|activement exploit|zero.?day|0.?day/i;

/**
 * Autorité d'un item = autorité maximale parmi ses sources.
 * @param {object} item
 * @returns {number}
 */
export function itemAuthority(item) {
  const weights = (item.sources || []).map((s) => AUTHORITY[s.label] ?? DEFAULT_AUTH);
  return weights.length ? Math.max(...weights) : DEFAULT_AUTH;
}

/**
 * Calcule un score d'importance sur 100 pour prioriser la lecture.
 * @param {object} item
 * @returns {number} 0-100
 */
export function scoreItem(item) {
  // 1. Autorité de l'organisation (18 → 50)
  let s = itemAuthority(item);

  // 2. Recoupement multi-sources : +11 par média au-delà du premier (max +33)
  s += Math.min(33, Math.max(0, (item.corroboration || 1) - 1) * 11);

  // 3. Gravité (surtout pour une menace)
  s += ({ critical: 20, high: 13, news: 8, culture: 5 })[item.severity] ?? 6;

  const isThreat = item.section === 'vulns' || item.section === 'attacks';
  if (item.exploited) s += 12;          // exploitation confirmée (CISA KEV)
  else if (isThreat && EXPLOIT_RE.test(`${item.title} ${item.detail || item.body || ''}`)) s += 7;
  if (item.cvss) s += Math.round((item.cvss / 10) * 6); // jusqu'à +6

  // 4. Fraîcheur (léger)
  if (item.pubDate) {
    const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3_600_000;
    if (ageH <= 24) s += 6;
    else if (ageH <= 72) s += 3;
  }

  return Math.max(0, Math.min(100, Math.round(s)));
}

// Premier extrait propre (coupé à la phrase) pour la preview multi-lignes.
function excerpt(text, max) {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const last = cut.lastIndexOf('. ');
  return last > max * 0.5 ? cut.slice(0, last + 1) : cut.trim() + '…';
}

/**
 * Rédige la preview (accroche + extrait, plusieurs lignes), le détail complet,
 * l'action et le score d'importance d'un item.
 * @param {object} item
 * @returns {object} item enrichi { body, detail, action, score }
 */
export function composeItem(item) {
  const lead = leadSentence(item);
  const previewSrc = (item.body || '').trim();   // texte source propre (desc/extrait)
  const fullSrc = (item.detail || item.body || '').trim();

  const preview = previewSrc ? `${lead}\n\n${excerpt(previewSrc, 320)}` : lead;
  const detail = fullSrc && !fullSrc.startsWith(lead) ? `${lead}\n\n${fullSrc}` : (fullSrc || lead);

  const enriched = { ...item, body: preview, detail, action: defaultAction(item) };
  enriched.score = scoreItem(enriched);
  return enriched;
}

// ── résumé exécutif du rapport ──────────────────────────────────────────────────
/**
 * @param {object[]} all  tous les items collectés
 * @param {'daily'|'weekly'|'monthly'} type
 */
export function composeSummary(all, type) {
  const p = PERIOD[type] || PERIOD.daily;
  const vulns = all.filter((i) => i.section === 'vulns');
  const attacks = all.filter((i) => i.section === 'attacks');
  const culture = all.filter((i) => i.section === 'culture');
  const exploited = vulns.filter((i) => i.exploited);
  const criticals = vulns.filter((i) => i.severity === 'critical');

  const parts = [];
  if (vulns.length) {
    let s = `${criticals.length || vulns.length} ${plural(criticals.length || vulns.length, 'vulnérabilité', 'vulnérabilités')} ${plural(criticals.length || vulns.length, 'critique')}`;
    if (exploited.length) {
      s += `, dont ${exploited.length} activement ${plural(exploited.length, 'exploitée')}`;
    }
    parts.push(s);
  }
  if (attacks.length) parts.push(`${attacks.length} ${plural(attacks.length, 'incident')} ou ${plural(attacks.length, 'compromission')}`);
  if (culture.length) parts.push(`${culture.length} ${plural(culture.length, 'signal', 'signaux')} de fond`);

  // Produits / éditeurs les plus cités
  const vendorCount = {};
  for (const i of all) if (i.vendor) vendorCount[i.vendor] = (vendorCount[i.vendor] || 0) + 1;
  const topVendors = Object.entries(vendorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([v]) => v);

  let summary = parts.length
    ? `Sur ${p.window}, la veille recense ${listFr(parts)}.`
    : `Veille cyber agrégée sur ${p.window} depuis les flux RSS, l'API NVD et le catalogue CISA KEV.`;
  if (topVendors.length) summary += ` Acteurs et produits les plus exposés : ${listFr(topVendors)}.`;
  return summary;
}

// ── synthèse rédigée (section "synthese" des rapports hebdo / mensuel) ───────────
/**
 * Produit jusqu'à 3 items de synthèse narrative à partir de l'ensemble collecté.
 * @param {object[]} all
 * @param {'weekly'|'monthly'} type
 * @returns {object[]} items prêts pour la section "synthese"
 */
export function composeSynthese(all, type, dateISO = null) {
  const p = PERIOD[type] || PERIOD.weekly;
  const items = [];

  const vulns = all.filter((i) => i.section === 'vulns');
  const exploited = vulns.filter((i) => i.exploited);
  const topVulns = [...vulns]
    .sort((a, b) => (b.cvss || 0) - (a.cvss || 0))
    .slice(0, 5);
  if (vulns.length) {
    const cves = topVulns.map((i) => i.cve).filter(Boolean);
    const lines = [
      `Sur ${p.window}, ${vulns.length} ${plural(vulns.length, 'vulnérabilité', 'vulnérabilités')} de gravité notable ${plural(vulns.length, 'a', 'ont')} été ${plural(vulns.length, 'recensée')}, dont ${exploited.length} ${plural(exploited.length, 'activement exploitée')}.`,
      cves.length ? `À prioriser : ${listFr(cves)}.` : '',
      'Recommandation : appliquer en priorité les correctifs des vulnérabilités exploitées (catalogue CISA KEV), puis les critiques exposées sur Internet.',
    ].filter(Boolean);
    items.push({
      title: `Vulnérabilités ${p.of} — ${vulns.length} ${plural(vulns.length, 'entrée')}`,
      cve: null,
      severity: exploited.length ? 'critical' : 'high',
      section: 'synthese',
      vendor: null, cvss: null, exploited: false,
      body: lines[0],
      detail: lines.join('\n\n'),
      action: null,
      sources: aggregateSources(topVulns),
      pubDate: dateISO,
      score: 95,
    });
  }

  const attacks = all.filter((i) => i.section === 'attacks');
  if (attacks.length) {
    const top = attacks.slice(0, 5).map((i) => `« ${i.title} »`);
    items.push({
      title: `Attaques & compromissions — ${attacks.length} ${plural(attacks.length, 'évènement')}`,
      cve: null,
      severity: 'news',
      section: 'synthese',
      vendor: null, cvss: null, exploited: false,
      body: `${attacks.length} ${plural(attacks.length, 'incident')} ${plural(attacks.length, 'majeur')} ${plural(attacks.length, 'relevé')} sur ${p.window}.`,
      detail: `${attacks.length} ${plural(attacks.length, 'incident')} ${plural(attacks.length, 'relevé')} sur ${p.window}.\n\nNotamment : ${top.join(', ')}.`,
      action: null,
      sources: aggregateSources(attacks),
      pubDate: dateISO,
      score: 80,
    });
  }

  const culture = all.filter((i) => i.section === 'culture');
  if (culture.length) {
    const top = culture.slice(0, 4).map((i) => `« ${i.title} »`);
    items.push({
      title: `Tendances de fond — ${culture.length} ${plural(culture.length, 'signal', 'signaux')}`,
      cve: null,
      severity: 'culture',
      section: 'synthese',
      vendor: null, cvss: null, exploited: false,
      body: `${culture.length} ${plural(culture.length, 'signal', 'signaux')} de fond à retenir sur ${p.window}.`,
      detail: `Sujets émergents et analyses : ${top.join(', ')}.`,
      action: null,
      sources: aggregateSources(culture),
      pubDate: dateISO,
      score: 60,
    });
  }

  return items;
}

// ── helpers ──────────────────────────────────────────────────────────────────────
function listFr(arr) {
  if (arr.length <= 1) return arr.join('');
  return arr.slice(0, -1).join(', ') + ' et ' + arr[arr.length - 1];
}

function aggregateSources(items) {
  const seen = new Set();
  const out = [];
  for (const it of items) {
    for (const s of it.sources || []) {
      if (!s.url || seen.has(s.url)) continue;
      seen.add(s.url);
      out.push(s);
      if (out.length >= 6) return out;
    }
  }
  return out;
}
