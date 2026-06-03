// Catalogue CISA KEV (Known Exploited Vulnerabilities) — vulnérabilités
// activement exploitées dans la nature. Source officielle, gratuite, sans clé.
// https://www.cisa.gov/known-exploited-vulnerabilities-catalog
const KEV_URL =
  "https://www.cisa.gov/sites/default/files/feeds/known_exploited_vulnerabilities.json";

/**
 * Récupère les entrées KEV ajoutées dans les dernières `hours` heures.
 * Ces vulnérabilités sont, par définition, exploitées activement → priorité maximale.
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectKEV(hours = 24) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  let data;
  try {
    const res = await fetch(KEV_URL, {
      headers: { "User-Agent": "VeilleApp/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  return (data.vulnerabilities || [])
    .filter((v) => {
      const added = v.dateAdded ? new Date(v.dateAdded) : null;
      return added && added >= cutoff;
    })
    .map((v) => {
      const vendor = [v.vendorProject, v.product].filter(Boolean).join(" ");
      const due = v.dueDate || null;
      const ransom = v.knownRansomwareCampaignUse === "Known";

      const detailLines = [
        v.shortDescription || "",
        v.requiredAction ? `Action requise (CISA) : ${v.requiredAction}` : "",
        due
          ? `Échéance de remédiation pour les agences fédérales US : ${due}.`
          : "",
        ransom ? "Exploitée dans des campagnes de rançongiciel connues." : "",
      ].filter(Boolean);

      return {
        title: `${v.cveID} — ${vendor}${v.vulnerabilityName ? " : " + v.vulnerabilityName : ""}`,
        cve: v.cveID,
        severity: "critical",
        section: "vulns",
        vendor: vendor || null,
        cvss: null,
        exploited: true,
        ransomware: ransom,
        kevDue: due,
        body: v.shortDescription || v.vulnerabilityName || "",
        detail: detailLines.join("\n\n"),
        action: null, // rempli par compose.js (priorité urgente)
        sources: [
          {
            url: "https://www.cisa.gov/known-exploited-vulnerabilities-catalog",
            label: "CISA KEV",
          },
          { url: `https://nvd.nist.gov/vuln/detail/${v.cveID}`, label: "NVD" },
        ],
        pubDate: v.dateAdded ? new Date(v.dateAdded) : new Date(),
      };
    });
}
