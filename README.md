# Veille Cyber

Console personnelle de **veille et de threat intelligence cybersécurité**. L'outil
agrège automatiquement l'actualité cyber (vulnérabilités, attaques, tendances)
depuis des sources fiables, **rédige une synthèse en français**, attribue à chaque
information un **score d'importance /100** pour lire l'essentiel en premier, et
présente le tout dans une console web claire.

Rapports **quotidiens**, **hebdomadaires** et **mensuels**. Génération
**100 % gratuite et sans clé API** : tout repose sur des sources publiques et une
rédaction par gabarits déterministes (aucun LLM, aucun coût).

---

## Installation

```bash
git clone https://github.com/Blumor/Veille-App.git
cd Veille-App
npm install
```

Prérequis : **Node.js ≥ 18**. Aucune configuration ni clé n'est nécessaire.

## Lancement

```bash
npm start
#   → console web sur http://localhost:4317
```

## Commandes

| Commande | Rôle |
|---|---|
| `npm start` | Lance la console web (port 4317, modifiable via `PORT`) |
| `npm run dev` | Idem en mode watch (redémarrage auto à chaque modification) |
| `npm run generate:daily` | Génère et archive le rapport du jour |
| `npm run generate:weekly` | Génère et archive le rapport de la semaine |
| `npm run generate:monthly` | Génère et archive le rapport du mois |

Les rapports sont aussi générables à la demande depuis la console web.

## Calcul du score d'importance

Chaque information reçoit un **score sur 100** pour prioriser la lecture quand le
temps manque. Il repose sur trois piliers (voir `src/generator/compose.js`) :

1. **L'autorité de la source** — une info publiée par une autorité (ANSSI/CERT-FR,
   CISA) ou un laboratoire de recherche reconnu pèse lourd, même sans attaque.
2. **Le recoupement multi-médias** — une même information reprise par plusieurs
   sources distinctes est plus fiable et plus marquante (badge « recoupé ×N »).
3. **La gravité** — pour une menace : sévérité, exploitation active (CISA KEV),
   score CVSS.

S'ajoutent des ajustements mineurs (fraîcheur de l'info). Les items sont triés du
plus important au moins important.

## Sources

Toutes gratuites, sans inscription ni clé :

- **Flux RSS (17)** — The Hacker News, BleepingComputer, Krebs on Security,
  Dark Reading, The Record, SecurityWeek, Help Net Security, Infosecurity Magazine,
  **CERT-FR** (alertes + avis), **CISA**, SANS ISC, Cisco Talos, ESET WeLiveSecurity,
  Unit 42, Google Project Zero, Schneier on Security.
- **API NVD** (NIST) — CVE critiques, score CVSS, éditeur affecté.
- **CISA KEV** — vulnérabilités activement exploitées (priorité maximale).

## Structure

```
veille-cyber/
├── config/default.js          # config centrale (sections, port)
├── src/
│   ├── server.js              # serveur Express (front + API REST)
│   ├── index.js               # entrée CLI (génération en ligne de commande)
│   ├── generator/
│   │   ├── rssCollector.js    # collecte des flux RSS
│   │   ├── nvdCollector.js    # collecte API NVD
│   │   ├── kevCollector.js    # collecte CISA KEV
│   │   ├── cluster.js         # regroupement multi-sources (recoupement)
│   │   ├── compose.js         # rédaction par gabarits + calcul du score
│   │   └── generate.js        # orchestration d'une génération
│   ├── lib/schema.js          # normalisation + validation du rapport
│   └── storage/fileStore.js   # persistance JSON des rapports
├── public/                    # front statique (console web)
├── data/reports/              # rapports archivés (JSON)
└── docs/                      # architecture + roadmap
```
