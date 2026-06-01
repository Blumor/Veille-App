# Roadmap

Pistes d'évolution, à prioriser selon l'usage réel. Rien d'imposé.

## Court terme
- [ ] Filtres dans la console (par sévérité, par section, recherche plein texte).
- [ ] Marqueur « lu / à traiter » par item, persistant.
- [ ] Export d'un rapport en PDF / Markdown (livrable client).
- [ ] Déduplication entre rapports successifs (ne pas répéter une CVE déjà vue).

## Moyen terme
- [ ] Sources configurables et pondérées (ANSSI, CISA KEV, éditeurs précis…).
- [ ] Notifications (e-mail / Slack) à la publication d'un rapport critique.
- [ ] Vue « tendance » : agrégation sur 30 jours (acteurs, secteurs, CVE récurrentes).
- [ ] Profils sectoriels (santé, OIV, finance) influençant le tri.

## Long terme
- [ ] Stockage en base (SQLite puis Postgres) via un adaptateur respectant l'interface de `fileStore`.
- [ ] Multi-utilisateur + authentification si partage en équipe.
- [ ] Ingestion de flux structurés (CERT-FR ATOM/RSS, NVD, CISA KEV JSON) en complément de la recherche web.
- [ ] Corrélation IOC et liens vers les avis officiels par produit.

## Dette / vigilance
- Garder le `model` et la version de l'outil de recherche web à jour (`config/default.js`).
- Surveiller le coût API si la fréquence de génération augmente (préférer Sonnet au quotidien).
- Le format de rapport est un contrat : toute évolution touche prompt + schéma + front ensemble.
