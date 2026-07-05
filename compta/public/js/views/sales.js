'use strict';
// Ventes : factures, notes de crédit, devis, factures récurrentes.

const DOC_TYPE_LABELS = { invoice: 'Facture', quote: 'Devis', credit_note: 'Note de crédit' };

// ---------- Liste des factures (et notes de crédit) ----------
async function viewInvoices(main, params) {
  const status = params.get('status') || '';
  const q = params.get('q') || '';
  const docs = await api(`/documents?${new URLSearchParams({ q, ...(status ? { status } : {}) })}`);
  const list = docs.filter((d) => d.doc_type !== 'quote');

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Factures &amp; notes de crédit</h1>
        <div class="sub">Numérotation séquentielle légale, PDF avec QR de paiement, export Peppol UBL.</div></div>
      <div class="header-actions"><button class="btn primary" id="new-invoice">+ Nouvelle facture</button></div>
    </div>
    <div class="filter-bar">
      <input id="search" placeholder="Rechercher n° ou client…" value="${esc(q)}">
      <select id="status-filter">
        <option value="">Tous statuts</option>
        ${['draft', 'sent', 'paid', 'overdue', 'cancelled'].map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${STATUS_LABELS[s]}</option>`).join('')}
      </select>
    </div>
    <div class="card">${renderDocTable(list)}</div>`;

  document.getElementById('new-invoice').onclick = () => openDocumentEditor('invoice', null, () => viewInvoices(main, params));
  document.getElementById('search').addEventListener('change', (e) => {
    location.hash = '#/invoices?' + new URLSearchParams({ q: e.target.value, status });
  });
  document.getElementById('status-filter').addEventListener('change', (e) => {
    location.hash = '#/invoices?' + new URLSearchParams({ q, status: e.target.value });
  });
  bindDocRows(main, () => viewInvoices(main, params));
  if (params.get('new')) { params.delete('new'); openDocumentEditor('invoice', null, () => viewInvoices(main, params)); }
}

// ---------- Devis ----------
async function viewQuotes(main, params) {
  const docs = await api('/documents?type=quote');
  main.innerHTML = `
    <div class="page-header">
      <div><h1>Devis</h1><div class="sub">Créez un devis et transformez-le en facture en un clic dès qu'il est accepté.</div></div>
      <div class="header-actions"><button class="btn primary" id="new-quote">+ Nouveau devis</button></div>
    </div>
    <div class="card">${renderDocTable(docs)}</div>`;
  document.getElementById('new-quote').onclick = () => openDocumentEditor('quote', null, () => viewQuotes(main, params));
  bindDocRows(main, () => viewQuotes(main, params));
}

function renderDocTable(list) {
  if (!list.length) return '<div class="empty">Aucun document pour l’instant.</div>';
  return `<table>
    <thead><tr><th>N°</th><th>Type</th><th>Client</th><th>Date</th><th>Échéance</th><th class="num">TVAC</th><th>Statut</th></tr></thead>
    <tbody>${list.map((d) => `
      <tr class="clickable" data-id="${d.id}">
        <td class="mono">${esc(d.number || '—')}</td>
        <td>${DOC_TYPE_LABELS[d.doc_type]}</td>
        <td>${esc(d.client_name || '—')}</td>
        <td class="mono">${fmt.date(d.issue_date)}</td>
        <td class="mono">${fmt.date(d.due_date)}</td>
        <td class="num">${fmt.eur(d.doc_type === 'credit_note' ? -d.total_incl : d.total_incl)}</td>
        <td>${badge(d.status)}</td>
      </tr>`).join('')}</tbody></table>`;
}

function bindDocRows(main, refresh) {
  main.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', () => openDocumentDetail(Number(tr.dataset.id), refresh));
  });
}

