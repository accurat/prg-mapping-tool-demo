/**
 * La scena costruita sui dati veri.
 *
 * Due cose sono emerse solo guardando il dataset della rete, e cambiano la
 * forma della scena rispetto ai dati sintetici di T10:
 *
 * - **la rete e' nazionale, non cittadina.** La rotta mediana e' lunga 1.136
 *   chilometri e la piu' lunga 6.196; la stella piu' compatta ha comunque un
 *   raggio di 695 km. La stella «un hub con i suoi negozi a pochi chilometri»
 *   non esiste nei dati: quello che esiste e' un centro di distribuzione
 *   rifornito da mezzo paese. A scala di citta' si vedrebbe un punto e delle
 *   linee che escono dall'inquadratura;
 * - **la rete tocca 550 negozi su 10.466.** Cinquecento rotte, cinquanta
 *   destinazioni, una decina di rami ciascuna. E' uno strato di supporto, non
 *   il ritratto del paese.
 *
 * Di conseguenza la sequenza si svolge a scala nazionale, e il momento in cui
 * ci si stringe e' su una stella, non su una citta'.
 */

import { potenziale } from "../data/metrics.ts";
import type { Dataset, Rotte } from "../data/schema.ts";
import { scalaAltezze } from "../data/aggregate.ts";
import { nomeDominante } from "../stories/contesto.ts";
import { distanzaKm } from "../stories/index.ts";
import type { Hub, Store } from "../lab/network.ts";

export type DatiScena = {
  hubs: Hub[];
  /** Il nome di ciascun hub, per le etichette dell'inquadratura del paese. */
  nomiHub: string[];
  stores: Store[];
  /** Gli indici nel dataset, paralleli a `stores`: servono ai pannelli. */
  indiciStore: Int32Array;
  /** Gli indici dei negozi di ciascuna stella, per i numeri dei pannelli. */
  indiciPerHub: Int32Array[];
  centro: [number, number];
  zoomArrivo: number;
  /** Inclinazione all'arrivo. Non negoziabile: resta quella di T10. */
  pitchArrivo: number;
  /** La stella su cui la sequenza si stringe. */
  fuoco: number;
  centroFuoco: [number, number];
  zoomFuoco: number;
  /** Raggio delle colonne dei negozi, in metri. */
  raggioStore: number;
  /** Raggio degli hub: piu' largo, perche' un hub e' un'altra categoria. */
  raggioHub: number;
  /**
   * Quanto sono piu' grandi gli hub nell'inquadratura del paese.
   *
   * Sta nei dati e non nella sequenza perche' dipende dalla scala della scena:
   * un hub da cinquantadue chilometri a zoom nazionale e' gia' un disco
   * visibile e gli basta un ritocco, uno da sei chilometri e' meno di un pixel
   * e senza un ingrandimento vero non esisterebbe. Lo stesso numero per
   * entrambe sarebbe sbagliato per tutte e due.
   */
  ingrandimentoHub: number;
  /** Altezza massima delle colonne quando mostrano il dato, in metri. */
  altezzaDato: number;
  /** Altezza uniforme quando diventano segnaposto. */
  altezzaSegnaposto: number;
};

