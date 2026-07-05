// Connexion bancaire PSD2 optionnelle via GoCardless Bank Account Data
// (ex-Nordigen) — le seul agrégateur open banking gratuit couvrant les
// banques belges (Belfius, KBC, BNP Paribas Fortis, ING, Argenta…).
//
// OPTIONNEL : sans GOCARDLESS_SECRET_ID / GOCARDLESS_SECRET_KEY dans
// .env, l'app fonctionne intégralement (import CSV). Clés gratuites sur
// https://bankaccountdata.gocardless.com (Developer portal).
//
// Flux : créer une réquisition → l'utilisateur autorise sur le site de
// sa banque → callback → on relie les comptes → synchronisation des
// transactions (consentement valable ~90 jours, puis à renouveler).

const BASE = "https://bankaccountdata.gocardless.com/api/v2";

export function gocardlessConfigure(): boolean {
  return Boolean(
    process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY,
  );
}

async function requete<T>(
  chemin: string,
  options: RequestInit & { jeton?: string } = {},
): Promise<T> {
  const { jeton, ...init } = options;
  const reponse = await fetch(`${BASE}${chemin}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}),
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!reponse.ok) {
    const corps = await reponse.text();
    throw new Error(`GoCardless ${reponse.status} sur ${chemin} : ${corps.slice(0, 300)}`);
  }
  return reponse.json() as Promise<T>;
}

/** Jeton d'accès éphémère (on n'en garde aucun en base). */
async function obtenirJeton(): Promise<string> {
  const { access } = await requete<{ access: string }>("/token/new/", {
    method: "POST",
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  return access;
}

export interface Institution {
  id: string;
  name: string;
  logo: string;
}

/** Banques belges disponibles. */
export async function listerBanquesBelges(): Promise<Institution[]> {
  const jeton = await obtenirJeton();
  return requete<Institution[]>("/institutions/?country=be", { jeton });
}

/** Crée une réquisition (consentement) et renvoie l'URL d'autorisation. */
export async function creerRequisition(
  institutionId: string,
  redirectUrl: string,
): Promise<{ id: string; link: string }> {
  const jeton = await obtenirJeton();
  return requete<{ id: string; link: string }>("/requisitions/", {
    method: "POST",
    jeton,
    body: JSON.stringify({ institution_id: institutionId, redirect: redirectUrl }),
  });
}

/** Comptes reliés à une réquisition (après autorisation par la banque). */
export async function comptesDeRequisition(
  requisitionId: string,
): Promise<{ status: string; accounts: string[] }> {
  const jeton = await obtenirJeton();
  return requete(`/requisitions/${requisitionId}/`, { jeton });
}

export interface DetailsCompte {
  iban?: string;
  name?: string;
  ownerName?: string;
}

export async function detailsCompte(compteExterneId: string): Promise<DetailsCompte> {
  const jeton = await obtenirJeton();
  const { account } = await requete<{ account: DetailsCompte }>(
    `/accounts/${compteExterneId}/details/`,
    { jeton },
  );
  return account;
}

export async function soldeCompte(
  compteExterneId: string,
): Promise<{ montantCents: number; date: Date } | null> {
  const jeton = await obtenirJeton();
  const { balances } = await requete<{
    balances: {
      balanceAmount: { amount: string };
      balanceType: string;
      referenceDate?: string;
    }[];
  }>(`/accounts/${compteExterneId}/balances/`, { jeton });
  const solde =
    balances.find((b) => b.balanceType === "closingBooked") ?? balances[0];
  if (!solde) return null;
  return {
    montantCents: Math.round(Number(solde.balanceAmount.amount) * 100),
    date: solde.referenceDate ? new Date(solde.referenceDate) : new Date(),
  };
}

interface TransactionPsd2 {
  bookingDate?: string;
  valueDate?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  creditorAccount?: { iban?: string };
  debtorAccount?: { iban?: string };
  remittanceInformationUnstructured?: string;
  remittanceInformationUnstructuredArray?: string[];
}

export interface TransactionSync {
  date: { annee: number; mois: number; jour: number };
  montantCents: number;
  contrepartie: string | null;
  ibanContrepartie: string | null;
  communication: string | null;
}

/** Transactions comptabilisées d'un compte, au format d'import commun. */
export async function transactionsCompte(
  compteExterneId: string,
): Promise<TransactionSync[]> {
  const jeton = await obtenirJeton();
  const { transactions } = await requete<{
    transactions: { booked: TransactionPsd2[] };
  }>(`/accounts/${compteExterneId}/transactions/`, { jeton });

  return transactions.booked.flatMap((t) => {
    const brutDate = t.valueDate ?? t.bookingDate;
    if (!brutDate) return [];
    const [annee, mois, jour] = brutDate.split("-").map(Number);
    const montantCents = Math.round(Number(t.transactionAmount.amount) * 100);
    const credit = montantCents > 0;
    return [
      {
        date: { annee, mois, jour },
        montantCents,
        contrepartie: (credit ? t.debtorName : t.creditorName) ?? null,
        ibanContrepartie:
          (credit ? t.debtorAccount?.iban : t.creditorAccount?.iban) ?? null,
        communication:
          t.remittanceInformationUnstructured ??
          t.remittanceInformationUnstructuredArray?.join(" ") ??
          null,
      },
    ];
  });
}
