/**
 * Regroupe les items qui couvrent la même information (même CVE, ou titres
 * suffisamment proches) afin de mesurer le recoupement multi-sources : une
 * info reprise par plusieurs médias est à la fois plus fiable et plus importante.
 */

// Mots vides (FR + EN) et termes cyber trop génériques pour distinguer un sujet.
const STOP = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "are",
  "has",
  "have",
  "was",
  "were",
  "will",
  "into",
  "over",
  "after",
  "amid",
  "says",
  "used",
  "using",
  "how",
  "les",
  "des",
  "une",
  "un",
  "la",
  "le",
  "de",
  "du",
  "dans",
  "sur",
  "par",
  "aux",
  "pour",
  "avec",
  "que",
  "qui",
  "son",
  "ses",
  "est",
  "plus",
  "security",
  "cyber",
  "attack",
  "attacks",
  "flaw",
  "flaws",
  "bug",
  "bugs",
  "data",
  "vulnerability",
  "vulnerabilities",
  "new",
  "report",
  "hackers",
  "hacker",
  "threat",
  "threats",
  "malware",
  "breach",
  "update",
  "warns",
  "warning",
]);

// Sources purement référentielles (bases de données), pas des médias éditoriaux.
const REF_ONLY = new Set(["NVD", "CVE Details"]);

function tokens(title) {
  return (title || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

const SEV_RANK = { critical: 0, high: 1, news: 2, culture: 3 };

/**
 * @param {object[]} items  items bruts (KEV, NVD, RSS)
 * @param {(item:object)=>number} authorityOf  poids d'autorité d'un item
 * @returns {object[]} items représentatifs fusionnés avec { sources, corroboration }
 */
export function clusterItems(items, authorityOf) {
  const clusters = [];
  const byCVE = new Map();

  for (const it of items) {
    let target = null;

    if (it.cve && byCVE.has(it.cve)) {
      target = byCVE.get(it.cve);
    } else if (!it.cve) {
      const sig = new Set(tokens(it.title));
      if (sig.size >= 3) {
        for (const c of clusters) {
          if (c.cve) continue;
          let overlap = 0;
          for (const w of sig) if (c.sig.has(w)) overlap++;
          if (overlap >= 3) {
            target = c;
            break;
          } // titres proches = même sujet
        }
      }
    }

    if (target) {
      target.members.push(it);
      tokens(it.title).forEach((w) => target.sig.add(w));
    } else {
      const c = {
        cve: it.cve || null,
        sig: new Set(tokens(it.title)),
        members: [it],
      };
      clusters.push(c);
      if (it.cve) byCVE.set(it.cve, c);
    }
  }

  return clusters.map((c) => finalize(c, authorityOf));
}

function finalize(cluster, authorityOf) {
  const members = cluster.members;

  // Représentant : la source la plus autoritaire, puis le contenu le plus riche.
  const rep = [...members].sort((a, b) => {
    const da = authorityOf(b) - authorityOf(a);
    if (da !== 0) return da;
    return (
      (b.detail || b.body || "").length - (a.detail || a.body || "").length
    );
  })[0];

  // Fusion des sources (dédup par label).
  const seen = new Set();
  const sources = [];
  for (const m of members) {
    for (const s of m.sources || []) {
      const key = s.label || s.url;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      sources.push(s);
    }
  }

  // Recoupement = nombre de médias éditoriaux distincts (hors bases référentielles).
  const outlets = new Set(
    members
      .flatMap((m) => (m.sources || []).map((s) => s.label))
      .filter((l) => l && !REF_ONLY.has(l)),
  );

  const severity = members
    .map((m) => m.severity)
    .sort((a, b) => (SEV_RANK[a] ?? 9) - (SEV_RANK[b] ?? 9))[0];

  const pubDate =
    members.reduce((mx, m) => {
      const d = m.pubDate ? new Date(m.pubDate) : null;
      return d && (!mx || d > mx) ? d : mx;
    }, null) || rep.pubDate;

  return {
    ...rep,
    severity,
    exploited: members.some((m) => m.exploited),
    ransomware: members.some((m) => m.ransomware),
    cvss: members.reduce((mx, m) => Math.max(mx, m.cvss || 0), 0) || null,
    vendor: rep.vendor || members.find((m) => m.vendor)?.vendor || null,
    pubDate,
    sources,
    corroboration: Math.max(1, outlets.size),
  };
}
