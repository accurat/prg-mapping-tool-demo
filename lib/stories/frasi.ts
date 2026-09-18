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
    `Potenziale inespresso alto e concorrenza ${v.concorrenti} rispetto alla mediana nazionale.`,
  sottoAssedio: (v) =>
    `Potenziale inespresso alto, ma con concorrenza ${v.concorrenti} rispetto alla mediana nazionale.`,
  annoPerduto: (v) =>
    `Vendite ${v.calo} sull'anno precedente, ${v.scarto} rispetto al paese, e non e' un caso isolato: ${v.diffusione} negozi vanno peggio della media.`,
  anomalieModello: (v) =>
    `${v.quanti} negozi ${v.verso} il modello: ${v.volte} la quota nazionale.`,
  pubblicoCheNonTorna: (v) =>
    `Bacino diverso dalla media nazionale del ${v.distanza}, con quota ${v.quota} rispetto a quella del paese.`,
  gemelliDivergenti: (v) =>
    `${v.debole} e ${v.forte} hanno bacini quasi identici e quote diverse del ${v.divergenza}.`,
  concentrazione: (v) =>
    `${v.quante} valgono il ${v.quota} del potenziale inespresso del paese: ${v.valore}.`,
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
  if (nomi.length === 2) return `${nomi[0]} e ${nomi[1]}`;
  const primi = nomi.slice(0, 3).join(", ");
  return `${primi} e altri ${nomi.length - 3}`;
}
