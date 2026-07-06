// Sauvegarde locale : IndexedDB (grande capacité), avec repli sur localStorage.
// Auto-save après chaque semaine + 3 slots manuels.

const DB_NAME = 'fcm-saves';
const STORE = 'saves';
export const SLOTS = ['auto', 'slot1', 'slot2', 'slot3'];

let dbPromise = null;

function ouvrirDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) { reject(new Error('IndexedDB indisponible')); return; }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function idbSet(cle, valeur) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(valeur, cle);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(cle) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(cle);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbDel(cle) {
  const db = await ouvrirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(cle);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// --- API publique ------------------------------------------------------------

export async function sauvegarder(slot, game) {
  const data = JSON.stringify(game);
  const clubJoueur = game.clubs.find(c => c.estJoueur);
  const meta = {
    slot, nomClub: clubJoueur?.nom || '?', saison: game.saison, semaine: game.semaine,
    date: new Date().toISOString(), taille: data.length,
  };
  try {
    await idbSet(`save:${slot}`, data);
    await idbSet(`meta:${slot}`, JSON.stringify(meta));
  } catch {
    try {
      localStorage.setItem(`fcm:save:${slot}`, data);
      localStorage.setItem(`fcm:meta:${slot}`, JSON.stringify(meta));
    } catch (e2) {
      console.error('Sauvegarde impossible', e2);
      return false;
    }
  }
  return true;
}

export async function charger(slot) {
  let data = null;
  try { data = await idbGet(`save:${slot}`); } catch { /* repli */ }
  if (!data) data = localStorage.getItem(`fcm:save:${slot}`);
  if (!data) return null;
  try { return JSON.parse(data); } catch { return null; }
}

export async function metaSlot(slot) {
  let m = null;
  try { m = await idbGet(`meta:${slot}`); } catch { /* repli */ }
  if (!m) m = localStorage.getItem(`fcm:meta:${slot}`);
  if (!m) return null;
  try { return JSON.parse(m); } catch { return null; }
}

export async function supprimer(slot) {
  try { await idbDel(`save:${slot}`); await idbDel(`meta:${slot}`); } catch { /* repli */ }
  localStorage.removeItem(`fcm:save:${slot}`);
  localStorage.removeItem(`fcm:meta:${slot}`);
}

export async function listerSlots() {
  const out = [];
  for (const slot of SLOTS) out.push(await metaSlot(slot));
  return out;   // [metaAuto|null, metaSlot1|null, ...]
}
