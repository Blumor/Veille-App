import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Persistance des rapports en fichiers JSON (data/reports/), indexés par _index.json.
// Interface stable list/get/save (remplaçable par une base sans toucher au reste).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.resolve(__dirname, '../../data/reports');
const INDEX_PATH = path.join(REPORTS_DIR, '_index.json');

// Identifiant de rapport autorisé : <type>-AAAA-MM-JJ. Empêche toute traversée de
// chemin (l'id provient d'une URL publique : /api/reports/:id).
const VALID_ID = /^[a-z]+-\d{4}-\d{2}-\d{2}$/;

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

/** Rapport complet par id (id validé contre la traversée de chemin), ou null. */
export async function getReport(id) {
  if (!VALID_ID.test(id || '')) return null;
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
