/**
 * Verifica delle definizioni di `lib/data/metrics.ts` sui dati veri.
 *
 * Gli attesi non sono stati presi da questo codice: sono stati calcolati a
 * parte, direttamente sul TSV di origine. Se coincidono, le due strade
 * indipendenti danno lo stesso numero; se un domani divergono, e' cambiata una
 * definizione e va saputo subito, non quando lo nota qualcuno in sala.
 *
 *   node --experimental-strip-types scripts/check-metrics.mts
 */

import { readFileSync } from "node:fs";
import { daGrezzo, type DatasetGrezzo } from "../lib/data/schema.ts";
import {
  aggrega,
  composizioneMedia,
  quotaBacino,
  quotaNegozio,
  statoNegozio,
  tuttiGliIndici,
} from "../lib/data/metrics.ts";

const grezzo = JSON.parse(readFileSync("public/data/stores.json", "utf8")) as DatasetGrezzo;
const d = daGrezzo(grezzo);

let esiti = 0;
let falliti = 0;

function atteso(nome: string, valore: number, riferimento: number, tolleranza = 0) {
  esiti++;
  const scarto = Math.abs(valore - riferimento);
  const passa = scarto <= tolleranza;
  if (!passa) falliti++;
  const mostra = Number.isInteger(riferimento) && tolleranza === 0
    ? `${valore}`
    : valore.toFixed(4);
  console.log(`  ${passa ? "ok  " : "NO  "} ${nome.padEnd(42)} ${mostra.padStart(14)}  atteso ${riferimento}`);
}

console.log("\nVerifica delle definizioni sui dati veri\n");

const inizio = performance.now();
const tutti = tuttiGliIndici(d);
const nazionale = aggrega(d, tutti);
const durata = performance.now() - inizio;

atteso("negozi", nazionale.negozi, 10466);
atteso("negozi con vendite", nazionale.misurabili, 9434);
atteso("sotto la quota del proprio bacino", nazionale.sotto, 5689);
atteso("senza vendite P&G", nazionale.senzaPg, 2535);
atteso("potenziale inespresso, M$", nazionale.potenziale / 1e6, 1.9932, 0.001);
atteso("vendite P&G, M$", nazionale.venditePg / 1e6, 9.6664, 0.001);
atteso("fatturato dei negozi, miliardi", nazionale.vendite / 1e9, 13.09, 0.01);
atteso("crescita possibile", nazionale.crescita ?? 0, 0.2062, 0.001);

// Gli stati: contati a parte, sono il livello a cui l'archetipo della
// concentrazione ha senso (§3.3 g).
const perStato = new Map<string, number[]>();
for (let i = 0; i < d.conteggio; i++) {
  const codice = d.testi.stato.codici[i];
  const nome = codice < 0 ? "?" : d.testi.stato.valori[codice];
  const elenco = perStato.get(nome);
  if (elenco) elenco.push(i);
  else perStato.set(nome, [i]);
}
const stati = [...perStato.entries()]
  .map(([nome, indici]) => ({ nome, s: aggrega(d, indici) }))
  .sort((a, b) => b.s.potenziale - a.s.potenziale);
const primi6 = stati.slice(0, 6).reduce((s, x) => s + x.s.potenziale, 0);
atteso("i primi 6 stati, quota del potenziale", primi6 / nazionale.potenziale, 0.39, 0.005);
atteso("stati distinti", stati.length, 51);

// I due sottoinsiemi che non sono sotto-performance.
let senzaVendite = 0;
for (let i = 0; i < d.conteggio; i++) if (statoNegozio(d, i) === "senzaVendite") senzaVendite++;
atteso("negozi senza vendite", senzaVendite, 1032);

// La precisione delle quote: e' il motivo per cui non usiamo le colonne pronte.
const distinteNegozio = new Set<number>();
const distinteBacino = new Set<number>();
const distinteArrotondate = new Set<number>();
for (let i = 0; i < d.conteggio; i++) {
  if (!Number.isFinite(quotaNegozio(d, i))) continue;
  distinteNegozio.add(quotaNegozio(d, i));
  distinteBacino.add(quotaBacino(d, i));
  distinteArrotondate.add(Number((quotaBacino(d, i) * 100).toFixed(2)));
}
console.log(
  `\n  quote del bacino: ${distinteBacino.size} valori distinti a precisione piena, ` +
    `${distinteArrotondate.size} una volta arrotondate come nella colonna pronta`,
);
console.log(`  quote del negozio: ${distinteNegozio.size} valori distinti`);

// La demografia deve sommare a uno dentro ogni gruppo.
for (const gruppo of ["eta", "reddito", "istruzione", "etnia"] as const) {
  const somma = composizioneMedia(d, gruppo).reduce((s, v) => s + v, 0);
  atteso(`composizione media, ${gruppo}: somma`, somma, 1, 0.002);
}

console.log(`\n  aggregazione nazionale su ${d.conteggio} negozi: ${durata.toFixed(0)} ms`);
console.log(`\n  ${esiti - falliti}/${esiti} verifiche superate\n`);
process.exit(falliti ? 1 : 0);
