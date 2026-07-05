'use strict';
// Clients et catalogue de produits/services.

async function viewClients(main) {
  const clients = await api('/clients');
  main.innerHTML = `
    <div class="page-header">
      <div><h1>Clients</h1><div class="sub">Vérification automatique du numéro de TVA belge (checksum officiel).</div></div>
      <div class="header-actions"><button class="btn primary" id="new-client">+ Nouveau client</button></div>
    </div>
    <div class="card">
      ${clients.length ? `<table>
        <thead><tr><th>Nom</th><th>N° TVA</th><th>Ville</th><th>Pays</th><th class="num">CA HTVA</th><th class="num">Factures</th><th></th></tr></thead>
        <tbody>${clients.map((c) => `<tr>
          <td><b>${esc(c.name)}</b>${c.email ? `<div class="muted" style="font-size:12px">${esc(c.email)}</div>` : ''}</td>
          <td class="mono">${esc(c.vat_number || '—')}</td>
          <td>${esc(c.city || '—')}</td><td>${esc(c.country)}</td>
          <td class="num">${fmt.eur(c.turnover)}</td><td class="num">${c.invoice_count}</td>
          <td class="right"><button class="btn small" data-edit="${c.id}">✏️</button>
            <button class="btn small danger" data-del="${c.id}">✕</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Ajoutez votre premier client pour commencer à facturer.</div>'}
    </div>`;

  document.getElementById('new-client').onclick = () => openClientEditor(null, () => viewClients(main));
  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => {
    openClientEditor(clients.find((c) => c.id === Number(b.dataset.edit)), () => viewClients(main));
  }));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () =>
    confirmModal('Supprimer ce client ? (il sera archivé s’il a des factures)', async () => {
      await api('/clients/' + b.dataset.del, { method: 'DELETE' });
      toast('Client supprimé.'); viewClients(main);
    })));
}

function openClientEditor(existing, refresh) {
  const c = existing || {};
  const modal = openModal(`
    <h2>${existing ? 'Modifier le client' : 'Nouveau client'}</h2>
    <form>
      <div class="form-row">
        <div><label>Type</label><select name="kind">
          <option value="company" ${c.kind !== 'individual' ? 'selected' : ''}>Entreprise</option>
          <option value="individual" ${c.kind === 'individual' ? 'selected' : ''}>Particulier</option></select></div>
        <div><label>Nom *</label><input name="name" required value="${esc(c.name || '')}"></div>
      </div>
      <div class="form-row">
        <div><label>N° TVA <span id="vat-check" style="font-weight:400"></span></label>
          <input name="vat_number" id="vat-input" placeholder="BE0123456749" value="${esc(c.vat_number || '')}"></div>
        <div><label>Identifiant Peppol (optionnel)</label><input name="peppol_id" placeholder="0208:0123456789" value="${esc(c.peppol_id || '')}"></div>
      </div>
      <div class="form-row">
        <div><label>E-mail</label><input name="email" type="email" value="${esc(c.email || '')}"></div>
        <div><label>Téléphone</label><input name="phone" value="${esc(c.phone || '')}"></div>
      </div>
      <label>Adresse</label><input name="address" value="${esc(c.address || '')}">
      <div class="form-row">
        <div><label>Code postal</label><input name="zip" value="${esc(c.zip || '')}"></div>
        <div><label>Ville</label><input name="city" value="${esc(c.city || '')}"></div>
        <div><label>Pays (code)</label><input name="country" value="${esc(c.country || 'BE')}" maxlength="2"></div>
        <div><label>Délai de paiement (jours)</label><input name="payment_days" type="number" value="${c.payment_days ?? 30}"></div>
      </div>
      <label>Notes</label><textarea name="notes">${esc(c.notes || '')}</textarea>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const v = formValues(form);
      v.payment_days = Number(v.payment_days) || 30;
      if (existing) await api('/clients/' + existing.id, { method: 'PUT', body: v });
      else await api('/clients', { method: 'POST', body: v });
      close(); toast('Client enregistré.'); refresh();
    },
  });

  // Vérification live du numéro de TVA belge
  const vatInput = modal.el.querySelector('#vat-input');
  const vatCheck = modal.el.querySelector('#vat-check');
  vatInput.addEventListener('input', async () => {
    const val = vatInput.value.trim();
    if (!val) { vatCheck.textContent = ''; return; }
    if (!/^BE/i.test(val)) { vatCheck.textContent = ''; return; }
    const r = await api('/tools/check-vat?number=' + encodeURIComponent(val));
    vatCheck.innerHTML = r.valid ? '<span style="color:var(--green)">✓ valide</span>' : '<span style="color:var(--red)">✗ ' + esc(r.reason) + '</span>';
  });
}

// ---------- Produits & services ----------
async function viewProducts(main) {
  const products = await api('/products');
  main.innerHTML = `
    <div class="page-header">
      <div><h1>Produits &amp; services</h1><div class="sub">Votre catalogue pour facturer plus vite.</div></div>
      <div class="header-actions"><button class="btn primary" id="new-product">+ Nouveau</button></div>
    </div>
    <div class="card">
      ${products.length ? `<table>
        <thead><tr><th>Nom</th><th>Description</th><th>Unité</th><th class="num">Prix HTVA</th><th class="num">TVA</th><th></th></tr></thead>
        <tbody>${products.map((p) => `<tr>
          <td><b>${esc(p.name)}</b></td><td class="muted">${esc(p.description || '')}</td>
          <td>${esc(p.unit)}</td><td class="num">${fmt.eur(p.unit_price)}</td><td class="num">${p.vat_rate}%</td>
          <td class="right"><button class="btn small" data-edit="${p.id}">✏️</button>
            <button class="btn small danger" data-del="${p.id}">✕</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Aucun produit ou service enregistré.</div>'}
    </div>`;

  const editor = (existing) => openModal(`
    <h2>${existing ? 'Modifier' : 'Nouveau produit / service'}</h2>
    <form>
      <label>Nom *</label><input name="name" required value="${esc(existing?.name || '')}">
      <label>Description</label><input name="description" value="${esc(existing?.description || '')}">
      <div class="form-row">
        <div><label>Unité</label><input name="unit" value="${esc(existing?.unit || 'pièce')}" placeholder="heure, jour, pièce…"></div>
        <div><label>Prix unitaire HTVA</label><input name="unit_price" type="number" step="0.01" required value="${existing?.unit_price ?? ''}"></div>
        <div><label>TVA %</label><select name="vat_rate">${[21, 12, 6, 0].map((r) =>
          `<option ${Number(existing?.vat_rate ?? 21) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Enregistrer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const v = formValues(form);
      v.unit_price = Number(v.unit_price); v.vat_rate = Number(v.vat_rate);
      if (existing) await api('/products/' + existing.id, { method: 'PUT', body: v });
      else await api('/products', { method: 'POST', body: v });
      close(); toast('Enregistré.'); viewProducts(main);
    },
  });

  document.getElementById('new-product').onclick = () => editor(null);
  main.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () =>
    editor(products.find((p) => p.id === Number(b.dataset.edit)))));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    await api('/products/' + b.dataset.del, { method: 'DELETE' });
    viewProducts(main);
  }));
}
