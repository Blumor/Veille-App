/**
 * Point d'entrée CLI — génère un rapport et l'enregistre, puis sort.
 * Utilisé par les tâches planifiées (cron). Exemples :
 *   node src/index.js daily
 *   node src/index.js weekly
 *   node src/index.js monthly
 */
import { generateReport } from './generator/generate.js';
import { saveReport } from './storage/fileStore.js';

const type = process.argv[2] || 'daily';
if (!['daily', 'weekly', 'monthly'].includes(type)) {
  console.error(`[veille] Type invalide : "${type}" (attendu daily | weekly | monthly)`);
  process.exit(1);
}

try {
  console.log(`[veille] Génération du rapport "${type}"…`);
  const report = await generateReport(type);
  await saveReport(report);
  const count = report.sections.reduce((n, s) => n + s.items.length, 0);
  console.log(`[veille] OK — ${report.id} enregistré (${count} items).`);
  process.exit(0);
} catch (err) {
  console.error(`[veille] ÉCHEC : ${err.message}`);
  process.exit(1);
}
