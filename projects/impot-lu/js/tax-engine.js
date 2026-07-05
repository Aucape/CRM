/**
 * Moteur de calcul de l'impôt sur le revenu — Luxembourg, année d'imposition 2025
 * (déclaration modèle 100 à remettre en 2026).
 *
 * Sources principales : Administration des contributions directes (impotsdirects.public.lu),
 * guichet.public.lu. Les montants sont ceux applicables à l'année d'imposition 2025.
 *
 * Outil purement indicatif — ne remplace ni le bulletin d'imposition de l'ACD,
 * ni le conseil d'un professionnel.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paramètres fiscaux 2025
  // ---------------------------------------------------------------------------
  const PARAMS = {
    year: 2025,

    // Barème progressif 2025 (art. 118 LIR, indexé) : [limite supérieure, taux]
    bareme: [
      [13230, 0.00],
      [15435, 0.08],
      [17640, 0.09],
      [19845, 0.10],
      [22050, 0.11],
      [24255, 0.12],
      [26550, 0.14],
      [28845, 0.16],
      [31140, 0.18],
      [33435, 0.20],
      [35730, 0.22],
      [38025, 0.24],
      [40320, 0.26],
      [42615, 0.28],
      [44910, 0.30],
      [47205, 0.32],
      [49500, 0.34],
      [51795, 0.36],
      [54090, 0.38],
      [117450, 0.39],
      [176160, 0.40],
      [234870, 0.41],
      [Infinity, 0.42],
    ],

    // Classe 1a (art. 120bis LIR) : impôt = tarif(1,5 × R − V/2) tant que R < V
    classe1aV: 52920, // 4 × 13 230

    // Fonds pour l'emploi
    fondsEmploi: { taux: 0.07, tauxMajore: 0.09, seuilCl1: 150000, seuilCl2: 300000 },

    // Frais de déplacement (FD) : forfait kilométrique
    fdParUnite: 99,
    fdFranchiseUnites: 4,
    fdMaxUnites: 30, // ⇒ maximum (30 − 4) × 99 = 2 574 €

    // Frais d'obtention (FO)
    foForfaitSalarie: 540,
    foForfaitPensionne: 300,

    // Dépenses spéciales (DS)
    dsMinimumForfaitaire: 480, // ×2 si conjoints tous deux salariés (imposition collective)
    plafondAssurancesParPersonne: 672,        // art. 111 LIR (primes + intérêts débiteurs personnels)
    plafondPrevoyance: 3200,                  // art. 111bis LIR, par souscripteur (4 500 € à partir de 2026)
    plafondEpargneLogementJeune: 1344,        // souscripteur de 18 à 40 ans accomplis
    plafondEpargneLogement: 672,              // ×(personnes du ménage)
    donsMinimum: 120,
    donsMaxPart: 0.20,                        // max 20 % du total des revenus nets (et 1 000 000 €)
    donsMaxAbsolu: 1000000,
    pensionAlimentaireMax: 24000,             // par ex-conjoint

    // Intérêts hypothécaires — habitation principale (plafond par personne du ménage,
    // selon la date de mise à disposition du logement)
    interetsHypoPlafonds: {
      apres2022: Infinity, // mise à disposition après le 31/12/2022 : déduction intégrale
      de2019a2022: 4000,
      de2014a2018: 3000,
      avant2014: 2000,
    },

    // Charges extraordinaires (CE)
    ceGardeDomesticiteMax: 5400,   // abattement forfaitaire frais de garde / domesticité / aides & soins
    ceEnfantHorsMenageMax: 4422,   // abattement par enfant n'appartenant pas au ménage

    // Abattement extra-professionnel (couples imposés collectivement, deux revenus professionnels)
    abattementExtraProfessionnel: 4500,

    // Revenus de capitaux
    abattementCapitaux: 1500, // 3 000 € en cas d'imposition collective
    exemptionDividendes: 0.50, // art. 115 (15a) LIR

    // Crédit d'impôt salarié / pensionné (CIS / CIP) 2025
    cisMax: 600,
    cisSeuilPlein: 40000,
    cisSeuilZero: 80000,
    cisPente: 0.015,
    cisSalaireMin: 936,

    // Crédit d'impôt CO2 (CI-CO2) 2025
    co2Max: 168,
    co2SeuilPlein: 40000,
    co2SeuilZero: 80000,
    co2Pente: 0.0042,

    // Crédit d'impôt monoparental (CIM) 2025
    cimMax: 3504,
    cimMin: 750,
    cimSeuilPlein: 60000,
    cimSeuilZero: 105000,
    cimPente: 0.0612,
    cimSeuilAllocations: 2712, // réduction de 50 % des allocations au-delà de ce montant annuel

    // Taux de cotisations sociales estimés (part salariale déductible)
    tauxCotisationsSalarie: 0.1105, // 8 % pension + ~3,05 % maladie (l'assurance dépendance 1,4 % n'est pas déductible)
    tauxCotisationsPensionne: 0.028,
  };

  // ---------------------------------------------------------------------------
  // Barème & classes d'impôt
  // ---------------------------------------------------------------------------

  /** Impôt suivant le tarif de base (classe 1) pour un revenu imposable ajusté R. */
  function tarifBase(R) {
    if (!(R > 0)) return 0;
    let tax = 0;
    let lower = 0;
    for (const [upper, rate] of PARAMS.bareme) {
      const slice = Math.min(R, upper) - lower;
      if (slice <= 0) break;
      tax += slice * rate;
      lower = upper;
    }
    return tax;
  }

  /** Impôt suivant le barème selon la classe d'impôt (hors fonds pour l'emploi). */
  function impotSelonClasse(R, classe) {
    if (!(R > 0)) return 0;
    if (classe === '2') return 2 * tarifBase(R / 2); // splitting
    if (classe === '1a') {
      const V = PARAMS.classe1aV;
      if (R >= V) return tarifBase(R);
      return Math.max(0, tarifBase(1.5 * R - V / 2));
    }
    return tarifBase(R);
  }

  /** Majoration pour le fonds pour l'emploi. */
  function fondsEmploi(impot, R, classe) {
    const p = PARAMS.fondsEmploi;
    const seuil = classe === '2' ? p.seuilCl2 : p.seuilCl1;
    return impot * (R > seuil ? p.tauxMajore : p.taux);
  }

  /**
   * Détermination de la classe d'impôt.
   * statut : celibataire | marie | pacs | divorce | veuf
   */
  function classeImpot(situation) {
    const s = situation;
    if (s.statut === 'marie') return '2';
    if (s.statut === 'pacs' && s.pacsDeclarationCommune) return '2';
    if ((s.statut === 'divorce' || s.statut === 'veuf') && s.transitionMoins3Ans) return '2';
    const aDroitEnfant = (s.enfants || 0) > 0;
    if (aDroitEnfant || s.statut === 'veuf' || (s.age || 0) >= 65 || (s.ageConjoint || 0) >= 65) return '1a';
    return '1';
  }

  // ---------------------------------------------------------------------------
  // Calcul complet
  // ---------------------------------------------------------------------------

  const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  const r2 = (v) => Math.round(v * 100) / 100;

  /**
   * Calcule l'impôt et retourne un décompte détaillé.
   * @param {object} d — données du formulaire (voir defaultInput()).
   */
  function compute(d) {
    const p = PARAMS;
    const sit = d.situation || {};
    const rev = d.revenus || {};
    const ded = d.deductions || {};

    const classe = classeImpot(sit);
    const collective = classe === '2';
    const enfants = num(sit.enfants);
    // Personnes du ménage fiscal (contribuable + conjoint imposé collectivement + enfants)
    const menage = 1 + (collective && (sit.statut === 'marie' || sit.statut === 'pacs') ? 1 : 0) + enfants;

    // --- Revenus ---------------------------------------------------------------
    const salaire1 = num(rev.salaireBrut1);
    const salaire2 = collective ? num(rev.salaireBrut2) : 0;
    const pension1 = num(rev.pensionBrut1);
    const pension2 = collective ? num(rev.pensionBrut2) : 0;
    const autresNets = num(rev.autresRevenusNets); // indépendant, location, etc. (montant net)

    // Cotisations sociales (part salariale, déductible)
    let cotisations;
    if (rev.cotisationsOverride != null && rev.cotisationsOverride !== '') {
      cotisations = num(rev.cotisationsOverride);
    } else {
      cotisations =
        (salaire1 + salaire2) * p.tauxCotisationsSalarie +
        (pension1 + pension2) * p.tauxCotisationsPensionne;
    }

    // Frais de déplacement (forfait kilométrique, par salarié)
    const fd = (units) =>
      Math.max(0, Math.min(num(units), p.fdMaxUnites) - p.fdFranchiseUnites) * p.fdParUnite;
    const fd1 = salaire1 > 0 ? fd(ded.kmUnites1) : 0;
    const fd2 = salaire2 > 0 ? fd(ded.kmUnites2) : 0;

    // Frais d'obtention : réels ou forfait (540 € salarié / 300 € pensionné), par personne
    const fo1 = salaire1 > 0 ? Math.max(p.foForfaitSalarie, num(ded.fraisReels1))
      : pension1 > 0 ? p.foForfaitPensionne : 0;
    const fo2 = salaire2 > 0 ? Math.max(p.foForfaitSalarie, num(ded.fraisReels2))
      : pension2 > 0 ? p.foForfaitPensionne : 0;

    // Revenus de capitaux mobiliers
    const dividendes = num(rev.dividendes);
    const interetsRecus = num(rev.interetsRecus);
    const abattementCapitaux = collective ? p.abattementCapitaux * 2 : p.abattementCapitaux;
    const capitauxImposables = Math.max(
      0,
      dividendes * (1 - p.exemptionDividendes) + interetsRecus - abattementCapitaux
    );

    // Revenu net de location : intérêts hypothécaires de l'habitation principale
    // (déductibles comme revenu de location négatif, plafond selon la date de mise à disposition)
    const plafondHypoParPers = p.interetsHypoPlafonds[ded.hypoDisponibilite || 'apres2022'];
    const plafondHypo = plafondHypoParPers === Infinity ? Infinity : plafondHypoParPers * menage;
    const interetsHypo = Math.min(num(ded.interetsHypotheque), plafondHypo);

    const totalRevenusNets =
      salaire1 + salaire2 - fd1 - fd2 - fo1 - fo2 +
      pension1 + pension2 +
      autresNets + capitauxImposables - interetsHypo;

    // --- Dépenses spéciales (DS) -------------------------------------------------
    const plafondAssurances = p.plafondAssurancesParPersonne * menage;
    const assurances = Math.min(num(ded.assurances) + num(ded.interetsDebiteurs), plafondAssurances);

    const prevoyance1 = Math.min(num(ded.prevoyance1), p.plafondPrevoyance);
    const prevoyance2 = collective ? Math.min(num(ded.prevoyance2), p.plafondPrevoyance) : 0;

    const ageEL = num(sit.age);
    const plafondELParPers =
      ageEL >= 18 && ageEL <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement;
    const plafondEL = plafondELParPers * menage;
    const epargneLogement = Math.min(num(ded.epargneLogement), plafondEL);

    const donsBruts = num(ded.dons);
    const donsMax = Math.min(Math.max(0, totalRevenusNets) * p.donsMaxPart, p.donsMaxAbsolu);
    const dons = donsBruts >= p.donsMinimum ? Math.min(donsBruts, donsMax) : 0;

    const pensionAlimentaire = Math.min(num(ded.pensionAlimentaire), p.pensionAlimentaireMax);

    const dsDetail = cotisations + assurances + prevoyance1 + prevoyance2 + epargneLogement + dons + pensionAlimentaire;
    const dsMinimum = p.dsMinimumForfaitaire * (collective && salaire1 > 0 && salaire2 > 0 ? 2 : 1);
    const depensesSpeciales = Math.max(dsDetail, dsMinimum);

    // --- Charges extraordinaires (CE) ---------------------------------------------
    const ceGarde = Math.min(num(ded.fraisGardeDomesticite), p.ceGardeDomesticiteMax);
    const enfantsHors = num(sit.enfantsHorsMenage);
    const ceEnfantsHors = Math.min(num(ded.entretienEnfantsHorsMenage), p.ceEnfantHorsMenageMax * enfantsHors);

    const revenuAvantCE = Math.max(0, totalRevenusNets - depensesSpeciales);
    const chargeNormale = revenuAvantCE * chargeNormalePct(revenuAvantCE, enfants);
    const ceAutres = Math.max(0, num(ded.autresChargesExtraordinaires) - chargeNormale);

    const chargesExtraordinaires = ceGarde + ceEnfantsHors + ceAutres;

    // --- Abattements ----------------------------------------------------------------
    // Abattement extra-professionnel : imposition collective + deux revenus d'activité
    const abattementExtraPro = collective && salaire1 > 0 && salaire2 > 0 ? p.abattementExtraProfessionnel : 0;

    // --- Revenu imposable ajusté & impôt ----------------------------------------------
    const revenuImposable = Math.max(
      0,
      totalRevenusNets - depensesSpeciales - chargesExtraordinaires - abattementExtraPro
    );
    const R = Math.floor(revenuImposable); // arrondi à l'euro inférieur

    const impotBareme = impotSelonClasse(R, classe);
    const majorationFE = fondsEmploi(impotBareme, R, classe);
    const impotAvantCredits = impotBareme + majorationFE;

    // --- Crédits d'impôt -----------------------------------------------------------
    const cis1 = creditSalarie(salaire1);
    const cis2 = creditSalarie(salaire2);
    const cip1 = pension1 > 0 ? creditSalarie(pension1) : 0; // CIP : mêmes barèmes que le CIS
    const cip2 = pension2 > 0 ? creditSalarie(pension2) : 0;
    const co2_1 = creditCO2(salaire1 + pension1);
    const co2_2 = creditCO2(salaire2 + pension2);

    let cim = 0;
    if (!collective && enfants > 0 && classe === '1a') {
      cim = creditMonoparental(R, num(ded.allocationsEnfant));
    }

    const credits = cis1 + cis2 + cip1 + cip2 + co2_1 + co2_2 + cim;

    const impotDu = Math.max(0, impotAvantCredits - credits);
    const retenues = num(ded.impotsRetenus);
    const solde = impotDu - retenues; // >0 : à payer, <0 : remboursement

    // Taux moyen & marginal (marginal : impôt supplémentaire sur 100 € de revenu imposable)
    const tauxMoyen = R > 0 ? impotDu / R : 0;
    const impotPlus100 = (() => {
      const b = impotSelonClasse(R + 100, classe);
      return b + fondsEmploi(b, R + 100, classe);
    })();
    const tauxMarginal = Math.max(0, (impotPlus100 - impotAvantCredits) / 100);

    return {
      params: p,
      classe,
      collective,
      menage,
      revenus: {
        salaire1, salaire2, pension1, pension2, autresNets,
        capitauxImposables, abattementCapitaux,
        cotisations: r2(cotisations),
        fd1, fd2, fo1, fo2,
        interetsHypo: r2(interetsHypo),
        plafondHypo,
        totalRevenusNets: r2(totalRevenusNets),
      },
      ds: {
        cotisations: r2(cotisations),
        assurances: r2(assurances), plafondAssurances,
        prevoyance1: r2(prevoyance1), prevoyance2: r2(prevoyance2),
        epargneLogement: r2(epargneLogement), plafondEL,
        dons: r2(dons), donsMax: r2(donsMax),
        pensionAlimentaire: r2(pensionAlimentaire),
        minimumApplique: dsDetail < dsMinimum,
        total: r2(depensesSpeciales),
      },
      ce: {
        garde: r2(ceGarde),
        enfantsHorsMenage: r2(ceEnfantsHors),
        autres: r2(ceAutres),
        chargeNormale: r2(chargeNormale),
        total: r2(chargesExtraordinaires),
      },
      abattementExtraPro,
      revenuImposable: R,
      impotBareme: r2(impotBareme),
      majorationFE: r2(majorationFE),
      impotAvantCredits: r2(impotAvantCredits),
      credits: {
        cis: r2(cis1 + cis2), cip: r2(cip1 + cip2), co2: r2(co2_1 + co2_2), cim: r2(cim),
        total: r2(credits),
      },
      impotDu: r2(impotDu),
      retenues: r2(retenues),
      solde: r2(solde),
      tauxMoyen,
      tauxMarginal,
    };
  }

  // Crédit d'impôt salarié / pensionné 2025
  function creditSalarie(brut) {
    const p = PARAMS;
    if (brut < p.cisSalaireMin) return 0;
    if (brut <= 11265) return p.cisMax * (brut / 11265);
    if (brut <= p.cisSeuilPlein) return p.cisMax;
    if (brut < p.cisSeuilZero) return Math.max(0, p.cisMax - (brut - p.cisSeuilPlein) * p.cisPente);
    return 0;
  }

  // Crédit d'impôt CO2 2025
  function creditCO2(brut) {
    const p = PARAMS;
    if (brut < p.cisSalaireMin) return 0;
    if (brut <= 11265) return p.co2Max * (brut / 11265);
    if (brut <= p.co2SeuilPlein) return p.co2Max;
    if (brut < p.co2SeuilZero) return Math.max(0, p.co2Max - (brut - p.co2SeuilPlein) * p.co2Pente);
    return 0;
  }

  // Crédit d'impôt monoparental 2025
  function creditMonoparental(R, allocationsAnnuelles) {
    const p = PARAMS;
    let cim;
    if (R <= p.cimSeuilPlein) cim = p.cimMax;
    else if (R <= p.cimSeuilZero) cim = p.cimMax - (R - p.cimSeuilPlein) * p.cimPente;
    else cim = p.cimMin;
    const alloc = Math.max(0, num(allocationsAnnuelles) - p.cimSeuilAllocations);
    return Math.max(0, cim - alloc * 0.5);
  }

  // Charge normale (art. 127 LIR) : pourcentage du revenu selon revenu & nombre d'enfants
  function chargeNormalePct(revenu, enfants) {
    const table = [
      [10000, [2, 0, 0, 0, 0, 0]],
      [20000, [4, 2, 0, 0, 0, 0]],
      [30000, [6, 4, 2, 0, 0, 0]],
      [40000, [7, 6, 4, 2, 0, 0]],
      [50000, [8, 7, 5, 3, 1, 0]],
      [60000, [9, 8, 6, 4, 2, 0]],
      [Infinity, [10, 9, 7, 5, 3, 1]],
    ];
    const col = Math.min(enfants, 5);
    for (const [cap, pcts] of table) {
      if (revenu <= cap) return pcts[col] / 100;
    }
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Optimisation : simule chaque levier et chiffre le gain exact
  // ---------------------------------------------------------------------------

  function clone(d) { return JSON.parse(JSON.stringify(d)); }

  /**
   * Retourne la liste des optimisations possibles, chacune avec le gain d'impôt
   * calculé par re-simulation complète (pas une simple approximation au taux marginal).
   */
  function optimize(d) {
    const base = compute(d);
    const suggestions = [];

    const trySuggestion = (mutate, meta) => {
      const alt = clone(d);
      const effort = mutate(alt); // montant à investir/dépenser en plus (ou null si non applicable)
      if (effort == null || effort <= 0.005) return;
      const res = compute(alt);
      const gain = r2(base.impotDu - res.impotDu);
      if (gain <= 0.005) return;
      suggestions.push(Object.assign({ effort: r2(effort), gain, rendement: gain / effort }, meta));
    };

    const ded = d.deductions || {};
    const p = PARAMS;

    // 1. Prévoyance-vieillesse (art. 111bis) — par conjoint
    trySuggestion(
      (alt) => {
        const restant = p.plafondPrevoyance - num(ded.prevoyance1);
        if (restant <= 0) return null;
        alt.deductions.prevoyance1 = p.plafondPrevoyance;
        return restant;
      },
      {
        id: 'prevoyance1',
        titre: 'Contrat de prévoyance-vieillesse (art. 111bis)',
        detail: `Versez jusqu'à ${fmt(p.plafondPrevoyance)} €/an dans un contrat de prévoyance-vieillesse : la prime est intégralement déductible. À partir de 2026, le plafond passe à 4 500 €.`,
      }
    );
    if (base.collective) {
      trySuggestion(
        (alt) => {
          const restant = p.plafondPrevoyance - num(ded.prevoyance2);
          if (restant <= 0) return null;
          alt.deductions.prevoyance2 = p.plafondPrevoyance;
          return restant;
        },
        {
          id: 'prevoyance2',
          titre: 'Prévoyance-vieillesse du conjoint / partenaire',
          detail: `Chaque conjoint peut souscrire son propre contrat : ${fmt(p.plafondPrevoyance)} € déductibles chacun.`,
        }
      );
    }

    // 2. Assurances & intérêts débiteurs (art. 111)
    trySuggestion(
      (alt) => {
        const plafond = p.plafondAssurancesParPersonne * base.menage;
        const actuel = num(ded.assurances) + num(ded.interetsDebiteurs);
        const restant = plafond - actuel;
        if (restant <= 0) return null;
        alt.deductions.assurances = num(ded.assurances) + restant;
        return restant;
      },
      {
        id: 'assurances',
        titre: 'Primes d\'assurances (art. 111)',
        detail: `Assurance vie, décès (y compris solde restant dû), RC auto, maladie complémentaire… déductibles jusqu'à ${fmt(p.plafondAssurancesParPersonne)} € × ${''}personnes du ménage. Les intérêts de prêts personnels comptent dans le même plafond.`,
      }
    );

    // 3. Épargne-logement
    trySuggestion(
      (alt) => {
        const age = num((d.situation || {}).age);
        const parPers = age >= 18 && age <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement;
        const plafond = parPers * base.menage;
        const restant = plafond - num(ded.epargneLogement);
        if (restant <= 0) return null;
        alt.deductions.epargneLogement = plafond;
        return restant;
      },
      {
        id: 'epargneLogement',
        titre: 'Épargne-logement (BHW, Wüstenrot…)',
        detail: `Cotisations déductibles jusqu'à ${fmt(p.plafondEpargneLogement)} € (${fmt(p.plafondEpargneLogementJeune)} € si vous avez entre 18 et 40 ans) par personne du ménage. Engagement : le contrat doit servir au financement d'un logement personnel.`,
      }
    );

    // 4. Dons sous le seuil de 120 €
    if (num(ded.dons) > 0 && num(ded.dons) < p.donsMinimum) {
      trySuggestion(
        (alt) => {
          alt.deductions.dons = p.donsMinimum;
          return p.donsMinimum - num(ded.dons);
        },
        {
          id: 'dons',
          titre: 'Atteindre le seuil des dons déductibles',
          detail: `Les dons ne sont déductibles qu'à partir de ${fmt(p.donsMinimum)} € au total par an. Complétez vos dons pour franchir le seuil.`,
        }
      );
    }

    // 5. Frais de garde / domesticité
    if ((d.situation || {}).enfants > 0 || num(ded.fraisGardeDomesticite) > 0) {
      trySuggestion(
        (alt) => {
          const restant = p.ceGardeDomesticiteMax - num(ded.fraisGardeDomesticite);
          if (restant <= 0) return null;
          alt.deductions.fraisGardeDomesticite = p.ceGardeDomesticiteMax;
          return restant;
        },
        {
          id: 'garde',
          titre: 'Frais de garde d\'enfants / domesticité',
          detail: `Crèche, foyer de jour, maison relais, femme de ménage déclarée, aides et soins : abattement jusqu'à ${fmt(p.ceGardeDomesticiteMax)} €/an. Déclarez toutes vos factures.`,
        }
      );
    }

    // 6. Frais de déplacement non renseignés
    if (num(d.revenus && d.revenus.salaireBrut1) > 0 && num(ded.kmUnites1) === 0) {
      suggestions.push({
        id: 'fd',
        titre: 'Frais de déplacement (forfait kilométrique)',
        detail: `Indiquez la distance domicile–travail : ${fmt(p.fdParUnite)} € par unité de distance au-delà de 4, jusqu'à ${fmt((p.fdMaxUnites - p.fdFranchiseUnites) * p.fdParUnite)} €/an déduits automatiquement.`,
        effort: 0, gain: null, rendement: null, info: true,
      });
    }

    return { base, suggestions: suggestions.sort((a, b) => (b.gain || 0) - (a.gain || 0)) };
  }

  /** Compare imposition collective (classe 2) et imposition individuelle pure pour un couple. */
  function compareCollectiveIndividuelle(d) {
    const base = compute(d);
    if (!base.collective) return null;

    // Individuelle pure : chacun en classe 1, revenus et déductions propres,
    // déductions communes réparties par moitié.
    const mk = (who) => {
      const c = clone(d);
      c.situation = Object.assign({}, c.situation, { statut: 'celibataire', transitionMoins3Ans: false });
      const rev = c.revenus, ded = c.deductions;
      const half = (k) => { ded[k] = num(ded[k]) / 2; };
      if (who === 1) {
        rev.salaireBrut2 = 0; rev.pensionBrut2 = 0;
        ded.kmUnites2 = 0; ded.fraisReels2 = 0; ded.prevoyance2 = 0;
      } else {
        rev.salaireBrut1 = rev.salaireBrut2 || 0; rev.pensionBrut1 = rev.pensionBrut2 || 0;
        rev.salaireBrut2 = 0; rev.pensionBrut2 = 0;
        ded.kmUnites1 = ded.kmUnites2 || 0; ded.fraisReels1 = ded.fraisReels2 || 0;
        ded.prevoyance1 = ded.prevoyance2 || 0;
        ded.kmUnites2 = 0; ded.fraisReels2 = 0; ded.prevoyance2 = 0;
        rev.autresRevenusNets = 0; rev.dividendes = 0; rev.interetsRecus = 0;
        ded.interetsHypotheque = 0; ded.dons = 0; ded.assurances = 0; ded.interetsDebiteurs = 0;
        ded.epargneLogement = 0; ded.fraisGardeDomesticite = 0; ded.autresChargesExtraordinaires = 0;
        ded.pensionAlimentaire = 0; ded.impotsRetenus = 0;
      }
      if (who === 1) {
        ['assurances', 'interetsDebiteurs', 'epargneLogement', 'dons', 'interetsHypotheque',
          'fraisGardeDomesticite', 'autresChargesExtraordinaires'].forEach(half);
      } else {
        // moitié des déductions communes côté conjoint 2
        const src = d.deductions || {};
        ['assurances', 'interetsDebiteurs', 'epargneLogement', 'dons', 'interetsHypotheque',
          'fraisGardeDomesticite', 'autresChargesExtraordinaires'].forEach((k) => {
            ded[k] = num(src[k]) / 2;
          });
      }
      ded.impotsRetenus = 0;
      c.situation.enfants = who === 1 ? (d.situation.enfants || 0) : 0;
      return compute(c);
    };

    const ind1 = mk(1);
    const ind2 = mk(2);
    const totalIndividuelle = r2(ind1.impotDu + ind2.impotDu);
    return {
      collective: base.impotDu,
      individuelle: totalIndividuelle,
      detail: { conjoint1: ind1.impotDu, conjoint2: ind2.impotDu },
      avantageCollective: r2(totalIndividuelle - base.impotDu),
    };
  }

  function fmt(n) {
    return new Intl.NumberFormat('fr-LU', { maximumFractionDigits: 0 }).format(n);
  }

  function defaultInput() {
    return {
      situation: {
        statut: 'celibataire', pacsDeclarationCommune: true, transitionMoins3Ans: false,
        age: 0, ageConjoint: 0, enfants: 0, enfantsHorsMenage: 0, resident: true,
      },
      revenus: {
        salaireBrut1: 0, salaireBrut2: 0, pensionBrut1: 0, pensionBrut2: 0,
        autresRevenusNets: 0, dividendes: 0, interetsRecus: 0, cotisationsOverride: null,
      },
      deductions: {
        kmUnites1: 0, kmUnites2: 0, fraisReels1: 0, fraisReels2: 0,
        assurances: 0, interetsDebiteurs: 0, prevoyance1: 0, prevoyance2: 0,
        epargneLogement: 0, dons: 0, pensionAlimentaire: 0,
        interetsHypotheque: 0, hypoDisponibilite: 'apres2022',
        fraisGardeDomesticite: 0, entretienEnfantsHorsMenage: 0,
        autresChargesExtraordinaires: 0, allocationsEnfant: 0, impotsRetenus: 0,
      },
    };
  }

  const TaxEngine = {
    PARAMS, tarifBase, impotSelonClasse, classeImpot, compute, optimize,
    compareCollectiveIndividuelle, defaultInput, chargeNormalePct, creditSalarie,
    creditCO2, creditMonoparental,
  };

  root.TaxEngine = TaxEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = TaxEngine;
})(typeof window !== 'undefined' ? window : globalThis);
