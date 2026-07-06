// Écrans Club : effectif pro, équipes de jeunes (U8→U19), staff, infrastructures.
// Modales : fiche joueur, candidats staff.

import {
  clubJoueur, noteGlobale, valeurMarchande, salaireDemande, nomComplet, trouverJoueur,
  definirDirective, definirSurclassement, definirInvestissement, prolongerContrat,
  libererJoueur, mettreEnVente, signerProJeune, basculerPartirFinContrat,
  candidatsStaff, embaucherStaff, licencierStaff, lancerTravaux, coutTravaux,
  definirMissionScout,
} from '../engine/game.js';
import { forme } from '../engine/player.js';
import { ROLE_LABELS } from '../engine/staff.js';
import { BALANCE } from '../config.js';
import { S, rerender, ouvrirModale, fermerModale, autoSave, defActions } from './state.js';
import {
  esc, fmtNote, fmtNote10, badgePoste, etatJoueur, barreAttr, fmtEuro, jauge,
  fourchetteVue, etoiles, NOMS_ATTRS, NOMS_POSTES, NOMS_BATIMENTS,
} from './helpers.js';

const ORDRE_POSTES = { G: 0, DEF: 1, MIL: 2, ATT: 3 };

export function rClub() {
  const sous = S.sous.club;
  const tabs = [['pros', 'Pros'], ...BALANCE.categories.map(c => [c.id, c.id]), ['staff', 'Staff'], ['infra', 'Infra']];
  return `
    <div class="onglets">
      ${tabs.map(([id, lib]) => `<button class="${sous === id ? 'actif' : ''}" data-act="sousOnglet" data-arg='${JSON.stringify({ o: 'club', s: id })}'>${lib}</button>`).join('')}
    </div>
    ${sous === 'pros' ? rPros() : sous === 'staff' ? rStaff() : sous === 'infra' ? rInfra() : rJeunes(sous)}`;
}

// ---------------------------------------------------------------------------
// Effectif pro
// ---------------------------------------------------------------------------
function ligneJoueur(p, extra = '') {
  return `<tr class="cliquable" data-act="voirJoueur" data-arg='${JSON.stringify({ id: p.id })}'>
    <td>${badgePoste(p.poste)}</td>
    <td><div class="ligne-joueur-nom">${esc(nomComplet(p))} ${etatJoueur(p)}</div>
      <div class="ligne-joueur-sub">${p.age} ans · ${fmtEuro(p.contrat.salaire)}/sem · ${p.contrat.saisons > 50 ? 'centre' : p.contrat.saisons + ' saison(s)'}</div></td>
    <td class="num">${fmtNote(noteGlobale(p))}</td>
    ${extra}</tr>`;
}

function rPros() {
  const club = clubJoueur(S.game);
  const joueurs = club.joueurs.slice().sort((a, b) =>
    ORDRE_POSTES[a.poste] - ORDRE_POSTES[b.poste] || noteGlobale(b) - noteGlobale(a));
  const masse = joueurs.reduce((a, p) => a + p.contrat.salaire, 0);
  return `
    <div class="carte"><div class="ligne-flex">
      <span class="mini">${joueurs.length} joueurs — masse salariale joueurs : <b>${fmtEuro(masse)}/sem</b></span></div></div>
    <div class="carte"><div class="table-scroll"><table>
      <tr><th></th><th>Joueur</th><th class="num">Note</th><th class="num">Forme</th><th class="num">Stats</th></tr>
      ${joueurs.map(p => ligneJoueur(p,
        `<td class="num">${fmtNote10(forme(p))}</td>
         <td class="num mini">${p.stats.matchs}m ${p.stats.buts}b ${p.stats.passes}p</td>`)).join('')}
    </table></div>
    <p class="mini" style="margin-top:8px">🏠 = formé au club. Le coach principal choisit le 11 — vos leviers :
    recrutement, directives des jeunes pros (fiche joueur) et qualité du staff.</p></div>`;
}

