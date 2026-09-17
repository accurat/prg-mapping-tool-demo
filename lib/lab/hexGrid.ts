export type HexCell = {
  position: [number, number];
  /** Identifica la cella nella maglia, per selezione e confronti. */
  key: string;
  /** Valore normalizzato 0..1: nel prodotto sarebbe il potenziale inespresso. */
  value: number;
};

/**
 * Genera una griglia esagonale di celle attorno a un centro.
 *
 * Dati finti ma con la struttura giusta: celle affiancate senza sovrapposizioni
 * ne' buchi, e un valore che varia con continuita' nello spazio invece che a
 * caso, cosi' il rilievo ha una forma leggibile come l'avrebbe con dati veri.
 * Un campo di rumore casuale renderebbe il test piu' facile del reale, perche'
 * non produrrebbe ne' picchi ne' pianure estese.
 */
export type HexGridSpec = {
  center: [number, number];
  count: number;
  cellRadiusMeters: number;
};

/**
 * Passo della maglia in gradi, per un dato centro e raggio.
 * Usato sia per generare la griglia sia per ritrovarla a partire da una
 * coordinata: devono per forza usare lo stesso calcolo.
 */
function gridStep(lat: number, cellRadiusMeters: number) {
  const metersPerDegLat = 111_320;
  const metersPerDegLng = metersPerDegLat * Math.cos((lat * Math.PI) / 180);
  return {
    stepX: (cellRadiusMeters * 1.5) / metersPerDegLng,
    stepY: (cellRadiusMeters * Math.sqrt(3)) / metersPerDegLat,
  };
}

/** Chiave stabile di una cella, per insiemi e confronti. */
export function cellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/**
 * Trova la cella che contiene una coordinata, **senza interrogare la scheda
 * video**.
 *
 * E' la contromisura emersa da T6: ogni interrogazione grafica costa una decina
 * di millisecondi perche' comporta di disegnare un fotogramma di servizio e
 * rileggerlo, mentre qui si tratta di due divisioni e due arrotondamenti.
 *
 * L'approssimazione: si risolve la cella come se la maglia fosse rettangolare
 * invece che esagonale, quindi vicino ai vertici degli esagoni il risultato puo'
 * cadere sulla cella adiacente. Per un pennello che attraversa decine di celle
 * e' irrilevante; per un tocco di precisione su una cella sola andrebbe raffinato.
 */
export function cellAt(
  lng: number,
  lat: number,
  { center, cellRadiusMeters }: Omit<HexGridSpec, "count">,
): { col: number; row: number; key: string } {
  const { stepX, stepY } = gridStep(center[1], cellRadiusMeters);
  const col = Math.round((lng - center[0]) / stepX);
  const offset = col % 2 === 0 ? 0 : stepY / 2;
  const row = Math.round((lat - center[1] - offset) / stepY);
  return { col, row, key: cellKey(col, row) };
}

export function makeHexGrid({
  center,
  count,
  cellRadiusMeters,
}: {
  center: [number, number];
  count: number;
  cellRadiusMeters: number;
}): HexCell[] {
  const [lng, lat] = center;
  const { stepX, stepY } = gridStep(lat, cellRadiusMeters);

  const side = Math.ceil(Math.sqrt(count));
  const half = Math.floor(side / 2);
  const cells: HexCell[] = [];

  for (let col = -half; col <= half && cells.length < count; col++) {
    for (let row = -half; row <= half && cells.length < count; row++) {
      // Le colonne dispari sono sfalsate di mezzo passo: e' quello che rende
      // la maglia esagonale invece che quadrata.
      const offset = col % 2 === 0 ? 0 : stepY / 2;
      const position: [number, number] = [
        lng + col * stepX,
        lat + row * stepY + offset,
      ];

      // Due onde sovrapposte di periodo diverso: crea zone alte e zone piatte.
      const value =
        0.5 +
        0.3 * Math.sin(col / 6) * Math.cos(row / 5) +
        0.2 * Math.sin((col + row) / 11);

      cells.push({
        position,
        value: Math.max(0.02, Math.min(1, value)),
        key: cellKey(col, row),
      });
    }
  }

  return cells;
}