export function costruisciScena(d: Dataset, rotte: Rotte): DatiScena {
  // Le destinazioni, in ordine di indice: l'ordine di apparizione nel file
  // dipenderebbe da come e' stato esportato, e la scena non deve dipenderne.
  const destinazioni = [...new Set(Array.from(rotte.destinazione))].sort((a, b) => a - b);
  const posizioneHub = new Map(destinazioni.map((indice, i) => [indice, i]));

  const hubs: Hub[] = destinazioni.map((indice, i) => ({
    index: i,
    position: [d.lng[indice], d.lat[indice]] as [number, number],
  }));

  // Il potenziale si normalizza sul 99esimo percentile come il rilievo: un solo
  // valore fuori scala produrrebbe una guglia che schiaccia tutto il resto.
  const potenziali = Array.from(rotte.origine, (i) => potenziale(d, i) ?? 0);
  const scala = scalaAltezze(potenziali);
  const valori = Array.from(rotte.valore);
  const valoreMassimo = Math.max(...valori, 1);

  const stores: Store[] = [];
  const indiciStore = new Int32Array(rotte.conteggio);
  const perHub: number[][] = hubs.map(() => []);
  const distanze: number[] = [];

  for (let k = 0; k < rotte.conteggio; k++) {
    const origine = rotte.origine[k];
    const hub = posizioneHub.get(rotte.destinazione[k])!;
    distanze.push(distanzaKm([d.lng[origine], d.lat[origine]], hubs[hub].position));
    indiciStore[k] = origine;
    perHub[hub].push(origine);
  }
  const distanzaMassima = Math.max(...distanze, 1);

  for (let k = 0; k < rotte.conteggio; k++) {
    const origine = rotte.origine[k];
    stores.push({
      position: [d.lng[origine], d.lat[origine]],
      hub: posizioneHub.get(rotte.destinazione[k])!,
      value: Math.max(0.05, scala.normalizza(potenziali[k])),
      reach: distanze[k] / distanzaMassima,
      // Il volume e' il valore in dollari della rotta: e' la merce che passa,
      // non il margine. Le due cose nel dataset non coincidono.
      volume: Math.max(0.05, Math.min(1, valori[k] / valoreMassimo)),
    });
  }

  // La stella su cui stringere: quella con piu' potenziale da prendere.
  const perStella = hubs.map((_, i) =>
    stores.filter((s) => s.hub === i).reduce((somma, s) => somma + s.value, 0),
  );
  const fuoco = perStella.indexOf(Math.max(...perStella));

  return {
    hubs,
    nomiHub: destinazioni.map((indice) => nomeDominante(d, [indice])),
    stores,
    indiciStore,
    indiciPerHub: perHub.map((v) => Int32Array.from(v)),
    centro: baricentro(stores.map((s) => s.position)),
    zoomArrivo: zoomPer(stores.map((s) => s.position)),
    pitchArrivo: 55,
    fuoco,
    centroFuoco: hubs[fuoco].position,
    zoomFuoco: zoomPer([
      hubs[fuoco].position,
      ...stores.filter((s) => s.hub === fuoco).map((s) => s.position),
    ]),
    // A scala nazionale una colonna da 26 km, che a scala di citta' era
    // imponente, e' invisibile: l'altezza va riferita all'inquadratura.
    raggioStore: 22_000,
    raggioHub: 52_000,
    ingrandimentoHub: 1.6,
    altezzaDato: 180_000,
    altezzaSegnaposto: 22_000,
  };
}

function baricentro(punti: [number, number][]): [number, number] {
  let lng = 0;
  let lat = 0;
  for (const p of punti) {
    lng += p[0];
    lat += p[1];
  }
  return [lng / punti.length, lat / punti.length];
}

/** Lo zoom a cui un insieme di punti sta comodo su 5760x1080. */
function zoomPer(punti: [number, number][]): number {
  const lat = punti.map((p) => p[1]);
  const lng = punti.map((p) => p[0]);
  const centro = baricentro(punti);
  const altezzaKm = Math.max(40, (Math.max(...lat) - Math.min(...lat)) * 111);
  const larghezzaKm = Math.max(
    40,
    (Math.max(...lng) - Math.min(...lng)) * 111 * Math.cos((centro[1] * Math.PI) / 180),
  );
  const metriPerPixel = Math.max(
    (altezzaKm * 1000) / (1080 * 0.62),
    (larghezzaKm * 1000) / (5760 * 0.72),
  );
  const zoom = Math.log2((156543 * Math.cos((centro[1] * Math.PI) / 180)) / metriPerPixel);
  return Math.max(2, Math.min(12, Number(zoom.toFixed(2))));
}
