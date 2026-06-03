// Connecteur ransomware.live (API gratuite, sans clé) : victimes de rançongiciel
// revendiquées par les groupes. Filtrable par pays — on garde toutes les victimes
// françaises + les plus récentes à l'international pour ne pas noyer le rapport.
const URL = "https://api.ransomware.live/v2/recentvictims";
const UA = { "User-Agent": "VeilleApp/1.0" };
const MAX_INTL = 30;

// Codes pays → nom FR (pour l'affichage et la détection de région France).
const COUNTRY = {
  FR: "France",
  BE: "Belgique",
  CH: "Suisse",
  LU: "Luxembourg",
  CA: "Canada",
  MC: "Monaco",
  US: "États-Unis",
  GB: "Royaume-Uni",
  DE: "Allemagne",
  ES: "Espagne",
  IT: "Italie",
  NL: "Pays-Bas",
  PT: "Portugal",
};

/**
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectRansomware(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  let data;
  try {
    const r = await fetch(URL, {
      headers: UA,
      signal: AbortSignal.timeout(20_000),
    });
    if (!r.ok) return [];
    data = await r.json();
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const recent = data
    .filter((v) => {
      const d = v.attackdate || v.discovered;
      return d && new Date(d) >= cutoff;
    })
    .sort(
      (a, b) =>
        new Date(b.attackdate || b.discovered) -
        new Date(a.attackdate || a.discovered),
    );

  // France : tout ; international : les plus récents (borne MAX_INTL).
  const fr = recent.filter((v) => v.country === "FR");
  const intl = recent.filter((v) => v.country !== "FR").slice(0, MAX_INTL);

  return [...fr, ...intl].map((v) => {
    const country = COUNTRY[v.country] || v.country || "";
    const sector = v.activity && v.activity !== "Not Found" ? v.activity : null;
    const desc = (v.description || "")
      .replace(/^\[AI generated\]\s*/i, "")
      .trim();
    const lines = [
      `Victime revendiquée par le groupe de rançongiciel ${v.group}.`,
      country ? `Pays : ${country}.` : "",
      sector ? `Secteur : ${sector}.` : "",
      desc,
    ].filter(Boolean);

    return {
      title: `${v.victim} — rançongiciel ${v.group}${country ? ` (${country})` : ""}`,
      cve: null,
      severity: "news",
      section: "attacks",
      vendor: null,
      cvss: null,
      exploited: false,
      ransomware: true,
      body: lines.join(" "),
      detail: lines.join("\n\n"),
      action: null,
      sources: [
        {
          url: v.url || "https://www.ransomware.live",
          label: "ransomware.live",
        },
      ],
      pubDate: new Date(v.attackdate || v.discovered),
    };
  });
}