// ---------------------------------------------------------------------------
// Équipes de jeunes
// ---------------------------------------------------------------------------
function rJeunes(catId) {
  const g = S.game, club = clubJoueur(g);
  const equipe = club.jeunes[catId];
  const cat = BALANCE.categories.find(c => c.id === catId);
  const inv = BALANCE.investissement;
  const cout = Math.round(inv.coutBase * Math.pow(equipe.invest, inv.exposant));
  const staffEtendu = BALANCE.categoriesStaffEtendu.includes(catId);
  const joueurs = equipe.joueurs.slice().sort((a, b) => noteGlobale(b) - noteGlobale(a));

  const staffLigne = (role, titulaire, roleLabel) => `
    <div class="ligne-flex">
      <div>${titulaire
        ? `<b>${esc(titulaire.prenom + ' ' + titulaire.nom)}</b> <span class="mini">${etoiles(titulaire.niveau)} · ${role === 'coachJeunes' ? 'Formation ' + titulaire.formation : ''} · ${fmtEuro(titulaire.salaire)}/sem</span>`
        : `<span class="texte-ko">Aucun ${roleLabel.toLowerCase()}</span>`}</div>
      <div style="display:flex;gap:6px">
        <button class="btn btn-petit" data-act="voirCandidats" data-arg='${JSON.stringify({ role, catId })}'>${titulaire ? 'Remplacer' : 'Embaucher'}</button>
        ${titulaire && role !== 'coachJeunes' ? `<button class="btn btn-petit btn-danger" data-act="virerStaff" data-arg='${JSON.stringify({ role, catId })}'>✕</button>` : ''}
      </div></div>`;

  return `
    <div class="carte"><h3>${catId} (${cat.ageMin}-${cat.ageMax} ans) — ${joueurs.length} joueurs</h3>
      <div class="champ">
        <label>Investissement hebdomadaire : <b>${equipe.invest}/10</b> — coût <b>${fmtEuro(cout)}/sem</b></label>
        <input type="range" min="0" max="10" step="1" value="${equipe.invest}" style="--pct:${equipe.invest * 10}%"
          data-input="invest" data-arg='${JSON.stringify({ catId })}'>
        <span class="info-bulle">Coût non linéaire : passer de 8 à 10 coûte bien plus que de 2 à 4.
        Un investissement très faible peut faire régresser et partir des jeunes.</span>
      </div></div>
    <div class="carte"><h3>Encadrement</h3>
      <div class="liste-simple">
        ${staffLigne('coachJeunes', equipe.coach, 'Coach')}
        ${staffEtendu ? staffLigne('adjoint', equipe.adjoint, 'Adjoint') : ''}
        ${staffEtendu ? staffLigne('prepa', equipe.prepa, 'Préparateur physique') : ''}
        ${!staffEtendu ? `<span class="mini">Adjoint et préparateur physique disponibles à partir des U14.</span>` : ''}
      </div></div>
    <div class="carte"><div class="table-scroll"><table>
      <tr><th></th><th>Joueur</th><th class="num">Note</th><th class="num">Potentiel</th><th class="num">Stats</th></tr>
      ${joueurs.map(p => ligneJoueur(p,
        `<td class="num mini">${fourchetteVue(g, club, p)}</td>
         <td class="num mini">${p.stats.matchs}m ${p.stats.buts}b</td>`)).join('')}
    </table></div>
    <p class="mini" style="margin-top:8px">⬆️ = surclassé (joue dans la catégorie supérieure). La fourchette de potentiel
    dépend du niveau de vos scouts.</p></div>`;
}

