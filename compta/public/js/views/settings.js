'use strict';
// Paramètres : entreprise, facturation, régime TVA, barèmes fiscaux, outils.

async function viewSettings(main) {
  const s = await api('/settings');
  const c = s.company, f = s.fiscal, p = s.tax_params;

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Paramètres</h1><div class="sub">Vos informations apparaissent sur les factures, les XML Intervat et les fichiers Peppol.</div></div>
    </div>
    <div class="grid grid-2" style="align-items:start">
      <div>
        <div class="card">
          <h2>🏢 Mon entreprise</h2>
          <form id="form-company">
            <label>Nom / dénomination *</label><input name="name" value="${esc(c.name)}" placeholder="Augusto Carvalho Pereira">
            <div class="form-row">
              <div><label>N° TVA / BCE <span id="vat-check" style="font-weight:400"></span></label>
                <input name="vat_number" id="my-vat" value="${esc(c.vat_number)}" placeholder="BE0123456749"></div>
              <div><label>Activité</label><input name="activity" value="${esc(c.activity)}"></div>
            </div>
            <label>Adresse</label><input name="address" value="${esc(c.address)}">
            <div class="form-row">
              <div><label>Code postal</label><input name="zip" value="${esc(c.zip)}"></div>
              <div><label>Ville</label><input name="city" value="${esc(c.city)}"></div>
            </div>
            <div class="form-row">
              <div><label>E-mail</label><input name="email" value="${esc(c.email)}"></div>
              <div><label>Téléphone</label><input name="phone" value="${esc(c.phone)}"></div>
            </div>
            <div class="form-row">
              <div><label>IBAN (pour le QR de paiement)</label><input name="iban" value="${esc(c.iban)}" placeholder="BE68 5390 0754 7034"></div>
              <div><label>BIC</label><input name="bic" value="${esc(c.bic)}"></div>
            </div>
            <div class="modal-actions"><button type="submit" class="btn primary">Enregistrer</button></div>
          </form>
        </div>
        <div class="card">
          <h2>🧾 Facturation</h2>
          <form id="form-fiscal">
            <div class="form-row">
              <div><label>Régime TVA</label><select name="vat_regime">
                <option value="assujetti" ${f.vat_regime === 'assujetti' ? 'selected' : ''}>Assujetti (déclarations périodiques)</option>
                <option value="franchise" ${f.vat_regime === 'franchise' ? 'selected' : ''}>Franchise petites entreprises (&lt; 25 000 €)</option>
                <option value="exempte" ${f.vat_regime === 'exempte' ? 'selected' : ''}>Exempté art. 44 (médical, social…)</option>
              </select></div>
              <div><label>Périodicité TVA</label><select name="vat_periodicity">
                <option value="quarterly" ${f.vat_periodicity === 'quarterly' ? 'selected' : ''}>Trimestrielle</option>
                <option value="monthly" ${f.vat_periodicity === 'monthly' ? 'selected' : ''}>Mensuelle</option>
              </select></div>
            </div>
            <div class="form-row">
              <div><label>Préfixe factures</label><input name="invoice_prefix" value="${esc(f.invoice_prefix)}"><div class="hint">{YYYY} = année. Ex. : ${esc(f.invoice_prefix).replace('{YYYY}', new Date().getFullYear())}0001</div></div>
              <div><label>Préfixe devis</label><input name="quote_prefix" value="${esc(f.quote_prefix)}"></div>
              <div><label>Préfixe notes de crédit</label><input name="credit_note_prefix" value="${esc(f.credit_note_prefix)}"></div>
            </div>
            <div class="form-row">
              <div><label>Prochain n° de facture</label><input name="next_invoice_seq" type="number" value="${f.next_invoice_seq}"></div>
              <div><label>Délai de paiement par défaut (jours)</label><input name="default_payment_days" type="number" value="${f.default_payment_days}"></div>
            </div>
            <label>Pied de page des factures (mentions, conditions générales…)</label>
            <textarea name="invoice_footer">${esc(f.invoice_footer)}</textarea>
            <div class="modal-actions"><button type="submit" class="btn primary">Enregistrer</button></div>
          </form>
        </div>
      </div>
      <div>
        <div class="card">
          <h2>📐 Barèmes fiscaux (${esc(p.year_label)})</h2>
          <p class="hint">Mis à jour chaque année par l'indexation. Adaptez-les si besoin — tous les calculs suivent.</p>
          <form id="form-tax">
            <div class="form-row">
              <div><label>Quotité exemptée d'impôt</label><input name="tax_free_amount" type="number" step="0.01" value="${p.tax_free_amount}"></div>
              <div><label>Additionnels communaux %</label><input name="communal_tax_pct" type="number" step="0.01" value="${p.communal_tax_pct}"></div>
            </div>
            <div class="form-row">
              <div><label>Frais forfaitaires %</label><input name="forfait_rate" type="number" step="0.01" value="${p.forfait_rate}"></div>
              <div><label>Plafond forfait</label><input name="forfait_max" type="number" step="0.01" value="${p.forfait_max}"></div>
            </div>
            <div class="form-row">
              <div><label>Cotisations % (tranche 1)</label><input name="social_rate_1" type="number" step="0.01" value="${p.social_rate_1}"></div>
              <div><label>Plafond tranche 1</label><input name="social_cap_1" type="number" step="0.01" value="${p.social_cap_1}"></div>
            </div>
            <div class="form-row">
              <div><label>Cotisations % (tranche 2)</label><input name="social_rate_2" type="number" step="0.01" value="${p.social_rate_2}"></div>
              <div><label>Plafond tranche 2</label><input name="social_cap_2" type="number" step="0.01" value="${p.social_cap_2}"></div>
            </div>
            <div class="form-row">
              <div><label>Frais de gestion caisse %</label><input name="social_admin_pct" type="number" step="0.01" value="${p.social_admin_pct}"></div>
              <div><label>Revenu min. présumé</label><input name="social_min_income" type="number" step="0.01" value="${p.social_min_income}"></div>
            </div>
            <label>Tranches d'imposition (limite € : taux %)</label>
            ${p.brackets.map((b, i) => `<div class="form-row">
              <div><input name="bracket_up_${i}" type="number" step="0.01" value="${b.upTo ?? ''}" placeholder="∞ (dernière tranche)"></div>
              <div><input name="bracket_rate_${i}" type="number" step="0.01" value="${b.rate}"></div>
            </div>`).join('')}
            <div class="modal-actions"><button type="submit" class="btn primary">Enregistrer</button></div>
          </form>
        </div>
        <div class="card">
          <h2>🚗 Calculateur déductibilité voiture</h2>
          <p class="hint">Formule officielle « gramme » : 120 % − (0,5 × coefficient × CO2/km).</p>
          <div class="form-row">
            <div><label>CO2 (g/km)</label><input id="car-co2" type="number" placeholder="120"></div>
            <div><label>Carburant</label><select id="car-fuel">
              <option value="diesel">Diesel</option><option value="essence">Essence</option><option value="gaz">Gaz naturel</option>
            </select></div>
            <div><label>&nbsp;</label><button class="btn primary" id="car-calc" style="width:100%">Calculer</button></div>
          </div>
          <div id="car-result" style="margin-top:8px"></div>
        </div>
        <div class="card">
          <h2>💾 Données</h2>
          <p class="hint">Vos données sont stockées localement (SQLite). Exportez une sauvegarde régulièrement.</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap">
            <a class="btn" href="/api/backup">⬇️ Exporter la sauvegarde</a>
            <label class="btn" style="margin:0">⬆️ Restaurer<input type="file" id="restore-file" accept=".json" hidden></label>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('form-company').addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/settings', { method: 'PUT', body: { company: formValues(e.target) } });
    toast('Entreprise enregistrée.');
  });
  document.getElementById('form-fiscal').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(e.target);
    v.next_invoice_seq = Number(v.next_invoice_seq);
    v.default_payment_days = Number(v.default_payment_days);
    await api('/settings', { method: 'PUT', body: { fiscal: v } });
    toast('Paramètres de facturation enregistrés.');
  });
  document.getElementById('form-tax').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = formValues(e.target);
    const brackets = s.tax_params.brackets.map((b, i) => ({
      upTo: v['bracket_up_' + i] === '' ? null : Number(v['bracket_up_' + i]),
      rate: Number(v['bracket_rate_' + i]),
    }));
    const numeric = {};
    for (const k of ['tax_free_amount', 'communal_tax_pct', 'forfait_rate', 'forfait_max',
      'social_rate_1', 'social_cap_1', 'social_rate_2', 'social_cap_2', 'social_admin_pct', 'social_min_income']) {
      numeric[k] = Number(v[k]);
    }
    await api('/settings', { method: 'PUT', body: { tax_params: { ...numeric, brackets } } });
    toast('Barèmes fiscaux enregistrés.');
  });

  const myVat = document.getElementById('my-vat');
  myVat.addEventListener('input', async () => {
    const el = document.getElementById('vat-check');
    if (!myVat.value.trim()) { el.textContent = ''; return; }
    const r = await api('/tools/check-vat?number=' + encodeURIComponent(myVat.value));
    el.innerHTML = r.valid ? '<span style="color:var(--green)">✓ valide</span>' : '<span style="color:var(--red)">✗ invalide</span>';
  });

  document.getElementById('car-calc').addEventListener('click', async () => {
    const co2 = Number(document.getElementById('car-co2').value);
    const fuel = document.getElementById('car-fuel').value;
    const r = await api(`/tools/car-deduct?co2=${co2}&fuel=${fuel}`);
    document.getElementById('car-result').innerHTML =
      `<div class="coach"><span class="icon">🚗</span><span>Déductibilité : <b>${fmt.pct(r.pct)}</b><br><span style="font-size:12px">${esc(r.note)}</span></span></div>`;
  });

  document.getElementById('restore-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    confirmModal('Restaurer cette sauvegarde ? TOUTES les données actuelles seront remplacées.', async () => {
      const content = JSON.parse(await file.text());
      await api('/backup/restore', { method: 'POST', body: content });
      toast('Sauvegarde restaurée.');
      location.hash = '#/dashboard';
    });
  });
}