// ---------- Détail / actions d'un document ----------
async function openDocumentDetail(id, refresh) {
  const d = await api('/documents/' + id);
  const isDraft = d.status === 'draft';
  const modal = openModal(`
    <h2>${DOC_TYPE_LABELS[d.doc_type]} ${esc(d.number || '(brouillon)')}</h2>
    <div class="muted" style="margin-bottom:10px">${esc(d.client?.name || 'Sans client')} — ${fmt.date(d.issue_date)} — ${badge(d.status)}</div>
    <table>
      <thead><tr><th>Description</th><th class="num">Qté</th><th class="num">P.U.</th><th class="num">TVA</th><th class="num">HTVA</th></tr></thead>
      <tbody>${d.lines.map((l) => `<tr>
        <td>${esc(l.description)}</td><td class="num">${l.quantity}</td>
        <td class="num">${fmt.eur(l.unit_price)}</td><td class="num">${l.vat_rate}%</td>
        <td class="num">${fmt.eur(l.quantity * l.unit_price * (1 - (l.discount_pct || 0) / 100))}</td></tr>`).join('')}
      </tbody></table>
    <div class="totals-box">
      HTVA : <b>${fmt.eur(d.total_excl)}</b> &nbsp; TVA : <b>${fmt.eur(d.total_vat)}</b><br>
      <span class="total">TVAC : ${fmt.eur(d.total_incl)}</span>
      ${d.structured_comm ? `<div class="muted mono">Communication : ${esc(d.structured_comm)}</div>` : ''}
      ${d.mention ? `<div class="muted" style="font-size:12px">${esc(d.mention)}</div>` : ''}
    </div>
    <div class="modal-actions" style="flex-wrap:wrap; justify-content:flex-start">
      ${isDraft ? `<button class="btn primary" id="act-finalize">✅ Finaliser &amp; numéroter</button>
        <button class="btn" id="act-edit">✏️ Modifier</button>` : ''}
      <a class="btn" href="/api/documents/${d.id}/pdf" target="_blank">📄 PDF</a>
      ${d.doc_type !== 'quote' ? `<a class="btn" href="/api/documents/${d.id}/ubl">🔗 UBL (Peppol)</a>` : ''}
      ${d.doc_type === 'invoice' && ['sent', 'overdue'].includes(d.status) ? `
        <button class="btn" id="act-paid">💶 Marquer payée</button>
        <a class="btn" href="/api/documents/${d.id}/reminder-pdf" target="_blank">🔔 Rappel PDF ${d.reminder_count ? '(n°' + (d.reminder_count + 1) + ')' : ''}</a>` : ''}
      ${d.doc_type === 'quote' && !['accepted'].includes(d.status) ? `<button class="btn primary" id="act-convert">➡️ Convertir en facture</button>` : ''}
      ${d.doc_type === 'invoice' && !isDraft ? `<button class="btn" id="act-credit">↩️ Note de crédit</button>` : ''}
      <button class="btn" id="act-duplicate">📋 Dupliquer</button>
      <button class="btn danger" id="act-delete">${isDraft ? '🗑️ Supprimer' : '🚫 Annuler'}</button>
      <button class="btn" data-close style="margin-left:auto">Fermer</button>
    </div>
  `, { wide: true });

  const el = modal.el;
  const act = async (fn, msg) => {
    try { await fn(); modal.close(); if (msg) toast(msg); refresh(); }
    catch (e) { toast(e.message, true); }
  };
  el.querySelector('#act-finalize')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}/finalize`, { method: 'POST' }), 'Document numéroté et finalisé.'));
  el.querySelector('#act-edit')?.addEventListener('click', () => { modal.close(); openDocumentEditor(d.doc_type, d, refresh); });
  el.querySelector('#act-paid')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}/status`, { method: 'POST', body: { status: 'paid' } }), 'Facture marquée payée. 🎉'));
  el.querySelector('#act-convert')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}/convert`, { method: 'POST' }), 'Devis converti en facture (brouillon).'));
  el.querySelector('#act-credit')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}/credit-note`, { method: 'POST' }), 'Note de crédit créée (brouillon).'));
  el.querySelector('#act-duplicate')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}/duplicate`, { method: 'POST' }), 'Document dupliqué (brouillon).'));
  el.querySelector('#act-delete')?.addEventListener('click', () =>
    act(() => api(`/documents/${id}`, { method: 'DELETE' }), isDraft ? 'Brouillon supprimé.' : 'Document annulé.'));
}

// ---------- Éditeur de document (lignes dynamiques) ----------
async function openDocumentEditor(docType, existing, refresh) {
  const [clients, products] = await Promise.all([api('/clients'), api('/products')]);
  const lines = existing?.lines?.length ? existing.lines.map((l) => ({ ...l })) : [{ description: '', quantity: 1, unit_price: 0, vat_rate: 21, discount_pct: 0 }];

  const modal = openModal(`
    <h2>${existing ? 'Modifier' : 'Créer'} — ${DOC_TYPE_LABELS[docType]}</h2>
    <form id="doc-form">
      <div class="form-row">
        <div><label>Client</label>
          <select name="client_id" required>
            <option value="">— Choisir —</option>
            ${clients.map((c) => `<option value="${c.id}" ${existing?.client_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select></div>
        <div><label>Régime TVA</label>
          <select name="vat_regime">${Object.entries(REGIME_LABELS).map(([k, v]) =>
            `<option value="${k}" ${(existing?.vat_regime || 'standard') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div><label>Date d'émission</label><input type="date" name="issue_date" value="${existing?.issue_date || todayISO()}" required></div>
        ${docType !== 'credit_note' ? `<div><label>Échéance</label><input type="date" name="due_date" value="${existing?.due_date || ''}"></div>` : ''}
      </div>
      <label>Lignes</label>
      <div class="lines-editor"><table>
        <thead><tr><th style="width:38%">Description</th><th>Qté</th><th>P.U. HTVA</th><th>Remise %</th><th>TVA %</th><th class="num">Total</th><th></th></tr></thead>
        <tbody id="lines-body"></tbody>
      </table></div>
      <div style="display:flex; gap:8px; margin-top:8px">
        <button type="button" class="btn small" id="add-line">+ Ligne</button>
        ${products.length ? `<select id="add-product" style="width:auto"><option value="">+ Depuis le catalogue…</option>
          ${products.map((p) => `<option value="${p.id}">${esc(p.name)} (${fmt.eur(p.unit_price)})</option>`).join('')}</select>` : ''}
      </div>
      <div class="totals-box" id="totals"></div>
      <label>Notes (affichées sur le document)</label>
      <textarea name="notes">${esc(existing?.notes || '')}</textarea>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">${existing ? 'Enregistrer' : 'Créer le brouillon'}</button>
      </div>
    </form>
  `, {
    wide: true,
    onSubmit: async (form, close) => {
      const v = formValues(form);
      const payload = {
        doc_type: docType,
        client_id: Number(v.client_id),
        issue_date: v.issue_date,
        due_date: v.due_date || undefined,
        vat_regime: v.vat_regime,
        notes: v.notes,
        lines: collectLines(),
      };
      if (!payload.lines.length) throw new Error('Ajoutez au moins une ligne avec une description.');
      if (existing) await api('/documents/' + existing.id, { method: 'PUT', body: payload });
      else await api('/documents', { method: 'POST', body: payload });
      close();
      toast(existing ? 'Document enregistré.' : 'Brouillon créé. Finalisez-le pour lui attribuer un numéro.');
      refresh();
    },
  });

  const el = modal.el;
  const body = el.querySelector('#lines-body');
  const form = el.querySelector('#doc-form');

  function renderLines() {
    body.innerHTML = lines.map((l, i) => `
      <tr data-i="${i}">
        <td><input class="l-desc" value="${esc(l.description)}" placeholder="Prestation…"></td>
        <td><input class="l-qty" type="number" step="any" value="${l.quantity}" style="width:60px"></td>
        <td><input class="l-price" type="number" step="0.01" value="${l.unit_price}" style="width:90px"></td>
        <td><input class="l-disc" type="number" step="any" min="0" max="100" value="${l.discount_pct || 0}" style="width:60px"></td>
        <td><select class="l-vat" style="width:70px">${[21, 12, 6, 0].map((r) => `<option ${Number(l.vat_rate) === r ? 'selected' : ''}>${r}</option>`).join('')}</select></td>
        <td class="num mono l-total"></td>
        <td><button type="button" class="btn small danger l-del">✕</button></td>
      </tr>`).join('');
    body.querySelectorAll('tr').forEach((tr) => {
      const i = Number(tr.dataset.i);
      tr.querySelectorAll('input, select').forEach((inp) => inp.addEventListener('input', () => {
        lines[i] = {
          description: tr.querySelector('.l-desc').value,
          quantity: Number(tr.querySelector('.l-qty').value) || 0,
          unit_price: Number(tr.querySelector('.l-price').value) || 0,
          discount_pct: Number(tr.querySelector('.l-disc').value) || 0,
          vat_rate: Number(tr.querySelector('.l-vat').value),
        };
        updateTotals();
      }));
      tr.querySelector('.l-del').addEventListener('click', () => { lines.splice(i, 1); renderLines(); });
    });
    updateTotals();
  }

  function collectLines() {
    return lines.filter((l) => l.description && l.description.trim());
  }

  function updateTotals() {
    const regime = form.vat_regime.value;
    const zeroVat = regime !== 'standard';
    let excl = 0, vat = 0;
    body.querySelectorAll('tr').forEach((tr, i) => {
      const l = lines[i];
      const lineExcl = (l.quantity || 0) * (l.unit_price || 0) * (1 - (l.discount_pct || 0) / 100);
      excl += lineExcl;
      if (!zeroVat) vat += lineExcl * l.vat_rate / 100;
      tr.querySelector('.l-total').textContent = fmt.eur(lineExcl);
    });
    el.querySelector('#totals').innerHTML =
      `HTVA : <b>${fmt.eur(excl)}</b> &nbsp; TVA : <b>${fmt.eur(vat)}</b> &nbsp; <span class="total">TVAC : ${fmt.eur(excl + vat)}</span>
      ${zeroVat ? '<div class="muted" style="font-size:12px">Régime sans TVA facturée — la mention légale sera ajoutée automatiquement.</div>' : ''}`;
  }

  el.querySelector('#add-line').addEventListener('click', () => {
    lines.push({ description: '', quantity: 1, unit_price: 0, vat_rate: 21, discount_pct: 0 });
    renderLines();
  });
  el.querySelector('#add-product')?.addEventListener('change', (e) => {
    const p = products.find((x) => x.id === Number(e.target.value));
    if (p) {
      lines.push({ description: p.name + (p.description ? ' — ' + p.description : ''), quantity: 1, unit_price: p.unit_price, vat_rate: p.vat_rate, discount_pct: 0 });
      renderLines();
    }
    e.target.value = '';
  });
  form.vat_regime.addEventListener('change', updateTotals);
  renderLines();
}

// ---------- Factures récurrentes ----------
async function viewRecurring(main) {
  const rows = await api('/recurring');
  main.innerHTML = `
    <div class="page-header">
      <div><h1>Factures récurrentes</h1>
        <div class="sub">Abonnements, loyers, forfaits mensuels… générés automatiquement en brouillon à chaque échéance.</div></div>
      <div class="header-actions">
        <button class="btn" id="run-now">▶️ Générer maintenant</button>
        <button class="btn primary" id="new-rec">+ Nouvelle récurrence</button></div>
    </div>
    <div class="card">
      ${rows.length ? `<table>
        <thead><tr><th>Libellé</th><th>Client</th><th>Fréquence</th><th>Prochaine</th><th>Fin</th><th>Active</th><th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          <td>${esc(r.label)}</td><td>${esc(r.client_name)}</td>
          <td>${{ weekly: 'Hebdomadaire', monthly: 'Mensuelle', quarterly: 'Trimestrielle', yearly: 'Annuelle' }[r.frequency]}</td>
          <td class="mono">${fmt.date(r.next_date)}</td><td class="mono">${fmt.date(r.end_date)}</td>
          <td>${r.active ? '✅' : '⏸️'}</td>
          <td class="right">
            <button class="btn small" data-toggle="${r.id}" data-active="${r.active}">${r.active ? 'Suspendre' : 'Activer'}</button>
            <button class="btn small danger" data-del="${r.id}">✕</button></td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune facture récurrente configurée.</div>'}
    </div>`;

  document.getElementById('new-rec').onclick = () => openRecurringEditor(() => viewRecurring(main));
  document.getElementById('run-now').onclick = async () => {
    const r = await api('/recurring/run', { method: 'POST' });
    toast(r.created ? `${r.created} facture(s) générée(s) en brouillon.` : 'Aucune échéance à générer.');
    viewRecurring(main);
  };
  main.querySelectorAll('[data-toggle]').forEach((b) => b.addEventListener('click', async () => {
    await api('/recurring/' + b.dataset.toggle, { method: 'PUT', body: { active: b.dataset.active === '1' ? 0 : 1 } });
    viewRecurring(main);
  }));
  main.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', () =>
    confirmModal('Supprimer cette récurrence ? (les factures déjà créées sont conservées)', async () => {
      await api('/recurring/' + b.dataset.del, { method: 'DELETE' });
      viewRecurring(main);
    })));
}

async function openRecurringEditor(refresh) {
  const clients = await api('/clients');
  openModal(`
    <h2>Nouvelle facture récurrente</h2>
    <form>
      <div class="form-row">
        <div><label>Libellé</label><input name="label" required placeholder="Ex. : Maintenance mensuelle"></div>
        <div><label>Client</label><select name="client_id" required>
          <option value="">— Choisir —</option>
          ${clients.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></div>
      </div>
      <div class="form-row">
        <div><label>Fréquence</label><select name="frequency">
          <option value="monthly">Mensuelle</option><option value="quarterly">Trimestrielle</option>
          <option value="yearly">Annuelle</option><option value="weekly">Hebdomadaire</option></select></div>
        <div><label>Première échéance</label><input type="date" name="next_date" value="${todayISO()}" required></div>
        <div><label>Fin (optionnel)</label><input type="date" name="end_date"></div>
      </div>
      <div class="form-row">
        <div><label>Description de la ligne</label><input name="line_desc" required placeholder="Prestation facturée"></div>
        <div><label>Montant HTVA</label><input type="number" step="0.01" name="line_price" required></div>
        <div><label>TVA %</label><select name="line_vat"><option>21</option><option>12</option><option>6</option><option>0</option></select></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Créer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const v = formValues(form);
      await api('/recurring', {
        method: 'POST',
        body: {
          label: v.label, client_id: Number(v.client_id), frequency: v.frequency,
          next_date: v.next_date, end_date: v.end_date || null,
          lines: [{ description: v.line_desc, quantity: 1, unit_price: Number(v.line_price), vat_rate: Number(v.line_vat) }],
        },
      });
      close(); toast('Récurrence créée.'); refresh();
    },
  });
}
