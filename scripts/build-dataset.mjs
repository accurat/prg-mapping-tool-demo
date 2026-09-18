/**
 * Riduzione del dataset del cliente a quello che serve alla demo.
 *
 * I file originali stanno nel repository del tool 2025 e pesano 7,6 MB, di cui
 * la demo userebbe meno di un decimo: 140 colonne per negozio, la gran parte
 * mai interrogate ne' dal rilievo ne' dalle storie. Scaricarle tutte nel
 * browser significherebbe pagare un secondo di rete per niente.
 *
 * Quindi: si tengono le colonne che il concept nomina davvero, si codificano
 * le stringhe che si ripetono (tremila citta' su diecimila righe), e si
 * scrivono tre file in `public/data/`.
 *
 * Lo script **non calcola nessun indicatore**. Il potenziale inespresso, le
 * quote e gli scarti dalla media stanno in `lib/data/metrics.ts`, perche' sono
 * configurabili (concept §2.2: quattro riferimenti possibili) e una definizione
 * cotta dentro al file di dati non si puo' cambiare da configurazione. Qui si
 * trasportano colonne, non si decide cosa significano.
 *
 * I dati del cliente **non entrano in questo repository**: l'uscita e' ignorata
 * da git e si rigenera da `predev`. Il repository resta codice.
 *
 * Sorgente: variabile d'ambiente PRG_DATASET_DIR, altrimenti il repository
 * affiancato.
 */

import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE =
  process.env.PRG_DATASET_DIR ?? resolve(ROOT, "..", "prg-mapping-tool", "public", "data");
const OUT = join(ROOT, "public", "data");

const FILE_STORES = "dataset_og.tsv.txt";
const FILE_ROUTES = "dataset_network.tsv.txt";
const FILE_GLOSSARY = "dataset_glossary.tsv.txt";

/* ------------------------------------------------------------------ colonne */

/**
 * Colonne numeriche trasportate cosi' come sono, con il nome che avranno.
 *
 * **Le quote non si trasportano, si ricalcolano.** Il dataset ha due colonne
 * pronte — `store_numer_sales_usd_share_pct` e la controparte del bacino — ma
 * sono arrotondate a due decimali, e su questi valori l'arrotondamento non e'
 * un dettaglio: la quota del bacino ha ventidue valori distinti su diecimila
 * negozi, quella del negozio cinquantatre, e la differenza fra le due — che e'
 * il potenziale inespresso — vale tipicamente uno o due scalini. L'errore di
 * arrotondamento sarebbe quindi grande quanto la grandezza misurata.
 *
 * Gli importi da cui quelle quote derivano sono invece presenti al completo e
 * senza arrotondamenti. Si trasportano quelli, e la quota si calcola in
 * `lib/data/metrics.ts`: stessa definizione, precisione piena.
 */
const NUMERI = {
  lat: "lat",
  lng: "long",
  venditeNegozio: "store_sales_usd_amt",
  venditeNegozioYa: "store_sales_usd_amt_ya",
  venditePgNegozio: "store_numer_sales_usd_amt",
  venditePgNegozioYa: "store_numer_sales_usd_amt_ya",
  venditeBacino: "trade_area_sales_usd_amt",
  venditeBacinoYa: "trade_area_sales_usd_amt_ya",
  venditePgBacino: "trade_area_numer_sales_usd_amt",
  venditePgBacinoYa: "trade_area_numer_sales_usd_amt_ya",
  // La definizione alternativa del potenziale, per produttivita' (§2.2 b).
  resaNegozio: "store_prdctvty_ratio",
  resaBacino: "trade_area_prdctvty_ratio",
  concorrenti: "comp_ttl_store",
  famiglie: "ttl_hhd",
  stelle: "star_rating",
};

/** Colonne di testo, codificate a dizionario: si ripetono moltissimo. */
const TESTI = {
  citta: "city",
  contea: "county_name",
  mercato: "dma_name",
  stato: "state_name",
  insegna: "owner_name",
  quadrante: "modeled_vs_actual_quadrant",
};

