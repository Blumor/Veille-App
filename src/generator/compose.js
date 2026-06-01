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
  'CERT-FR Actualité': 48,
  // Recherche / threat intelligence éditeurs
  'Project Zero': 46, 'Cisco Talos': 42, 'Unit 42': 42, 'ESET WeLiveSec.': 40,
  // Presse spécialisée de référence
  'Krebs on Security': 36, 'The Record': 34, 'BleepingComputer': 32, 'SANS ISC': 34,
  'The Hacker News': 30, 'SecurityWeek': 30, 'CyberScoop': 30, 'Security Affairs': 30,
  'The Register': 28, 'Dark Reading': 28, 'Schneier on Sec.': 30,
  'Infosecurity Mag': 26, 'GBHackers': 24, 'Help Net Security': 24,
  // Presse cyber francophone
  'Zataz': 30, 'Cyberattaque.org': 26, 'Numerama': 28, 'IT-Connect': 24,
  'UnderNews': 22, 'Silicon.fr': 22, 'Global Sec Mag': 22,
  // Bases référentielles
  'NVD': 24, 'CVE Details': 16,
};
const DEFAULT_AUTH = 18;

// Sources « France-centrées » : autorité nationale ou presse breach FR → toujours région France.
// (Les médias FR généralistes — Numerama, IT-Connect… — couvrent aussi l'actu mondiale :
//  ils ne basculent en région France que si le CONTENU parle de la France.)
const FR_CENTRIC = new Set(['CERT-FR Alertes', 'CERT-FR Avis', 'CERT-FR Actualité', 'Zataz', 'Cyberattaque.org']);

// Logiciels / systèmes à très large déploiement : une faille chez eux a un impact massif.
const WIDESPREAD = [
  'microsoft', 'windows', 'exchange', 'outlook', 'azure', 'office', 'sharepoint',
  'cisco', 'fortinet', 'fortios', 'fortigate', 'palo alto', 'pan-os', 'globalprotect',
  'vmware', 'vcenter', 'esxi', 'ivanti', 'citrix', 'netscaler', 'juniper', 'sonicwall',
  'f5', 'big-ip', 'apache', 'linux', 'openssl', 'google', 'chrome', 'android', 'apple',
  'ios', 'macos', 'safari', 'oracle', 'java', 'adobe', 'atlassian', 'confluence', 'jira',
  'wordpress', 'drupal', 'gitlab', 'jenkins', 'spring', 'php', 'kubernetes', 'docker',
  'zoom', 'moveit', 'winrar', 'veeam', 'sap', 'sharepoint', 'nginx',
];

function isWidespread(item) {
  const v = (item.vendor || '').toLowerCase();
  if (v && WIDESPREAD.some((w) => v.includes(w))) return true;
  const t = (item.title || '').toLowerCase();
  return WIDESPREAD.some((w) => t.includes(w));
}
const FRANCE_RE = /\bfrance\b|fran[çc]ais|française|\banssi\b|\bcnil\b|cert-fr|gendarmerie|\bparis\b|hexagone|\boiv\b|secnumcloud/i;

/**
 * Région d'un item : 'fr' (source France-centrée OU sujet lié à la France) sinon 'intl'.
 * @param {object} item
 * @returns {'fr'|'intl'}
 */
export function regionOf(item) {
  if ((item.sources || []).some((s) => FR_CENTRIC.has(s.label))) return 'fr';
  if (FRANCE_RE.test(`${item.title} ${item.body || ''} ${item.detail || ''}`)) return 'fr';
  return 'intl';
}

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

function recencyBonus(item, big = 6, mid = 3) {
  if (!item.pubDate) return 0;
  const ageH = (Date.now() - new Date(item.pubDate).getTime()) / 3_600_000;
  return ageH <= 24 ? big : ageH <= 72 ? mid : 0;
}

/**
 * Score d'une VULNÉRABILITÉ : criticité technique + importance des logiciels touchés.
 * (L'autorité/le recoupement comptent peu : une RCE critique reste critique même si
 *  une seule base la référence.)
 * @param {object} item
 * @returns {number} 0-100
 */
function scoreVuln(item) {
  let s = ({ critical: 35, high: 22, news: 14, culture: 10 })[item.severity] ?? 14;
  if (item.cvss) s += Math.round((item.cvss / 10) * 20);   // criticité CVSS, jusqu'à +20
  if (item.exploited) s += 25;                              // activement exploité (CISA KEV)
  else if (EXPLOIT_RE.test(`${item.title} ${item.detail || item.body || ''}`)) s += 12;
  if (item.ransomware) s += 8;
  if (isWidespread(item)) s += 18;                          // logiciel/système très répandu
  s += Math.round(itemAuthority(item) / 12);               // léger gage de fiabilité (≤ +4)
  s += recencyBonus(item, 5, 3);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/**
 * Score d'une INFO (attaque, incident, signal) : importance par l'autorité de la
 * source et le suivi par la communauté cyber (recoupement multi-organismes).
 * @param {object} item
 * @returns {number} 0-100
 */
function scoreNews(item) {
  // 1. Organisation de confiance qui publie (18 → 50)
  let s = itemAuthority(item);
  // 2. Suivi par de nombreux organismes : +13 par source au-delà du premier (max +42)
  s += Math.min(42, Math.max(0, (item.corroboration || 1) - 1) * 13);
  // 3. Gravité de l'évènement
  s += ({ critical: 14, high: 10, news: 12, culture: 6 })[item.severity] ?? 8;
  // 4. Fraîcheur
  s += recencyBonus(item, 6, 3);
  return Math.max(0, Math.min(100, Math.round(s)));
}

/**
 * Score d'importance sur 100 — deux logiques distinctes selon le type de topic.
 * @param {object} item
 * @returns {number} 0-100
 */
export function scoreItem(item) {
  return item.section === 'vulns' ? scoreVuln(item) : scoreNews(item);
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
  enriched.region = regionOf(item);
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
      region: 'intl',
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
      region: 'intl',
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
      region: 'intl',
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
