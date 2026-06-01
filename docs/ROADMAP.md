# Roadmap

Pistes d'évolution, à prioriser selon l'usage réel. Rien d'imposé.

## Déjà en place
- [x] Sources multiples gratuites : RSS (17 flux), API NVD, catalogue CISA KEV.
- [x] Rapports quotidien / hebdomadaire / **mensuel**.
- [x] Score d'importance /100 (autorité de la source + recoupement multi-médias + gravité).
- [x] Regroupement multi-sources (corroboration) par CVE / similarité de titre.
- [x] Synthèse rédigée pour les rapports hebdo et mensuel.

## Court terme
- [ ] Filtres dans la console (par sévérité, par section, recherche plein texte).
- [ ] Marqueur « lu / à traiter » par item, persistant.
- [ ] Export d'un rapport en PDF / Markdown (livrable).
- [ ] Déduplication entre rapports successifs (ne pas répéter une CVE déjà vue la veille).

## Moyen terme
- [ ] Sources configurables et pondérées depuis `config` (poids d'autorité éditables).
- [ ] Notifications (e-mail / Slack) à la publication d'un rapport critique.
- [ ] Profils sectoriels (santé, OIV, finance) influençant le score.
- [ ] Améliorer la classification sévérité/section (réduire les faux positifs des mots-clés).

## Long terme
- [ ] Stockage en base (SQLite puis Postgres) via un adaptateur respectant l'interface de `fileStore`.
- [ ] Multi-utilisateur + authentification si partage en équipe.
- [ ] Corrélation IOC et liens vers les avis officiels par produit.
- [ ] Clustering de titres plus robuste (similarité sémantique) sans dépendre d'un service payant.

## Dette / vigilance
- Le format de rapport est un contrat : toute évolution touche `compose.js` + `schema.js` + `app.js` ensemble.
- Vérifier périodiquement que les URL de flux RSS répondent (les éditeurs changent parfois d'adresse).
- Les heuristiques de tri (sévérité, section, clustering de titres) restent perfectibles : à ajuster selon le bruit observé.
