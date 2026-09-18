/**
 * Il calcolo delle storie.
 *
 * Una volta sola, al caricamento del dataset, **prima** che la sessione
 * cominci. Il risultato e' deterministico: lo stesso dataset produce sempre le
 * stesse storie nello stesso ordine. Non e' un dettaglio ma un requisito —
 * chi presenta prova la sessione il giorno prima e deve ritrovare esattamente
 * le stesse cose davanti alla sala.
 *
 * Il determinismo si ottiene evitando tre cose: qualsiasi sorgente casuale,
 * qualsiasi dipendenza dall'orologio, e qualsiasi ordinamento che lasci due
 * elementi a pari merito senza un criterio per separarli.
 */

import type { Dataset } from "../data/schema.ts";
import { aggrega } from "../data/metrics.ts";
import { ARCHETIPI } from "./archetipi.ts";
import { costruisciContesto } from "./contesto.ts";
import { componiFrase, componiLuogo } from "./frasi.ts";
import {
  CONFIGURAZIONE_PREDEFINITA,
  ETICHETTE,
  STRATI,
  type Candidata,
  type Configurazione,
  type Regia,
  type Storia,
  type Unita,
} from "./tipi.ts";

export * from "./tipi.ts";
export { costruisciContesto } from "./contesto.ts";

