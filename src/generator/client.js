import Anthropic from '@anthropic-ai/sdk';
import { config, assertApiKey } from '../../config/default.js';

/**
 * Wrapper minimal autour du SDK Anthropic.
 * Active l'outil de recherche web et renvoie le texte concaténé des blocs "text".
 */
let _client = null;
function client() {
  if (!_client) {
    assertApiKey();
    _client = new Anthropic({ apiKey: config.apiKey });
  }
  return _client;
}

/**
 * @param {object} opts
 * @param {string} opts.system  - prompt système
 * @param {string} opts.user    - message utilisateur
 * @param {number} opts.maxTokens
 * @returns {Promise<string>} texte brut (censé contenir le JSON du rapport)
 */
export async function generateText({ system, user, maxTokens }) {
  const res = await client().messages.create({
    model: config.model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: user }],
    tools: [
      { type: config.webSearchTool, name: 'web_search', max_uses: config.maxSearches },
    ],
  });

  return (res.content || [])
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
