import 'dotenv/config';

/**
 * Configuration centrale du projet.
 * Source unique de vérité pour les paramètres serveur
 * et la définition des sections de rapport.
 *
 * La génération est 100 % gratuite : agrégation RSS + API NVD + catalogue CISA KEV,
 * rédaction par gabarits déterministes (aucune clé API requise).
 */

const VULNS   = { id: 'vulns',   label: 'Vulnérabilités ultra-critiques', icon: '🔴' };
const ATTACKS = { id: 'attacks', label: 'Attaques & leaks',               icon: '🌍' };
const CULTURE = { id: 'culture', label: 'À retenir / culture veille',     icon: '📌' };

export const config = {
  // --- Serveur ---
  port: Number(process.env.PORT) || 4317,

  // --- Sections affichées (ordre + libellés + icône) ---
  // L'id sert de clé entre le générateur, le schéma et le front.
  sections: {
    daily:   [VULNS, ATTACKS, CULTURE],
    weekly:  [{ id: 'synthese', label: 'Synthèse de la semaine', icon: '🧭' }, VULNS, ATTACKS, CULTURE],
    monthly: [{ id: 'synthese', label: 'Synthèse du mois',       icon: '🧭' }, VULNS, ATTACKS, CULTURE],
  },
};