/** Le tredici insegne concorrenti, per "campo libero" e "sotto assedio". */
const CONCORRENTI = [
  "comp_albertsons", "comp_costco", "comp_cvs", "comp_dollar_general",
  "comp_family_dollar", "comp_kroger", "comp_meijer", "comp_publix",
  "comp_safeway", "comp_sams", "comp_target", "comp_walgreens", "comp_walmart",
];

/**
 * La demografia, in quattro gruppi.
 *
 * Non si trasportano i conteggi ma la **composizione dentro il proprio
 * gruppo**, in millesimi interi: un bacino di quarantamila persone e uno di
 * quattromila vanno confrontati per come sono fatti, non per quanto sono
 * grandi, e ogni archetipo demografico del concept ragiona su scarti di
 * composizione dalla media nazionale. Il conteggio assoluto resta disponibile
 * come `famiglie`.
 */
const DEMOGRAFIA = {
  eta: ["age_0_4", "age_gen_alpha", "age_gen_z", "age_millenials", "age_gen_x", "age_boomers", "age_70_plus"],
  reddito: ["inc_less15", "inc_15_35", "inc_35_50", "inc_50_100", "inc_100_150", "inc_150_200", "inc_200pl"],
  istruzione: ["edu_less_hs", "edu_hs_dip", "edu_some_col_no_deg", "edu_assoc_deg", "edu_bach_deg", "edu_grad_deg"],
  etnia: ["ethn_2pl", "ethn_aa", "ethn_asian", "ethn_hisp", "ethn_native", "ethn_other", "ethn_pi", "ethn_white"],
};

/* ------------------------------------------------------------------ lettura */

/**
 * Legge un TSV come righe gia' divise.
 *
 * Nessuna gestione delle virgolette: nei tre file non ce ne sono, e i campi di
 * testo contengono virgole ma mai tabulazioni.
 */
function leggiTsv(percorso) {
  const testo = readFileSync(percorso, "utf8");
  const righe = testo.split("\n");
  const intestazione = righe[0].replace(/\r$/, "").split("\t");
  const indice = new Map(intestazione.map((nome, i) => [nome, i]));
  const dati = [];
  for (let i = 1; i < righe.length; i++) {
    const riga = righe[i];
    if (!riga || riga === "\r") continue;
    dati.push(riga.replace(/\r$/, "").split("\t"));
  }
  return { intestazione, indice, dati };
}

/**
 * Converte una cella in numero.
 *
 * Due insidie vere del file: il letterale `null` al posto della cella vuota, e
 * la notazione esponenziale (`5.77E+07`) su tutte le colonne di fatturato del
 * bacino. `Number` regge la seconda; la prima diventerebbe `NaN` e va
 * intercettata, altrimenti si propaga in silenzio fino a un rilievo con dei
 * buchi che sembrano un difetto di resa.
 */
function numero(cella) {
  if (cella === undefined || cella === "" || cella === "null" || cella === "NA") return null;
  const v = Number(cella);
  return Number.isFinite(v) ? v : null;
}

const arrotonda = (v, cifre) =>
  v === null ? null : Number(v.toFixed(cifre));

/* ---------------------------------------------------------------- dizionari */

function dizionario() {
  const valori = [];
  const indice = new Map();
  return {
    valori,
    /** Ritorna l'indice del valore, aggiungendolo se nuovo. */
    codifica(v) {
      if (v === undefined || v === "" || v === "null") return -1;
      const trovato = indice.get(v);
      if (trovato !== undefined) return trovato;
      indice.set(v, valori.length);
      valori.push(v);
      return valori.length - 1;
    },
  };
}

/* ------------------------------------------------------------------ negozi  */

