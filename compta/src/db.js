'use strict';
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DATA_DIR = process.env.COMPTA_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new Database(path.join(DATA_DIR, 'compta.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS clients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL DEFAULT 'company',            -- company | individual
  name TEXT NOT NULL,
  vat_number TEXT DEFAULT '',
  email TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  address TEXT DEFAULT '',
  zip TEXT DEFAULT '',
  city TEXT DEFAULT '',
  country TEXT DEFAULT 'BE',
  peppol_id TEXT DEFAULT '',
  payment_days INTEGER DEFAULT 30,
  default_vat_regime TEXT DEFAULT '',              -- vide = choisir à la facture
  notes TEXT DEFAULT '',
  archived INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  unit TEXT DEFAULT 'pièce',
  unit_price REAL NOT NULL DEFAULT 0,              -- HTVA
  vat_rate REAL NOT NULL DEFAULT 21,
  archived INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  doc_type TEXT NOT NULL,                          -- invoice | quote | credit_note
  number TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',            -- draft|sent|paid|overdue|accepted|rejected|expired|cancelled
  client_id INTEGER REFERENCES clients(id),
  issue_date TEXT NOT NULL,
  due_date TEXT,
  vat_regime TEXT NOT NULL DEFAULT 'standard',     -- standard|cocontractant|intracom_services|intracom_goods|export|exempt|franchise
  structured_comm TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  total_excl REAL DEFAULT 0,
  total_vat REAL DEFAULT 0,
  total_incl REAL DEFAULT 0,
  payment_date TEXT,
  related_doc_id INTEGER,                          -- NC -> facture, facture -> devis
  recurring_id INTEGER,
  sent_at TEXT,
  reminder_count INTEGER DEFAULT 0,
  last_reminder_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS document_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit TEXT DEFAULT '',
  unit_price REAL NOT NULL DEFAULT 0,
  discount_pct REAL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 21
);

CREATE TABLE IF NOT EXISTS recurring_invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL REFERENCES clients(id),
  label TEXT NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',       -- weekly|monthly|quarterly|yearly
  next_date TEXT NOT NULL,
  end_date TEXT,
  vat_regime TEXT NOT NULL DEFAULT 'standard',
  lines_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT DEFAULT '',
  active INTEGER DEFAULT 1,
  last_generated TEXT
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  vat_grid TEXT NOT NULL DEFAULT '82',             -- 81 marchandises | 82 services & biens divers | 83 investissements
  income_deduct_pct REAL NOT NULL DEFAULT 100,     -- % déductible à l'impôt
  vat_deduct_pct REAL NOT NULL DEFAULT 100,        -- % TVA récupérable
  professional_pct REAL NOT NULL DEFAULT 100,      -- % usage professionnel par défaut
  builtin INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  supplier TEXT DEFAULT '',
  supplier_vat TEXT DEFAULT '',
  description TEXT DEFAULT '',
  category_id INTEGER REFERENCES expense_categories(id),
  expense_date TEXT NOT NULL,
  amount_excl REAL NOT NULL DEFAULT 0,
  vat_amount REAL NOT NULL DEFAULT 0,
  amount_incl REAL NOT NULL DEFAULT 0,
  professional_pct REAL NOT NULL DEFAULT 100,
  income_deduct_pct REAL NOT NULL DEFAULT 100,
  vat_deduct_pct REAL NOT NULL DEFAULT 100,
  vat_regime TEXT NOT NULL DEFAULT 'domestic',     -- domestic|intracom_goods|intracom_services|import|cocontractant|none
  payment_method TEXT DEFAULT 'bank',
  receipt_path TEXT DEFAULT '',
  is_asset INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  purchase_date TEXT NOT NULL,
  amount_excl REAL NOT NULL,
  duration_years INTEGER NOT NULL DEFAULT 5,
  income_deduct_pct REAL NOT NULL DEFAULT 100,
  expense_id INTEGER REFERENCES expenses(id),
  notes TEXT DEFAULT '',
  sold_date TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS bank_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  iban TEXT DEFAULT '',
  bic TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER REFERENCES bank_accounts(id),
  tx_date TEXT NOT NULL,
  amount REAL NOT NULL,
  counterparty_name TEXT DEFAULT '',
  counterparty_iban TEXT DEFAULT '',
  communication TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new',              -- new|matched|ignored
  matched_type TEXT,                               -- invoice|expense
  matched_id INTEGER,
  import_batch TEXT DEFAULT '',
  dedupe_hash TEXT UNIQUE,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS vat_declarations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  year INTEGER NOT NULL,
  period TEXT NOT NULL,                            -- Q1..Q4 | M01..M12
  grids_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',            -- draft|filed
  filed_at TEXT,
  UNIQUE(year, period)
);
`);

// ---- Paramètres par défaut -------------------------------------------------
const DEFAULT_SETTINGS = {
  company: {
    name: '', vat_number: '', iban: '', bic: '', email: '', phone: '',
    address: '', zip: '', city: '', country: 'BE', website: '',
    activity: '', logo_path: '',
    legal_form: 'personne_physique',
  },
  fiscal: {
    vat_regime: 'assujetti',          // assujetti | franchise | exempte
    vat_periodicity: 'quarterly',     // quarterly | monthly
    invoice_prefix: '{YYYY}-',
    quote_prefix: 'D{YYYY}-',
    credit_note_prefix: 'NC{YYYY}-',
    next_invoice_seq: 1,
    next_quote_seq: 1,
    next_credit_note_seq: 1,
    seq_year: new Date().getFullYear(),
    default_payment_days: 30,
    invoice_footer: '',
  },
  // Paramètres fiscaux — année de revenus 2026 (modifiables dans Paramètres).
  tax_params: {
    year_label: 'Revenus 2026',
    activity_status: 'principal',     // principal | complementaire
    social_regime: 'belgique',        // belgique | etranger (salarié à l'étranger : pas de cotisations belges)
    foreign_salary: 0,                // salaire étranger exonéré (imposable annuel) — réserve de progressivité
    social_exempt_threshold: 1900,    // complémentaire : pas de cotisations sous ce revenu net annuel
    brackets: [
      { upTo: 16560, rate: 25 },
      { upTo: 29230, rate: 40 },
      { upTo: 50610, rate: 45 },
      { upTo: null,  rate: 50 },
    ],
    tax_free_amount: 11090,           // quotité exemptée d'impôt
    communal_tax_pct: 7,              // additionnels communaux (moyenne ~7%)
    forfait_rate: 30,                 // frais forfaitaires bénéfices : 30 %
    forfait_max: 6250,                // plafond frais forfaitaires
    social_rate_1: 20.5,              // cotisations sociales tranche 1
    social_cap_1: 75000,
    social_rate_2: 14.16,             // tranche 2
    social_cap_2: 110000,
    social_min_income: 17000,         // revenu minimum présumé (à titre principal)
    social_admin_pct: 3.55,           // frais de gestion caisse sociale (~3,05-4,25 %)
    franchise_threshold: 25000,       // plafond régime franchise TVA
  },
};

const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key) {
  const row = getSettingStmt.get(key);
  if (!row) return DEFAULT_SETTINGS[key] ? JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key])) : null;
  const stored = JSON.parse(row.value);
  // fusion avec les défauts pour que les nouvelles clés apparaissent après mise à jour
  if (DEFAULT_SETTINGS[key] && typeof stored === 'object' && !Array.isArray(stored)) {
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_SETTINGS[key])), stored);
  }
  return stored;
}

function setSetting(key, value) {
  setSettingStmt.run(key, JSON.stringify(value));
}

// ---- Catégories de dépenses belges par défaut ------------------------------
const DEFAULT_CATEGORIES = [
  // [nom, grille TVA, % déduct. impôt, % TVA récupérable, % pro]
  ['Marchandises & matières premières', '81', 100, 100, 100],
  ['Sous-traitance', '82', 100, 100, 100],
  ['Loyer professionnel', '82', 100, 0, 100],
  ['Bureau à domicile (quote-part)', '82', 100, 0, 100],
  ['Électricité, eau, chauffage', '82', 100, 100, 100],
  ['Téléphone & internet', '82', 100, 100, 80],
  ['Matériel informatique (<1 000 €)', '82', 100, 100, 100],
  ['Fournitures de bureau', '82', 100, 100, 100],
  ['Logiciels & abonnements', '82', 100, 100, 100],
  ['Logiciel de facturation/comptabilité (déduct. 120 %)', '82', 120, 100, 100],
  ['Honoraires (comptable, avocat…)', '82', 100, 100, 100],
  ['Assurances professionnelles', '82', 100, 0, 100],
  ['Cotisations sociales', '82', 100, 0, 100],
  ['P.L.C.I.', '82', 100, 0, 100],
  ['Formation professionnelle', '82', 100, 100, 100],
  ['Livres & documentation', '82', 100, 100, 100],
  ['Restaurant', '82', 69, 0, 100],
  ['Frais de réception', '82', 50, 0, 100],
  ['Cadeaux d’affaires', '82', 50, 0, 100],
  ['Voiture — carburant', '82', 75, 50, 100],
  ['Voiture — entretien & réparations', '82', 75, 50, 100],
  ['Voiture — assurance & taxes', '82', 75, 0, 100],
  ['Voiture électrique — recharge', '82', 100, 50, 100],
  ['Transports en commun & taxi', '82', 100, 6, 100],
  ['Déplacements & voyages professionnels', '82', 100, 0, 100],
  ['Marketing & publicité', '82', 100, 100, 100],
  ['Frais bancaires', '82', 100, 0, 100],
  ['Vêtements de travail spécifiques', '82', 100, 100, 100],
  ['Investissements (matériel > 1 000 €)', '83', 100, 100, 100],
  ['Amendes', '82', 0, 0, 100],
  ['Divers', '82', 100, 100, 100],
];

const catCount = db.prepare('SELECT COUNT(*) AS n FROM expense_categories').get().n;
if (catCount === 0) {
  const ins = db.prepare(
    'INSERT INTO expense_categories (name, vat_grid, income_deduct_pct, vat_deduct_pct, professional_pct, builtin) VALUES (?, ?, ?, ?, ?, 1)'
  );
  const tx = db.transaction(() => {
    for (const c of DEFAULT_CATEGORIES) ins.run(...c);
  });
  tx();
}

module.exports = { db, getSetting, setSetting, DATA_DIR, DEFAULT_SETTINGS };
