/**
 * Build du site statique pour l'hébergement (Cloudflare Pages, GitHub Pages…).
 * Assemble dans dist/ : le front (public/) + les rapports archivés (data/).
 * Le front lit alors data/reports/*.json directement (aucun backend requis).
 *
 *   npm run build   →   dossier `dist/` prêt à publier
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(dist, { recursive: true });

// Front statique → racine du site
await fs.cp(path.join(root, 'public'), dist, { recursive: true });

// Rapports archivés → dist/data/ (lus par le front en relatif : data/reports/…)
await fs.cp(path.join(root, 'data'), path.join(dist, 'data'), { recursive: true });

// Anti-cache : versionne les assets pour que chaque déploiement soit pris en compte
// immédiatement par les navigateurs (sinon styles.css/app.js restent en cache).
const v = Date.now().toString(36);
const indexPath = path.join(dist, 'index.html');
let html = await fs.readFile(indexPath, 'utf8');
html = html
  .replace(/href="styles\.css"/g, `href="styles.css?v=${v}"`)
  .replace(/src="app\.js"/g, `src="app.js?v=${v}"`);
await fs.writeFile(indexPath, html, 'utf8');

const reports = (await fs.readdir(path.join(dist, 'data', 'reports')))
  .filter((f) => f.endsWith('.json') && f !== '_index.json').length;
console.log(`[build] dist/ prêt — front (v=${v}) + ${reports} rapport(s) archivé(s).`);
