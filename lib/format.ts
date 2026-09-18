/**
 * Come si scrivono i numeri.
 *
 * Un posto solo, perche' gli stessi valori compaiono nelle frasi delle storie,
 * nelle schede della dashboard e sui pannelli del muro, e devono essere scritti
 * allo stesso modo: una cifra che cambia forma da una schermata all'altra
 * sembra una cifra diversa.
 */

// Il tool parla inglese: separatore delle migliaia con la virgola e simbolo
// prima della cifra, come se lo aspetta chi lo guarda.
const en = (opzioni: Intl.NumberFormatOptions) => new Intl.NumberFormat("en-US", opzioni);

const intero = en({ maximumFractionDigits: 0 });
const unDecimale = en({ maximumFractionDigits: 1 });

/**
 * Denaro, con l'unita' scelta secondo la grandezza.
 *
 * Sul sample un'area vale qualche migliaio di dollari, non qualche milione:
 * scrivere «0,0 M$» sarebbe esatto e inutile.
 */
export function valuta(v: number): string {
  const assoluto = Math.abs(v);
  if (assoluto >= 1_000_000) return `$${unDecimale.format(v / 1_000_000)}M`;
  if (assoluto >= 1000) return `$${unDecimale.format(v / 1000)}k`;
  // Sotto il migliaio si scrive per esteso, ma con lo stesso simbolo: una cifra
  // che cambia notazione a meta' di una classifica sembra una cifra di
  // un'altra cosa.
  return `$${intero.format(Math.round(v))}`;
}

/** Percentuale a partire da una frazione, con il segno quando e' una variazione. */
export function percentuale(frazione: number, { segno = false, decimali = 0 } = {}): string {
  const valore = frazione * 100;
  const testo = en({ maximumFractionDigits: decimali }).format(valore);
  return `${segno && valore > 0 ? "+" : ""}${testo}%`;
}

export function conta(v: number): string {
  return intero.format(v);
}

/** Numero di negozi, con la parola al singolare o al plurale. */
export function negozi(n: number): string {
  return `${intero.format(n)} ${n === 1 ? "store" : "stores"}`;
}
