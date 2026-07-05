'use strict';
// Scan de justificatifs par IA : extraction automatique des données d'un
// ticket/facture (photo ou PDF) via l'API Claude. Nécessite une clé API
// Anthropic dans Paramètres → Intégrations.

const Anthropic = require('@anthropic-ai/sdk');
const { getSetting } = require('../db');

const RECEIPT_SCHEMA = {
  type: 'object',
  properties: {
    supplier: { type: 'string', description: 'Nom du fournisseur/commerçant' },
    supplier_vat: { type: 'string', description: 'Numéro de TVA du fournisseur (ex. BE0123456789), vide si absent' },
    description: { type: 'string', description: 'Courte description de l\'achat' },
    expense_date: { type: 'string', description: 'Date du document au format YYYY-MM-DD' },
    amount_incl: { type: 'number', description: 'Montant total TVA comprise' },
    vat_amount: { type: 'number', description: 'Montant total de la TVA (0 si non mentionnée)' },
    amount_excl: { type: 'number', description: 'Montant hors TVA' },
    vat_rate: { type: 'number', description: 'Taux de TVA principal en % (21, 12, 6 ou 0)' },
    category: { type: 'string', description: 'Catégorie la plus adaptée, choisie EXACTEMENT dans la liste fournie' },
    confidence: { type: 'string', enum: ['haute', 'moyenne', 'basse'], description: 'Confiance dans l\'extraction' },
  },
  required: ['supplier', 'supplier_vat', 'description', 'expense_date', 'amount_incl', 'vat_amount', 'amount_excl', 'vat_rate', 'category', 'confidence'],
  additionalProperties: false,
};

/**
 * Analyse un justificatif (image ou PDF) et retourne les champs de la dépense.
 * @param {Buffer} buffer contenu du fichier
 * @param {string} mimeType type MIME (image/* ou application/pdf)
 * @param {string[]} categories noms des catégories disponibles
 */
async function scanReceipt(buffer, mimeType, categories) {
  const integrations = getSetting('integrations');
  if (!integrations.anthropic_api_key) {
    const err = new Error('Aucune clé API Anthropic configurée (Paramètres → Intégrations).');
    err.status = 400;
    throw err;
  }
  const client = new Anthropic({ apiKey: integrations.anthropic_api_key });

  const data = buffer.toString('base64');
  const fileBlock = mimeType === 'application/pdf'
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } }
    : { type: 'image', source: { type: 'base64', media_type: mimeType, data } };

  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 2048,
    system: 'Tu extrais les données comptables de justificatifs belges (tickets, factures). ' +
      'Réponds uniquement avec les données du document. Montants en euros avec le point décimal. ' +
      'Si la TVA n\'est pas détaillée, calcule-la depuis le taux le plus probable (21 % par défaut en Belgique, 6 % pour l\'alimentaire). ' +
      'La cohérence amount_excl + vat_amount = amount_incl doit être respectée.',
    output_config: {
      format: { type: 'json_schema', schema: RECEIPT_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: [
        fileBlock,
        {
          type: 'text',
          text: 'Extrais les données de ce justificatif. Catégories disponibles (champ category, copie exacte) :\n' +
            categories.map((c) => '- ' + c).join('\n'),
        },
      ],
    }],
  });

  if (response.stop_reason === 'refusal') {
    const err = new Error('L\'analyse du document a été refusée par le modèle.');
    err.status = 422;
    throw err;
  }
  const text = response.content.find((b) => b.type === 'text')?.text || '{}';
  return JSON.parse(text);
}

module.exports = { scanReceipt };
