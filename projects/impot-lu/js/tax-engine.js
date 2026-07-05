/**
 * Moteur de calcul de l'impôt sur le revenu — Luxembourg (v2)
 * Années d'imposition couvertes : 2025 (définitif) et 2026 (provisoire).
 *
 * Couvre : barème art. 118 LIR, classes 1/1a/2, fonds pour l'emploi, résidents et
 * non-résidents assimilés (art. 157ter) avec réserve de progressivité (art. 134),
 * modes d'imposition des couples (collective, individuelle pure, individuelle avec
 * réallocation — art. 3ter), revenus locatifs avec amortissement, plus-values au
 * demi-taux global (art. 131), dépenses spéciales, charges extraordinaires,
 * crédits d'impôt CIS/CIP/CII/CI-CO2/CIM.
 *
 * Sources : Administration des contributions directes (impotsdirects.public.lu),
 * guichet.public.lu. Outil purement indicatif — ne remplace ni le bulletin
 * d'imposition de l'ACD, ni le conseil d'un professionnel.
 */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------------------
  // Paramètres fiscaux par année d'imposition
  // ---------------------------------------------------------------------------
  const COMMON = {
    // Barème progressif (art. 118 LIR, tel qu'applicable depuis 2025) : [limite sup., taux]
    bareme: [
      [13230, 0.00], [15435, 0.08], [17640, 0.09], [19845, 0.10], [22050, 0.11],
      [24255, 0.12], [26550, 0.14], [28845, 0.16], [31140, 0.18], [33435, 0.20],
      [35730, 0.22], [38025, 0.24], [40320, 0.26], [42615, 0.28], [44910, 0.30],
      [47205, 0.32], [49500, 0.34], [51795, 0.36], [54090, 0.38], [117450, 0.39],
      [176160, 0.40], [234870, 0.41], [Infinity, 0.42],
    ],
    classe1aV: 52920, // art. 120bis : 4 × la limite de la tranche exonérée

    fondsEmploi: { taux: 0.07, tauxMajore: 0.09, seuilCl1: 150000, seuilCl2: 300000 },

    fdParUnite: 99, fdFranchiseUnites: 4, fdMaxUnites: 30,
    foForfaitSalarie: 540, foForfaitPensionne: 300,

    dsMinimumForfaitaire: 480,
    donsMinimum: 120, donsMaxPart: 0.20, donsMaxAbsolu: 1000000,
    pensionAlimentaireMax: 24000,

    interetsHypoPlafonds: { apres2022: Infinity, de2019a2022: 4000, de2014a2018: 3000, avant2014: 2000 },

    ceGardeDomesticiteMax: 5400,
    ceEnfantHorsMenageMax: 4422,

    abattementExtraProfessionnel: 4500,

    abattementCapitaux: 1500,
    exemptionDividendes: 0.50,

    // Plus-values : abattement décennal (art. 130) — 50 000 € (100 000 € imposition collective)
    pvAbattementDecennal: 50000,

    // Amortissement locatif : 4 % (achèvement < 5 ans), sinon 2 %
    amortissementAccelere: 0.04, amortissementNormal: 0.02, amortissementAccelereAnnees: 5,

    // Crédits d'impôt (CIS / CIP / CII et CI-CO2)
    cisMax: 600, cisSeuilPlein: 40000, cisSeuilZero: 80000, cisPente: 0.015,
    cisSalaireMin: 936, cisSalaireRef: 11265,
    co2Max: 168, co2SeuilPlein: 40000, co2SeuilZero: 80000, co2Pente: 0.0042,

    // Crédit d'impôt monoparental
    cimMax: 3504, cimMin: 750, cimSeuilPlein: 60000, cimSeuilZero: 105000,
    cimPente: 0.0612, cimSeuilAllocations: 2712,

    // Non-résidents — assimilation art. 157ter
    assimilationSeuilPct: 0.90,
    assimilationSeuilAbsolu: 13000,

    // Cotisations sociales (part salariale déductible ; l'assurance dépendance 1,4 % ne l'est pas)
    tauxCotisationsSalarie: 0.1105,
    tauxCotisationsPensionne: 0.028,
    assietteCotisableMax: 158267, // ≈ 5 × salaire social minimum × 12
  };

  const YEARS = {
    2025: Object.assign({}, COMMON, {
      annee: 2025, provisoire: false,
      plafondAssurancesParPersonne: 672,
      plafondPrevoyance: 3200,
      plafondEpargneLogementJeune: 1344,
      plafondEpargneLogement: 672,
    }),
    2026: Object.assign({}, COMMON, {
      annee: 2026, provisoire: true, // barème 2026 non encore indexé — paramètres provisoires
      plafondAssurancesParPersonne: 900,   // réforme 2026
      plafondPrevoyance: 4500,             // réforme 2026
      plafondEpargneLogementJeune: 1500,   // réforme 2026
      plafondEpargneLogement: 900,         // réforme 2026
    }),
  };

  // ---------------------------------------------------------------------------
  // Barème & classes d'impôt
  // ---------------------------------------------------------------------------

  function tarifBase(R, p) {
    if (!(R > 0)) return 0;
    let tax = 0, lower = 0;
    for (const [upper, rate] of p.bareme) {
      const slice = Math.min(R, upper) - lower;
      if (slice <= 0) break;
      tax += slice * rate;
      lower = upper;
    }
    return tax;
  }

  function impotSelonClasse(R, classe, p) {
    if (!(R > 0)) return 0;
    if (classe === '2') return 2 * tarifBase(R / 2, p);
    if (classe === '1a') {
      const V = p.classe1aV;
      if (R >= V) return tarifBase(R, p);
      return Math.max(0, tarifBase(1.5 * R - V / 2, p));
    }
    return tarifBase(R, p);
  }

  function fondsEmploi(impot, R, classe, p) {
    const fe = p.fondsEmploi;
    const seuil = classe === '2' ? fe.seuilCl2 : fe.seuilCl1;
    return impot * (R > seuil ? fe.tauxMajore : fe.taux);
  }

  function classeImpot(situation) {
    const s = situation || {};
    if (s.statut === 'marie') return '2';
    if (s.statut === 'pacs' && s.pacsDeclarationCommune) return '2';
    if ((s.statut === 'divorce' || s.statut === 'veuf') && s.transitionMoins3Ans) return '2';
    if ((s.enfants || 0) > 0 || s.statut === 'veuf' || (s.age || 0) >= 65 || (s.ageConjoint || 0) >= 65) return '1a';
    return '1';
  }

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------
  const num = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && isFinite(n) && n > 0 ? n : 0;
  };
  const numSigned = (v) => {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return typeof n === 'number' && isFinite(n) ? n : 0;
  };
  const r2 = (v) => Math.round(v * 100) / 100;
  const clone = (d) => JSON.parse(JSON.stringify(d));

  // ---------------------------------------------------------------------------
  // Revenus locatifs (location de biens)
  // ---------------------------------------------------------------------------
  function revenuLocation(loc, p, annee) {
    const l = loc || {};
    const loyers = num(l.loyersBruts);
    if (loyers === 0 && num(l.valeurConstruction) === 0) {
      return { net: 0, amortissement: 0, tauxAmortissement: 0, actif: false };
    }
    const age = l.anneeAchevement ? annee - num(l.anneeAchevement) : 99;
    const taux = age >= 0 && age < p.amortissementAccelereAnnees ? p.amortissementAccelere : p.amortissementNormal;
    const amortissement = num(l.valeurConstruction) * taux;
    const net = loyers - num(l.fraisEntretien) - num(l.chargesAssurances) - num(l.interetsEmprunt) - amortissement;
    return { net, amortissement: r2(amortissement), tauxAmortissement: taux, actif: true };
  }

  // ---------------------------------------------------------------------------
  // Calcul principal (contribuable seul ou couple imposé collectivement)
  // ---------------------------------------------------------------------------

  /**
   * @param {object} d — données (voir defaultInput())
   * @returns décompte détaillé
   */
  function compute(d) {
    const annee = YEARS[d.annee] ? d.annee : 2025;
    const p = YEARS[annee];
    const sit = d.situation || {};
    const rev = d.revenus || {};
    const ded = d.deductions || {};

    const classe = classeImpot(sit);
    const collective = classe === '2';
    const couple = collective && (sit.statut === 'marie' || sit.statut === 'pacs');
    const enfants = num(sit.enfants);
    const menage = 1 + (couple ? 1 : 0) + enfants;

    // --- Revenus professionnels ---------------------------------------------------
    const salaire1 = num(rev.salaireBrut1);
    const salaire2 = collective ? num(rev.salaireBrut2) : 0;
    const pension1 = num(rev.pensionBrut1);
    const pension2 = collective ? num(rev.pensionBrut2) : 0;
    const benefice1 = numSigned(rev.beneficeIndependant1);
    const benefice2 = collective ? numSigned(rev.beneficeIndependant2) : 0;
    const autresNets = numSigned(rev.autresRevenusNets);

    // Cotisations sociales (part salariale, déductible ; assiette plafonnée)
    let cotisations;
    if (rev.cotisationsOverride != null && rev.cotisationsOverride !== '') {
      cotisations = num(rev.cotisationsOverride);
    } else {
      const cap = p.assietteCotisableMax;
      cotisations =
        Math.min(salaire1, cap) * p.tauxCotisationsSalarie +
        Math.min(salaire2, cap) * p.tauxCotisationsSalarie +
        Math.min(pension1, cap) * p.tauxCotisationsPensionne +
        Math.min(pension2, cap) * p.tauxCotisationsPensionne +
        num(rev.cotisationsIndependant);
    }

    // Frais de déplacement & frais d'obtention
    const fd = (units) => Math.max(0, Math.min(num(units), p.fdMaxUnites) - p.fdFranchiseUnites) * p.fdParUnite;
    const fd1 = salaire1 > 0 ? fd(ded.kmUnites1) : 0;
    const fd2 = salaire2 > 0 ? fd(ded.kmUnites2) : 0;
    const fo1 = salaire1 > 0 ? Math.max(p.foForfaitSalarie, num(ded.fraisReels1))
      : pension1 > 0 ? p.foForfaitPensionne : 0;
    const fo2 = salaire2 > 0 ? Math.max(p.foForfaitSalarie, num(ded.fraisReels2))
      : pension2 > 0 ? p.foForfaitPensionne : 0;

    // Revenus de capitaux mobiliers
    const dividendes = num(rev.dividendes);
    const interetsRecus = num(rev.interetsRecus);
    const abattementCapitaux = collective ? p.abattementCapitaux * 2 : p.abattementCapitaux;
    const capitauxImposables = Math.max(0, dividendes * (1 - p.exemptionDividendes) + interetsRecus - abattementCapitaux);

    // Revenus de location + intérêts hypothécaires habitation principale
    const location = revenuLocation(rev.location, p, annee);
    const plafondHypoParPers = p.interetsHypoPlafonds[ded.hypoDisponibilite || 'apres2022'];
    const plafondHypo = plafondHypoParPers === Infinity ? Infinity : plafondHypoParPers * menage;
    const interetsHypo = Math.min(num(ded.interetsHypotheque), plafondHypo);

    // Plus-values de spéculation (détention ≤ 2 ans) : plein tarif
    const pvSpeculation = numSigned(rev.pvSpeculation);

    const totalRevenusNets =
      salaire1 + salaire2 - fd1 - fd2 - fo1 - fo2 +
      pension1 + pension2 + benefice1 + benefice2 +
      autresNets + capitauxImposables + location.net + pvSpeculation - interetsHypo;

    // --- Dépenses spéciales ----------------------------------------------------------
    const plafondAssurances = p.plafondAssurancesParPersonne * menage;
    const assurances = Math.min(num(ded.assurances) + num(ded.interetsDebiteurs), plafondAssurances);

    const prevoyance1 = Math.min(num(ded.prevoyance1), p.plafondPrevoyance);
    const prevoyance2 = collective ? Math.min(num(ded.prevoyance2), p.plafondPrevoyance) : 0;

    const ageEL = num(sit.age);
    const plafondELParPers = ageEL >= 18 && ageEL <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement;
    const plafondEL = plafondELParPers * menage;
    const epargneLogement = Math.min(num(ded.epargneLogement), plafondEL);

    const donsBruts = num(ded.dons);
    const donsMax = Math.min(Math.max(0, totalRevenusNets) * p.donsMaxPart, p.donsMaxAbsolu);
    const dons = donsBruts >= p.donsMinimum ? Math.min(donsBruts, donsMax) : 0;

    const pensionAlimentaire = Math.min(num(ded.pensionAlimentaire), p.pensionAlimentaireMax);

    const dsDetail = cotisations + assurances + prevoyance1 + prevoyance2 + epargneLogement + dons + pensionAlimentaire;
    const dsMinimum = p.dsMinimumForfaitaire * (collective && salaire1 > 0 && salaire2 > 0 ? 2 : 1);
    const depensesSpeciales = Math.max(dsDetail, dsMinimum);

    // --- Charges extraordinaires ---------------------------------------------------
    const ceGarde = Math.min(num(ded.fraisGardeDomesticite), p.ceGardeDomesticiteMax);
    const enfantsHors = num(sit.enfantsHorsMenage);
    const ceEnfantsHors = Math.min(num(ded.entretienEnfantsHorsMenage), p.ceEnfantHorsMenageMax * enfantsHors);
    const revenuAvantCE = Math.max(0, totalRevenusNets - depensesSpeciales);
    const chargeNormale = revenuAvantCE * chargeNormalePct(revenuAvantCE, enfants);
    const ceAutres = Math.max(0, num(ded.autresChargesExtraordinaires) - chargeNormale);
    const chargesExtraordinaires = ceGarde + ceEnfantsHors + ceAutres;

    // --- Abattements ------------------------------------------------------------------
    const pro1 = salaire1 > 0 || benefice1 > 0;
    const pro2 = salaire2 > 0 || benefice2 > 0;
    const abattementExtraPro = collective && pro1 && pro2 ? p.abattementExtraProfessionnel : 0;

    // --- Revenu imposable ajusté ---------------------------------------------------------
    const revenuImposable = Math.max(0, totalRevenusNets - depensesSpeciales - chargesExtraordinaires - abattementExtraPro);
    const R = Math.floor(revenuImposable);

    // --- Non-résidents : assimilation art. 157ter ---------------------------------------
    const etranger1 = num(rev.revenusEtrangers1);
    const etranger2 = collective ? num(rev.revenusEtrangers2) : 0;
    const F = etranger1 + etranger2; // revenus exonérés au Luxembourg (réserve de progressivité)
    const resident = sit.resident !== false;
    let assimilation = null;
    if (!resident) {
      const luxPro1 = salaire1 + pension1 + Math.max(0, benefice1);
      const luxPro2 = salaire2 + pension2 + Math.max(0, benefice2);
      const pct1 = luxPro1 + etranger1 > 0 ? luxPro1 / (luxPro1 + etranger1) : 0;
      const pct2 = luxPro2 + etranger2 > 0 ? luxPro2 / (luxPro2 + etranger2) : 0;
      const ok1 = pct1 >= p.assimilationSeuilPct || etranger1 < p.assimilationSeuilAbsolu;
      const ok2 = pct2 >= p.assimilationSeuilPct || etranger2 < p.assimilationSeuilAbsolu;
      // Pour les couples, il suffit qu'un des époux remplisse la condition ;
      // résidents belges : ≥ 50 % des revenus professionnels du ménage imposables au Luxembourg.
      const pctMenage = luxPro1 + luxPro2 + F > 0 ? (luxPro1 + luxPro2) / (luxPro1 + luxPro2 + F) : 0;
      const okBelge = sit.paysResidence === 'BE' && pctMenage >= 0.5;
      assimilation = {
        assimile: ok1 || (collective && ok2) || okBelge,
        pct1: r2(pct1 * 100), pct2: r2(pct2 * 100), pctMenage: r2(pctMenage * 100),
        regleBelge: okBelge,
      };
    }
    const assimile = resident || (assimilation && assimilation.assimile);

    // --- Impôt suivant barème, réserve de progressivité, plus-values au demi-taux --------
    // Plus-values long terme (immobilier > 2 ans…) : demi-taux global (art. 131),
    // après abattement décennal (art. 130).
    const pvLongTerme = num(rev.pvLongTerme);
    const abattementDecennalMax = p.pvAbattementDecennal * (collective ? 2 : 1);
    const abattementDecennal = Math.min(
      pvLongTerme,
      Math.min(num(rev.pvAbattementRestant != null && rev.pvAbattementRestant !== '' ? rev.pvAbattementRestant : abattementDecennalMax), abattementDecennalMax)
    );
    const pvNet = Math.max(0, pvLongTerme - abattementDecennal);

    // Réserve de progressivité (art. 134) : taux global calculé sur le revenu mondial,
    // appliqué au seul revenu luxembourgeois.
    let impotOrdinaire;
    if (F > 0 && R > 0) {
      const Rmonde = R + Math.floor(F);
      impotOrdinaire = impotSelonClasse(Rmonde, classe, p) * (R / Rmonde);
    } else {
      impotOrdinaire = impotSelonClasse(R, classe, p);
    }

    // Demi-taux global sur les plus-values
    let impotPV = 0, tauxGlobalPV = 0;
    if (pvNet > 0) {
      const Rtot = R + Math.floor(pvNet) + Math.floor(F);
      const tauxGlobal = Rtot > 0 ? impotSelonClasse(Rtot, classe, p) / Rtot : 0;
      tauxGlobalPV = tauxGlobal / 2;
      impotPV = pvNet * tauxGlobalPV;
    }

    const impotBareme = impotOrdinaire + impotPV;
    const majorationFE = fondsEmploi(impotBareme, R + pvNet, classe, p);
    const impotAvantCredits = impotBareme + majorationFE;

    // --- Crédits d'impôt -------------------------------------------------------------------
    const cis1 = creditSalarie(salaire1, p);
    const cis2 = creditSalarie(salaire2, p);
    const cip1 = pension1 > 0 ? creditSalarie(pension1, p) : 0;
    const cip2 = pension2 > 0 ? creditSalarie(pension2, p) : 0;
    const cii1 = benefice1 > 0 ? creditSalarie(benefice1, p) : 0; // crédit d'impôt indépendant
    const cii2 = benefice2 > 0 ? creditSalarie(benefice2, p) : 0;
    const co2_1 = creditCO2(salaire1 + pension1 + Math.max(0, benefice1), p);
    const co2_2 = creditCO2(salaire2 + pension2 + Math.max(0, benefice2), p);

    let cim = 0;
    if (!collective && enfants > 0 && classe === '1a') {
      cim = creditMonoparental(R, num(ded.allocationsEnfant), p);
    }

    const credits = cis1 + cis2 + cip1 + cip2 + cii1 + cii2 + co2_1 + co2_2 + cim;
    const impotDu = Math.max(0, impotAvantCredits - credits);
    const retenues = num(ded.impotsRetenus);
    const solde = impotDu - retenues;

    // Taux moyen & marginal
    const baseTaux = R + pvNet;
    const tauxMoyen = baseTaux > 0 ? impotDu / baseTaux : 0;
    const impotPlus100 = (() => {
      const Rb = F > 0 ? R + Math.floor(F) + 100 : R + 100;
      let b = impotSelonClasse(Rb, classe, p);
      if (F > 0) b *= (R + 100) / Rb;
      return b + fondsEmploi(b, R + 100, classe, p);
    })();
    const impotRef = impotOrdinaire + fondsEmploi(impotOrdinaire, R, classe, p);
    const tauxMarginal = Math.max(0, (impotPlus100 - impotRef) / 100);

    return {
      annee, params: p, classe, collective, couple, menage, resident, assimilation, assimile,
      revenus: {
        salaire1, salaire2, pension1, pension2,
        benefice1, benefice2, autresNets,
        capitauxImposables, abattementCapitaux,
        location, pvSpeculation,
        cotisations: r2(cotisations),
        fd1, fd2, fo1, fo2,
        interetsHypo: r2(interetsHypo), plafondHypo,
        etranger: r2(F),
        totalRevenusNets: r2(totalRevenusNets),
      },
      ds: {
        cotisations: r2(cotisations),
        assurances: r2(assurances), plafondAssurances,
        prevoyance1: r2(prevoyance1), prevoyance2: r2(prevoyance2), plafondPrevoyance: p.plafondPrevoyance,
        epargneLogement: r2(epargneLogement), plafondEL,
        dons: r2(dons), donsMax: r2(donsMax),
        pensionAlimentaire: r2(pensionAlimentaire),
        minimumApplique: dsDetail < dsMinimum,
        total: r2(depensesSpeciales),
      },
      ce: {
        garde: r2(ceGarde), enfantsHorsMenage: r2(ceEnfantsHors),
        autres: r2(ceAutres), chargeNormale: r2(chargeNormale),
        total: r2(chargesExtraordinaires),
      },
      abattementExtraPro,
      pv: { longTerme: pvLongTerme, abattement: r2(abattementDecennal), net: r2(pvNet), tauxApplique: tauxGlobalPV, impot: r2(impotPV) },
      revenuImposable: R,
      impotBareme: r2(impotBareme),
      majorationFE: r2(majorationFE),
      impotAvantCredits: r2(impotAvantCredits),
      credits: {
        cis: r2(cis1 + cis2), cip: r2(cip1 + cip2), cii: r2(cii1 + cii2),
        co2: r2(co2_1 + co2_2), cim: r2(cim), total: r2(credits),
      },
      impotDu: r2(impotDu),
      retenues: r2(retenues),
      solde: r2(solde),
      tauxMoyen, tauxMarginal,
    };
  }

  // Crédits d'impôt (barèmes identiques CIS / CIP / CII)
  function creditSalarie(brut, p) {
    if (brut < p.cisSalaireMin) return 0;
    if (brut <= p.cisSalaireRef) return p.cisMax * (brut / p.cisSalaireRef);
    if (brut <= p.cisSeuilPlein) return p.cisMax;
    if (brut < p.cisSeuilZero) return Math.max(0, p.cisMax - (brut - p.cisSeuilPlein) * p.cisPente);
    return 0;
  }
  function creditCO2(brut, p) {
    if (brut < p.cisSalaireMin) return 0;
    if (brut <= p.cisSalaireRef) return p.co2Max * (brut / p.cisSalaireRef);
    if (brut <= p.co2SeuilPlein) return p.co2Max;
    if (brut < p.co2SeuilZero) return Math.max(0, p.co2Max - (brut - p.co2SeuilPlein) * p.co2Pente);
    return 0;
  }
  function creditMonoparental(R, allocationsAnnuelles, p) {
    let cim;
    if (R <= p.cimSeuilPlein) cim = p.cimMax;
    else if (R <= p.cimSeuilZero) cim = p.cimMax - (R - p.cimSeuilPlein) * p.cimPente;
    else cim = p.cimMin;
    const alloc = Math.max(0, num(allocationsAnnuelles) - p.cimSeuilAllocations);
    return Math.max(0, cim - alloc * 0.5);
  }

  // Charge normale (art. 127 LIR)
  function chargeNormalePct(revenu, enfants) {
    const table = [
      [10000, [2, 0, 0, 0, 0, 0]], [20000, [4, 2, 0, 0, 0, 0]], [30000, [6, 4, 2, 0, 0, 0]],
      [40000, [7, 6, 4, 2, 0, 0]], [50000, [8, 7, 5, 3, 1, 0]], [60000, [9, 8, 6, 4, 2, 0]],
      [Infinity, [10, 9, 7, 5, 3, 1]],
    ];
    const col = Math.min(enfants, 5);
    for (const [cap, pcts] of table) if (revenu <= cap) return pcts[col] / 100;
    return 0;
  }

  // ---------------------------------------------------------------------------
  // Modes d'imposition des couples (art. 3ter LIR)
  // ---------------------------------------------------------------------------

  /** Construit les données « conjoint N imposé seul » pour l'imposition individuelle pure. */
  function splitPourIndividuelle(d, who) {
    const c = clone(d);
    c.situation = Object.assign({}, c.situation, {
      statut: 'celibataire', transitionMoins3Ans: false, pacsDeclarationCommune: false,
      // En imposition individuelle, la modération pour enfants est partagée ;
      // par simplification, les enfants sont rattachés au conjoint 1.
      enfants: who === 1 ? (d.situation.enfants || 0) : 0,
      enfantsHorsMenage: who === 1 ? (d.situation.enfantsHorsMenage || 0) : 0,
      age: who === 1 ? d.situation.age : d.situation.ageConjoint,
    });
    const rev = c.revenus, ded = c.deductions;
    const src = d.revenus || {}, sded = d.deductions || {};
    if (who === 2) {
      rev.salaireBrut1 = num(src.salaireBrut2); rev.pensionBrut1 = num(src.pensionBrut2);
      rev.beneficeIndependant1 = numSigned(src.beneficeIndependant2);
      rev.revenusEtrangers1 = num(src.revenusEtrangers2);
      ded.kmUnites1 = num(sded.kmUnites2); ded.fraisReels1 = num(sded.fraisReels2);
      ded.prevoyance1 = num(sded.prevoyance2);
    }
    rev.salaireBrut2 = 0; rev.pensionBrut2 = 0; rev.beneficeIndependant2 = 0; rev.revenusEtrangers2 = 0;
    ded.kmUnites2 = 0; ded.fraisReels2 = 0; ded.prevoyance2 = 0;
    rev.cotisationsOverride = null; // recalculées sur les revenus propres

    // Revenus et déductions communs : répartis par moitié
    ['autresRevenusNets', 'dividendes', 'interetsRecus', 'pvSpeculation', 'pvLongTerme'].forEach((k) => {
      rev[k] = numSigned(src[k]) / 2;
    });
    if (src.location) {
      rev.location = clone(src.location);
      ['loyersBruts', 'fraisEntretien', 'chargesAssurances', 'interetsEmprunt', 'valeurConstruction']
        .forEach((k) => { rev.location[k] = num(src.location[k]) / 2; });
    }
    ['assurances', 'interetsDebiteurs', 'epargneLogement', 'dons', 'interetsHypotheque',
      'fraisGardeDomesticite', 'entretienEnfantsHorsMenage', 'autresChargesExtraordinaires',
      'pensionAlimentaire', 'cotisationsIndependant'].forEach((k) => {
        const bag = k === 'cotisationsIndependant' ? rev : ded;
        const sbag = k === 'cotisationsIndependant' ? src : sded;
        bag[k] = num(sbag[k]) / 2;
      });
    ded.impotsRetenus = 0;
    return c;
  }

  /**
   * Compare les trois modes d'imposition d'un couple :
   *  - collective (classe 2, splitting)
   *  - individuelle pure (chacun classe 1 sur ses revenus propres, communs partagés)
   *  - individuelle avec réallocation 50/50 (total ajusté commun réparti par moitié,
   *    chacun au tarif classe 1 — total identique au splitting, intérêt : retenue à la
   *    source individualisée, non-résidents)
   */
  function comparerModes(d) {
    const base = compute(d);
    if (!base.couple) return null;

    const c1 = compute(splitPourIndividuelle(d, 1));
    const c2 = compute(splitPourIndividuelle(d, 2));
    const individuelle = r2(c1.impotDu + c2.impotDu);

    // Réallocation 50/50 : tarif classe 1 sur la moitié du revenu commun ajusté,
    // crédits d'impôt individuels identiques à la collective.
    const p = base.params;
    const moitie = Math.floor(base.revenuImposable / 2);
    let impotReal = 2 * impotSelonClasse(moitie, '1', p);
    impotReal += fondsEmploi(impotReal, base.revenuImposable, '2', p);
    const reallocation = r2(Math.max(0, impotReal - base.credits.total + base.credits.cim));

    return {
      collective: base.impotDu,
      individuelle,
      individuelleDetail: { conjoint1: c1.impotDu, conjoint2: c2.impotDu },
      reallocation,
      meilleur:
        individuelle < base.impotDu - 0.5 && individuelle <= reallocation ? 'individuelle'
          : reallocation < base.impotDu - 0.5 ? 'reallocation' : 'collective',
    };
  }

  // ---------------------------------------------------------------------------
  // Optimisation
  // ---------------------------------------------------------------------------

  function optimize(d) {
    const base = compute(d);
    const suggestions = [];
    const p = base.params;
    const ded = d.deductions || {};
    const rev = d.revenus || {};
    const fmtN = (n) => new Intl.NumberFormat('fr-LU', { maximumFractionDigits: 0 }).format(n);

    const trySuggestion = (mutate, meta) => {
      const alt = clone(d);
      const effort = mutate(alt);
      if (effort == null || effort <= 0.005) return;
      const res = compute(alt);
      const gain = r2(base.impotDu - res.impotDu);
      if (gain <= 0.005) return;
      suggestions.push(Object.assign({ effort: r2(effort), gain, rendement: gain / effort }, meta));
    };

    // Prévoyance-vieillesse — par conjoint
    trySuggestion((alt) => {
      const restant = p.plafondPrevoyance - num(ded.prevoyance1);
      if (restant <= 0) return null;
      alt.deductions.prevoyance1 = p.plafondPrevoyance;
      return restant;
    }, {
      id: 'prevoyance1', avant3112: true,
      titre: 'Prévoyance-vieillesse (art. 111bis)',
      detail: `Versez jusqu'à ${fmtN(p.plafondPrevoyance)} €/an dans un contrat de prévoyance-vieillesse : la prime est intégralement déductible.` +
        (base.annee === 2025 ? ' Dès 2026, le plafond passe à 4 500 €.' : ''),
    });
    if (base.collective) {
      trySuggestion((alt) => {
        const restant = p.plafondPrevoyance - num(ded.prevoyance2);
        if (restant <= 0) return null;
        alt.deductions.prevoyance2 = p.plafondPrevoyance;
        return restant;
      }, {
        id: 'prevoyance2', avant3112: true,
        titre: 'Prévoyance-vieillesse du conjoint',
        detail: `Chaque conjoint peut souscrire son propre contrat : ${fmtN(p.plafondPrevoyance)} € déductibles chacun.`,
      });
    }

    // Assurances & intérêts débiteurs
    trySuggestion((alt) => {
      const plafond = p.plafondAssurancesParPersonne * base.menage;
      const restant = plafond - (num(ded.assurances) + num(ded.interetsDebiteurs));
      if (restant <= 0) return null;
      alt.deductions.assurances = num(ded.assurances) + restant;
      return restant;
    }, {
      id: 'assurances', avant3112: true,
      titre: 'Primes d\'assurances (art. 111)',
      detail: `Assurance vie, décès (dont solde restant dû), RC auto, complémentaire santé… jusqu'à ${fmtN(p.plafondAssurancesParPersonne)} € par personne du ménage (intérêts de prêts personnels compris).` +
        (base.annee === 2025 ? ' Dès 2026, le plafond passe à 900 €.' : ''),
    });

    // Épargne-logement
    trySuggestion((alt) => {
      const age = num((d.situation || {}).age);
      const parPers = age >= 18 && age <= 40 ? p.plafondEpargneLogementJeune : p.plafondEpargneLogement;
      const plafond = parPers * base.menage;
      const restant = plafond - num(ded.epargneLogement);
      if (restant <= 0) return null;
      alt.deductions.epargneLogement = plafond;
      return restant;
    }, {
      id: 'epargneLogement', avant3112: true,
      titre: 'Épargne-logement',
      detail: `Cotisations déductibles jusqu'à ${fmtN(p.plafondEpargneLogement)} € (${fmtN(p.plafondEpargneLogementJeune)} € entre 18 et 40 ans) par personne du ménage — contrat destiné au financement d'un logement personnel.`,
    });

    // Dons sous le seuil
    if (num(ded.dons) > 0 && num(ded.dons) < p.donsMinimum) {
      trySuggestion((alt) => {
        alt.deductions.dons = p.donsMinimum;
        return p.donsMinimum - num(ded.dons);
      }, {
        id: 'dons', avant3112: true,
        titre: 'Atteindre le seuil des dons déductibles',
        detail: `Les dons ne sont déductibles qu'à partir de ${fmtN(p.donsMinimum)} € au total par an.`,
      });
    }

    // Frais de garde / domesticité
    if ((d.situation || {}).enfants > 0 || num(ded.fraisGardeDomesticite) > 0) {
      trySuggestion((alt) => {
        const restant = p.ceGardeDomesticiteMax - num(ded.fraisGardeDomesticite);
        if (restant <= 0) return null;
        alt.deductions.fraisGardeDomesticite = p.ceGardeDomesticiteMax;
        return restant;
      }, {
        id: 'garde',
        titre: 'Frais de garde d\'enfants / domesticité',
        detail: `Crèche, maison relais, femme de ménage déclarée, aides et soins : abattement jusqu'à ${fmtN(p.ceGardeDomesticiteMax)} €/an — déclarez toutes vos factures.`,
      });
    }

    // Frais de déplacement non renseignés
    if (num(rev.salaireBrut1) > 0 && num(ded.kmUnites1) === 0) {
      suggestions.push({
        id: 'fd', info: true, effort: 0, gain: null, rendement: null,
        titre: 'Frais de déplacement (forfait kilométrique)',
        detail: `Indiquez la distance domicile–travail : ${fmtN(p.fdParUnite)} € par unité au-delà de 4, jusqu'à ${fmtN((p.fdMaxUnites - p.fdFranchiseUnites) * p.fdParUnite)} €/an.`,
      });
    }

    // Amortissement locatif non renseigné
    if (rev.location && num(rev.location.loyersBruts) > 0 && num(rev.location.valeurConstruction) === 0) {
      suggestions.push({
        id: 'amortissement', info: true, effort: 0, gain: null, rendement: null,
        titre: 'Amortissement du bien locatif',
        detail: 'Renseignez la valeur de la construction (hors terrain) : 2 %/an d\'amortissement déductible, 4 %/an si l\'achèvement date de moins de 5 ans — souvent plusieurs milliers d\'euros.',
      });
    }

    return { base, suggestions: suggestions.sort((a, b) => (b.gain || 0) - (a.gain || 0)) };
  }

  // ---------------------------------------------------------------------------
  // Récapitulatif « modèle 100 » : rubriques et pièces justificatives
  // ---------------------------------------------------------------------------

  /**
   * Construit le guide de recopie vers la déclaration (rubriques du modèle 100 —
   * pages du formulaire 2024/2025, à vérifier sur le formulaire de l'année) et la
   * checklist des pièces à joindre. Ne liste que les rubriques concernées.
   */
  function guideModele100(d, res) {
    const rev = d.revenus || {}, ded = d.deductions || {};
    const lignes = [], pieces = [];
    const add = (cond, rubrique, page, montant, piece) => {
      if (!cond) return;
      lignes.push({ rubrique, page, montant });
      if (piece) pieces.push(piece);
    };

    add(true, 'Signalétique : état civil, enfants du ménage, demande d\'imposition (pages 1 à 3)', 'p. 1–3', null, null);
    add(res.revenus.salaire1 + res.revenus.salaire2 > 0,
      'Revenus nets d\'une occupation salariée — salaires bruts et retenues', 'p. 7',
      res.revenus.salaire1 + res.revenus.salaire2,
      'Certificat(s) de rémunération annuel(s) remis par l\'employeur');
    add(res.revenus.fd1 + res.revenus.fd2 > 0,
      'Frais de déplacement (forfait kilométrique)', 'p. 7', res.revenus.fd1 + res.revenus.fd2, null);
    add(res.revenus.fo1 + res.revenus.fo2 > 0,
      'Frais d\'obtention (forfait ou frais réels)', 'p. 7',
      res.revenus.fo1 + res.revenus.fo2,
      num(ded.fraisReels1) + num(ded.fraisReels2) > 0 ? 'Justificatifs des frais d\'obtention réels' : null);
    add(res.revenus.pension1 + res.revenus.pension2 > 0,
      'Revenus nets de pensions ou de rentes', 'p. 8',
      res.revenus.pension1 + res.revenus.pension2,
      'Certificat(s) de pension');
    add(res.revenus.benefice1 + res.revenus.benefice2 !== 0,
      'Bénéfice commercial / provenant de l\'exercice d\'une profession libérale', 'p. 4–5',
      res.revenus.benefice1 + res.revenus.benefice2,
      'Comptes annuels ou état des recettes et dépenses');
    add(res.revenus.capitauxImposables > 0 || num(rev.dividendes) + num(rev.interetsRecus) > 0,
      'Revenus nets de capitaux mobiliers (dividendes, intérêts)', 'p. 9–10',
      res.revenus.capitauxImposables,
      'Relevés bancaires / certificats de dividendes');
    add(res.revenus.location.actif,
      'Revenus nets de la location de biens (loyers, frais, amortissement)', 'p. 11–12',
      r2(res.revenus.location.net),
      'Contrats de bail, décomptes de charges, tableau d\'amortissement');
    add(res.revenus.interetsHypo > 0,
      'Intérêts débiteurs — habitation principale (valeur locative)', 'p. 11–12',
      -res.revenus.interetsHypo,
      'Certificat annuel d\'intérêts du prêt hypothécaire');
    add(num(rev.pvSpeculation) > 0 || num(rev.pvLongTerme) > 0,
      'Revenus divers : bénéfices de spéculation et de cession (mod. 700)', 'p. 13',
      num(rev.pvSpeculation) + num(rev.pvLongTerme),
      'Actes d\'acquisition et de cession');
    add(res.ds.assurances > 0,
      'Dépenses spéciales — primes d\'assurances et intérêts débiteurs (annexe DS)', 'p. 14',
      res.ds.assurances,
      'Certificats annuels des compagnies d\'assurance / banques');
    add(res.ds.prevoyance1 + res.ds.prevoyance2 > 0,
      'Dépenses spéciales — prévoyance-vieillesse art. 111bis (cases 1549–1552)', 'p. 14',
      res.ds.prevoyance1 + res.ds.prevoyance2,
      'Certificat annuel du contrat de prévoyance-vieillesse');
    add(res.ds.epargneLogement > 0,
      'Dépenses spéciales — cotisations d\'épargne-logement', 'p. 14',
      res.ds.epargneLogement,
      'Certificat annuel de la caisse d\'épargne-logement');
    add(res.ds.dons > 0,
      'Dépenses spéciales — dons et libéralités', 'p. 15',
      res.ds.dons,
      'Reçus des organismes bénéficiaires');
    add(res.ds.pensionAlimentaire > 0,
      'Dépenses spéciales — rentes et pensions alimentaires (ex-conjoint)', 'p. 15',
      res.ds.pensionAlimentaire,
      'Jugement de divorce / convention, preuves de paiement');
    add(res.ce.total > 0,
      'Charges extraordinaires (mod. CE) : garde d\'enfants, domesticité, autres', 'p. 17',
      res.ce.total,
      'Factures de crèche/maison relais, contrat de la femme de ménage, frais médicaux');
    add(res.retenues > 0,
      'Retenues d\'impôt sur salaires et pensions', 'p. 20', res.retenues, null);

    return { lignes, pieces: pieces.filter(Boolean) };
  }

  function defaultInput() {
    return {
      annee: 2025,
      situation: {
        statut: 'celibataire', pacsDeclarationCommune: true, transitionMoins3Ans: false,
        age: 0, ageConjoint: 0, enfants: 0, enfantsHorsMenage: 0,
        resident: true, paysResidence: 'BE',
      },
      revenus: {
        salaireBrut1: 0, salaireBrut2: 0, pensionBrut1: 0, pensionBrut2: 0,
        beneficeIndependant1: 0, beneficeIndependant2: 0, cotisationsIndependant: 0,
        autresRevenusNets: 0, dividendes: 0, interetsRecus: 0,
        location: { loyersBruts: 0, fraisEntretien: 0, chargesAssurances: 0, interetsEmprunt: 0, valeurConstruction: 0, anneeAchevement: 0 },
        pvSpeculation: 0, pvLongTerme: 0, pvAbattementRestant: '',
        revenusEtrangers1: 0, revenusEtrangers2: 0,
        cotisationsOverride: null,
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
    YEARS, PARAMS: YEARS[2025], // rétro-compatibilité
    tarifBase: (R, p) => tarifBase(R, p || YEARS[2025]),
    impotSelonClasse: (R, c, p) => impotSelonClasse(R, c, p || YEARS[2025]),
    classeImpot, compute, optimize, comparerModes, guideModele100,
    defaultInput, chargeNormalePct,
    creditSalarie: (b, p) => creditSalarie(b, p || YEARS[2025]),
    creditCO2: (b, p) => creditCO2(b, p || YEARS[2025]),
    creditMonoparental: (R, a, p) => creditMonoparental(R, a, p || YEARS[2025]),
  };

  root.TaxEngine = TaxEngine;
  if (typeof module !== 'undefined' && module.exports) module.exports = TaxEngine;
})(typeof window !== 'undefined' ? window : globalThis);
