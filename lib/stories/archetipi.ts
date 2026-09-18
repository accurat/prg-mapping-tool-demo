/**
 * I sette criteri (§3.3).
 *
 * Ognuno guarda i dati da una parte diversa, ed e' il punto: sette regole che
 * misurano la stessa cosa produrrebbero sette volte la stessa storia con nomi
 * diversi. Ogni criterio dichiara **quanto** il caso e' estremo, su una scala
 * 0..1 confrontabile fra archetipi; quanto vale in denaro lo decide il
 * punteggio, non il criterio.
 *
 * Nessuno di questi criteri afferma un nesso di causa (§3.8). «Potenziale alto
 * e pochi concorrenti» e' una coincidenza osservata, non una spiegazione.
 */

import { quadrante, variazioneAnnua } from "../data/metrics.ts";
import { conta, valuta, percentuale } from "../format.ts";
import {
  distanzaDemografica,
  percentile,
  quotaDi,
  type Contesto,
} from "./contesto.ts";
import type { ArchetipoId, Candidata, Numero, Unita } from "./tipi.ts";

const limita = (v: number) => Math.max(0, Math.min(1, v));

/** Le aree su cui ha senso cercare una storia. */
function ammissibili(ctx: Contesto): Unita[] {
  return ctx.unita.filter((u) => !u.sottoSoglia && u.sintesi.misurabili > 0);
}

/** I numeri che accompagnano sempre una storia d'area. */
function numeriDiBase(u: Unita): Numero[] {
  return [
    { etichetta: "unrealised potential", valore: valuta(u.sintesi.potenziale), principale: true },
    {
      etichetta: "possible growth",
      valore: u.sintesi.crescita === null ? "—" : percentuale(u.sintesi.crescita, { segno: true }),
      principale: true,
    },
    { etichetta: "stores", valore: conta(u.sintesi.negozi) },
    { etichetta: "below the reference", valore: `${u.sintesi.sotto} of ${u.sintesi.misurabili}` },
  ];
}

/* ------------------------------------------------- a) e b) i concorrenti */

/**
 * Campo libero e sotto assedio sono lo stesso confronto letto ai due estremi.
 *
 * Restano due archetipi separati perche' rispondono a due domande commerciali
 * diverse — prendere uno spazio vuoto non e' conquistarlo contro qualcuno — ma
 * il calcolo e' uno, e scriverlo due volte vorrebbe dire poterlo correggere una
 * volta sola.
 */
function perConcorrenti(ctx: Contesto, verso: "pochi" | "molti"): Candidata[] {
  const aree = ammissibili(ctx);
  const soglia = percentile(
    aree.map((u) => u.sintesi.potenziale),
    ctx.config.soglie.potenzialeAlto,
  );
  const limite =
    verso === "pochi" ? ctx.config.soglie.concorrentiPochi : ctx.config.soglie.concorrentiMolti;

  const fuori: Candidata[] = [];
  for (const u of aree) {
    if (u.sintesi.potenziale < soglia || u.sintesi.potenziale <= 0) continue;
    if (u.sintesi.concorrenti === null || ctx.concorrentiMediana <= 0) continue;

    const rapporto = u.sintesi.concorrenti / ctx.concorrentiMediana;
    if (verso === "pochi" ? rapporto > limite : rapporto < limite) continue;

    const scarto = rapporto - 1;
    fuori.push({
      archetipo: verso === "pochi" ? "campoLibero" : "sottoAssedio",
      aree: [u],
      anomalia: limita(Math.abs(scarto - (limite - 1)) / Math.abs(limite - 1) / 2 + 0.25),
      numeri: [
        ...numeriDiBase(u),
        {
          etichetta: "competitors vs median",
          valore: percentuale(scarto, { segno: true }),
          principale: true,
        },
      ],
      frase: { concorrenti: percentuale(scarto, { segno: true }) },
    });
  }
  return fuori;
}

/* ---------------------------------------------------- c) l'anno perduto  */

