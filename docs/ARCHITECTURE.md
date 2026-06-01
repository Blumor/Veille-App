# Architecture

## Principe

Génération **100 % gratuite et déterministe** : aucune API payante, aucune clé.
Trois responsabilités reliées par un **format de rapport unique** :

```
  CLI / cron / API
        │
        ▼
 ┌───────────────┐   collecte : RSS · NVD · CISA KEV
 │   generator    │   regroupement multi-sources (cluster)
 │                │   scoring + rédaction par gabarits (compose)
 └──────┬────────┘
        │  rapport normalisé (lib/schema.js)
        ▼
 ┌───────────────┐
 │   storage      │  data/reports/*.json + _index.json
 └──────┬────────┘
        │
   ┌────┴─────────┐
   ▼              ▼
┌────────────┐  ┌──────────────┐
│ server.js   │ │  public/ (UI) │
│  (REST)     │─▶│  console      │
└────────────┘  └──────────────┘
```

## Pipeline de génération

`generate.js` orchestre, dans l'ordre :

1. **Collecte** (en parallèle, aucune clé requise) :
   - `rssCollector.js` — 17 flux RSS (presse, CERT-FR/CISA, recherche éditeurs).
   - `nvdCollector.js` — API NVD (CVE critiques, score CVSS, éditeur via CPE).
   - `kevCollector.js` — catalogue CISA KEV (vulnérabilités activement exploitées).
2. **Regroupement** — `cluster.js` fusionne les articles d'une même info (même CVE,
   ou titres proches) et compte le **recoupement multi-médias** (`corroboration`).
3. **Rédaction & score** — `compose.js` :
   - `composeItem()` — accroche FR + extrait + action recommandée par gabarits ;
   - `scoreItem()` — score d'importance /100 = **autorité de la source** +
     **recoupement multi-sources** + **gravité** (+ exploitation, CVSS, fraîcheur) ;
   - `composeSummary()` / `composeSynthese()` — résumé exécutif et synthèse rédigée
     (hebdo / mensuel).
4. **Tri + sections** — tri par score décroissant, découpe en sections selon le type.
5. **Normalisation** — `lib/schema.js` valide et fige le contrat de données.

## Modules

| Module | Rôle | Point d'extension |
|---|---|---|
| `config/default.js` | Sections (ordre/libellés/icône) + port | Ajouter une section ⇒ ici + le front la connaît |
| `src/generator/rssCollector.js` | Flux RSS + classement sévérité/section, vendor | Ajouter/retirer une source dans `FEEDS` |
| `src/generator/nvdCollector.js` | CVE critiques via l'API NVD | Élargir aux sévérités HIGH, autres fenêtres |
| `src/generator/kevCollector.js` | Vulnérabilités exploitées (CISA KEV) | Filtrer par éditeur, échéances |
| `src/generator/cluster.js` | Regroupement multi-sources (corroboration) | Affiner la similarité de titres |
| `src/generator/compose.js` | Rédaction par gabarits + scoring | Ajuster les poids d'autorité / la formule de score |
| `src/generator/generate.js` | Orchestration d'une génération | Ajouter un type, enchaîner des passes |
| `src/lib/schema.js` | Normalisation + validation du rapport | Renforcer la validation, nouveaux champs |
| `src/storage/fileStore.js` | Persistance fichiers (list/get/save) | Remplacer par SQLite/Postgres (même interface) |
| `src/server.js` | API REST + front statique | Auth, notifications |
| `public/` | Console (UI, thème sombre éditorial) | Filtres, recherche, vue comparée |

## Le contrat de données

Tout passe par une structure de rapport stable (voir `lib/schema.js`) :

```jsonc
{
  "id": "daily-2026-06-01",
  "type": "daily | weekly | monthly",
  "date": "YYYY-MM-DD",
  "title": "…",
  "summary": "…",
  "generatedAt": "ISO-8601",
  "sections": [
    { "id": "vulns", "items": [
      {
        "title", "cve", "severity": "critical|high|news|culture",
        "score": 0,            // importance /100
        "corroboration": 1,    // nb de médias recoupant l'info
        "body",                // accroche + extrait (preview)
        "detail",              // analyse complète
        "action",              // recommandation
        "sources": [{ "url", "label" }],
        "url",
        "pubDate": "ISO-8601"
      }
    ]}
  ]
}
```

Le générateur (`compose.js`), le validateur (`schema.js`) et le front (`app.js`)
restent alignés sur ce contrat. Toute modification se fait à ces endroits.

## Choix assumés

- **Zéro coût, zéro clé** : sources publiques gratuites (RSS, NVD, CISA KEV),
  rédaction par gabarits — pas de LLM, donc rien à payer ni à provisionner.
- **Front sans build** : HTML/CSS/JS purs, aucun outillage à maintenir.
- **Stockage fichiers** : simple, versionnable, lisible ; migrable vers une base
  derrière la même interface quand le volume l'exigera.
- **Score explicable** : la priorité de lecture repose sur des critères lisibles
  (autorité, recoupement, gravité) plutôt que sur une boîte noire.
