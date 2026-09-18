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

import { aggregaInCelle, aggregaPerCampo, scalaAltezze } from "../lib/data/aggregate.ts";
import { mercatore, raggioPerArea, rettangoloDi } from "../lib/data/grid.ts";
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

// Gli stati: e' il livello a cui l'archetipo della concentrazione ha senso
// (§3.3 g), e serve anche a verificare che il raggruppamento per campo di testo
// non perda ne' duplichi negozi.
const stati = aggregaPerCampo(d, tutti, "stato").sort(
  (a, b) => b.sintesi.potenziale - a.sintesi.potenziale,
);
const primi6 = stati.slice(0, 6).reduce((s, x) => s + x.sintesi.potenziale, 0);
atteso("stati distinti", stati.length, 51);
atteso("i primi 6 stati, quota del potenziale", primi6 / nazionale.potenziale, 0.39, 0.005);
atteso(
  "negozi ritrovati negli stati",
  stati.reduce((s, x) => s + x.sintesi.negozi, 0),
  10466,
);
atteso(
  "potenziale ritrovato negli stati, M$",
  stati.reduce((s, x) => s + x.sintesi.potenziale, 0) / 1e6,
  1.9932,
  0.001,
);

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

/*
 * Le celle del rilievo.
 *
 * Il raggruppamento geometrico deve conservare gli stessi totali di quello per
 * campo di testo: se un negozio cade fuori da ogni cella o dentro a due, il
 * rilievo mostra un paese che non somma al proprio totale, ed e' il genere di
 * errore che non si vede guardando lo schermo.
 */
console.log("");
const riquadro = rettangoloDi({ lng: d.lng, lat: d.lat, indici: tutti });
const inizioCelle = performance.now();
const raggioNazionale = raggioPerArea(riquadro.area);
const celle = aggregaInCelle(d, tutti, raggioNazionale);
const durataCelle = performance.now() - inizioCelle;

atteso(
  "negozi ritrovati nelle celle",
  celle.reduce((s, c) => s + c.sintesi.negozi, 0),
  10466,
);
atteso(
  "potenziale ritrovato nelle celle, M$",
  celle.reduce((s, c) => s + c.sintesi.potenziale, 0) / 1e6,
  1.9932,
  0.001,
);

/*
 * Il tetto di T9: oltre le tremila celle l'occhio smette di distinguerle.
 *
 * Si conta quello che si vede, cioe' le celle dentro l'inquadratura, non quelle
 * che esistono nel paese: a zoom alto la maglia e' fitta ovunque ma il muro ne
 * mostra una porzione.
 */
console.log(`  ${"".padEnd(4)} ${"zoom".padStart(5)} ${"raggio".padStart(8)} ${"in vista".padStart(9)}`);
for (const zoom of [2, 3.2, 5, 7, 9, 11]) {
  const metriPerPixel = (2 * Math.PI * 6378137) / (256 * Math.pow(2, zoom));
  const semiX = Math.min(2 * Math.PI * 6378137, 5760 * metriPerPixel) / 2;
  const semiY = (1080 * metriPerPixel) / 2;
  // Inquadratura centrata sul baricentro dei dati, intersecata con il
  // rettangolo che li contiene: e' l'area che il rilievo deve riempire.
  const cx = (riquadro.x0 + riquadro.x1) / 2;
  const cy = (riquadro.y0 + riquadro.y1) / 2;
  const x0 = Math.max(riquadro.x0, cx - semiX);
  const x1 = Math.min(riquadro.x1, cx + semiX);
  const y0 = Math.max(riquadro.y0, cy - semiY);
  const y1 = Math.min(riquadro.y1, cy + semiY);
  const raggio = raggioPerArea((x1 - x0) * (y1 - y0));

  const dentro: number[] = [];
  for (let i = 0; i < d.conteggio; i++) {
    const [x, y] = mercatore(d.lng[i], d.lat[i]);
    if (x >= x0 && x <= x1 && y >= y0 && y <= y1) dentro.push(i);
  }
  const n = aggregaInCelle(d, dentro, raggio).length;
  const km = (raggio / 1000) * Math.cos((39 * Math.PI) / 180);
  console.log(
    `  ${n <= 3000 ? "ok  " : "NO  "} ${String(zoom).padStart(5)} ${(km.toFixed(0) + " km").padStart(8)} ${String(n).padStart(9)}`,
  );
  esiti++;
  if (n > 3000) falliti++;
}

// Sotto la soglia di cinque negozi la cella non si alza (§2.5).
const sottoSoglia = celle.filter((c) => c.sottoSoglia).length;
console.log(
  `\n  rilievo nazionale: ${celle.length} celle da ${((raggioNazionale / 1000) * Math.cos((39 * Math.PI) / 180)).toFixed(0)} km,` +
    ` di cui ${sottoSoglia} sotto i 5 negozi (${((sottoSoglia / celle.length) * 100).toFixed(0)}%) restano piatte`,
);

/*
 * Il taglio al 99esimo percentile.
 *
 * Ha senso solo con abbastanza celle: su settantasei, l'uno per cento e' meno
 * di una cella e non si taglia niente — che e' il comportamento giusto, non un
 * difetto. Si verifica quindi sul rilievo fitto.
 */
const fitte = aggregaInCelle(d, tutti, raggioPerArea(riquadro.area, 20000));
const scala = scalaAltezze(fitte.map((c) => c.sintesi.potenziale));
const tagliate = fitte.filter((c) => scala.oltreIlTetto(c.sintesi.potenziale)).length;
atteso("celle oltre il tetto, quota", tagliate / fitte.length, 0.01, 0.004);
console.log(
  `  su ${fitte.length} celle fitte la piu' alta vale ` +
    `${(Math.max(...fitte.map((c) => c.sintesi.potenziale)) / scala.tetto).toFixed(1)}x il tetto`,
);

console.log(`\n  aggregazione nazionale su ${d.conteggio} negozi: ${durata.toFixed(0)} ms`);
console.log(`  rilievo nazionale, ${celle.length} celle: ${durataCelle.toFixed(0)} ms`);
console.log(`\n  ${esiti - falliti}/${esiti} verifiche superate\n`);
process.exit(falliti ? 1 : 0);
