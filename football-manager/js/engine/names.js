// Générateur de noms fictifs (joueurs, staff, clubs, sponsors).
// Tous les noms sont inventés — aucune licence réelle.

import { pick, rand } from './rng.js';

const PRENOMS = [
  'Lucas', 'Hugo', 'Nathan', 'Théo', 'Enzo', 'Louis', 'Mathis', 'Jules', 'Tom', 'Léo',
  'Rayan', 'Noah', 'Ethan', 'Maxime', 'Antoine', 'Romain', 'Quentin', 'Baptiste', 'Clément', 'Adrien',
  'Kylian', 'Ousmane', 'Ibrahim', 'Moussa', 'Karim', 'Yanis', 'Mehdi', 'Sofiane', 'Amine', 'Bilal',
  'Diego', 'Matteo', 'Luca', 'Andrea', 'Pablo', 'Thiago', 'Rafael', 'Bruno', 'João', 'Nuno',
  'Kevin', 'Dylan', 'Jason', 'Brandon', 'Axel', 'Simon', 'Victor', 'Arthur', 'Gabriel', 'Raphaël',
  'Amadou', 'Sékou', 'Mamadou', 'Idrissa', 'Cheikh', 'Aboubacar', 'Youssouf', 'Tidiane', 'Boubacar', 'Lamine',
  'Jonas', 'Milan', 'Senne', 'Wout', 'Arne', 'Lars', 'Thibo', 'Cyriel', 'Dries', 'Yari',
  'Florian', 'Damien', 'Cédric', 'Julien', 'Nicolas', 'Olivier', 'Sébastien', 'Thomas', 'Vincent', 'Alexandre',
];

const NOMS = [
  'Moreau', 'Lefebvre', 'Garnier', 'Rousseau', 'Fontaine', 'Chevalier', 'Marchand', 'Dumont', 'Berger', 'Renard',
  'Delacroix', 'Beaumont', 'Lavigne', 'Charpentier', 'Vasseur', 'Leclerc', 'Perrin', 'Mercier', 'Baron', 'Colin',
  'Diallo', 'Traoré', 'Konaté', 'Camara', 'Cissé', 'Touré', 'Keita', 'Doumbia', 'Sissoko', 'Fofana',
  'Benali', 'Meziane', 'Hamdi', 'Zerhouni', 'Bouras', 'Cherif', 'Saadi', 'Belkacem', 'Rachedi', 'Ziani',
  'Da Silva', 'Fernandes', 'Oliveira', 'Costa', 'Almeida', 'Ribeiro', 'Carvalho', 'Santos', 'Pereira', 'Machado',
  'Vermeulen', 'De Smet', 'Janssens', 'Peeters', 'Claes', 'Wouters', 'Mertens', 'Goossens', 'Van Damme', 'Segers',
  'Rossi', 'Bianchi', 'Romano', 'Conti', 'Marino', 'Greco', 'Ferrari', 'Gallo', 'Riva', 'Longo',
  'Kowalski', 'Nowak', 'Petrov', 'Ivanov', 'Novak', 'Horvat', 'Popescu', 'Ionescu', 'Kovacs', 'Szabo',
  'Okafor', 'Mensah', 'Boateng', 'Asante', 'Owusu', 'Adjei', 'Kone', 'Bakayoko', 'Gueye', 'Ndiaye',
  'Aubry', 'Bonnaire', 'Castel', 'Deschamps-Vidal', 'Estève', 'Fauvel', 'Girardin', 'Hubert', 'Jacquet', 'Lombard',
];

