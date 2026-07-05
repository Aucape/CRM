'use strict';
// Compta.be — logiciel de comptabilité pour indépendant belge.
// Démarrage : npm start (http://localhost:3900)

const express = require('express');
const path = require('path');

require('./src/db'); // initialise la base et les données par défaut

const core = require('./src/routes/core');
const documents = require('./src/routes/documents');
const expenses = require('./src/routes/expenses');
const bank = require('./src/routes/bank');
const fiscal = require('./src/routes/fiscal');
const integrations = require('./src/routes/integrations');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api', core);
app.use('/api', documents.router);
app.use('/api', expenses);
app.use('/api', bank);
app.use('/api', fiscal);
app.use('/api', integrations);

// Gestion d'erreurs uniforme
app.use((err, req, res, next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.message || 'Erreur interne.' });
});

// Factures récurrentes : génération au démarrage puis toutes les 12 h.
const created = documents.runRecurring();
if (created) console.log(`${created} facture(s) récurrente(s) générée(s).`);
setInterval(() => {
  try {
    documents.runRecurring();
    documents.refreshOverdue();
  } catch (e) { console.error('Tâche périodique :', e); }
}, 12 * 60 * 60 * 1000);

const PORT = process.env.PORT || 3900;
app.listen(PORT, () => {
  console.log(`Compta.be démarré : http://localhost:${PORT}`);
});
