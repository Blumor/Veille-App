// Connecteur Hacker News (API Algolia, gratuite, sans clé) : signal communautaire.
// Le nombre de points/commentaires reflète l'intérêt de la communauté tech/cyber
// — c'est un bon proxy de « suivi par de nombreuses personnes ».
const UA = { "User-Agent": "VeilleApp/1.0" };
const QUERIES = ["cybersecurity", "vulnerability", "ransomware", "data breach"];
const MIN_POINTS = 10;

/**
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectHackerNews(hours = 168) {
  const cutoffTs = Math.floor((Date.now() - hours * 3_600_000) / 1000);

  const results = await Promise.allSettled(
    QUERIES.map(async (q) => {
      const url =
        `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(q)}` +
        `&numericFilters=created_at_i>${cutoffTs},points>=${MIN_POINTS}&hitsPerPage=20`;
      const r = await fetch(url, {
        headers: UA,
        signal: AbortSignal.timeout(15_000),
      });
      if (!r.ok) return [];
      return (await r.json()).hits || [];
    }),
  );

  const seen = new Set();
  const items = [];
  for (const res of results) {
    if (res.status !== "fulfilled") continue;
    for (const h of res.value) {
      if (!h.title || seen.has(h.objectID)) continue;
      seen.add(h.objectID);
      const hnUrl = `https://news.ycombinator.com/item?id=${h.objectID}`;
      const reach = `${h.points} points · ${h.num_comments || 0} commentaires sur Hacker News.`;
      items.push({
        title: h.title,
        cve: null,
        severity: "culture",
        section: "culture",
        vendor: null,
        cvss: null,
        exploited: false,
        hnPoints: h.points || 0,
        body: reach,
        detail: reach + (h.url ? `\n\nLien : ${h.url}` : ""),
        action: null,
        sources: [
          ...(h.url
            ? [{ url: h.url, label: "Hacker News" }]
            : [{ url: hnUrl, label: "Hacker News" }]),
          { url: hnUrl, label: "Discussion HN" },
        ],
        pubDate: new Date((h.created_at_i || cutoffTs) * 1000),
      });
    }
  }
  return items;
}