/** Distanza in chilometri fra due punti sulla sfera. */
export function distanzaKm(a: [number, number], b: [number, number]): number {
  const R = 6371;
  const rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad;
  const dLng = (b[0] - a[0]) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Dove va la camera e cosa si accende.
 *
 * Lo zoom si ricava dall'estensione di quello che la storia deve contenere: una
 * cella di sessanta chilometri e nove stati non si guardano dalla stessa quota.
 * L'altezza del muro e' il lato stretto, quindi e' quella a decidere.
 */
function regiaPer(d: Dataset, aree: Unita[], archetipo: Storia["archetipo"]): Regia {
  // L'estensione si misura sui **negozi**, non sui centri delle aree: per una
  // storia su una cella sola i centri sono un punto solo, l'estensione
  // risulterebbe zero e la camera scenderebbe a un'altezza da cui la cella non
  // ci sta neanche tutta.
  let nord = -90;
  let sud = 90;
  let est = -180;
  let ovest = 180;
  let pesoTotale = 0;
  let lng = 0;
  let lat = 0;

  for (const u of aree) {
    pesoTotale += u.sintesi.negozi;
    lng += u.centro[0] * u.sintesi.negozi;
    lat += u.centro[1] * u.sintesi.negozi;
    for (let k = 0; k < u.indici.length; k++) {
      const i = u.indici[k];
      if (!Number.isFinite(d.lat[i]) || !Number.isFinite(d.lng[i])) continue;
      nord = Math.max(nord, d.lat[i]);
      sud = Math.min(sud, d.lat[i]);
      est = Math.max(est, d.lng[i]);
      ovest = Math.min(ovest, d.lng[i]);
    }
  }
  const centro: [number, number] = [lng / pesoTotale, lat / pesoTotale];

  // Il muro e' largo cinque volte la propria altezza, quindi e' l'altezza a
  // decidere: si lascia all'area meta' dell'altezza, cosi' attorno resta il
  // contesto che rende leggibile dove si e' atterrati.
  const altezzaKm = Math.max(8, (nord - sud) * 111);
  const larghezzaKm = Math.max(8, (est - ovest) * 111 * Math.cos((centro[1] * Math.PI) / 180));
  const metriPerPixel = Math.max(
    (altezzaKm * 1000) / (1080 * 0.5),
    (larghezzaKm * 1000) / (5760 * 0.7),
  );
  const zoom = Math.log2((156543 * Math.cos((centro[1] * Math.PI) / 180)) / metriPerPixel);

  return {
    centro,
    zoom: Math.max(3, Math.min(12, Number(zoom.toFixed(2)))),
    strato: STRATI[archetipo],
  };
}

/**
 * Il punteggio: quanto e' estremo il caso, per quanto vale.
 *
 * Il valore economico entra **come rango e non come importo**. Con l'importo
 * grezzo la storia della concentrazione, che parla di meta' del paese, varrebbe
 * cento volte qualsiasi area e schiaccerebbe tutte le altre a zero: non
 * verrebbe fuori una classifica ma un vincitore e del rumore. Il rango dice la
 * stessa cosa — questa vale piu' di quella — senza importare la scala.
 *
 * I due termini si combinano in media geometrica: un termine vicino a zero
 * affossa il totale invece di lasciarsi compensare dall'altro. Un'area
 * statisticamente eclatante da poche migliaia di dollari non deve superare
 * un'area meno estrema ma da molti.
 */
function assegnaPunteggi(candidate: Candidata[], peso: number): number[] {
  const valori = candidate.map((c) => c.aree.reduce((s, u) => s + u.sintesi.potenziale, 0));
  const ordine = valori
    .map((v, i) => ({ v, i }))
    .sort((a, b) => a.v - b.v || a.i - b.i)
    .map((x) => x.i);

  const rango = new Array(candidate.length).fill(0);
  ordine.forEach((indice, posizione) => {
    rango[indice] = candidate.length > 1 ? posizione / (candidate.length - 1) : 1;
  });

  return candidate.map((c, i) =>
    Math.pow(Math.max(1e-6, c.anomalia), 1 - peso) * Math.pow(Math.max(1e-6, rango[i]), peso),
  );
}

export function calcolaStorie(
  d: Dataset,
  opzioni: Partial<Configurazione> = {},
): { storie: Storia[]; candidate: number; perArchetipo: Record<string, number> } {
  const config: Configurazione = {
    ...CONFIGURAZIONE_PREDEFINITA,
    ...opzioni,
    soglie: { ...CONFIGURAZIONE_PREDEFINITA.soglie, ...(opzioni.soglie ?? {}) },
  };
  const ctx = costruisciContesto(d, config);

  const candidate: Candidata[] = [];
  const perArchetipo: Record<string, number> = {};
  // L'ordine di esecuzione segue la configurazione, non l'ordine delle chiavi
  // di un oggetto: e' l'unico modo di renderlo dichiarato invece che implicito.
  for (const id of config.attivi) {
    const trovate = ARCHETIPI[id](ctx);
    perArchetipo[id] = trovate.length;
    candidate.push(...trovate);
  }

  const punteggi = assegnaPunteggi(candidate, config.pesoValore);
  const ordinate = candidate
    .map((c, i) => ({ c, punteggio: punteggi[i], i }))
    // Il pari merito si rompe sull'indice di generazione, che e' stabile: due
    // calcoli sullo stesso dataset non devono poter scambiare due storie.
    .sort((a, b) => b.punteggio - a.punteggio || a.i - b.i);

  const scelte: Storia[] = [];
  const contatore: Record<string, number> = {};
  const gia: [number, number][] = [];

  for (const { c, punteggio } of ordinate) {
    if (scelte.length >= config.quante) break;

    // Varieta' di archetipo: altrimenti si ottengono otto varianti della stessa
    // cosa, che e' esattamente la lista inutile che le storie devono evitare.
    if ((contatore[c.archetipo] ?? 0) >= config.massimoPerArchetipo) continue;

    // Distanza geografica: due storie su aree adiacenti sono la stessa anomalia
    // raccontata due volte con due nomi. La concentrazione e' esente perche'
    // non e' una storia su un luogo ma su come e' distribuito il paese.
    if (c.archetipo !== "concentrazione") {
      const troppoVicina = c.aree.some((u) =>
        gia.some((p) => distanzaKm(p, u.centro) < config.distanzaMinimaKm),
      );
      if (troppoVicina) continue;
      for (const u of c.aree) gia.push(u.centro);
    }

    contatore[c.archetipo] = (contatore[c.archetipo] ?? 0) + 1;
    const indici = c.aree.length === 1 ? c.aree[0].indici : unisci(c.aree);
    scelte.push({
      ...c,
      id: `${c.archetipo}:${c.aree.map((u) => u.id).join("+")}`,
      titolo: ETICHETTE[c.archetipo],
      luogo: componiLuogo(c),
      testo: componiFrase(c),
      sintesi: c.aree.length === 1 ? c.aree[0].sintesi : aggrega(d, indici),
      regia: regiaPer(d, c.aree, c.archetipo),
      punteggio,
    });
  }

  return { storie: scelte, candidate: candidate.length, perArchetipo };
}

function unisci(aree: Unita[]): Int32Array {
  let lunghezza = 0;
  for (const u of aree) lunghezza += u.indici.length;
  const fuori = new Int32Array(lunghezza);
  let scritti = 0;
  for (const u of aree) {
    fuori.set(u.indici, scritti);
    scritti += u.indici.length;
  }
  return fuori;
}
