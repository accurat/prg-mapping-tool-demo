export type Hub = {
  position: [number, number];
  index: number;
};

export type Store = {
  position: [number, number];
  /** A quale hub e' assegnato: definisce la stella. */
  hub: number;
  /** Potenziale inespresso normalizzato, 0..1. */
  value: number;
  /** Distanza dal proprio hub, normalizzata 0..1. */
  reach: number;
  /**
   * Posizione in classifica per distanza, 0..1: e' questa a scaglionare le
   * animazioni, non la distanza.
   *
   * L'ordine e' lo stesso — i piu' vicini per primi — ma il ritmo no. Usando la
   * distanza, e' la forma dei dati a decidere quante cose accadono insieme: su
   * questa rete un quarto dei collegamenti e' piu' corto di un decimo del piu'
   * lungo, quindi centocinquanta colonne salivano nello stesso istante e la
   * scena non si popolava, sbocciava. Con la posizione in classifica le
   * comparse sono equidistanti nel tempo qualunque forma abbiano i dati.
   */
  rango: number;
  /**
   * Quantita' di merce scambiata con il proprio hub, 0..1.
   *
   * Distinta dal potenziale: un negozio puo' ricevere molta merce e avere poco
   * margine, o viceversa. Nel prodotto sarebbero casse o pezzi dal dataset di
   * rete, qui e' correlata alla dimensione ma non identica.
   */
  volume: number;
};
