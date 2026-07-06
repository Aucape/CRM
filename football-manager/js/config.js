// ============================================================================
// FICHIER D'ÉQUILIBRAGE CENTRALISÉ
// Toutes les constantes du jeu sont regroupées ici. Modifier une valeur ici
// suffit pour rééquilibrer le jeu — aucun nombre "magique" dans le moteur.
// Montants financiers en euros. Durées en semaines sauf mention contraire.
// ============================================================================

export const BALANCE = {

  // --------------------------------------------------------------------------
  // STRUCTURE DE LA SAISON
  // --------------------------------------------------------------------------
  saison: {
    nbClubs: 16,               // clubs dans le championnat unique
    nbJournees: 30,            // aller-retour (15 adversaires × 2)
    semainesMercato: 2,        // semaines d'intersaison après la journée 30
    // => une saison dure nbJournees + semainesMercato = 32 semaines
  },

  // --------------------------------------------------------------------------
  // CATÉGORIES DE JEUNES  (âges inclus)
  // --------------------------------------------------------------------------
  categories: [
    { id: 'U8',  ageMin: 7,  ageMax: 8,  effectifMin: 14, effectifMax: 16 },
    { id: 'U10', ageMin: 9,  ageMax: 10, effectifMin: 14, effectifMax: 16 },
    { id: 'U12', ageMin: 11, ageMax: 12, effectifMin: 14, effectifMax: 17 },
    { id: 'U14', ageMin: 13, ageMax: 14, effectifMin: 14, effectifMax: 17 },
    { id: 'U16', ageMin: 15, ageMax: 16, effectifMin: 15, effectifMax: 18 },
    { id: 'U19', ageMin: 17, ageMax: 19, effectifMin: 15, effectifMax: 18 },
  ],
  // catégories où un adjoint et un préparateur physique peuvent être ajoutés
  categoriesStaffEtendu: ['U14', 'U16', 'U19'],

  // --------------------------------------------------------------------------
  // NOTE GLOBALE — pondération des attributs par poste
  // --------------------------------------------------------------------------
  poidsPoste: {
    G:   { gb: 0.60, men: 0.15, phy: 0.10, vit: 0.05, tec: 0.05, def: 0.05, att: 0.00 },
    DEF: { def: 0.35, phy: 0.20, vit: 0.15, men: 0.15, tec: 0.10, att: 0.05, gb: 0.00 },
    MIL: { tec: 0.30, men: 0.20, phy: 0.15, vit: 0.15, def: 0.10, att: 0.10, gb: 0.00 },
    ATT: { att: 0.35, vit: 0.20, tec: 0.20, phy: 0.10, men: 0.10, def: 0.05, gb: 0.00 },
  },

  // --------------------------------------------------------------------------
  // GÉNÉRATION DES JOUEURS
  // --------------------------------------------------------------------------
  generation: {
    // note moyenne des pros par "force" de club (tier 0 = plus fort du champ.)
    proMoyenneTier: [72, 62],        // interpolation linéaire entre les 2 selon le rang du club
    proEcart: 7,                     // écart-type autour de la moyenne du club
    tailleEffectifPro: 22,
    // potentiel : tiré autour de (note actuelle + marge selon l'âge)
    potentielMargeParAge: { 8: 45, 12: 38, 16: 28, 19: 18, 23: 8, 99: 2 },
    talentMin: 0.6, talentMax: 1.4,  // multiplicateur caché de vitesse de progression
    partGardiens: 0.11,              // proportion de gardiens générés
  },

  // --------------------------------------------------------------------------
  // PROGRESSION HEBDOMADAIRE DES JEUNES (points d'attributs / semaine)
  // progression = base(âge) × f(invest) × g(coach) × h(centre) × talent × bonusTempsJeu
  // --------------------------------------------------------------------------
  progression: {
    baseParAge: [                    // base(âge) — points/semaine avant multiplicateurs
      { ageMax: 10, base: 0.34 },
      { ageMax: 14, base: 0.30 },
      { ageMax: 19, base: 0.26 },
      { ageMax: 23, base: 0.12 },    // jeunes pros : progression forte jusqu'à ~23 ans
      { ageMax: 29, base: 0.02 },    // plateau 24-29
      { ageMax: 99, base: 0.00 },    // le déclin est géré par le vieillissement
    ],
    fInvest: { min: 0.35, parPoint: 0.125 },   // f(i) = min + i × parPoint  (0→0.35, 10→1.6)
    gCoach:  { min: 0.55, plage: 0.85 },       // g = min + Formation/100 × plage (0.55→1.40)
    hCentre: { min: 0.85, parNiveau: 0.07 },   // h = min + niveau × parNiveau (niv.5 → 1.20)
    bonusTempsJeu: 0.30,             // bonus max : ×(1 + 0.30 × minutes/90)
    bonusAdjoint: 0.08,              // +8 % si adjoint dans la catégorie (U14+)
    bonusPrepa: 0.06,                // +6 % si préparateur physique (U14+)
    bonusSurclassement: 1.30,        // multiplicateur si le jeune est surclassé
    // approche asymptotique du potentiel : gain × clamp((potentiel - note)/plafondLisse, 0, 1)
    plafondLisse: 12,
    // stagnation / régression : si invest ≤ seuil ET Formation coach < seuilCoach
    regression: { seuilInvest: 1, seuilCoach: 40, perte: 0.15, moralHebdo: -3, probaDepart: 0.02 },
    // progression des pros ≤ 23 ans : base(âge) × centreEntrainement × devJeunes du coach
    proCentreEntrainement: { min: 0.80, parNiveau: 0.09 },
    proDevJeunesCoach: { min: 0.70, plage: 0.60 },
  },

  // --------------------------------------------------------------------------
  // VIEILLISSEMENT (appliqué en fin de saison, âge +1)
  // --------------------------------------------------------------------------
  vieillissement: {
    ageDebutDeclin: 30,
    // pertes annuelles à partir de 30 ans, croissantes avec l'âge :
    // perte = base + (âge - 30) × parAnnee, pour chaque attribut listé
    declin: {
      phy: { base: 1.2, parAnnee: 0.5 },
      vit: { base: 1.4, parAnnee: 0.6 },
      att: { base: 0.4, parAnnee: 0.3 },
      tec: { base: 0.2, parAnnee: 0.2 },
      def: { base: 0.3, parAnnee: 0.2 },
      gb:  { base: 0.3, parAnnee: 0.3 },   // les gardiens déclinent plus tard/lentement
      men: { base: -0.2, parAnnee: 0.0 },  // le mental s'améliore légèrement avec l'âge
    },
    ageRetraiteMin: 33,             // à partir de cet âge, probabilité de retraite
    probaRetraiteParAn: 0.30,       // + forte si note faible
  },

  // --------------------------------------------------------------------------
  // BUDGET JEUNES — coût hebdomadaire du curseur d'investissement (0-10)
  // coût = coutBase × invest^exposant   (croissance non linéaire : 8→10 coûte cher)
  // --------------------------------------------------------------------------
  investissement: { coutBase: 380, exposant: 1.8 },

  // --------------------------------------------------------------------------
  // INTAKE ANNUEL DE JEUNES
  // --------------------------------------------------------------------------
  intake: {
    nbU8Min: 7, nbU8Max: 10,         // nouveaux U8 chaque saison
    nbAutresMax: 2,                  // arrivées possibles par autre catégorie
    // qualité : moyenne = base + centreFormation × parNiveauCentre + investMoyen × parInvest + réputation × parRep
    qualite: { base: 20, parNiveauCentre: 2.2, parInvest: 0.7, parRep: 0.06 },
    // le potentiel des recrues suit generation.potentielMargeParAge
    bonusPotentielCentre: 1.5,       // + potentiel par niveau de centre de formation
  },

  // --------------------------------------------------------------------------
  // SURCLASSEMENT
  // --------------------------------------------------------------------------
  surclassement: {
    risqueBlessureMult: 1.5,         // risque de blessure multiplié
    ecartMoral: 8,                   // si note < (moyenne catégorie sup - écart) → baisse de moral
    moralPerte: -4,                  // perte de moral hebdo si trop juste
  },

  // --------------------------------------------------------------------------
  // FORME / MORAL / FATIGUE
  // --------------------------------------------------------------------------
  condition: {
    fatigueParMatch: 26,             // fatigue ajoutée pour 90 minutes (proportionnel aux minutes)
    recupHebdo: 32,                  // récupération hebdomadaire de base
    recupBonusPrepa: 8,              // bonus si préparateur physique au club (équipe pro)
    recupBonusSponsorEntrainement: 4,// bonus du sponsor entraînement
    fatigueMaxPerf: 0.30,            // à 100 de fatigue : -30 % de performance
    moralVictoire: 4, moralDefaite: -4, moralNul: 0,
    moralTitulaire: 1, moralRemplacantNonEntre: -2,
    moralRetourNeutre: 0.1,          // le moral revient doucement vers 60
    formeNeutre: 6.0,                // note de base pour le calcul de forme (moyenne 5 derniers matchs)
  },

  // --------------------------------------------------------------------------
  // BLESSURES
  // --------------------------------------------------------------------------
  blessures: {
    probaBaseParMatch: 0.015,        // probabilité par joueur et par match
    facteurFatigue: 1.8,             // multiplicateur si fatigue > 70
    dureeMin: 1, dureeMax: 12,       // durée en semaines (tirage biaisé vers le court)
    seuilLongueDuree: 6,             // ≥ 6 semaines = blessure "longue durée"
    reducInfirmerieParNiveau: 0.07,  // -7 % de durée par niveau d'infirmerie
    reducMedecin: 0.15,              // -15 % de durée si médecin/kiné au club
    reducCentreEntrainement: 0.04,   // -4 % de probabilité par niveau du centre d'entraînement
  },

  // --------------------------------------------------------------------------
  // MOTEUR DE MATCH
  // --------------------------------------------------------------------------
  match: {
    formations: {                    // selon la préférence tactique du coach
      off: { DEF: 4, MIL: 3, ATT: 3 },
      bal: { DEF: 4, MIL: 4, ATT: 2 },
      def: { DEF: 5, MIL: 4, ATT: 1 },
    },
    tailleBanc: 5,
    avantageDomicile: 1.08,          // multiplicateur de force à domicile
    bonusTactiqueCoach: 0.0012,      // force × (1 + tactique(0-100) × bonus)
    xgBase: 1.30,                    // buts attendus pour des forces égales
    xgExposant: 2.4,                 // sensibilité au rapport de forces (↑ = moins de surprises)
    xgMax: 5.0,                      // plafond de buts attendus
    aleatoireForce: 0.08,            // bruit gaussien ±8 % sur la force du jour (part de chance)
    tactiqueMod: {                   // modificateurs offensifs/défensifs de la tactique
      off: { atk: 1.12, def: 0.94 },
      bal: { atk: 1.00, def: 1.00 },
      def: { atk: 0.88, def: 1.10 },
    },
    cartonsJaunesMoyens: 1.8,        // par équipe et par match
    probaRouge: 0.04,                // par équipe et par match
    suspensionRouge: 1,              // matchs de suspension après un rouge
    jeunesButsMult: 1.25,            // les matchs de jeunes ont un peu plus de buts
    minutesRemplacement: [58, 68, 79], // minutes approximatives des 3 changements
  },

  // --------------------------------------------------------------------------
  // INFRASTRUCTURES — 4 bâtiments, 5 niveaux
  // coûts/délais pour passer AU niveau indiqué (index 0 = passage au niveau 2)
  // --------------------------------------------------------------------------
  infra: {
    coutNiveau:  [350_000, 900_000, 2_200_000, 5_500_000],
    delaiNiveau: [8, 12, 16, 24],                  // semaines de travaux
    entretienHebdoParNiveau: 900,                  // entretien : niveau × ce montant, par bâtiment
    stadeCapacite: [5000, 9000, 16000, 28000, 45000],
    facteurCout: { stade: 1.3, entrainement: 1.0, formation: 1.0, infirmerie: 0.6 },
  },

  // --------------------------------------------------------------------------
  // BILLETTERIE
  // --------------------------------------------------------------------------
  billetterie: {
    prixMoyen: 19,                   // € par spectateur
    remplissageBase: 0.45,           // taux de base
    remplissageParRep: 0.004,        // + réputation × x
    remplissageForme: 0.12,          // ± selon les 5 derniers résultats
    remplissageClassement: 0.10,     // bonus max si 1er (dégressif)
  },

  // --------------------------------------------------------------------------
  // SPONSORS
  // --------------------------------------------------------------------------
  sponsors: {
    slots: ['maillot', 'equipementier', 'stade', 'entrainement', 'sec1', 'sec2'],
    // montant hebdo = base + réputation × parRep, ± variation ; ×capacité pour le stade
    montants: {
      maillot:       { base: 6000, parRep: 550, variation: 0.25 },
      equipementier: { base: 3000, parRep: 260, variation: 0.20 },
      stade:         { base: 0,    parCapacite: 0.55, variation: 0.20 }, // € / place / semaine
      entrainement:  { base: 2000, parRep: 150, variation: 0.20 },
      sec1:          { base: 1200, parRep: 55,  variation: 0.30 },
      sec2:          { base: 1200, parRep: 55,  variation: 0.30 },
    },
    repMinSlot: { maillot: 30, equipementier: 25, stade: 20, entrainement: 15, sec1: 0, sec2: 0 },
    repMinPrestige: 65,              // sponsors "prestigieux" : rep ≥ 65 ET confiance conseil ≥ 60
    prestigeMult: 1.6,               // leurs montants sont supérieurs
    dureeMinSem: 16, dureeMaxSem: 96,     // 6 mois à 3 saisons
    primeCourteDuree: 0.30,          // contrat court (< 1 saison) : jusqu'à +30 % de montant hebdo
    probaOffreHebdo: 0.30,           // probabilité qu'une offre arrive pour un slot vide
    dureeOffreSemaines: 4,           // une offre expire après 4 semaines
    contreProposition: { margeMax: 0.20, probaAccepteBase: 0.55 }, // négociation simple
    bonus: {                         // bonus de performance possibles dans les contrats
      top5:  { proba: 0.5, mult: 10 },   // versé en fin de saison si top 5 (mult × hebdo)
      titre: { proba: 0.3, mult: 25 },   // si champion
      jeune: { proba: 0.35, mult: 6, seuilMatchs: 10 }, // si un jeune formé au club ≥ N matchs pros
    },
    satisfaction: { depart: 60, resultatSemaine: 1.2, bonusAtteint: 15, bonusRate: -12 },
    renouvellement: { seuilBon: 70, hausseBon: 0.20, seuilMauvais: 40, baisseMauvais: 0.25,
                      saisonsAbsenceSiFache: 2 },
    equipementierEconomie: 800,      // l'équipementier réduit les coûts matériel (€/semaine)
  },

  // --------------------------------------------------------------------------
  // FINANCES
  // --------------------------------------------------------------------------
  finances: {
    tresorerieDepart: 2_800_000,
    primeClassement: [               // versée en fin de saison selon le rang (1er → 16e)
      2_500_000, 1_900_000, 1_500_000, 1_200_000, 1_000_000, 850_000, 720_000, 620_000,
      540_000, 470_000, 410_000, 360_000, 320_000, 290_000, 265_000, 245_000,
    ],
    coutMaterielHebdo: 1500,         // équipements (réduit par l'équipementier)
    semainesRougeAvertissement: 6,   // trésorerie négative : avertissement du conseil
    semainesRougeVenteForcee: 10,    // le conseil met le meilleur joueur en vente
    semainesRougeFaillite: 16,       // GAME OVER faillite
    budgetMercatoBase: 400_000,      // budget mercato = base + confiance × parConfiance + prime rang
    budgetMercatoParConfiance: 14_000,
  },

  // --------------------------------------------------------------------------
  // SALAIRES ET VALEURS
  // --------------------------------------------------------------------------
  salaires: {
    // salaire hebdo joueur pro ≈ exp(note/expDiv) × base, ajusté par l'âge
    joueurBase: 90, joueurExpDiv: 13.5,
    jeuneCentre: 120,                // "salaire" symbolique hebdo d'un jeune du centre (défraiement)
    // valeur marchande ≈ exp(note/expDiv) × base × facteurAge × facteurPotentiel
    valeurBase: 2600, valeurExpDiv: 9.0,
    staff: {                         // salaire hebdo = base × niveau(1-5)
      coachPrincipal: 3200, coachJeunes: 700, adjoint: 500, prepa: 550,
      medecin: 900, directeurRecrutement: 1100, scout: 450,
    },
  },

  // --------------------------------------------------------------------------
  // SCOUTING & MERCATO
  // --------------------------------------------------------------------------
  scouting: {
    maxScouts: 3,
    precisionPotentiel: [20, 15, 11, 8, 5],   // ± fourchette de potentiel par niveau de scout (1-5)
    probaRapportHebdo: 0.55,                  // probabilité de trouver un joueur par semaine de mission
    qualiteParNiveau: 6,                      // niveau du scout ↑ → joueurs trouvés meilleurs
    bonusDirecteurRecrutement: 0.15,          // +15 % de proba de rapport et meilleure précision
    ageMinJeunes: 13, ageMaxJeunes: 19,       // marché des jeunes
    fraisSignatureJeune: 15_000,              // indemnité de formation pour signer un jeune scouté
  },
  mercato: {
    ageMinPro: 15,                   // recrutement possible dès 15 ans pour l'équipe première
    tailleListeTransferts: 14,       // joueurs transférables visibles sur le marché pro
    tailleAgentsLibres: 8,
    margeNegociation: 0.35,          // l'IA accepte entre valeur×(1-x/2) et valeur×(1+x)
    activiteIAHebdo: 0.10,           // proba qu'un club IA fasse un transfert (hors mercato)
    activiteIAMercato: 0.45,         // pendant l'intersaison
    probaOffreRecueHebdo: 0.06,      // proba de recevoir une offre pour un de vos joueurs cotés
  },

  // --------------------------------------------------------------------------
  // CONSEIL D'ADMINISTRATION
  // --------------------------------------------------------------------------
  conseil: {
    confianceDepart: 50,
    objectifsMin: 2, objectifsMax: 3,
    gainObjectif: 12,                // confiance gagnée par objectif atteint
    perteObjectifBase: 10,           // perte de base par objectif raté
    perteObjectifMarge: 8,           // + jusqu'à ce montant selon l'ampleur de l'échec
    bonusToutReussi: 6,              // bonus si 100 % des objectifs atteints
    patienceSerieDefaites: 5,        // série de défaites déclenchant un avertissement en cours de saison
    perteSerieDefaites: 3,           // confiance perdue à chaque avertissement
    minutesJeunesObjectifBase: 1200, // objectif "minutes de jeunes du centre" (ajusté par ambition)
  },

  // --------------------------------------------------------------------------
  // RÉPUTATION DU CLUB (0-100)
  // --------------------------------------------------------------------------
  reputation: {
    depart: 42,                      // club du joueur : milieu de tableau
    plageIA: [30, 72],               // réputations des clubs IA
    ajustementFinSaison: 0.55,       // rep évolue vers (cible selon classement) à cette vitesse
    cibleParRang: { 1: 80, 4: 68, 8: 55, 12: 45, 16: 34 },  // interpolé
  },

  // --------------------------------------------------------------------------
  // IA DES CLUBS ADVERSES
  // --------------------------------------------------------------------------
  ia: {
    profils: ['formateur', 'acheteur', 'equilibre'],
    formateurInvestMin: 6,           // les clubs formateurs investissent plus dans les jeunes
    acheteurInvestMax: 4,
    tailleEffectifCible: 22,
  },

  // --------------------------------------------------------------------------
  // SITUATION DE DÉPART DU CLUB DU JOUEUR
  // --------------------------------------------------------------------------
  depart: {
    investInitial: 3,                // curseurs jeunes à 3/10 partout
    infraInitiale: 1,                // toutes les infrastructures au niveau 1
    rangForceInitial: 8,             // force de l'effectif ≈ 8e/16
  },
};

// Nombre de semaines par saison (dérivé)
export const SEMAINES_SAISON = BALANCE.saison.nbJournees + BALANCE.saison.semainesMercato;
