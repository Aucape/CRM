'use strict';
// Estimation de l'impôt des personnes physiques et des cotisations sociales
// d'indépendant belge. Tous les barèmes sont modifiables dans Paramètres.

const { db, getSetting } = require('../db');
const { round2 } = require('./belgium');

/** Impôt progressif par tranches (sans quotité exemptée). */
function progressiveTax(amount, brackets) {
  let tax = 0;
  let prev = 0;
  for (const b of brackets) {
    const upTo = b.upTo == null ? Infinity : Number(b.upTo);
    if (amount > prev) {
      tax += (Math.min(amount, upTo) - prev) * (Number(b.rate) / 100);
      prev = upTo;
    } else break;
  }
  return tax;
}

/** Cotisations sociales annuelles sur base du revenu net (avant cotisations). */
function socialContributions(netIncome, p) {
  const base = Math.max(Number(netIncome) || 0, 0);
  const effectiveBase = Math.max(base, Number(p.social_min_income) || 0);
  let contrib = Math.min(effectiveBase, p.social_cap_1) * (p.social_rate_1 / 100);
  if (effectiveBase > p.social_cap_1) {
    contrib += (Math.min(effectiveBase, p.social_cap_2) - p.social_cap_1) * (p.social_rate_2 / 100);
  }
  const adminFees = contrib * (p.social_admin_pct / 100);
  return { contributions: round2(contrib), admin_fees: round2(adminFees), total: round2(contrib + adminFees) };
}

/** Amortissements de l'année pour toutes les immobilisations actives. */
function depreciationForYear(year) {
  const assets = db.prepare('SELECT * FROM assets').all();
  let total = 0;
  const details = [];
  for (const a of assets) {
    const startYear = Number(a.purchase_date.slice(0, 4));
    const endYear = startYear + a.duration_years - 1;
    if (year < startYear || year > endYear) continue;
    if (a.sold_date && Number(a.sold_date.slice(0, 4)) < year) continue;
    const annuity = round2((a.amount_excl / a.duration_years) * (Number(a.income_deduct_pct) / 100));
    total += annuity;
    details.push({ id: a.id, name: a.name, annuity, year_index: year - startYear + 1, duration: a.duration_years });
  }
  return { total: round2(total), details };
}

/**
 * Estimation complète pour une année de revenus :
 * chiffre d'affaires, frais réels vs forfait, cotisations sociales, IPP + communaux.
 */
function estimate(year) {
  const p = getSetting('tax_params');
  const y = String(year);

  const revenueRow = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN doc_type = 'credit_note' THEN -total_excl ELSE total_excl END), 0) AS rev
    FROM documents
    WHERE doc_type IN ('invoice','credit_note') AND status NOT IN ('draft','cancelled')
      AND strftime('%Y', issue_date) = ?
  `).get(y);
  const revenue = round2(revenueRow.rev);

  // Frais réels : coût = HTVA + TVA non récupérée, × % pro × % déductible.
  // Les achats convertis en immobilisation passent par les amortissements.
  const expenses = db.prepare(`
    SELECT e.*, cat.name AS category_name FROM expenses e
    LEFT JOIN expense_categories cat ON cat.id = e.category_id
    WHERE strftime('%Y', e.expense_date) = ? AND e.is_asset = 0
  `).all(y);
  let realExpenses = 0;
  let socialPaid = 0;
  for (const e of expenses) {
    const proPct = Number(e.professional_pct) / 100;
    const vatNotRecovered = Number(e.vat_amount) * (1 - Number(e.vat_deduct_pct) / 100);
    const cost = (Number(e.amount_excl) + vatNotRecovered) * proPct * (Number(e.income_deduct_pct) / 100);
    realExpenses += cost;
    if ((e.category_name || '').toLowerCase().includes('cotisations sociales')) socialPaid += Number(e.amount_incl);
  }
  const depreciation = depreciationForYear(Number(year));
  realExpenses = round2(realExpenses + depreciation.total);

  // Frais forfaitaires (bénéfices) : % du CA plafonné.
  const forfait = round2(Math.min(revenue * (p.forfait_rate / 100), p.forfait_max));
  const bestExpenses = Math.max(realExpenses, forfait);
  const usedMethod = realExpenses >= forfait ? 'reels' : 'forfait';

  const netBeforeSocial = Math.max(round2(revenue - bestExpenses), 0);
  // Cotisations estimées sur le net (les cotisations déjà payées en frais réels sont
  // déjà déduites dans realExpenses si encodées comme dépense).
  const social = socialContributions(netBeforeSocial, p);
  const socialToDeduct = socialPaid > 0 ? 0 : social.total; // éviter la double déduction
  const taxable = Math.max(round2(netBeforeSocial - socialToDeduct), 0);

  const grossTax = progressiveTax(taxable, p.brackets);
  const taxFreeRelief = progressiveTax(Math.min(Number(p.tax_free_amount), taxable), p.brackets);
  const stateTax = Math.max(round2(grossTax - taxFreeRelief), 0);
  const communalTax = round2(stateTax * (p.communal_tax_pct / 100));
  const totalTax = round2(stateTax + communalTax);

  const totalToSetAside = round2(totalTax + (socialPaid > 0 ? 0 : social.total));
  const netInPocket = round2(revenue - bestExpenses - social.total - totalTax + (socialPaid > 0 ? social.total : 0));

  return {
    year: Number(year),
    params_label: p.year_label,
    revenue,
    real_expenses: realExpenses,
    depreciation: depreciation.total,
    depreciation_details: depreciation.details,
    forfait_expenses: forfait,
    used_method: usedMethod,
    deducted_expenses: round2(bestExpenses),
    net_before_social: netBeforeSocial,
    social_estimated: social,
    social_paid_encoded: round2(socialPaid),
    taxable,
    state_tax: stateTax,
    communal_tax: communalTax,
    total_tax: totalTax,
    effective_rate_pct: revenue > 0 ? round2((totalToSetAside / revenue) * 100) : 0,
    total_to_set_aside: totalToSetAside,
    net_in_pocket: netInPocket,
    quarterly_social: round2(social.total / 4),
    prepayment_suggestion: round2(totalTax / 4),
  };
}

module.exports = { estimate, socialContributions, progressiveTax, depreciationForYear };
