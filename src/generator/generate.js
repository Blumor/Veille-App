import { config } from '../../config/default.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts.js';
import { generateText } from './client.js';
import { extractJSON, normalizeReport } from '../lib/schema.js';

/** Date du jour au format YYYY-MM-DD (fuseau local). */
export function todayISO() {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d - off).toISOString().slice(0, 10);
}

/**
 * Génère un rapport complet (recherche web + rédaction + normalisation).
 * @param {'daily'|'weekly'} type
 * @param {string} [dateISO]
 * @returns {Promise<object>} rapport normalisé
 */
export async function generateReport(type, dateISO = todayISO()) {
  if (type !== 'daily' && type !== 'weekly') {
    throw new Error(`Type inconnu : ${type} (attendu "daily" ou "weekly").`);
  }

  const text = await generateText({
    system: SYSTEM_PROMPT,
    user: buildUserPrompt(type, dateISO),
    maxTokens: config.maxTokens[type],
  });

  const parsed = extractJSON(text);
  if (!parsed) {
    throw new Error('Réponse du modèle illisible (JSON introuvable).');
  }

  return normalizeReport(parsed, type, dateISO);
}
