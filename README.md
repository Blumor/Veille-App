# Veille Cyber — Threat Intelligence Console

Application personnelle de veille cybersécurité : génère des **rapports quotidiens** (dernières 24h) et **hebdomadaires** (synthèse de la semaine), les archive, et les présente dans une console web claire.

La génération s'appuie sur l'API Claude avec **recherche web** : vulnérabilités ultra-critiques sur logiciels répandus, attaques sur grandes entreprises, leaks majeurs, rapports clés (ANSSI/CERT-FR/CISA) et tendances utiles à la veille. Chaque item porte une **source cliquable**.

---

## Démarrage rapide

```bash
# 1. Dépendances
npm install

# 2. Configuration
cp .env.example .env
#   puis renseigne ANTHROPIC_API_KEY dans .env

# 3. Lancer la console web
npm start
#   → http://localhost:4317
```

Au premier lancement, un rapport d'exemple (1er juin 2026) est déjà présent.
Les boutons **Rapport du jour** / **Rapport hebdo** lancent une génération à la demande.

## Génération en ligne de commande

```bash
npm run generate:daily     # produit + archive le rapport du jour
npm run generate:weekly    # produit + archive le rapport hebdo
```

## Automatisation réelle

Deux options pour publier sans intervention :

- **GitHub Actions (recommandé)** — aucune machine à laisser allumée. Le workflow
  `.github/workflows/veille.yml` génère le rapport sur l'infra GitHub puis le commit
  dans le dépôt (quotidien + hebdo le dimanche). Il suffit d'ajouter le secret
  `ANTHROPIC_API_KEY` dans *Settings → Secrets and variables → Actions*. Déclenchement
  manuel possible depuis l'onglet *Actions*. Horaires en UTC, ajustables dans le fichier.
- **Cron local** — voir `scripts/cron-example.txt` si tu préfères héberger toi-même.

## Développement dans VS Code

```bash
git clone <url-de-ton-depot> && cd veille-cyber
npm install
cp .env.example .env        # puis renseigne ta clé API (jamais commitée : .env est ignoré)
npm start
```

L'extension Claude pour VS Code permet d'éditer le projet en session. Le `.env`
reste local et n'est pas poussé sur GitHub.

---

## Structure

```
veille-cyber/
├── config/default.js        # config centrale (modèle, sections, port)
├── src/
│   ├── server.js            # serveur Express (front + API REST)
│   ├── index.js             # entrée CLI (utilisée par cron)
│   ├── generator/           # prompts, client Anthropic, orchestration
│   ├── storage/fileStore.js # persistance JSON des rapports
│   └── lib/schema.js        # extraction + validation du rapport
├── public/                  # front statique (console)
├── data/reports/            # rapports archivés (JSON)
├── scripts/                 # exemples cron
└── docs/                    # architecture + roadmap
```

Détails dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Pistes d'évolution dans [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Configuration utile

| Variable | Rôle | Défaut |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clé API (obligatoire) | — |
| `VEILLE_MODEL` | Modèle de génération | `claude-sonnet-4-6` |
| `PORT` | Port du serveur web | `4317` |

## API REST

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/api/reports` | Liste des rapports (métadonnées) |
| `GET` | `/api/reports/:id` | Rapport complet |
| `POST` | `/api/reports/generate` | Génère (`{ "type": "daily" \| "weekly" }`) |
| `GET` | `/api/config` | Libellés des sections |

## Pile technique

Node.js (ESM) · Express · SDK `@anthropic-ai/sdk` · front vanilla (zéro build).