const CLUB_PREFIXES = ['FC', 'Olympique', 'Racing', 'Sporting', 'Étoile', 'AS', 'Union', 'Stade', 'Cercle', 'Real', 'Atlético', 'Jeunesse'];
const CLUB_VILLES = [
  'Valmont', 'Clairefont', 'Rocheval', 'Montargent', 'Belrive', 'Aubemont', 'Ferrandes', 'Sauveterre',
  'Hautpré', 'Lormont', 'Vertcamp', 'Grandclos', 'Miraval', 'Pontneuf', 'Argelune', 'Castelbrune',
  'Noirmont', 'Beaulac', 'Serremont', 'Ombreval',
];
const CLUB_COULEURS = [
  ['#c0392b', '#ffffff'], ['#2980b9', '#ffffff'], ['#27ae60', '#ffffff'], ['#8e44ad', '#f1c40f'],
  ['#d35400', '#2c3e50'], ['#16a085', '#ffffff'], ['#2c3e50', '#e74c3c'], ['#f39c12', '#2c3e50'],
  ['#7f0000', '#f5d76e'], ['#003366', '#66ccff'], ['#1b5e20', '#ffd600'], ['#4a148c', '#ffffff'],
  ['#880e4f', '#80cbc4'], ['#0d47a1', '#ffab00'], ['#33691e', '#ffffff'], ['#3e2723', '#ffcc80'],
];

const SPONSOR_SECTEURS = [
  { secteur: 'banque', noms: ['Banque Helvet', 'CrédiMax', 'Fortalis', 'Épargne Plus', 'NovaBanque'] },
  { secteur: 'télécom', noms: ['TéléAzur', 'Connectis', 'MobiLux', 'Réseau Prima', 'VoxCom'] },
  { secteur: 'énergie', noms: ['ÉlectraVolt', 'GazNord', 'SolairEco', 'Hydrélis', 'Énergie Vive'] },
  { secteur: 'automobile', noms: ['Motors Delta', 'AutoRoc', 'Vélocité Motors', 'Garage Central', 'TurboLine'] },
  { secteur: 'agroalimentaire', noms: ['Brasserie du Lion', 'Fromagerie Royale', 'BioChamps', 'Delices & Co', 'Boulangeries Réunies'] },
  { secteur: 'assurance', noms: ['AssurTout', 'Prévoyance Plus', 'Garantia', 'SécuriVie', 'Omnium Assur'] },
  { secteur: 'équipement sportif', noms: ['Sportech', 'Kalao Sport', 'Vertex Wear', 'Ultrafoot', 'Stadion Gear'] },
  { secteur: 'grande distribution', noms: ['HyperPrix', 'Marchés Unis', 'MaxiCourses', 'Le Grand Panier', 'DistribPlus'] },
  { secteur: 'informatique', noms: ['DataCube', 'Logiciels Axiom', 'PixelSoft', 'NuageTech', 'InfoSphère'] },
  { secteur: 'construction', noms: ['BâtiPro', 'Construxa', 'Les Charpentiers', 'ImmoBât', 'Fondations & Fils'] },
];

export function genNomJoueur(game) {
  return { prenom: pick(game, PRENOMS), nom: pick(game, NOMS) };
}

export function genNomsClubs(game, n) {
  const villes = [...CLUB_VILLES];
  const noms = [];
  for (let i = 0; i < n; i++) {
    const vi = Math.floor(rand(game) * villes.length);
    const ville = villes.splice(vi, 1)[0];
    noms.push({
      nom: `${pick(game, CLUB_PREFIXES)} ${ville}`,
      ville,
      couleurs: CLUB_COULEURS[i % CLUB_COULEURS.length],
    });
  }
  return noms;
}

// équipementiers utilisent le secteur "équipement sportif" ; les autres slots piochent ailleurs
export function genSponsorNom(game, slot) {
  let pool = SPONSOR_SECTEURS;
  if (slot === 'equipementier') {
    pool = SPONSOR_SECTEURS.filter(s => s.secteur === 'équipement sportif');
  } else {
    pool = SPONSOR_SECTEURS.filter(s => s.secteur !== 'équipement sportif');
  }
  const s = pick(game, pool);
  return { nom: pick(game, s.noms), secteur: s.secteur };
}