function costruisciNegozi(diagnosi) {
  const { indice, dati } = leggiTsv(join(SOURCE, FILE_STORES));

  const colonne = {};
  for (const nome of Object.keys(NUMERI)) colonne[nome] = [];
  const dizionari = {};
  const codici = {};
  for (const nome of Object.keys(TESTI)) {
    dizionari[nome] = dizionario();
    codici[nome] = [];
  }
  const concorrenti = CONCORRENTI.map(() => []);
  const demografia = {};
  for (const [gruppo, campi] of Object.entries(DEMOGRAFIA)) {
    demografia[gruppo] = campi.map(() => []);
  }

  // Quante celle mancanti per colonna: e' il controllo che il concept chiede
  // di dichiarare invece di lasciare degradare in silenzio.
  const mancanti = {};
  const conta = (nome, valore) => {
    if (valore === null) mancanti[nome] = (mancanti[nome] ?? 0) + 1;
  };

  for (const riga of dati) {
    for (const [nome, sorgente] of Object.entries(NUMERI)) {
      const v = numero(riga[indice.get(sorgente)]);
      conta(nome, v);
      // Le coordinate a cinque decimali valgono circa un metro; oltre e'
      // rumore che costa byte. Le vendite P&G vanno tenute ai centesimi perche'
      // sono importi di poche centinaia di dollari, dove il centesimo pesa; le
      // vendite totali, che stanno nei milioni, si arrotondano all'unita'.
      colonne[nome].push(
        nome === "lat" || nome === "lng"
          ? arrotonda(v, 5)
          : nome.startsWith("venditePg") || nome.startsWith("resa")
            ? arrotonda(v, 2)
            : v === null
              ? null
              : Math.round(v),
      );
    }

    for (const [nome, sorgente] of Object.entries(TESTI)) {
      codici[nome].push(dizionari[nome].codifica(riga[indice.get(sorgente)]));
    }

    CONCORRENTI.forEach((sorgente, i) => {
      concorrenti[i].push(numero(riga[indice.get(sorgente)]) ?? 0);
    });

    for (const [gruppo, campi] of Object.entries(DEMOGRAFIA)) {
      const valori = campi.map((c) => numero(riga[indice.get(c)]) ?? 0);
      const totale = valori.reduce((s, v) => s + v, 0);
      campi.forEach((_, i) => {
        // Millesimi interi: due cifre in piu' di quante ne servano a
        // distinguere due bacini, e un quarto dei byte di un decimale.
        demografia[gruppo][i].push(totale > 0 ? Math.round((valori[i] / totale) * 1000) : 0);
      });
    }
  }

  // Le due colonne che il concept dava per inservibili: si verificano qui, a
  // ogni costruzione, invece di fidarsi di una verifica fatta una volta.
  const sopIdx = indice.get("size_of_prize");
  const sgIdx = indice.get("share_gap");
  diagnosi.sizeOfPrizeVuote = dati.filter((r) => numero(r[sopIdx]) === null).length;
  diagnosi.shareGapNonZero = dati.filter((r) => (numero(r[sgIdx]) ?? 0) !== 0).length;
  diagnosi.righe = dati.length;
  diagnosi.mancanti = mancanti;
  // Un negozio senza vendite non ha una quota, quindi non ha un potenziale:
  // va escluso dal calcolo invece di entrarci come zero. Sono il dieci per
  // cento del dataset, quindi non e' un caso limite.
  diagnosi.senzaVendite = colonne.venditeNegozio.filter((v) => !v).length;

  return {
    versione: 1,
    conteggio: dati.length,
    colonne,
    testi: Object.fromEntries(
      Object.keys(TESTI).map((nome) => [nome, { valori: dizionari[nome].valori, codici: codici[nome] }]),
    ),
    concorrenti: { insegne: CONCORRENTI, valori: concorrenti },
    demografia: {
      gruppi: Object.fromEntries(
        Object.entries(DEMOGRAFIA).map(([g, campi]) => [g, { campi, valori: demografia[g] }]),
      ),
      unita: "millesimi",
    },
  };
}

