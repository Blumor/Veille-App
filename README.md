# Veille Cyber — Threat Intelligence Console

Application personnelle de veille cybersécurité : génère des **rapports quotidiens**
(dernières 24h), **hebdomadaires** et **mensuels**, les archive, et les présente
dans une console web lisible.

La génération est **100 % gratuite et sans clé API** : agrégation des flux **RSS**
de référence, de l'**API NVD** (vulnérabilités) et du **catalogue CISA KEV**
(failles activement exploitées). La rédaction se fait par **gabarits déterministes**
(aucun LLM). Chaque info reçoit un **score d'importance /100** pour lire l'essentiel
en premier, et porte ses **sources cliquables**.

---

## Démarrage rapide

```bash
# 1. Dépendances
npm install

# 2. Lancer la console web
npm start
#   → http://localhost:4317
```

Aucune configuration, aucune clé : ça marche directement. Les boutons
**Rapport du jour** / **hebdo** / **mensuel** lancent une génération à la demande.

## Génération en ligne de commande

```bash
npm run generate:daily     # produit + archive le rapport du jour
npm run generate:weekly    # produit + archive le rapport hebdo
npm run generate:monthly   # produit + archive le rapport mensuel
```

## Comment l'importance est calculée

Chaque item a un **score /100** pour prioriser la lecture quand le temps manque.
Trois piliers (voir `src/generator/compose.js`) :

1. **L'autorité de l'organisation** qui publie (ANSSI/CERT-FR, CISA, labos de
   recherche, presse de référence…) — une info d'une source faisant autorité pèse,
   même sans attaque.
2. **Le recoupement multi-médias** — une info reprise par plusieurs sources est plus
   fiable et plus marquante (badge « recoupé ×N »).
3. **La gravité** quand il s'agit d'une menace (sévérité, exploitation active, CVSS).

## Sources collectées

- **RSS** (17 flux) — The Hacker News, BleepingComputer, Krebs, Dark Reading,
  The Record, SecurityWeek, Help Net, Infosecurity, **CERT-FR** (alertes + avis),
  **CISA**, SANS ISC, Cisco Talos, ESET, Unit 42, Google Project Zero, Schneier.
- **API NVD** (NIST) — CVE critiques, score CVSS, éditeur affecté.
- **CISA KEV** — vulnérabilités activement exploitées (priorité maximale).

Toutes gratuites, sans inscription ni clé.

## Automatisation

Deux options pour publier sans intervention — **aucun secret ni clé requis** :

- **GitHub Actions (recommandé)** — aucune machine à laisser allumée. Le workflow
  `.github/workflows/veille.yml` génère les rapports sur l'infra GitHub puis les commit
  dans le dépôt. Logique **cumulative**, une exécution par jour à ~6h Paris :
  - **journalier** tous les jours,
  - **+ hebdomadaire** le lundi,
  - **+ mensuel** le 1er du mois.

  Déclenchement manuel possible depuis l'onglet *Actions* (choix du type). Il suffit de
  pousser le dépôt sur GitHub — aucun secret à configurer. L'horaire (cron en UTC) est
  ajustable en tête du fichier.
- **Cron local** — voir `scripts/cron-example.txt`.

## Hébergement gratuit 24/24 (Cloudflare Pages)

L'app étant un **visualiseur de rapports déjà générés** (par GitHub Actions), elle
se publie comme **site statique** : gratuit, toujours en ligne, sans serveur ni
démarrage à froid, et compatible **dépôt privé**.

Le front s'adapte tout seul : avec un backend (`npm start`) il utilise l'API ;
hébergé en statique, il lit directement les JSON de `data/reports/`.

**Build** : `npm run build` assemble le dossier `dist/` (front + rapports).

**Mise en place sur Cloudflare Pages :**
1. Pousser le dépôt sur GitHub (ou GitLab).
2. Cloudflare → *Workers & Pages* → *Create* → *Pages* → *Connect to Git*, choisir le dépôt.
3. Réglages de build :
   - **Framework preset** : `None`
   - **Build command** : `npm run build`
   - **Build output directory** : `dist`
4. *Save and Deploy*. Le site est en ligne sur `https://<projet>.pages.dev`.

À chaque push (y compris les commits automatiques de rapports par GitHub Actions),
Cloudflare **rebuild et redéploie tout seul** — la veille reste à jour sans rien faire.

> Astuce : sur dépôt **public**, *GitHub Pages* fonctionne aussi (même build,
> *Settings → Pages → Build and deployment → GitHub Actions*).

## Développement dans VS Code

```bash
git clone <url-de-ton-depot> && cd veille-cyber
npm install
npm start
```

`F5` lance le serveur ou une génération (voir `.vscode/launch.json`).

---

## Structure

```
veille-cyber/
├── config/default.js         # config centrale (sections, port)
├── src/
│   ├── server.js            # serveur Express (front + API REST)
│   ├── index.js             # entrée CLI (utilisée par cron)
│   ├── generator/
│   │   ├── rssCollector.js  # flux RSS
│   │   ├── nvdCollector.js  # API NVD
│   │   ├── kevCollector.js  # catalogue CISA KEV
│   │   ├── cluster.js       # regroupement multi-sources (recoupement)
│   │   ├── compose.js       # rédaction par gabarits + score d'importance
│   │   └── generate.js      # orchestration d'une génération
│   ├── storage/fileStore.js # persistance JSON des rapports
│   └── lib/schema.js        # normalisation + validation du rapport
├── public/                  # front statique (console)
├── data/reports/            # rapports archivés (JSON)
├── scripts/
│   ├── build-static.mjs     # build du site statique (dist/) pour l'hébergement
│   └── cron-example.txt     # exemples cron
└── docs/                    # architecture + roadmap
```

Détails dans [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md). Pistes dans [`docs/ROADMAP.md`](docs/ROADMAP.md).

## Configuration

| Variable | Rôle | Défaut |
|---|---|---|
| `PORT` | Port du serveur web | `4317` |

Exemple : `PORT=8080 npm start`. C'est la seule variable — il n'y a aucune clé à fournir.

## API REST

| Méthode | Route | Rôle |
|---|---|---|
| `GET`  | `/api/reports` | Liste des rapports (métadonnées) |
| `GET`  | `/api/reports/:id` | Rapport complet |
| `POST` | `/api/reports/generate` | Génère (`{ "type": "daily" \| "weekly" \| "monthly" }`) |
| `GET`  | `/api/config` | Libellés des sections |

## Pile technique

Node.js (ESM) · Express · `rss-parser` · API NVD & CISA KEV (fetch natif) ·
front vanilla (zéro build). **Aucune dépendance à un service payant.**
