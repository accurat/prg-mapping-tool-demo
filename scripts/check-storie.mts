/**
 * Verifica del motore delle storie.
 *
 * Tre domande, nell'ordine in cui contano: sono deterministiche, quanto
 * costano, e la lista che ne esce e' varia o e' otto volte la stessa cosa.
 *
 *   pnpm run check:storie
 */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { daGrezzo, type DatasetGrezzo } from "../lib/data/schema.ts";
import { calcolaStorie, type Storia } from "../lib/stories/index.ts";

const d = daGrezzo(JSON.parse(readFileSync("public/data/stores.json", "utf8")) as DatasetGrezzo);

let esiti = 0;
let falliti = 0;
function verifica(nome: string, passa: boolean, dettaglio = "") {
  esiti++;
  if (!passa) falliti++;
  console.log(`  ${passa ? "ok  " : "NO  "} ${nome.padEnd(46)} ${dettaglio}`);
}

/** L'impronta di una lista: identifica ordine, punteggi e regia insieme. */
const impronta = (storie: Storia[]) =>
  createHash("sha256")
    .update(
      JSON.stringify(
        storie.map((s) => [s.id, s.punteggio.toFixed(9), s.testo, s.regia.zoom, s.regia.centro]),
      ),
    )
    .digest("hex")
    .slice(0, 12);

console.log("\nVerifica del motore delle storie\n");

const t0 = performance.now();
const primo = calcolaStorie(d);
const durata = performance.now() - t0;
const secondo = calcolaStorie(d);

verifica("determinismo, due esecuzioni", impronta(primo.storie) === impronta(secondo.storie), impronta(primo.storie));
verifica("calcolo sotto i 200 ms", durata < 200, `${durata.toFixed(0)} ms`);
verifica("otto storie", primo.storie.length === 8, `${primo.storie.length}`);

const archetipiUsati = new Set(primo.storie.map((s) => s.archetipo));
verifica("almeno quattro archetipi diversi", archetipiUsati.size >= 4, `${archetipiUsati.size}`);

const maxPerArchetipo = Math.max(
  ...[...archetipiUsati].map((a) => primo.storie.filter((s) => s.archetipo === a).length),
);
verifica("mai piu' di due storie per archetipo", maxPerArchetipo <= 2, `${maxPerArchetipo}`);

const sottoSoglia = primo.storie.filter((s) => s.aree.some((u) => u.sottoSoglia));
verifica("nessuna storia sotto i 5 negozi", sottoSoglia.length === 0, `${sottoSoglia.length}`);

console.log("\n  candidate per archetipo:");
for (const [id, n] of Object.entries(primo.perArchetipo)) {
  console.log(`    ${id.padEnd(24)} ${String(n).padStart(6)}`);
}
console.log(`    ${"totale".padEnd(24)} ${String(primo.candidate).padStart(6)}  scelte ${primo.storie.length}`);

console.log("\n  la lista:\n");
primo.storie.forEach((s, i) => {
  console.log(`  ${i + 1}. ${s.titolo.toUpperCase()} — ${s.luogo}`);
  console.log(`     ${s.testo}`);
  console.log(
    `     ${s.numeri
      .filter((n) => n.principale)
      .map((n) => `${n.etichetta} ${n.valore}`)
      .join("  ·  ")}`,
  );
  console.log(
    `     punteggio ${s.punteggio.toFixed(3)}  ·  camera ${s.regia.centro[0].toFixed(2)},${s.regia.centro[1].toFixed(2)} zoom ${s.regia.zoom}  ·  strato ${s.regia.strato ?? "nessuno"}\n`,
  );
});

console.log(`  ${esiti - falliti}/${esiti} verifiche superate\n`);
process.exit(falliti ? 1 : 0);