// ---------------------------------------------------------------------------
// Staff (équipe première + recrutement/médical + scouts)
// ---------------------------------------------------------------------------
function rStaff() {
  const club = clubJoueur(S.game);
  const s = club.staff;

  const bloc = (role, titulaire, detail) => `
    <div class="carte" style="padding:10px"><div class="ligne-flex">
      <div><h3 style="margin-bottom:2px">${ROLE_LABELS[role]}</h3>
        ${titulaire ? `<b>${esc(titulaire.prenom + ' ' + titulaire.nom)}</b> <span class="mini">${etoiles(titulaire.niveau)}</span>
          <div class="mini">${detail || ''} ${fmtEuro(titulaire.salaire)}/sem · contrat ${titulaire.contratSaisons} saison(s)</div>`
        : `<span class="texte-ko">Poste vacant</span>`}</div>
      <div style="display:flex;gap:6px;flex-direction:column">
        <button class="btn btn-petit" data-act="voirCandidats" data-arg='${JSON.stringify({ role })}'>${titulaire ? 'Remplacer' : 'Embaucher'}</button>
        ${titulaire && role !== 'coachPrincipal' ? `<button class="btn btn-petit btn-danger" data-act="virerStaff" data-arg='${JSON.stringify({ role })}'>Licencier</button>` : ''}
      </div></div></div>`;

  const prefLib = { off: 'Offensif', bal: 'Équilibré', def: 'Défensif' };
  const cp = s.coachPrincipal;

  const scoutsHtml = s.scouts.map(sc => `
    <div class="carte" style="padding:10px">
      <div class="ligne-flex"><div>
        <b>${esc(sc.prenom + ' ' + sc.nom)}</b> <span class="mini">${etoiles(sc.niveau)} · ${fmtEuro(sc.salaire)}/sem</span>
        <div class="mini">${sc.mission
          ? `Mission : ${sc.mission.type === 'jeunes' ? 'jeunes talents' : 'marché pro'}, ${sc.mission.ageMin}-${sc.mission.ageMax} ans${sc.mission.poste ? ', ' + NOMS_POSTES[sc.mission.poste] : ''}`
          : '<span class="texte-ko">Sans mission</span>'}</div></div>
        <div style="display:flex;gap:6px;flex-direction:column">
          <button class="btn btn-petit btn-primaire" data-act="voirMission" data-arg='${JSON.stringify({ scoutId: sc.id })}'>Mission</button>
          <button class="btn btn-petit btn-danger" data-act="virerStaff" data-arg='${JSON.stringify({ role: 'scout', scoutId: sc.id })}'>✕</button>
        </div></div></div>`).join('');

  return `
    ${bloc('coachPrincipal', cp, cp ? `Tactique ${cp.tactique} · Gestion ${cp.gestion} · Dév. jeunes ${cp.devJeunes} · Préf. ${prefLib[cp.prefTactique]} ·` : '')}
    <p class="mini" style="padding:0 4px">Le coach principal sélectionne le 11 et le banc à chaque match, selon sa préférence
    tactique, la forme, la fatigue, le moral et vos directives sur les jeunes pros.</p>
    ${bloc('adjoint', s.adjoint, s.adjoint ? `Tactique ${s.adjoint.tactique} ·` : '')}
    ${bloc('prepa', s.prepa, s.prepa ? `Condition ${s.prepa.condition} · réduit fatigue/blessures ·` : '')}
    ${bloc('medecin', s.medecin, s.medecin ? `Médical ${s.medecin.medical} · blessures plus courtes ·` : '')}
    ${bloc('directeurRecrutement', s.directeurRecrutement, s.directeurRecrutement ? `Réseau ${s.directeurRecrutement.reseau} · scouts plus efficaces ·` : '')}
    <h2 style="margin:6px 0 0">Scouts (${s.scouts.length}/${BALANCE.scouting.maxScouts})</h2>
    ${scoutsHtml || '<p class="mini" style="padding:0 4px">Aucun scout — impossible de découvrir de nouveaux talents ni d\'estimer les potentiels.</p>'}
    ${s.scouts.length < BALANCE.scouting.maxScouts ? `<button class="btn btn-large" data-act="voirCandidats" data-arg='${JSON.stringify({ role: 'scout' })}'>+ Embaucher un scout</button>` : ''}`;
}

