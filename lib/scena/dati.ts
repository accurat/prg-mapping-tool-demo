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
  /**
   * I negozi che restano quando la scena si stringe.
   *
   * Stanno qui e non nella sequenza perche' sono **la stessa cosa che decide
   * l'inquadratura**: la camera si chiude su quello che resta, non su tutto
   * quello che c'era. Calcolarli in due posti vorrebbe dire poter inquadrare
   * un insieme diverso da quello che si vede.
   */
  superstiti: Set<Store>;
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
  /**
   * Quanto si alza un collegamento, in proporzione alla propria lunghezza.
   *
   * Sta nei dati e non nella sequenza perche' una proporzione che funziona su
   * una stella di cinquanta chilometri e' fuori scala su una rete nazionale:
   * con 0,45 la rotta piu' lunga del dataset si alzerebbe di 2.788 chilometri,
   * il 44% del raggio terrestre. Un arco cosi' esce dalla sagoma del pianeta e
   * la parte dietro l'orizzonte sparisce: a schermo resta mezzo arco sospeso
   * nel vuoto.
   */
  proporzioneArco: number;
  /** Quota massima di un collegamento, in metri: il tetto della proporzione. */
  verticeMassimo: number;
  /**
   * Quanto si stringono i raggi di colonne e hub quando la scena si chiude.
   *
   * Le stesse misure non possono servire due scale separate da un fattore
   * trenta: un raggio che a vista nazionale e' un punto visibile, da vicino e'
   * un disco che copre la citta' sotto. Si riassorbe seguendo lo zoom, come
   * l'ingrandimento degli hub sull'inquadratura del paese.
   */
  restringimentoFuoco: number;
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

  /**
   * L'altezza delle colonne misura la **merce**, non il potenziale inespresso.
   *
   * E' una deviazione dal concept, ed e' il dato a imporla. Sui cinquecento
   * negozi che la rete tocca il potenziale inespresso praticamente non esiste:
   * 214 sono esattamente a zero, la mediana e' zero, il novantesimo percentile
   * vale 455 dollari e un solo negozio arriva a 9.087. Un rilievo costruito su
   * quei numeri e' una guglia sola in mezzo a una pianura piatta — che e' una
   * verita', ma non e' una scena, e nemmeno una verita' che riguardi la rete.
   *
   * I dollari per rotta hanno invece una distribuzione vera: mediana 1,8
   * milioni, dal decimo al novantesimo percentile un fattore otto. E' la
   * grandezza di cui questa scena parla — quanta merce passa di qui — ed e'
   * la stessa che regola la frequenza del flusso sugli archi.
   *
   * Il potenziale resta la grandezza del rilievo nazionale, dove c'e' e ha una
   * forma: qui si guarda un'altra cosa.
   */
  const valori = Array.from(rotte.valore);
  const scala = scalaAltezze(valori);
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
      value: Math.max(0.05, scala.normalizza(valori[k])),
      reach: distanze[k] / distanzaMassima,
      // Il volume e' il valore in dollari della rotta: e' la merce che passa,
      // non il margine. Le due cose nel dataset non coincidono.
      volume: Math.max(0.05, Math.min(1, valori[k] / valoreMassimo)),
    });
  }

  /**
   * La stella su cui stringere, e chi vi resta.
   *
   * Di ogni stella sopravvivono i dodici negozi che movimentano piu' merce.
   *
   * Il criterio era due — i sei con piu' potenziale e i sei con piu' merce, per
   * mettere a confronto due domande diverse — ma su questa rete il potenziale
   * e' nullo per quattrocento negozi su cinquecento: «i sei con il potenziale
   * piu' alto» sceglieva sei nomi a caso fra quattrocento a pari merito. Un
   * criterio che non distingue niente e' peggio di un criterio in meno.
   *
   * La scelta di **quale** stella non guarda solo al valore ma anche a quanto
   * e' larga. Su questa rete la rotta mediana e' lunga oltre mille chilometri:
   * la stella piu' ricca puo' essere sparsa su mezzo continente, e inquadrarla
   * significherebbe tornare alla vista nazionale proprio nel momento in cui la
   * scena dovrebbe stringersi. Il punteggio divide quindi il valore per
   * l'estensione, e premia le stelle diffuse quanto basta a stare in
   * un'inquadratura.
   */
  const stelle = hubs.map((h, i) => {
    const suoi = stores.filter((s) => s.hub === i);
    const superstiti = [...suoi].sort((a, b) => b.volume - a.volume).slice(0, 12);
    const raggio = Math.max(
      40,
      ...superstiti.map((s) => distanzaKm(h.position, s.position)),
    );
    const valore = superstiti.reduce((somma, s) => somma + s.value, 0);
    return {
      superstiti,
      punti: [h.position, ...superstiti.map((s) => s.position)] as [number, number][],
      raggio,
      // La penalita' per l'estensione e' **quadratica**, non lineare: una
      // divisione dolce lascia vincere la stella piu' ricca anche quando e'
      // larga mille chilometri, e a quel punto stringersi su di lei vuol dire
      // tornare alla vista nazionale proprio nel momento in cui la scena
      // dovrebbe chiudersi. Con il quadrato, trecento chilometri di raggio
      // costano poco e mille costano quasi tutto.
      punteggio: valore / (1 + (raggio / 300) ** 2),
    };
  });
  const fuoco = stelle.findIndex(
    (s) => s.punteggio === Math.max(...stelle.map((x) => x.punteggio)),
  );

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
    superstiti: new Set(stelle[fuoco].superstiti),
    centroFuoco: baricentro(stelle[fuoco].punti),
    // L'inquadratura si calcola sui superstiti, non su tutti i negozi della
    // stella: quelli che svaniscono non devono decidere da che altezza si
    // guarda quelli che restano.
    zoomFuoco: zoomPer(stelle[fuoco].punti),
    // A scala nazionale una colonna da 26 km, che a scala di citta' era
    // imponente, e' invisibile: l'altezza va riferita all'inquadratura.
    proporzioneArco: 0.1,
    verticeMassimo: 300_000,
    raggioStore: 22_000,
    raggioHub: 52_000,
    ingrandimentoHub: 1.6,
    // Tarati sull'inquadratura finale misurata, non stimati: a 547 metri per
    // pixel un negozio resta largo una quindicina di pixel e la colonna piu'
    // alta ne misura duecentocinquanta, cioe' un quarto dell'altezza del muro.
    restringimentoFuoco: 0.38,
    // Tarata sull'inquadratura finale, che e' l'unica da cui un'altezza si
    // vede: a vista nazionale la camera e' a picco e l'altezza non esiste.
    altezzaDato: 140_000,
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
