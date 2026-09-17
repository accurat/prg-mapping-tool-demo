export type HexCell = {
  position: [number, number];
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

  // Passo della griglia in gradi. La longitudine si accorcia con la latitudine.
  const metersPerDegLat = 111_320;
  const metersPerDegLng = metersPerDegLat * Math.cos((lat * Math.PI) / 180);
  const stepX = (cellRadiusMeters * 1.5) / metersPerDegLng;
  const stepY = (cellRadiusMeters * Math.sqrt(3)) / metersPerDegLat;

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

      cells.push({ position, value: Math.max(0.02, Math.min(1, value)) });
    }
  }

  return cells;
}
