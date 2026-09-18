/**
 * La miniatura di una storia: il rilievo della regione, con dentro evidenziata
 * l'area di cui si parla.
 *
 * Serve a riconoscere una scheda a colpo d'occhio (§3.5), e a dire una cosa che
 * il testo non dice: **quanto quell'area spicca rispetto a quello che le sta
 * intorno**. Una barra alta in mezzo a barre basse e una barra alta in mezzo ad
 * altre barre alte sono due storie diverse, e nessun numero lo comunica cosi'
 * in fretta.
 *
 * Si disegna dalle celle gia' calcolate, non da un rendering della scena: otto
 * scene tridimensionali costerebbero, un profilo costa una passata su un
 * elenco ed e' deterministico come tutto il resto.
 */

import { distanzaKm } from "../stories/index.ts";
import type { Storia, Unita } from "../stories/tipi.ts";

export type Barra = {
  /** Altezza normalizzata 0..1 sul massimo della finestra. */
  altezza: number;
  /** Vero quando la colonna contiene almeno una cella della storia. */
  della: boolean;
};

/**
 * Le barre del profilo.
 *
 * La finestra segue l'estensione della storia: una cella si guarda con qualche
 * centinaio di chilometri attorno, nove stati si guardano da tutto il paese.
 * Le celle si proiettano sulla longitudine e si raccolgono in colonne, come
 * farebbe una sezione est-ovest del rilievo.
 */
export function profiloDi(
  storia: Storia,
  celle: Unita[],
  { colonne = 28, raggioMinimoKm = 350 } = {},
): Barra[] {
  const centro = storia.regia.centro;
  const estensione = Math.max(
    raggioMinimoKm,
    ...storia.aree.map((u) => distanzaKm(centro, u.centro) * 2.5),
  );

  const dentro = celle.filter((u) => distanzaKm(centro, u.centro) <= estensione);
  if (!dentro.length) return [];

  // L'appartenenza si decide sui **negozi**, non sugli identificativi delle
  // aree: la concentrazione parla di stati mentre il profilo e' fatto di celle,
  // e due livelli di aggregazione non hanno chiavi in comune. I negozi si', e
  // sono la stessa cosa a qualsiasi livello la si guardi.
  const suoi = new Set<number>();
  for (const u of storia.aree) for (let k = 0; k < u.indici.length; k++) suoi.add(u.indici[k]);
  const eSua = (u: Unita) => {
    for (let k = 0; k < u.indici.length; k++) if (suoi.has(u.indici[k])) return true;
    return false;
  };
  const ovest = Math.min(...dentro.map((u) => u.centro[0]));
  const est = Math.max(...dentro.map((u) => u.centro[0]));
  const passo = (est - ovest) / colonne || 1;

  const valori = new Array(colonne).fill(0);
  const della = new Array(colonne).fill(false);
  for (const u of dentro) {
    const c = Math.min(colonne - 1, Math.floor((u.centro[0] - ovest) / passo));
    // Si somma, come somma l'altezza di una cella: una colonna che contiene
    // molte celle medie deve poter competere con una che ne contiene una alta.
    valori[c] += u.sintesi.potenziale;
    if (eSua(u)) della[c] = true;
  }

  const massimo = Math.max(...valori);
  return valori.map((v, i) => ({
    altezza: massimo > 0 ? v / massimo : 0,
    della: della[i],
  }));
}
