"use client";

// Assistant d'import CSV en 3 temps : fichier → vérification du mapping
// des colonnes (deviné depuis les en-têtes) → import. Fonctionne avec
// les exports de toutes les banques belges.
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { CompteBancaire } from "@prisma/client";
import { importerCsv } from "@/server/actions/finances";
import type { ResultatImport } from "@/lib/finances";
import {
  devinerMapping,
  extraireTransactions,
  parserCsv,
  parserDateBelge,
  parserMontantBelge,
  type CsvParse,
  type MappingColonnes,
} from "@/lib/csv";
import { LIBELLES_BANQUE, type Banque } from "@/lib/constantes";
import { Bouton, Carte, ChampSelect } from "@/components/ui/base";

const ROLES: {
  cle: keyof MappingColonnes;
  libelle: string;
  obligatoire: boolean;
}[] = [
  { cle: "date", libelle: "Date", obligatoire: true },
  { cle: "montant", libelle: "Montant", obligatoire: true },
  { cle: "contrepartie", libelle: "Contrepartie (nom)", obligatoire: false },
  { cle: "ibanContrepartie", libelle: "IBAN contrepartie", obligatoire: false },
  { cle: "communication", libelle: "Communication", obligatoire: false },
];

export function ImportCsv({ comptes }: { comptes: CompteBancaire[] }) {
  const router = useRouter();
  const [compteId, setCompteId] = useState(comptes[0]?.id ?? "");
  const [parse, setParse] = useState<CsvParse | null>(null);
  const [mapping, setMapping] = useState<MappingColonnes | null>(null);
  const [nomFichier, setNomFichier] = useState("");
  const [resultat, setResultat] = useState<ResultatImport | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, demarrer] = useTransition();

  const chargerFichier = async (fichier: File) => {
    setErreur(null);
    setResultat(null);
    const texte = await fichier.text();
    const p = parserCsv(texte);
    if (p.entetes.length < 2 || p.lignes.length === 0) {
      setErreur(
        "Fichier illisible : attendez-vous à un export CSV de votre banque (avec une ligne d'en-têtes).",
      );
      setParse(null);
      return;
    }
    setNomFichier(fichier.name);
    setParse(p);
    setMapping(devinerMapping(p.entetes));
  };

  const extraction =
    parse && mapping ? extraireTransactions(parse, mapping) : null;

  const importer = () =>
    demarrer(async () => {
      if (!extraction || !compteId) return;
      const bilan = await importerCsv(compteId, extraction.transactions);
      if ("erreur" in bilan) {
        setErreur(bilan.erreur);
      } else {
        setResultat(bilan);
        setParse(null);
        router.refresh();
      }
    });

  return (
    <div className="space-y-4">
      <Carte titre="1 · Compte et fichier">
        <div className="space-y-3">
          <ChampSelect
            label="Compte concerné"
            value={compteId}
            onChange={(e) => setCompteId(e.target.value)}
          >
            {comptes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom} ({LIBELLES_BANQUE[c.banque as Banque] ?? c.banque})
              </option>
            ))}
          </ChampSelect>
          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-700">
              Export CSV de la banque
            </span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) chargerFichier(f);
              }}
              className="block w-full rounded-xl bg-white text-sm text-slate-600 ring-1 ring-slate-300 file:mr-3 file:min-h-11 file:cursor-pointer file:rounded-l-xl file:border-0 file:bg-slate-100 file:px-4 file:font-medium"
            />
          </label>
          <p className="text-xs text-slate-400">
            Belfius : Extraits → Exporter (CSV). KBC : Comptes → Télécharger.
            ING : Historique → Télécharger CSV. BNP Fortis : Historique →
            Exporter. Le format exact importe peu : vous vérifiez le mapping
            des colonnes à l&apos;étape 2.
          </p>
        </div>
      </Carte>

      {parse && mapping && (
        <Carte titre={`2 · Colonnes de « ${nomFichier} »`}>
          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map(({ cle, libelle, obligatoire }) => (
              <ChampSelect
                key={cle}
                label={obligatoire ? `${libelle} *` : libelle}
                value={mapping[cle] ?? ""}
                onChange={(e) =>
                  setMapping({
                    ...mapping,
                    [cle]: e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              >
                {!obligatoire && <option value="">—</option>}
                {parse.entetes.map((entete, i) => (
                  <option key={i} value={i}>
                    {entete || `Colonne ${i + 1}`}
                  </option>
                ))}
              </ChampSelect>
            ))}
          </div>

          {/* Aperçu des 5 premières lignes interprétées */}
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-96 text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-400 uppercase">
                  <th className="py-1.5 pr-3">Date</th>
                  <th className="py-1.5 pr-3">Montant</th>
                  <th className="py-1.5 pr-3">Contrepartie</th>
                  <th className="py-1.5">Communication</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {parse.lignes.slice(0, 5).map((ligne, i) => {
                  const date = parserDateBelge(ligne[mapping.date] ?? "");
                  const montant = parserMontantBelge(ligne[mapping.montant] ?? "");
                  return (
                    <tr key={i}>
                      <td className={`py-1.5 pr-3 ${date ? "text-slate-700" : "text-red-600"}`}>
                        {date
                          ? `${String(date.jour).padStart(2, "0")}/${String(date.mois).padStart(2, "0")}/${date.annee}`
                          : "illisible"}
                      </td>
                      <td className={`py-1.5 pr-3 tabular-nums ${Number.isNaN(montant) ? "text-red-600" : "text-slate-700"}`}>
                        {Number.isNaN(montant)
                          ? "illisible"
                          : `${(montant / 100).toFixed(2).replace(".", ",")} €`}
                      </td>
                      <td className="max-w-40 truncate py-1.5 pr-3 text-slate-500">
                        {mapping.contrepartie !== null ? ligne[mapping.contrepartie] : "—"}
                      </td>
                      <td className="max-w-48 truncate py-1.5 text-slate-500">
                        {mapping.communication !== null ? ligne[mapping.communication] : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {extraction && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">
                <strong>{extraction.transactions.length}</strong> transactions
                lisibles
                {extraction.ignorees > 0 && (
                  <span className="text-amber-700">
                    {" "}
                    · {extraction.ignorees} lignes ignorées
                  </span>
                )}
              </p>
              <Bouton
                onClick={importer}
                disabled={enCours || extraction.transactions.length === 0 || !compteId}
              >
                {enCours ? "Import en cours…" : "3 · Importer"}
              </Bouton>
            </div>
          )}
        </Carte>
      )}

      {erreur && (
        <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-700">{erreur}</p>
      )}

      {resultat && (
        <Carte className="ring-green-200">
          <p className="font-medium text-green-800">Import terminé ✅</p>
          <ul className="mt-1.5 space-y-0.5 text-sm text-slate-600">
            <li>{resultat.ajoutees} transactions ajoutées</li>
            <li>{resultat.doublons} doublons ignorés (déjà importés)</li>
            <li>
              {resultat.rapprochees} factures marquées payées automatiquement
            </li>
            <li>{resultat.categorisees} catégorisées par vos règles</li>
          </ul>
        </Carte>
      )}
    </div>
  );
}
