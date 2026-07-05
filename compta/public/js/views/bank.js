'use strict';
// Banque : comptes, import CODA/CSV, rapprochement.

async function viewBank(main) {
  const accounts = await api('/bank/accounts');
  const txs = accounts.length ? await api('/bank/transactions') : [];
  const news = txs.filter((t) => t.status === 'new');

  main.innerHTML = `
    <div class="page-header">
      <div><h1>Banque</h1>
        <div class="sub">Importez vos extraits CODA (téléchargeables dans votre banque en ligne) ou CSV — rapprochement automatique avec vos factures et dépenses.</div></div>
      <div class="header-actions">
        <button class="btn" id="new-account">+ Compte</button>
        ${accounts.length ? '<button class="btn primary" id="import-file">⬆️ Importer CODA / CSV</button>' : ''}
      </div>
    </div>
    ${accounts.length ? `
    <div class="grid grid-3">
      ${accounts.map((a) => `<div class="stat">
        <div class="label">${esc(a.name)}</div>
        <div class="value" style="font-size:15px" class="mono">${esc(a.iban || '—')}</div>
        <div class="detail">${a.to_review} transaction(s) à vérifier
          <button class="btn small danger" data-del-account="${a.id}" style="float:right">✕</button></div>
      </div>`).join('')}
    </div>
    <div class="card" style="margin-top:14px">
      <h2>Transactions ${news.length ? `— <span style="color:var(--orange)">${news.length} à vérifier</span>` : ''}</h2>
      ${txs.length ? `<table>
        <thead><tr><th>Date</th><th>Contrepartie</th><th>Communication</th><th class="num">Montant</th><th>Statut</th><th></th></tr></thead>
        <tbody>${txs.map((t) => `<tr>
          <td class="mono">${fmt.date(t.tx_date)}</td>
          <td>${esc(t.counterparty_name || '—')}<div class="muted mono" style="font-size:11px">${esc(t.counterparty_iban || '')}</div></td>
          <td class="muted" style="font-size:12.5px">${esc((t.communication || '').slice(0, 60))}</td>
          <td class="num" style="color:${t.amount >= 0 ? 'var(--green)' : 'var(--red)'}">${fmt.eur(t.amount)}</td>
          <td>${badge(t.status)}</td>
          <td class="right" style="white-space:nowrap">
            ${t.status === 'new' ? `
              ${t.suggestion ? `<button class="btn small primary" data-accept="${t.id}" data-type="${t.suggestion.type}" data-target="${t.suggestion.id}"
                title="${esc(t.suggestion.reason)}">✓ ${esc(t.suggestion.label)}</button>` : ''}
              ${t.amount < 0 ? `<button class="btn small" data-mkexp="${t.id}">+ Dépense</button>` : ''}
              <button class="btn small" data-ignore="${t.id}" title="Privé / hors compta">Ignorer</button>` :
    `<button class="btn small" data-reset="${t.id}">↺</button>`}
          </td>
        </tr>`).join('')}</tbody></table>` : '<div class="empty">Aucune transaction. Importez un extrait CODA ou CSV.</div>'}
    </div>` : '<div class="card"><div class="empty">Créez d’abord un compte bancaire pour importer vos extraits.</div></div>'}
  `;

  document.getElementById('new-account').onclick = () => openModal(`
    <h2>Nouveau compte bancaire</h2>
    <form>
      <label>Nom *</label><input name="name" required placeholder="Ex. : Compte pro KBC">
      <div class="form-row">
        <div><label>IBAN</label><input name="iban" placeholder="BE68 5390 0754 7034"></div>
        <div><label>BIC</label><input name="bic" placeholder="KREDBEBB"></div>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Créer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      await api('/bank/accounts', { method: 'POST', body: formValues(form) });
      close(); toast('Compte créé.'); viewBank(main);
    },
  });

  document.getElementById('import-file')?.addEventListener('click', () => openModal(`
    <h2>Importer un extrait bancaire</h2>
    <p class="hint">Formats acceptés : <b>CODA</b> (le format standard des banques belges — KBC, Belfius, BNP, ING…) ou <b>CSV</b> (colonnes date / montant / contrepartie / communication). Les doublons sont détectés automatiquement.</p>
    <form>
      <label>Compte</label>
      <select name="account_id">${accounts.map((a) => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}</select>
      <label>Fichier</label>
      <input type="file" name="file" required accept=".cod,.coda,.txt,.csv">
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Annuler</button>
        <button type="submit" class="btn primary">Importer</button>
      </div>
    </form>
  `, {
    onSubmit: async (form, close) => {
      const fd = new FormData(form);
      const r = await api('/bank/import', { method: 'POST', body: fd });
      close();
      toast(`${r.imported} transaction(s) importée(s) (${r.format})${r.duplicates ? `, ${r.duplicates} doublon(s) ignoré(s)` : ''}.`);
      viewBank(main);
    },
  }));

  main.querySelectorAll('[data-del-account]').forEach((b) => b.addEventListener('click', () =>
    confirmModal('Supprimer ce compte et toutes ses transactions ?', async () => {
      await api('/bank/accounts/' + b.dataset.delAccount, { method: 'DELETE' });
      viewBank(main);
    })));
  main.querySelectorAll('[data-accept]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/bank/transactions/${b.dataset.accept}/match`, { method: 'POST', body: { type: b.dataset.type, id: Number(b.dataset.target) } });
    toast(b.dataset.type === 'invoice' ? 'Facture rapprochée et marquée payée. 🎉' : 'Dépense rapprochée.');
    viewBank(main);
  }));
  main.querySelectorAll('[data-mkexp]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/bank/transactions/${b.dataset.mkexp}/match`, { method: 'POST', body: { create_expense: true } });
    toast('Dépense créée depuis la transaction — complétez la TVA et la catégorie dans Dépenses.');
    viewBank(main);
  }));
  main.querySelectorAll('[data-ignore]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/bank/transactions/${b.dataset.ignore}/ignore`, { method: 'POST' });
    viewBank(main);
  }));
  main.querySelectorAll('[data-reset]').forEach((b) => b.addEventListener('click', async () => {
    await api(`/bank/transactions/${b.dataset.reset}/reset`, { method: 'POST' });
    viewBank(main);
  }));
}
