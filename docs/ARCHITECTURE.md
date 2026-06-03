# Architecture

```
  CLI (src/index.js) / API (src/server.js)
        │
        ▼
   generator/        collecte → regroupement → score + rédaction → enrichissement
        │            (rapport normalisé : lib/schema.js)
        ▼
   storage/          data/reports/*.json + _index.json
        │
        ▼
   public/           console web (statique), lit les JSON
```

## Pipeline (`src/generator/generate.js`)

1. **Collecte** :
   - `rssCollector.js` — 30 flux RSS (presse FR + internationale, CERT-FR, recherche éditeurs).
   - `nvdCollector.js` — API NVD (CVE critiques, CVSS, éditeur via CPE).
   - `kevCollector.js` — CISA KEV (vulnérabilités activement exploitées).
   - `ransomwareCollector.js` — ransomware.live (victimes, France priorisée).
   - `githubAdvisories.js` — GitHub Advisory DB (open-source).
   - `hnCollector.js` — Hacker News (signal communautaire).
   - `anssiScraper.js` — publications ANSSI (scraping du sitemap cyber.gouv.fr, faute de RSS).
2. **Regroupement** — `cluster.js` fusionne les articles d'une même info (CVE / titres similaires).
3. **Enrichissement vulns** — `epss.js` ajoute la probabilité d'exploitation (EPSS) par CVE.
4. **Score + rédaction** — `compose.js` : accroche FR, action, et **score d'importance /100** (voir plus bas).
5. **Sélection** — tri par score, découpe en sections, items « France » jamais coupés.
6. **Enrichissement descriptions** — `enrich.js` complète les descriptions trop courtes en récupérant le texte de la page source (déterministe, tolérant, anti-SSRF).
7. **Normalisation** — `lib/schema.js` valide et fige le contrat de données.

## Calcul du score (`compose.js`)

- **Vulnérabilités** : scores communautaires (CVSS + EPSS + CISA KEV + ubiquité du logiciel).
- **Autres infos** : fiabilité de la source (Admiralty Code, évaluée en isolation) + impact intrinsèque du contenu (valeurs d'information de Galtung & Ruge). Pas de recoupement.

## Contrat de données (`lib/schema.js`)

```jsonc
{
  "id": "daily-2026-06-01", "type": "daily|weekly|monthly", "date": "YYYY-MM-DD",
  "title", "summary", "generatedAt",
  "sections": [{ "id": "vulns", "items": [{
    "title", "cve", "severity": "critical|high|news|culture",
    "score": 0, "corroboration": 1, "region": "fr|intl",
    "body", "detail", "action", "sources": [{ "url", "label" }], "url", "pubDate"
  }]}]
}
```

Générateur, validateur (`schema.js`) et front (`app.js`) restent alignés sur ce contrat.

## Automatisation & déploiement

- **Génération** : workflow `.github/workflows/veille.yml` (`workflow_dispatch`, type `auto` = quotidien + hebdo le lundi + mensuel le 1er), déclenché à 6h Paris par un service cron externe via l'API GitHub (token hors dépôt — voir README).
- **Déploiement** : `.github/workflows/pages.yml` build (`scripts/build-static.mjs`) + publie sur GitHub Pages à chaque push et après chaque génération.

## Sécurité

- `getReport(id)` valide l'id (anti-traversée de chemin) ; le front neutralise les URLs non http(s) ; le scraping bloque les hôtes privés (anti-SSRF).
