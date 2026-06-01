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
  'CERT-FR Actualité': 48, 'ANSSI': 50,
  // Connecteurs spécialisés
  'GitHub Advisory': 32, 'ransomware.live': 28, 'Hacker News': 20, 'Discussion HN': 20,
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
const FR_CENTRIC = new Set(['CERT-FR Alertes', 'CERT-FR Avis', 'CERT-FR Actualité', 'ANSSI', 'Zataz', 'Cyberattaque.org']);

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
 * Score d'une VULNÉRABILITÉ — uniquement les scores communautaires standards :
 * CVSS (criticité technique), EPSS (probabilité d'exploitation), CISA KEV
 * (exploitation avérée) et l'ubiquité du logiciel affecté (cf. SSVC : prévalence /
 * automatisabilité). Ni autorité éditoriale ni recoupement : une RCE critique reste
 * critique même référencée par une seule base.
 * @param {object} item
 * @returns {number} 0-100
 */
function scoreVuln(item) {
  let s = ({ critical: 30, high: 20, news: 12, culture: 8 })[item.severity] ?? 12;
  if (item.cvss) s += Math.round((item.cvss / 10) * 25);   // CVSS, jusqu'à +25
  if (item.exploited) s += 25;                             // KEV : exploitation avérée
  else if (item.epss != null) s += Math.round(item.epss * 20); // EPSS : probabilité, ≤ +20
  else if (EXPLOIT_RE.test(`${item.title} ${item.detail || item.body || ''}`)) s += 12;
  if (item.ransomware) s += 6;
  if (isWidespread(item)) s += 15;                         // ubiquité du logiciel/système
  s += recencyBonus(item, 4, 2);
  return Math.max(0, Math.min(100, Math.round(s)));
}

// ── Impact du contenu d'une info (valeurs d'information de Galtung & Ruge) ───────
// Lexique déterministe : « négativité » (gravité de la menace) + acteurs/cibles
// majeurs (prominence). Chaque signal présent ajoute son poids.
const IMPACT_LEXICON = [
  { re: /zero.?day|0.?day|jour.?z[ée]ro/, w: 10 },
  { re: /actively exploit|exploited in the wild|activement exploit|exploitation active|in[- ]the[- ]wild/, w: 10 },
  { re: /\brce\b|remote code execution|ex[ée]cution de code/, w: 9 },
  { re: /supply.?chain|cha[îi]ne d'approvisionnement|supply chain/, w: 9 },
  { re: /nation.?state|state.?sponsored|\bapt\d*\b|[ée]tatique|espionnage|spyware/, w: 8 },
  { re: /critical infrastructure|infrastructure critique|\boiv\b|\bscada\b|\bics\b|h[ôo]pital|hospital|sant[ée]|[ée]nergie|energy|nucl[ée]aire/, w: 8 },
  { re: /ransomware|ran[çc]ongiciel/, w: 6 },
  { re: /data breach|fuite de donn[ée]es|\bleak\b|vol de donn[ée]es|exfiltrat|piratage/, w: 5 },
  { re: /backdoor|porte d[ée]rob[ée]e|\bwiper\b|rootkit|botnet/, w: 5 },
  { re: /\bgouvernement|government|d[ée]fense|defense|minist[èe]re|military|arm[ée]e/, w: 5 },
  { re: /urgent|emergency|alerte|patch now|correctif urgent|sans d[ée]lai/, w: 4 },
];
const SUPERLATIVE = /largest|biggest|record|massive|unprecedented|first.?ever|jamais vu|sans pr[ée]c[ée]dent|historique|g[ée]ant/;

// Magnitude (ampleur) : ordre de grandeur du nombre de victimes/débit/montant.
function magnitudeBonus(t) {
  let b = 0;
  if (/(\d+(?:[.,]\d+)?)\s*(milliards?|billion)/.test(t)) b = Math.max(b, 6);
  if (/(\d+(?:[.,]\d+)?)\s*(millions?|\bm\b)/.test(t)) b = Math.max(b, 5);
  if (/(\d+(?:[.,]\d+)?)\s*tbps/.test(t)) b = Math.max(b, 5);
  const m = t.match(/(\d[\d.,\s]{3,})\s*(records|comptes|accounts|users|utilisateurs|victim|victimes|personnes|patients|clients)/);
  if (m) {
    const n = parseInt(m[1].replace(/[.,\s]/g, ''), 10);
    if (n >= 1e6) b = Math.max(b, 6);
    else if (n >= 1e5) b = Math.max(b, 4);
    else if (n >= 1e4) b = Math.max(b, 2);
  }
  return b;
}

function contentImpact(item) {
  const t = `${item.title} ${item.body || ''} ${item.detail || ''}`.toLowerCase();
  let c = 0;
  for (const { re, w } of IMPACT_LEXICON) if (re.test(t)) c += w;
  c = Math.min(26, c);
  if (SUPERLATIVE.test(t)) c += 4;
  c += magnitudeBonus(t);
  return Math.min(34, c);
}

/**
 * Score d'une INFO (attaque, incident, signal). Théorisé à partir de deux cadres :
 *  - Admiralty Code (NATO AJP-2.1) : fiabilité de la source, évaluée EN ISOLATION
 *    → une source de référence seule suffit à rendre une info majeure ;
 *  - valeurs d'information de Galtung & Ruge : impact intrinsèque du contenu
 *    (gravité, ampleur, acteurs majeurs) — une info critique mono-source reste forte.
 * Aucun recoupement, aucune métrique de simple visibilité.
 * @param {object} item
 * @returns {number} 0-100
 */
function scoreNews(item) {
  const reliability = Math.round(itemAuthority(item) * 1.8); // Admiralty : 18→32 … 50→90
  const impact = contentImpact(item);                          // Galtung-Ruge : 0 → 34
  return Math.max(0, Math.min(100, reliability + impact + recencyBonus(item, 5, 2)));
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