function annoPerduto(ctx: Contesto): Candidata[] {
  const { caloMarcato, caloDiffuso } = ctx.config.soglie;
  const tipica = ctx.variazioneTipica;
  const fuori: Candidata[] = [];

  for (const u of ammissibili(ctx)) {
    let misurati = 0;
    let peggio = 0;
    let somma = 0;
    for (let k = 0; k < u.indici.length; k++) {
      const v = variazioneAnnua(ctx.d, u.indici[k]);
      if (v === null) continue;
      misurati++;
      somma += v;
      // «In calo» va inteso rispetto al paese: dove arretrano tutti, arretrare
      // non distingue nessuno.
      if (v < tipica) peggio++;
    }
    if (misurati < ctx.config.minimoNegozi) continue;

    const media = somma / misurati;
    const scarto = media - tipica;
    const diffusione = peggio / misurati;
    // Il vincolo di diffusione e' quello che distingue una storia da un caso:
    // senza, un solo negozio che crolla trascina la media dell'area e produce
    // una storia su qualcosa che e' successo a un indirizzo.
    if (scarto > caloMarcato || diffusione < caloDiffuso) continue;

    fuori.push({
      archetipo: "annoPerduto",
      aree: [u],
      anomalia: limita((caloMarcato - scarto) / 0.25) * 0.7 + limita(diffusione) * 0.3,
      numeri: [
        {
          etichetta: "vs last year",
          valore: percentuale(media, { segno: true, decimali: 1 }),
          principale: true,
        },
        {
          etichetta: "vs the country",
          valore: percentuale(scarto, { segno: true, decimali: 1 }),
          principale: true,
        },
        {
          etichetta: "stores below the country",
          valore: `${peggio} of ${misurati}`,
          principale: true,
        },
        ...numeriDiBase(u),
      ],
      frase: {
        calo: percentuale(media, { segno: true, decimali: 1 }),
        scarto: percentuale(scarto, { segno: true, decimali: 1 }),
        diffusione: `${peggio} of ${misurati}`,
      },
    });
  }
  return fuori;
}

/* --------------------------------------------- d) anomalie del modello   */

function anomalieModello(ctx: Contesto): Candidata[] {
  const fuori: Candidata[] = [];
  const soglia = ctx.config.soglie.modelloConcentrato;

  for (const u of ammissibili(ctx)) {
    const conteggi = { Overachieving: 0, Underachieving: 0 };
    for (let k = 0; k < u.indici.length; k++) {
      const q = quadrante(ctx.d, u.indici[k]);
      if (q === "Overachieving" || q === "Underachieving") conteggi[q]++;
    }

    for (const tipo of ["Overachieving", "Underachieving"] as const) {
      const quanti = conteggi[tipo];
      if (quanti < ctx.config.minimoNegozi) continue;
      const quota = quanti / u.indici.length;
      const attesa = ctx.quoteQuadranti[tipo];
      if (attesa <= 0 || quota < attesa * soglia) continue;

      fuori.push({
        archetipo: "anomalieModello",
        aree: [u],
        anomalia: limita((quota / attesa - soglia) / soglia / 2 + 0.3),
        numeri: [
          {
            etichetta: tipo === "Overachieving" ? "above the model" : "below the model",
            valore: `${quanti} of ${u.indici.length}`,
            principale: true,
          },
          {
            etichetta: "share vs national",
            valore: `${(quota / attesa).toFixed(1)}x`,
            principale: true,
          },
          ...numeriDiBase(u),
        ],
        frase: {
          verso: tipo === "Overachieving" ? "above" : "below",
          quanti: `${quanti} of ${u.indici.length}`,
          volte: `${(quota / attesa).toFixed(1)}x`,
        },
      });
    }
  }
  return fuori;
}

/* ------------------------------------------- e) il pubblico che non torna */

function pubblicoCheNonTorna(ctx: Contesto): Candidata[] {
  const soglia = ctx.config.soglie.demografiaAnomala;
  const fuori: Candidata[] = [];

  for (const u of ammissibili(ctx)) {
    const distanza = distanzaDemografica(ctx.profilo(u), ctx.profiloNazionale);
    if (distanza < soglia) continue;

    // La seconda meta' del criterio: un bacino particolare non e' una storia se
    // li' si vende bene. La storia e' «il pubblico e' diverso **e** non lo
    // stiamo servendo».
    const quota = quotaDi(u.sintesi);
    if (quota >= ctx.quotaNazionale) continue;

    const mancanza = 1 - quota / ctx.quotaNazionale;
    fuori.push({
      archetipo: "pubblicoCheNonTorna",
      aree: [u],
      anomalia: limita((distanza - soglia) / soglia) * 0.5 + limita(mancanza) * 0.5,
      numeri: [
        {
          etichetta: "catchment vs national profile",
          valore: percentuale(distanza, { decimali: 1 }),
          principale: true,
        },
        {
          etichetta: "share vs national",
          valore: percentuale(-mancanza, { segno: true }),
          principale: true,
        },
        ...numeriDiBase(u),
      ],
      frase: {
        distanza: percentuale(distanza, { decimali: 1 }),
        quota: percentuale(-mancanza, { segno: true }),
      },
    });
  }
  return fuori;
}

/* -------------------------------------------- f) i gemelli divergenti    */