/* ------------------------------------------------------------------- rotte  */

/**
 * Le rotte, agganciate ai negozi per coordinate.
 *
 * Il file delle rotte non porta identificativi: l'aggancio avviene confrontando
 * le coordinate come stringhe, ed e' esatto, non tollerante (concept §7.4). La
 * precisione nei file varia da una a otto cifre decimali, quindi un confronto
 * per prossimita' non e' un ripiego praticabile: a una cifra il margine e' di
 * una decina di chilometri.
 *
 * Per questo si **dichiara quante rotte si sono agganciate**. Se un domani uno
 * dei due file passa per un foglio di calcolo che riformatta i numeri,
 * l'aggancio non peggiora poco per volta: smette del tutto, e senza questo
 * numero apparirebbe come una rete stranamente vuota.
 */
function costruisciRotte(negozi, diagnosi) {
  const { indice, dati } = leggiTsv(join(SOURCE, FILE_ROUTES));

  const perCoordinate = new Map();
  const { lat, lng } = negozi.colonne;
  for (let i = 0; i < negozi.conteggio; i++) {
    const chiave = `${lat[i]},${lng[i]}`;
    // Cinquantadue negozi condividono le coordinate con un altro (§7.4): si
    // tiene il primo, e lo si dichiara.
    if (!perCoordinate.has(chiave)) perCoordinate.set(chiave, i);
  }

  const origine = [];
  const destinazione = [];
  const casse = [];
  const pezzi = [];
  const valore = [];
  let agganciate = 0;

  for (const riga of dati) {
    const da = perCoordinate.get(
      `${arrotonda(numero(riga[indice.get("lat")]), 5)},${arrotonda(numero(riga[indice.get("long")]), 5)}`,
    );
    const a = perCoordinate.get(
      `${arrotonda(numero(riga[indice.get("Conlat")]), 5)},${arrotonda(numero(riga[indice.get("Conlong")]), 5)}`,
    );
    if (da === undefined || a === undefined) continue;
    agganciate++;
    origine.push(da);
    destinazione.push(a);
    casse.push(numero(riga[indice.get("Cases")]) ?? 0);
    pezzi.push(numero(riga[indice.get("Units")]) ?? 0);
    valore.push(Math.round(numero(riga[indice.get("Dollars")]) ?? 0));
  }

  diagnosi.rotteTotali = dati.length;
  diagnosi.rotteAgganciate = agganciate;
  diagnosi.coordinateCondivise = negozi.conteggio - perCoordinate.size;
  diagnosi.destinazioni = new Set(destinazione).size;
  diagnosi.negoziToccati = new Set([...origine, ...destinazione]).size;

  return {
    versione: 1,
    conteggio: agganciate,
    totaleNelFile: dati.length,
    origine,
    destinazione,
    casse,
    pezzi,
    valore,
  };
}

/* --------------------------------------------------------------- glossario  */

/** Le etichette leggibili, per le sole colonne trasportate. */
function costruisciGlossario() {
  const { indice, dati } = leggiTsv(join(SOURCE, FILE_GLOSSARY));
  const tenute = new Set([
    ...Object.values(NUMERI),
    ...Object.values(TESTI),
    ...CONCORRENTI,
    ...Object.values(DEMOGRAFIA).flat(),
  ]);

  const etichette = {};
  for (const riga of dati) {
    const colonna = riga[indice.get("column")];
    if (!tenute.has(colonna)) continue;
    etichette[colonna] = {
      etichetta: riga[indice.get("label")] || colonna,
      categoria: riga[indice.get("category")] || null,
      gruppo: riga[indice.get("group")] || null,
      formato: riga[indice.get("format")] || null,
    };
  }

  const senzaEtichetta = [...tenute].filter((c) => !etichette[c]);
  return { versione: 1, etichette, senzaEtichetta };
}

/* ------------------------------------------------------------------ uscita  */

