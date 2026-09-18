/**
 * Le frasi delle storie.
 *
 * Costruite da template a partire da valori gia' calcolati, **mai generate da
 * un modello linguistico** (§3.5). In una sala con i responsabili del cliente
 * una frase inventata sbagliata su dati di vendita fa piu' danno di quanto
 * valga la fluidita' del linguaggio.
 *
 * I template dicono sempre cosa e' stato trovato, mai perche': il tool osserva
 * coincidenze, non stabilisce cause (§3.8).
 */

import type { Candidata, ArchetipoId } from "./tipi.ts";

const TEMPLATE: Record<ArchetipoId, (v: Record<string, string>) => string> = {
  campoLibero: (v) =>
    `High unrealised potential and competition ${v.concorrenti} against the national median.`,
  sottoAssedio: (v) =>
    `High unrealised potential, but competition ${v.concorrenti} against the national median.`,
  annoPerduto: (v) =>
    `Sales ${v.calo} year on year, ${v.scarto} against the country, and it is not one store: ${v.diffusione} are doing worse than average.`,
  anomalieModello: (v) => `${v.quanti} stores ${v.verso} the model: ${v.volte} the national share.`,
  pubblicoCheNonTorna: (v) =>
    `Catchment ${v.distanza} away from the national profile, with share ${v.quota} against the country.`,
  gemelliDivergenti: (v) =>
    `${v.debole} and ${v.forte} have near-identical catchments and shares ${v.divergenza} apart.`,
  concentrazione: (v) =>
    `${v.quante} hold ${v.quota} of the country's unrealised potential: ${v.valore}.`,
};

export function componiFrase(c: Candidata): string {
  return TEMPLATE[c.archetipo](c.frase);
}

/**
 * Il luogo, come si legge su una scheda.
 *
 * Un'area sola ha il suo nome. Due sono un confronto, e vanno nominate
 * entrambe. Piu' di due sono un insieme: si nominano le prime e si dice quante
 * sono le altre, perche' un elenco di nove stati su una scheda non si legge.
 */
export function componiLuogo(c: Candidata): string {
  const nomi = c.aree.map((u) => u.nome);
  if (nomi.length === 1) return nomi[0];
  if (nomi.length === 2) return `${nomi[0]} and ${nomi[1]}`;
  const primi = nomi.slice(0, 3).join(", ");
  return `${primi} and ${nomi.length - 3} more`;
}
