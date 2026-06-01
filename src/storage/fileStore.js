import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Stockage des rapports sous forme de fichiers JSON dans data/reports/.
 * Un index léger (_index.json) liste les métadonnées pour l'affichage.
 *
 * Évolution prévue : remplacer cette implémentation par un adaptateur
 * SQLite/Postgres en conservant la même interface (list / get / save).
 */
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../data/reports');
const INDEX_PATH = path.join(REPORTS_DIR, '_index.json');

async function ensureDir() {
  await fs.mkdir(REPORTS_DIR, { recursive: true });
}

async function readJSON(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Liste des métadonnées de rapports, triée du plus récent au plus ancien. */
export async function listReports() {
  await ensureDir();
  const idx = await readJSON(INDEX_PATH, []);
  return idx.sort((a, b) => (b.date + b.type).localeCompare(a.date + a.type));
}

/** Rapport complet par id, ou null. */
export async function getReport(id) {
  await ensureDir();
  return readJSON(path.join(REPORTS_DIR, `${id}.json`), null);
}

/** Enregistre un rapport et met à jour l'index. */
export async function saveReport(report) {
  await ensureDir();
  await fs.writeFile(
    path.join(REPORTS_DIR, `${report.id}.json`),
    JSON.stringify(report, null, 2),
    'utf8'
  );
  let idx = await readJSON(INDEX_PATH, []);
  idx = idx.filter((x) => x.id !== report.id);
  idx.push({ id: report.id, type: report.type, date: report.date, title: report.title });
  await fs.writeFile(INDEX_PATH, JSON.stringify(idx, null, 2), 'utf8');
  return report;
}