function scrivi(nome, contenuto) {
  const testo = JSON.stringify(contenuto);
  const percorso = join(OUT, nome);
  writeFileSync(percorso, testo);
  return {
    nome,
    byte: Buffer.byteLength(testo),
    byteCompresso: gzipSync(testo).length,
    impronta: createHash("sha256").update(testo).digest("hex").slice(0, 12),
  };
}

const kb = (b) => `${(b / 1024).toFixed(0)} kB`;

function main() {
  if (!existsSync(join(SOURCE, FILE_STORES))) {
    const gia = existsSync(join(OUT, "stores.json"));
    const messaggio = [
      `Dataset non trovato in ${SOURCE}`,
      "",
      "I dati del cliente non stanno in questo repository. Indica dove sono:",
      "  PRG_DATASET_DIR=/percorso/a/prg-mapping-tool/public/data pnpm build:dataset",
      "",
      "oppure affianca il repository prg-mapping-tool a questo.",
    ].join("\n");
    if (gia) {
      console.warn(`${messaggio}\n\nI file preparati esistono gia': si prosegue con quelli.`);
      return;
    }
    console.error(messaggio);
    process.exit(1);
  }

  mkdirSync(OUT, { recursive: true });
  const inizio = Date.now();
  const diagnosi = {};

  const negozi = costruisciNegozi(diagnosi);
  const rotte = costruisciRotte(negozi, diagnosi);
  const glossario = costruisciGlossario();

  const scritti = [
    scrivi("stores.json", negozi),
    scrivi("routes.json", rotte),
    scrivi("glossary.json", glossario),
  ];

  const origine = statSync(join(SOURCE, FILE_STORES)).size;
  const totale = scritti.reduce((s, f) => s + f.byte, 0);
  const totaleCompresso = scritti.reduce((s, f) => s + f.byteCompresso, 0);

  console.log(`\nDataset preparato in ${Date.now() - inizio} ms\n`);
  console.log(`  sorgente          ${kb(origine)}`);
  for (const f of scritti) {
    console.log(`  ${f.nome.padEnd(16)}  ${kb(f.byte).padStart(7)}  ${kb(f.byteCompresso).padStart(7)} compresso  ${f.impronta}`);
  }
  console.log(`  ${"totale".padEnd(16)}  ${kb(totale).padStart(7)}  ${kb(totaleCompresso).padStart(7)} compresso`);
  console.log(`  riduzione         ${(100 - (totale / origine) * 100).toFixed(0)}%\n`);

  console.log(`  negozi                        ${diagnosi.righe}`);
  console.log(`  size_of_prize vuote           ${diagnosi.sizeOfPrizeVuote} su ${diagnosi.righe}`);
  console.log(`  share_gap diverse da zero     ${diagnosi.shareGapNonZero} su ${diagnosi.righe}`);
  console.log(`  negozi senza vendite          ${diagnosi.senzaVendite} su ${diagnosi.righe}`);
  console.log(`  coordinate condivise          ${diagnosi.coordinateCondivise} negozi`);
  console.log(`  rotte agganciate              ${diagnosi.rotteAgganciate} su ${diagnosi.rotteTotali}`);
  console.log(`  destinazioni della rete       ${diagnosi.destinazioni}`);
  console.log(`  negozi toccati dalla rete     ${diagnosi.negoziToccati}`);

  const buchi = Object.entries(diagnosi.mancanti).filter(([, n]) => n > 0);
  if (buchi.length) {
    console.log("\n  colonne con celle mancanti:");
    for (const [nome, n] of buchi.sort((a, b) => b[1] - a[1])) {
      console.log(`    ${nome.padEnd(20)} ${n} su ${diagnosi.righe}`);
    }
  }
  if (glossario.senzaEtichetta.length) {
    console.log(`\n  colonne senza etichetta nel glossario: ${glossario.senzaEtichetta.join(", ")}`);
  }
  console.log("");
}

main();
