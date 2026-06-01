import 'dotenv/config';

/**
 * Configuration centrale du projet.
 * Source unique de vérité pour le modèle, les paramètres serveur,
 * et la définition des sections de rapport.
 */
export const config = {
  // --- API / modèle ---
  apiKey: process.env.ANTHROPIC_API_KEY,
  model: process.env.VEILLE_MODEL || 'claude-sonnet-4-6',
  webSearchTool: 'web_search_20260209', // outil de recherche web Anthropic (version)
  maxSearches: 8,

  // Budget de tokens par type de rapport (backend = pas de limite artificielle)
  maxTokens: {
    daily: 3000,
    weekly: 5000,
  },

  // --- Serveur ---
  port: Number(process.env.PORT) || 4317,

  // --- Sections affichées (ordre + libellés + icône) ---
  // L'id sert de clé entre le générateur, le schéma et le front.
  sections: {
    daily: [
      { id: 'vulns',   label: 'Vulnérabilités ultra-critiques', icon: '🔴' },
      { id: 'attacks', label: 'Attaques & leaks',               icon: '🌍' },
      { id: 'culture', label: 'À retenir / culture veille',     icon: '📌' },
    ],
    weekly: [
      { id: 'synthese', label: 'Synthèse de la semaine',         icon: '🧭' },
      { id: 'vulns',    label: 'Vulnérabilités ultra-critiques', icon: '🔴' },
      { id: 'attacks',  label: 'Attaques & leaks',               icon: '🌍' },
      { id: 'culture',  label: 'À retenir / culture veille',     icon: '📌' },
    ],
  },
};

export function assertApiKey() {
  if (!config.apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY manquante. Copie .env.example vers .env et renseigne ta clé."
    );
  }
}
