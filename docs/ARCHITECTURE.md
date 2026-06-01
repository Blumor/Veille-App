# Architecture

## Principe

Séparation nette en trois responsabilités, reliées par un **format de rapport unique** :

```
            ┌──────────────┐
   cron ───▶│  generator    │  recherche web + rédaction (API Claude)
            └──────┬───────┘
                   │  rapport normalisé (lib/schema.js)
                   ▼
            ┌──────────────┐
            │  storage      │  data/reports/*.json + _index.json
            └──────┬───────┘
                   │
       ┌───────────┼────────────┐
       ▼                        ▼
┌────────────┐          ┌──────────────┐
│  server.js  │ REST ───▶│  public/ (UI) │
└────────────┘          └──────────────┘
```

## Modules

| Module | Rôle | Point d'extension |
|---|---|---|
| `config/default.js` | Source unique : modèle, sections, port | Ajouter une section ⇒ ici + le front la connaît |
| `src/generator/prompts.js` | System prompt + prompts par type | Affiner les critères de tri/criticité |
| `src/generator/client.js` | Wrapper SDK Anthropic + recherche web | Changer de modèle, ajouter du prompt caching |
| `src/generator/generate.js` | Orchestration d'une génération | Enchaîner plusieurs passes (ex. dédup) |
| `src/lib/schema.js` | Extraction JSON + normalisation | Renforcer la validation, gérer de nouveaux champs |
| `src/storage/fileStore.js` | Persistance fichiers | Remplacer par SQLite/Postgres (même interface) |
| `src/server.js` | API REST + front statique | Auth, multi-utilisateur, notifications |
| `public/` | Console (UI) | Filtres, recherche, vue comparée |

## Le contrat de données

Tout passe par une structure de rapport stable (voir `lib/schema.js`) :

```jsonc
{
  "id": "daily-2026-06-01",
  "type": "daily | weekly",
  "date": "YYYY-MM-DD",
  "title": "…",
  "summary": "…",
  "generatedAt": "ISO-8601",
  "sections": [
    { "id": "vulns", "items": [
      { "title", "cve", "severity": "critical|high|news|culture",
        "body", "action", "url" }
    ]}
  ]
}
```

Le générateur (prompt), le validateur (`schema.js`) et le front (`app.js`)
doivent rester alignés sur ce contrat. Toute modification se fait à ces trois endroits.

## Choix assumés

- **Front sans build** : HTML/CSS/JS purs, zéro outillage à maintenir sur la durée.
- **Stockage fichiers** : simple, versionnable, lisible. Migrable vers une base quand le volume l'exigera, sans toucher au reste.
- **Génération côté serveur** : la clé API ne quitte jamais le backend ; permet le cron (vraie automatisation).
