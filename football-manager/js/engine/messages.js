// Messagerie du président : tous les événements notables arrivent ici.
// Un message peut porter des actions (offre de sponsor, rapport de scout, offre de transfert…).

let NEXT_MSG_ID = 1;
export function resetMsgIds(start = 1) { NEXT_MSG_ID = start; }
export function peekNextMsgId() { return NEXT_MSG_ID; }

/**
 * Ajoute un message dans la boîte du joueur.
 * type : info | sponsor | scout | transfert | blessure | conseil | finance | jeunes | staff
 * actions : [{ label, action: 'nomAction', data: {...} }] — traitées par game.js/actions
 */
export function msg(game, { type = 'info', titre, corps = '', actions = null, data = null }) {
  game.messages.unshift({
    id: NEXT_MSG_ID++,
    saison: game.saison, semaine: game.semaine,
    type, titre, corps, actions, data,
    lu: false, traite: false,
  });
  // borne la taille de la boîte (les plus vieux messages sans action sont purgés)
  if (game.messages.length > 120) {
    const idx = game.messages.map((m, i) => ({ m, i }))
      .filter(x => !x.m.actions || x.m.traite)
      .map(x => x.i);
    if (idx.length) game.messages.splice(idx[idx.length - 1], 1);
    else game.messages.pop();
  }
  return game.messages[0];
}

export function marquerTraite(game, msgId, note = null) {
  const m = game.messages.find(x => x.id === msgId);
  if (m) {
    m.traite = true;
    m.lu = true;
    if (note) m.corps += `\n\n➤ ${note}`;
  }
}
