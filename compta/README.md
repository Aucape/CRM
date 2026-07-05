# 🧾 Compta.be — Comptabilité complète pour indépendant belge

Alternative auto-hébergée à Accountable (équivalent du plan **Taxes**, le plus complet) :
toute votre comptabilité de personne physique — facturation, dépenses, TVA, impôts,
cotisations sociales — sans abonnement, et vos données restent chez vous.

## Démarrage

```bash
cd compta
npm install
npm start          # → http://localhost:3900
```

Première utilisation : allez dans **Paramètres** pour encoder votre entreprise
(nom, n° TVA, IBAN — c'est lui qui alimente le QR de paiement des factures) et
votre régime TVA (assujetti / franchise / exempté).

## Fonctionnalités

### Facturation (équivalent Accountable + plus)
- Factures, devis, notes de crédit, **factures récurrentes** (générées automatiquement)
- Numérotation séquentielle légale par année, statuts (brouillon → envoyée → payée / en retard)
- PDF professionnel avec **QR de virement EPC** (payable en un scan depuis toute app bancaire belge)
- **Communication structurée** (+++xxx/xxxx/xxxxx+++) générée automatiquement
- **Export UBL 2.1 Peppol BIS 3.0** (norme EN 16931) — la facture électronique obligatoire en B2B belge depuis 2026
- Régimes TVA : standard 21/12/6/0 %, cocontractant, intracom (biens/services), export, franchise, art. 44 — mentions légales ajoutées automatiquement
- Rappels de paiement PDF (compteur de rappels), devis → facture en un clic
- Catalogue de produits/services, remises par ligne

### Dépenses
- Encodage avec justificatif (photo/PDF), catégories belges pré-configurées avec les
  **règles de déductibilité** (restaurant 69 %, réception 50 %, cadeaux 50 %,
  voiture, logiciel comptable 120 %, amendes 0 %…)
- % d'usage professionnel, % TVA récupérable, régimes autoliquidation (intracom, import, cocontractant)
- **Immobilisations & amortissements** linéaires avec plan annuel (3/5/10/33 ans)
- Calculateur de **déductibilité voiture** selon le CO2 (formule « gramme »)

### Banque
- **Import CODA** (le format d'extraits de toutes les banques belges) + CSV générique
- Détection des doublons, **rapprochement automatique** (communication structurée ou montant)
- Une transaction rapprochée marque la facture payée ; création de dépense en un clic depuis un débit

### TVA
- **Déclaration périodique calculée en temps réel** (toutes les grilles : 00-03, 44-49, 54-59, 61-64, 71/72, 81-88)
- **Export XML Intervat** prêt à déposer
- **Listing clients annuel** + XML Intervat
- **Relevé intracommunautaire** + XML Intervat
- Suivi du **plafond de franchise** (25 000 €) avec alerte
- Périodicité mensuelle ou trimestrielle

### Impôts & cotisations sociales
- Estimation IPP en temps réel : barème progressif, quotité exemptée, additionnels communaux,
  **frais réels vs forfait** (le meilleur est choisi automatiquement)
- **Cotisations sociales** (20,5 % / 14,16 % par tranche, frais de caisse, minimum légal)
- « **À mettre de côté** » et « net en poche » affichés en permanence sur le dashboard
- Barèmes 100 % modifiables dans Paramètres (indexation annuelle)
- Coach fiscal : conseils versements anticipés, P.L.C.I., forfait…

### Pilotage
- Dashboard : revenus/dépenses par mois, impayés, TVA de la période, échéances
- **Calendrier fiscal belge** : TVA, listing clients, cotisations, versements anticipés, IPP
- Compte de résultats, **export CSV pour votre comptable**, vérificateur de n° TVA (checksum)
- **Sauvegarde/restauration** complète en JSON

## Notes

- Données stockées en SQLite dans `compta/data/` (variable `COMPTA_DATA_DIR` pour changer).
- Les barèmes fiscaux livrés par défaut (revenus 2026) sont indicatifs : vérifiez-les
  chaque année dans Paramètres — tous les calculs les suivent.
- L'envoi effectif sur le réseau Peppol nécessite un point d'accès certifié : le fichier
  UBL généré est prêt à être transmis via votre point d'accès (ex. Hermes, e-invoicing
  de votre banque) ou remis au client.
- Ce logiciel est un outil d'aide : il ne remplace pas un conseil fiscal personnalisé.
