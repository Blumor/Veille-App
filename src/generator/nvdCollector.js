const NVD_BASE = "https://services.nvd.nist.gov/rest/json/cves/2.0";

function fmtISO(d) {
  return d.toISOString().replace(/\.\d+Z$/, "");
}

function getBaseScore(metrics = {}) {
  return (
    metrics.cvssMetricV31?.[0]?.cvssData?.baseScore ??
    metrics.cvssMetricV30?.[0]?.cvssData?.baseScore ??
    metrics.cvssMetricV2?.[0]?.cvssData?.baseScore ??
    0
  );
}

// Vendor/produit depuis la première configuration CPE (cpe:2.3:a:vendor:product:…)
function getVendor(cve) {
  const cpe = cve.configurations
    ?.flatMap((c) => c.nodes || [])
    .flatMap((n) => n.cpeMatch || [])
    .find((m) => m.criteria)?.criteria;
  if (!cpe) return null;
  const parts = cpe.split(":"); // [cpe,2.3,part,vendor,product,...]
  const vendor = parts[3] && parts[3] !== "*" ? parts[3] : null;
  const product = parts[4] && parts[4] !== "*" ? parts[4] : null;
  const tidy = (s) =>
    s ? s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  return [tidy(vendor), tidy(product)].filter(Boolean).join(" ") || null;
}

/**
 * Récupère les CVE critiques publiées dans les dernières `hours` heures via l'API NVD (gratuite).
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectNVDCves(hours = 48) {
  const end = new Date();
  const start = new Date(end - hours * 3_600_000);
  const url = `${NVD_BASE}?pubStartDate=${fmtISO(start)}&pubEndDate=${fmtISO(end)}&cvssV3Severity=CRITICAL`;

  let data;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "VeilleApp/1.0" },
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return [];
    data = await res.json();
  } catch {
    return [];
  }

  return (data.vulnerabilities || []).map((v) => {
    const cve = v.cve;
    const score = getBaseScore(cve.metrics);
    const vendor = getVendor(cve);
    const enDesc = cve.descriptions?.find((d) => d.lang === "en")?.value || "";
    const shortTitle = enDesc.length > 90 ? enDesc.slice(0, 90) + "…" : enDesc;
    const cwes = (cve.weaknesses || [])
      .flatMap((w) => w.description)
      .map((d) => d.value)
      .filter((v) => v !== "NVD-CWE-noinfo")
      .join(", ");

    const detailLines = [
      enDesc,
      score ? `Score CVSS : ${score}` : "",
      cwes ? `Type de faiblesse (CWE) : ${cwes}` : "",
    ].filter(Boolean);

    return {
      title: vendor ? `${cve.id} — ${vendor}` : `${cve.id} — ${shortTitle}`,
      cve: cve.id,
      severity: score >= 9 ? "critical" : "high",
      section: "vulns",
      vendor,
      cvss: score || null,
      exploited: false,
      body: enDesc,
      detail: detailLines.join("\n\n"),
      action: null, // rempli par compose.js
      sources: [
        { url: `https://nvd.nist.gov/vuln/detail/${cve.id}`, label: "NVD" },
        {
          url: `https://www.cvedetails.com/cve/${cve.id}/`,
          label: "CVE Details",
        },
      ],
      pubDate: new Date(cve.published),
    };
  });
}