// ---------------------------------------------------------------------------
// Infrastructures
// ---------------------------------------------------------------------------
function rInfra() {
  const club = clubJoueur(S.game);
  return Object.entries(NOMS_BATIMENTS).map(([bat, info]) => {
    const niveau = club.infra[bat];
    const travaux = club.travaux.find(t => t.batiment === bat);
    const ct = coutTravaux(bat, niveau);
    let detail = '';
    if (bat === 'stade') detail = `Capacité : ${BALANCE.infra.stadeCapacite[niveau - 1].toLocaleString('fr')} places`;
    return `<div class="carte">
      <div class="ligne-flex"><h2>${info.ico} ${info.nom}</h2><span class="pill pill-or">Niveau ${niveau}/5</span></div>
      ${jauge(niveau * 20, 'var(--or)')}
      <p class="mini" style="margin-top:6px">${info.effet}${detail ? ' — ' + detail : ''}</p>
      ${travaux
        ? `<p class="texte-or" style="margin-top:6px">🏗️ Travaux vers le niveau ${travaux.versNiveau} — ${travaux.semainesRestantes} semaine(s) restante(s)</p>`
        : ct
          ? `<button class="btn btn-petit btn-primaire" style="margin-top:8px" data-act="ameliorerInfra" data-arg='${JSON.stringify({ bat })}'>
              Améliorer → niv. ${niveau + 1} (${fmtEuro(ct.cout)}, ${ct.delai} sem)</button>`
          : `<p class="texte-ok" style="margin-top:6px">Niveau maximum atteint.</p>`}
    </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Modale : fiche joueur
// ---------------------------------------------------------------------------
export function mJoueur(m) {
  const g = S.game, club = clubJoueur(g);
  const res = trouverJoueur(club, m.id);
  if (!res) return { titre: 'Joueur', corps: '<p>Ce joueur ne fait plus partie du club.</p>' };
  const p = res.joueur;
  const estPro = res.ou === 'pro';
  const attrs = p.poste === 'G'
    ? ['gb', 'men', 'phy', 'vit', 'tec', 'def']
    : ['att', 'tec', 'def', 'phy', 'vit', 'men'];

  const histoSaisons = p.carriere.saisons.slice(-4).reverse().map(s =>
    `<tr><td>S${s.saison}</td><td class="num">${s.matchs}</td><td class="num">${s.buts}</td><td class="num">${s.passes}</td><td class="num">${s.noteMoy || '—'}</td></tr>`).join('');

  const dirLib = { auto: 'Laisser les coachs décider', pro: 'Priorité équipe première', jeunes: 'Priorité formation' };

  let actionsHtml = '';
  if (estPro) {
    if (p.age <= 19) {
      actionsHtml += `<div class="champ"><label>Directive président (double éligibilité pro/jeunes)</label>
        <div style="display:flex;gap:6px;flex-wrap:wrap">${['auto', 'pro', 'jeunes'].map(d =>
          `<button class="btn btn-petit ${p.directive === d ? 'btn-primaire' : ''}" data-act="directive" data-arg='${JSON.stringify({ id: p.id, d })}'>${dirLib[d]}</button>`).join('')}
        </div></div>`;
    }
    actionsHtml += `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn btn-petit" data-act="prolonger" data-arg='${JSON.stringify({ id: p.id })}'>Prolonger 3 saisons (${fmtEuro(Math.round(salaireDemande(p) * 1.09))}/sem)</button>
      <button class="btn btn-petit ${p.partirFinContrat ? 'btn-danger' : ''}" data-act="laisserPartir" data-arg='${JSON.stringify({ id: p.id })}'>
        ${p.partirFinContrat ? '✔ Partira en fin de contrat' : 'Laisser partir en fin de contrat'}</button>
      <button class="btn btn-petit btn-danger" data-act="vendre" data-arg='${JSON.stringify({ id: p.id })}'>Mettre en vente (~${fmtEuro(valeurMarchande(p))})</button>
    </div>`;
  } else {
    const catIdx = BALANCE.categories.findIndex(c => c.id === res.ou);
    const peutSurclasser = catIdx < BALANCE.categories.length - 1;
    actionsHtml += `<div style="display:flex;gap:8px;flex-wrap:wrap">
      ${peutSurclasser ? `<button class="btn btn-petit ${p.surclasse ? 'btn-primaire' : ''}" data-act="surclasser" data-arg='${JSON.stringify({ id: p.id })}'>
        ${p.surclasse ? '✔ Surclassé (' + BALANCE.categories[catIdx + 1].id + ')' : 'Surclasser en ' + BALANCE.categories[catIdx + 1].id}</button>` : ''}
      ${p.age >= BALANCE.mercato.ageMinPro ? `<button class="btn btn-petit btn-primaire" data-act="signerPro" data-arg='${JSON.stringify({ id: p.id })}'>
        Contrat pro (${fmtEuro(salaireDemande(p))}/sem)</button>` : ''}
    </div>
    <p class="info-bulle">Surclassement : progression ×${BALANCE.progression.bonusSurclassement}, mais plus de blessures
    et baisse de moral s'il est trop juste.</p>`;
  }

  const corps = `
    <div class="ligne-flex">
      <div>${badgePoste(p.poste)} <b>${NOMS_POSTES[p.poste]}</b> · ${p.age} ans · pied ${p.pied}</div>
      ${fmtNote(noteGlobale(p))}
    </div>
    <div class="stats-grille">
      <div class="stat-bloc"><div class="val">${fourchetteVue(g, club, p)}</div><div class="lib">Potentiel</div></div>
      <div class="stat-bloc"><div class="val">${fmtNote10(forme(p)).replace(/<[^>]+>/g, '') || '—'}</div><div class="lib">Forme</div></div>
      <div class="stat-bloc"><div class="val">${Math.round(p.moral)}</div><div class="lib">Moral</div></div>
      <div class="stat-bloc"><div class="val">${Math.round(p.fatigue)}</div><div class="lib">Fatigue</div></div>
      <div class="stat-bloc"><div class="val">${fmtEuro(valeurMarchande(p))}</div><div class="lib">Valeur</div></div>
      <div class="stat-bloc"><div class="val">${fmtEuro(p.contrat.salaire)}</div><div class="lib">Salaire/sem</div></div>
    </div>
    ${p.blessure ? `<p class="texte-ko">🤕 ${esc(p.blessure.type)} — ${p.blessure.semaines} semaine(s) restante(s)${p.blessure.longue ? ' (longue durée)' : ''}</p>` : ''}
    ${p.suspension > 0 ? `<p class="texte-ko">🟥 Suspendu ${p.suspension} match(s)</p>` : ''}
    <div>${attrs.map(a => barreAttr(NOMS_ATTRS[a], p.attrs[a])).join('')}</div>
    <div class="carte" style="padding:10px"><h3>Saison en cours ${estPro ? '' : '(' + res.ou + ')'}</h3>
      <div class="mini">${p.stats.matchs} matchs · ${p.stats.buts} buts · ${p.stats.passes} passes ·
      note moyenne ${p.stats.matchs ? (p.stats.notes / p.stats.matchs).toFixed(1) : '—'}/10 · ${p.stats.minutes} min</div>
      ${histoSaisons ? `<div class="table-scroll" style="margin-top:6px"><table>
        <tr><th>Saison</th><th class="num">M</th><th class="num">B</th><th class="num">P</th><th class="num">Note</th></tr>${histoSaisons}</table></div>` : ''}
    </div>
    <div class="mini">Contrat : ${p.contrat.saisons > 50 ? 'centre de formation' : p.contrat.saisons + ' saison(s) restante(s)'}
      ${p.formeAuClub ? ' · 🏠 formé au club' : ''}</div>
    ${actionsHtml}`;
  return { titre: esc(nomComplet(p)), corps };
}

// ---------------------------------------------------------------------------
// Modale : candidats staff
// ---------------------------------------------------------------------------
export function mCandidats(m) {
  const g = S.game;
  const liste = candidatsStaff(g, m.role, m.catId || null);
  const detail = c => {
    if (m.role === 'coachPrincipal') return `Tactique ${c.tactique} · Gestion ${c.gestion} · Dév. jeunes ${c.devJeunes} · ${({ off: 'Offensif', bal: 'Équilibré', def: 'Défensif' })[c.prefTactique]}`;
    if (m.role === 'coachJeunes') return `Formation ${c.formation} · Gestion ${c.gestion}`;
    if (m.role === 'prepa') return `Condition ${c.condition}`;
    if (m.role === 'medecin') return `Médical ${c.medical}`;
    if (m.role === 'directeurRecrutement') return `Réseau ${c.reseau}`;
    if (m.role === 'scout') return `Précision potentiel ±${BALANCE.scouting.precisionPotentiel[c.niveau - 1]}`;
    if (m.role === 'adjoint') return `Tactique ${c.tactique}`;
    return '';
  };
  const corps = liste.length ? liste.map(c => `
    <div class="carte" style="padding:10px"><div class="ligne-flex">
      <div><b>${esc(c.prenom + ' ' + c.nom)}</b> <span class="mini">${etoiles(c.niveau)}</span>
        <div class="mini">${detail(c)}</div>
        <div class="mini">${fmtEuro(c.salaire)}/sem · ${c.contratSaisons} saison(s)</div></div>
      <button class="btn btn-petit btn-primaire" data-act="embaucher" data-arg='${JSON.stringify({ role: m.role, catId: m.catId || null, id: c.id })}'>Embaucher</button>
    </div></div>`).join('')
    : '<p class="mini">Plus de candidats disponibles cette saison.</p>';
  return { titre: `Candidats — ${ROLE_LABELS[m.role]}${m.catId ? ' ' + m.catId : ''}`, corps };
}

// ---------------------------------------------------------------------------
// Modale : mission de scout
// ---------------------------------------------------------------------------
export function mMission(m) {
  const club = clubJoueur(S.game);
  const sc = club.staff.scouts.find(x => x.id === m.scoutId);
  if (!sc) return { titre: 'Scout', corps: '' };
  const mi = sc.mission || { type: 'jeunes', ageMin: 13, ageMax: 19, poste: null };
  const corps = `
    <p class="mini">${esc(sc.prenom + ' ' + sc.nom)} ${etoiles(sc.niveau)} — plus son niveau est haut,
    plus l'estimation du potentiel est précise et plus les joueurs découverts sont bons.</p>
    <div class="champ"><label>Type de mission</label>
      <select id="mi-type">
        <option value="jeunes" ${mi.type === 'jeunes' ? 'selected' : ''}>Jeunes talents (13-19 ans) → centre de formation</option>
        <option value="pro" ${mi.type === 'pro' ? 'selected' : ''}>Marché pro → évaluer les joueurs à vendre</option>
      </select></div>
    <div class="grille-2">
      <div class="champ"><label>Âge min</label><input id="mi-agemin" type="number" min="13" max="40" value="${mi.ageMin}"></div>
      <div class="champ"><label>Âge max</label><input id="mi-agemax" type="number" min="13" max="40" value="${mi.ageMax}"></div>
    </div>
    <div class="champ"><label>Poste ciblé</label>
      <select id="mi-poste">
        <option value="">Tous les postes</option>
        ${Object.entries(NOMS_POSTES).map(([k, v]) => `<option value="${k}" ${mi.poste === k ? 'selected' : ''}>${v}</option>`).join('')}
      </select></div>
    <button class="btn btn-primaire btn-large" data-act="validerMission" data-arg='${JSON.stringify({ scoutId: sc.id })}'>Lancer la mission</button>
    ${sc.mission ? `<button class="btn btn-large" data-act="arreterMission" data-arg='${JSON.stringify({ scoutId: sc.id })}'>Arrêter la mission</button>` : ''}`;
  return { titre: '🔭 Mission de scouting', corps };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
defActions({
  voirJoueur(arg) { ouvrirModale({ type: 'joueur', id: arg.id }); },
  voirCandidats(arg) { ouvrirModale({ type: 'candidats', role: arg.role, catId: arg.catId || null }); },
  voirMission(arg) { ouvrirModale({ type: 'mission', scoutId: arg.scoutId }); },

  directive(arg) { definirDirective(S.game, arg.id, arg.d); autoSave(); rerender(); },
  surclasser(arg) {
    const res = trouverJoueur(clubJoueur(S.game), arg.id);
    if (res) definirSurclassement(S.game, arg.id, !res.joueur.surclasse);
    autoSave(); rerender();
  },
  laisserPartir(arg) { basculerPartirFinContrat(S.game, arg.id); autoSave(); rerender(); },
  prolonger(arg) {
    const r = prolongerContrat(S.game, arg.id, 3);
    if (!r.ok) alert(r.raison || 'Impossible.');
    autoSave(); rerender();
  },
  vendre(arg) {
    if (!confirm('Mettre ce joueur en vente ? S\'il part, c\'est définitif.')) return;
    const r = mettreEnVente(S.game, arg.id);
    if (!r.ok) alert(r.raison);
    else fermerModale();
    autoSave(); rerender();
  },
  signerPro(arg) {
    const r = signerProJeune(S.game, arg.id);
    if (!r.ok) alert(r.raison);
    else fermerModale();
    autoSave(); rerender();
  },

  embaucher(arg) {
    const r = embaucherStaff(S.game, arg.role, arg.id, arg.catId);
    if (!r.ok) alert(r.raison);
    else fermerModale();
    autoSave(); rerender();
  },
  virerStaff(arg) {
    if (!confirm('Licencier ? Une indemnité de 6 semaines de salaire sera versée.')) return;
    licencierStaff(S.game, arg.role, arg.catId || null, arg.scoutId || null);
    autoSave(); rerender();
  },

  validerMission(arg) {
    const type = document.getElementById('mi-type').value;
    const ageMin = Math.max(13, parseInt(document.getElementById('mi-agemin').value, 10) || 13);
    const ageMax = Math.min(40, parseInt(document.getElementById('mi-agemax').value, 10) || 19);
    const poste = document.getElementById('mi-poste').value || null;
    const borne = type === 'jeunes' ? { min: 13, max: 19 } : { min: 15, max: 40 };
    const mi = {
      type,
      ageMin: Math.max(borne.min, Math.min(ageMin, ageMax)),
      ageMax: Math.min(borne.max, Math.max(ageMin, ageMax)),
      poste,
    };
    definirMissionScout(S.game, arg.scoutId, mi);
    autoSave(); fermerModale();
  },
  arreterMission(arg) {
    definirMissionScout(S.game, arg.scoutId, null);
    autoSave(); fermerModale();
  },

  ameliorerInfra(arg) {
    const r = lancerTravaux(S.game, arg.bat);
    if (!r.ok) alert(r.raison);
    autoSave(); rerender();
  },
});

// gestion du curseur d'investissement (événement input)
export function onInput(cible) {
  if (cible.dataset.input === 'invest') {
    const arg = JSON.parse(cible.dataset.arg);
    definirInvestissement(S.game, arg.catId, parseInt(cible.value, 10));
    cible.style.setProperty('--pct', (parseInt(cible.value, 10) * 10) + '%');
    // met à jour le libellé sans re-render complet (pour garder le doigt sur le curseur)
    const inv = BALANCE.investissement;
    const cout = Math.round(inv.coutBase * Math.pow(parseInt(cible.value, 10), inv.exposant));
    const label = cible.closest('.champ')?.querySelector('label');
    if (label) label.innerHTML = `Investissement hebdomadaire : <b>${cible.value}/10</b> — coût <b>${fmtEuro(cout)}/sem</b>`;
    autoSave();
  }
}
