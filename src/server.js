import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/default.js';
import { listReports, getReport, saveReport } from './storage/fileStore.js';
import { generateReport } from './generator/generate.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());

// --- API REST ---

// Liste des rapports (métadonnées)
app.get('/api/reports', async (_req, res) => {
  res.json(await listReports());
});

// Rapport complet
app.get('/api/reports/:id', async (req, res) => {
  const report = await getReport(req.params.id);
  if (!report) return res.status(404).json({ error: 'Rapport introuvable.' });
  res.json(report);
});

// Génération à la demande : POST { "type": "daily" | "weekly" }
app.post('/api/reports/generate', async (req, res) => {
  const type = req.body?.type === 'weekly' ? 'weekly' : 'daily';
  try {
    const report = await generateReport(type);
    await saveReport(report);
    res.json(report);
  } catch (err) {
    console.error('[veille] génération:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Config publique (libellés de sections) pour le front
app.get('/api/config', (_req, res) => {
  res.json({ sections: config.sections });
});

// --- Front statique ---
app.use(express.static(path.resolve(__dirname, '../public')));

app.listen(config.port, () => {
  console.log(`\n  ▣  Veille Cyber — http://localhost:${config.port}`);
  console.log(`     Modèle : ${config.model}\n`);
});
