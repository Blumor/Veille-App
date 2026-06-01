// Connecteur GitHub Advisory Database (API publique, sans clé) : vulnérabilités
// des paquets open-source / supply-chain. On ne garde que critical/high récentes.
const URL = 'https://api.github.com/advisories?per_page=100&sort=published&type=reviewed';
const UA = { 'User-Agent': 'VeilleCyber/1.0', Accept: 'application/vnd.github+json' };
const SEV = { critical: 'critical', high: 'high' };

/**
 * @param {number} hours
 * @returns {Promise<object[]>}
 */
export async function collectGitHubAdvisories(hours = 168) {
  const cutoff = new Date(Date.now() - hours * 3_600_000);

  let data;
  try {
    const r = await fetch(URL, { headers: UA, signal: AbortSignal.timeout(20_000) });
    if (!r.ok) return [];
    data = await r.json();
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  return data
    .filter((a) => SEV[a.severity] && a.published_at && new Date(a.published_at) >= cutoff)
    .map((a) => {
      const pkg = a.vulnerabilities?.find((v) => v.package)?.package;
      const vendor = pkg ? `${pkg.name} (${pkg.ecosystem})` : null;
      const summary = (a.summary || '').trim();
      return {
        title: a.cve_id ? `${a.cve_id} — ${summary}` : summary,
        cve: a.cve_id || null,
        severity: SEV[a.severity],
        section: 'vulns',
        vendor,
        cvss: a.cvss?.score || null,
        exploited: false,
        body: summary,
        detail: [summary, vendor ? `Paquet affecté : ${vendor}.` : ''].filter(Boolean).join('\n\n'),
        action: null,
        sources: [{ url: a.html_url, label: 'GitHub Advisory' }],
        pubDate: new Date(a.published_at),
      };
    });
}
