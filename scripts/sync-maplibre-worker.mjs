/**
 * Copia il worker di MapLibre (e il modulo condiviso che importa) in public/.
 *
 * Serve perche' MapLibre costruisce il proprio worker da un blob che risolve il
 * percorso del modulo tramite import.meta.url: con il bundler di sviluppo di
 * Next quel percorso non viene servito come JavaScript e il worker non parte,
 * quindi la mappa non carica nulla. Servendo il file da public/ e indicandolo
 * con setWorkerUrl il problema sparisce.
 *
 * Gira prima di dev e di build, cosi' i file restano allineati alla versione
 * installata invece di diventare una copia dimenticata.
 */
import { copyFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const dist = dirname(require.resolve("maplibre-gl/dist/maplibre-gl.mjs"));
const out = join(process.cwd(), "public", "maplibre");

const FILES = ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"];

await mkdir(out, { recursive: true });
for (const file of FILES) {
  await copyFile(join(dist, file), join(out, file));
}
console.log(`maplibre: copiati ${FILES.length} file in public/maplibre`);
