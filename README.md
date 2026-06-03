# Veille Cyber

Console de **veille et de threat intelligence cybersécurité**. L'outil agrège automatiquement l'actualité cyber (vulnérabilités, attaques, tendances) depuis des sources fiables françaises et internationales, rédige une synthèse, attribue à chaque information un **score d'importance /100** pour mettre en avant l'essentiel, et présente le tout dans une page web claire (adaptée PC et mobile).

## 🔗 Accès en ligne

**👉 [blumor.github.io/Veille-App](https://blumor.github.io/Veille-App/)**

Le site est public et s'auto-alimente : rapports **quotidiens**, **hebdomadaires** et **mensuels** générés et publiés automatiquement.

---

## Fonctionnalités

- **Rapports quotidien / hebdomadaire / mensuel**, nommés selon la période couverte (« Briefing du lundi 1 juin », « Semaine du 25 mai au 1 juin », « Veille cyber — Mai 2026 »).
- **Score d'importance /100** sur chaque information, pour prioriser la lecture.
- **Filtre 🇫🇷 France / 🌍 International** — pour suivre spécifiquement l'état de la cyber en France.
- **Recherche plein texte** (titre **et** contenu : CVE, entreprise, sujet…).
- **Interface responsive** — lisible sur PC comme sur smartphone (archive accessible via le menu ☰).
- **100 % gratuit, sans clé API** : sources publiques + rédaction par gabarits déterministes (aucun LLM).

## Calcul du score d'importance

Deux logiques distinctes, déterministes et reproductibles :

**Vulnérabilités** — scores communautaires standards (approche type _SSVC_) :
`gravité CVSS` + `EPSS` (probabilité d'exploitation) + `CISA KEV` (exploitation avérée) + `ubiquité du logiciel affecté`. Une faille critique reste critique même référencée par une seule base.

**Autres infos (attaques, signaux)** — deux cadres reconnus combinés :

- **Admiralty Code (NATO AJP-2.1)** : fiabilité de la source, évaluée _en isolation_ → une
  source de référence (ANSSI, CISA, CERT-FR…) suffit à rendre une info majeure, même seule.
- **Valeurs d'information de Galtung & Ruge** : impact intrinsèque du contenu (gravité de la menace, ampleur/magnitude, acteurs et cibles majeurs).

## Sources

Toutes les sources utilisées sont gratuites, sans inscription ni clé :

- **30 flux RSS** — presse internationale (The Hacker News, BleepingComputer, Krebs, Dark Reading, The Record, SecurityWeek, Security Affairs, GBHackers, The Register, CyberScoop, Help Net, Infosecurity), **presse francophone** (Zataz, Cyberattaque.org, Numerama, IT-Connect, UnderNews, Silicon.fr, Global Security Mag), **autorités** (CERT-FR alertes/avis/actualité, CISA, SANS ISC), **recherche éditeurs** (Cisco Talos, ESET, Unit 42, Google Project Zero, Schneier).
- **API NVD** (NIST) — CVE critiques, score CVSS.
- **CISA KEV** — vulnérabilités activement exploitées.
- **EPSS** (FIRST.org) — probabilité d'exploitation par CVE.
- **ransomware.live** — victimes de rançongiciel (France priorisée).
- **GitHub Advisory Database** — failles open-source / supply-chain.
- **Hacker News** — signal communautaire.
- **ANSSI** (cyber.gouv.fr) — publications institutionnelles (scraping du sitemap, faute de RSS).

---

## Installation locale (optionnel)

Pour héberger ou développer soi-même. Prérequis : **Node.js ≥ 18**.

```bash
git clone https://github.com/Blumor/Veille-App.git
cd Veille-App
npm install
npm start            # console web sur http://localhost:4317
```

Aucune configuration ni clé n'est nécessaire.

## Commandes

| Commande                   | Rôle                                                    |
| -------------------------- | ------------------------------------------------------- |
| `npm start`                | Lance la console web (port 4317, modifiable via `PORT`) |
| `npm run dev`              | Idem en mode watch                                      |
| `npm run generate:daily`   | Génère et archive le rapport du jour                    |
| `npm run generate:weekly`  | Génère et archive le rapport de la semaine              |
| `npm run generate:monthly` | Génère et archive le rapport du mois                    |
| `npm run build`            | Construit le site statique (`dist/`) pour l'hébergement |

La génération automatique (GitHub Actions) et le déploiement (GitHub Pages) tournent sans intervention : rapports publiés chaque jour, le lundi, et le 1er du mois.

## Structure

```
veille-cyber/
├── config/default.js          # config centrale (sections, port)
├── src/
│   ├── server.js              # serveur Express (front + API REST)
│   ├── index.js               # entrée CLI (génération en ligne de commande)
│   ├── generator/
│   │   ├── rssCollector.js    # 30 flux RSS (FR + international)
│   │   ├── nvdCollector.js    # API NVD (CVE critiques)
│   │   ├── kevCollector.js    # CISA KEV (exploitées)
│   │   ├── epss.js            # enrichissement EPSS (proba d'exploitation)
│   │   ├── ransomwareCollector.js # victimes de rançongiciel
│   │   ├── githubAdvisories.js    # failles open-source
│   │   ├── hnCollector.js     # Hacker News (signal communautaire)
│   │   ├── anssiScraper.js    # scraping publications ANSSI
│   │   ├── cluster.js         # regroupement multi-sources
│   │   ├── compose.js         # rédaction par gabarits + calcul du score
│   │   ├── enrich.js          # enrichissement des descriptions (scraping)
│   │   └── generate.js        # orchestration d'une génération
│   ├── lib/schema.js          # normalisation + validation du rapport
│   └── storage/fileStore.js   # persistance JSON des rapports
├── public/                    # front statique (console web, responsive)
├── scripts/build-static.mjs   # build du site statique
├── data/reports/              # rapports archivés (JSON)
└── docs/ARCHITECTURE.md       # architecture détaillée
```
