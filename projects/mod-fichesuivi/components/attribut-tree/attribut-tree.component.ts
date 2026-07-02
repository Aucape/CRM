import {ChangeDetectionStrategy, Component, computed, inject, input} from '@angular/core';
import { CommonModule } from '@angular/common';
import {ComponentToggleComponent} from "@src/app/components/component-toggle/component-toggle.component";
import {InputDateNeoComponent} from "@src/app/components/input-date-neo/input-date-neo.component";
import {InputNeoComponent} from "@src/app/components/input-neo/input-neo.component";
import {FicheSuiviService} from "@projects/mod-fichesuivi/services/fiche-suivi.service";

/**
 * Un "attribut" final : la feuille de l'arbre.
 * On le reconnaît à la présence de IDENTIFIANT_ATTRIBUT.
 */
export interface AttributLeaf {
  IDENTIFIANT_ATTRIBUT: string;
  ENCART_ATTRIBUT?: string;
  GROUPE_ATTRIBUT?: string | null;
  LIBELLE: string;
  TYPE_ATTRIBUT: string;
  DISPLAY_LIBELLE_ATTRIBUT?: number;
  ICONE_ATTRIBUT?: string | null;
  SELECTION?: any;
  TYPE_SELECTION?: string;
  VALEUR_OLD?: any;
  VALEUR_NEW?: any;
  PAGE?: number;
  REF?: any;
}

/**
 * Un "groupe" intermédiaire : contient un LIBELLE et un sous-TAB
 * qui peut lui-même contenir des feuilles ou d'autres groupes.
 */
export interface AttributGroupe {
  LIBELLE: string;
  TAB: AttributNode[];
}

/** Un noeud de l'arbre : soit une feuille, soit un groupe. */
export type AttributNode = AttributLeaf | AttributGroupe;

/** Une section de premier niveau (élément de "donnees"). */
export interface Section {
  LIBELLE: string;
  TAB: AttributNode[];
}

/**
 * Type guard : distingue un groupe (a un TAB tableau) d'une feuille
 * (a un IDENTIFIANT_ATTRIBUT). On teste sur TAB pour être robuste
 * même si la structure évolue.
 */
export function estGroupe(node: AttributNode): node is AttributGroupe {
  return Array.isArray((node as AttributGroupe).TAB);
}

@Component({
  selector: 'app-attribut-tree',
  standalone: true,
  imports: [
    CommonModule,
    ComponentToggleComponent,
    InputDateNeoComponent,
    InputNeoComponent
  ],
  templateUrl: './attribut-tree.component.html',
  styleUrl: './attribut-tree.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AttributTreeComponent {

  protected ficheSuiviService = inject(FicheSuiviService);

  /** Liste de noeuds à afficher à ce niveau (feuilles et/ou groupes mélangés). */
  readonly items = input.required<AttributNode[]>();

  /** Niveau de profondeur courant, sert uniquement à l'indentation visuelle. */
  readonly depth = input<number>(0);

  /**
   * Feuilles de CE niveau (attributs finaux, avec IDENTIFIANT_ATTRIBUT).
   * -> affichées ensemble dans UN seul tableau.
   */
  readonly feuilles = computed<AttributLeaf[]>(() =>
    this.items().filter((i): i is AttributLeaf => !estGroupe(i))
  );

  /**
   * Sous-groupes de CE niveau (LIBELLE + TAB imbriqué).
   * -> chacun est re-descendu récursivement.
   */
  readonly groupes = computed<AttributGroupe[]>(() =>
    this.items().filter((i): i is AttributGroupe => estGroupe(i))
  );

  /** Vrai si la valeur diffère entre Avant et Après (pilote la flèche bleue). */
  protected estModifie(data: AttributLeaf): boolean {
    return String(data.VALEUR_OLD ?? '') !== String(data.VALEUR_NEW ?? '');
  }

  protected setData(button,data,key){
    data[key] = data[key] === button.ID ? null : button.ID;
  }

  protected setData2(button,data,key){
    data[key] = data[key] === button.ID_VALEUR ? null : button.ID_VALEUR;
  }

}