/**
 * Due aree con lo stesso pubblico e risultati opposti.
 *
 * E' l'archetipo piu' persuasivo in sala perche' toglie in partenza
 * l'obiezione «si', ma li' e' diverso»: se i due bacini sono fatti allo stesso
 * modo, la differenza non e' il mercato.
 *
 * Il confronto e' fra tutte le coppie, che su qualche centinaio di aree sono
 * qualche decina di migliaia: si puo' fare per intero, e conviene, perche'
 * qualsiasi scorciatoia rischierebbe di perdere proprio la coppia migliore.
 */
function gemelliDivergenti(ctx: Contesto): Candidata[] {
  const { demografiaGemella, divergenzaGemelli } = ctx.config.soglie;
  const aree = ammissibili(ctx).filter((u) => quotaDi(u.sintesi) > 0);
  const fuori: Candidata[] = [];

  for (let a = 0; a < aree.length; a++) {
    for (let b = a + 1; b < aree.length; b++) {
      const distanza = distanzaDemografica(ctx.profilo(aree[a]), ctx.profilo(aree[b]));
      if (distanza > demografiaGemella) continue;

      const qa = quotaDi(aree[a].sintesi);
      const qb = quotaDi(aree[b].sintesi);
      const alto = Math.max(qa, qb);
      const basso = Math.min(qa, qb);
      const divergenza = (alto - basso) / alto;
      if (divergenza < divergenzaGemelli) continue;

      const forte = qa >= qb ? aree[a] : aree[b];
      const debole = qa >= qb ? aree[b] : aree[a];
      fuori.push({
        archetipo: "gemelliDivergenti",
        aree: [debole, forte],
        anomalia: limita(divergenza) * 0.6 + limita(1 - distanza / demografiaGemella) * 0.4,
        numeri: [
          { etichetta: "share gap", valore: percentuale(divergenza), principale: true },
          {
            etichetta: "audience gap",
            valore: percentuale(distanza, { decimali: 1 }),
            principale: true,
          },
          { etichetta: debole.nome, valore: valuta(debole.sintesi.potenziale) },
          { etichetta: forte.nome, valore: valuta(forte.sintesi.potenziale) },
        ],
        frase: {
          debole: debole.nome,
          forte: forte.nome,
          divergenza: percentuale(divergenza),
        },
      });
    }
  }
  return fuori;
}

/* ------------------------------------------------- g) la concentrazione  */

/**
 * Le poche aree che valgono la meta' del problema.
 *
 * **Dipende dal livello di aggregazione**, e per questo si calcola sul livello
 * piu' grossolano — gli stati — e la frase lo nomina. Sulle celle del rilievo
 * la concentrazione non esiste: servono un centinaio di celle per arrivare a
 * meta' del potenziale, e dire «le prime sei valgono il 5%» non e' una storia,
 * e' una smentita.
 */
function concentrazione(ctx: Contesto): Candidata[] {
  const aree = ctx.grossolane
    .filter((u) => u.sintesi.potenziale > 0)
    .sort((a, b) =>
      b.sintesi.potenziale - a.sintesi.potenziale || (a.id < b.id ? -1 : 1),
    );
  if (aree.length < 4) return [];

  const totale = aree.reduce((s, u) => s + u.sintesi.potenziale, 0);
  let cumulato = 0;
  let quante = 0;
  for (const u of aree) {
    cumulato += u.sintesi.potenziale;
    quante++;
    if (cumulato >= totale / 2) break;
  }

  const quotaAree = quante / aree.length;
  // Se serve piu' di un quarto delle aree per arrivare a meta' del totale, il
  // potenziale e' diffuso e la storia va taciuta invece che raccontata debole.
  if (quotaAree > 0.25) return [];

  const scelte = aree.slice(0, quante);
  return [
    {
      archetipo: "concentrazione",
      aree: scelte,
      anomalia: limita(1 - quotaAree / 0.5),
      numeri: [
        { etichetta: "areas", valore: `${quante} states of ${aree.length}`, principale: true },
        {
          etichetta: "share of the potential",
          valore: percentuale(cumulato / totale),
          principale: true,
        },
        { etichetta: "value", valore: valuta(cumulato) },
        { etichetta: "stores", valore: conta(scelte.reduce((s, u) => s + u.sintesi.negozi, 0)) },
      ],
      frase: {
        quante: `${quante} states`,
        quota: percentuale(cumulato / totale),
        valore: valuta(cumulato),
      },
    },
  ];
}

/* ------------------------------------------------------------------------ */

export const ARCHETIPI: Record<ArchetipoId, (ctx: Contesto) => Candidata[]> = {
  campoLibero: (ctx) => perConcorrenti(ctx, "pochi"),
  sottoAssedio: (ctx) => perConcorrenti(ctx, "molti"),
  annoPerduto,
  anomalieModello,
  pubblicoCheNonTorna,
  gemelliDivergenti,
  concentrazione,
};
