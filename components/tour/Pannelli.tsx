"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Barre } from "@/components/viz/Barre";
import { COLORI, SPAZI, TIPI } from "@/components/wall/tokens";
import { mercatore } from "@/lib/data/grid";
import { valuta } from "@/lib/format";
import { nomeGruppo, type CellaTour, type Tappa } from "@/lib/scena/tour";
import type { Numero } from "@/lib/stories/tipi";

/**
 * I pannelli del tour.
 *
 * Una regola sola, presa dal documento dei layout e confermata da T9: **da
 * dodici metri si legge un numero, non un paragrafo**. Il pannello di destra
 * e' quindi fatto per essere letto per primo — tre cifre grandi — e quello di
 * sinistra per chi vuole sapere perche'.
 */

const LARGHEZZA_PANNELLO = 1792 - SPAZI.interno * 2;
/** Quante voci demografiche mostrare: oltre, il pannello esce dalla sua zona. */
const VOCI_PROFILO = 5;
const ROSSO = "#ff5668";
const ACQUA = "#50ebc8";

/* -------------------------------------------------------------- il conteggio */

/**
 * Un numero che sale all'arrivo, e poi sta fermo.
 *
 * Non riscrive il testo a ogni fotogramma per tutta la sosta — quella e' la
 * configurazione che T12 misura come costosa — ma per meno di un secondo, a
 * camera ferma, e poi si ferma. Il formato e' quello del motore delle storie:
 * si anima la prima cifra della stringa e si lasciano com'erano prefisso e
 * suffisso, cosi' «$22.7k» sale come «$22.7k» e non diventa un altro formato.
 */
function Conta({ testo, durata = 900 }: { testo: string; durata?: number }) {
  const parti = /^(.*?)(\d[\d,]*(?:\.\d+)?)(.*)$/.exec(testo);
  const [mostrato, setMostrato] = useState(testo);

  useEffect(() => {
    if (!parti) return;
    const [, prima, cifra, dopo] = parti;
    const obiettivo = Number(cifra.replace(/,/g, ""));
    const decimali = cifra.includes(".") ? cifra.split(".")[1].length : 0;
    const formato = new Intl.NumberFormat("en-US", {
      minimumFractionDigits: decimali,
      maximumFractionDigits: decimali,
      useGrouping: cifra.includes(","),
    });
    let raf = 0;
    const inizio = performance.now();
    const passo = (ora: number) => {
      const t = Math.min(1, (ora - inizio) / durata);
      const e = 1 - (1 - t) ** 3;
      setMostrato(`${prima}${formato.format(obiettivo * e)}${dopo}`);
      if (t < 1) raf = requestAnimationFrame(passo);
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
    // La stringa e' la chiave: le parti derivano da lei.
  }, [testo, durata]); // eslint-disable-line react-hooks/exhaustive-deps

  return <>{mostrato}</>;
}

/* --------------------------------------------------------------- la scatola */

/**
 * L'altezza dei pannelli laterali.
 *
 * Partono a 180 pixel dall'alto e finiscono a 910: settanta pixel sopra la
 * barra dei capitoli, che comincia a 984. Un filo piu' della zona della
 * cornice (680), che con i numeri grandi a 150 pixel non basta a contenere
 * numeri, classifica e legenda senza schiacciare il margine interno.
 *
 * E' un'altezza **fissa** per entrambi, non quella del contenuto: con due
 * pannelli alti ciascuno a modo suo, il fondo del sinistro e quello del
 * destro cadevano a cento pixel l'uno dall'altro, e su un muro largo sei
 * metri due rettangoli disallineati si notano prima di quello che c'e' dentro.
 * Il contenuto deve starci: se non ci sta, va accorciato, non allungata la
 * scatola fin sotto la barra.
 */
const ALTEZZA_PANNELLO = 730;

function Scatola({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        height: ALTEZZA_PANNELLO,
        boxSizing: "border-box",
        overflow: "hidden",
        background: COLORI.fondo,
        border: `2px solid ${COLORI.bordo}`,
        borderRadius: 12,
        padding: SPAZI.interno,
      }}
    >
      {children}
    </div>
  );
}

function Occhiello({ children, colore = COLORI.accento }: { children: ReactNode; colore?: string }) {
  return (
    <div
      style={{
        fontSize: TIPI.minimo,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: colore,
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------ il pannello sinistro */

export function PannelloStoria({
  tappa,
  numero,
  totale,
  celle,
}: {
  tappa: Tappa;
  numero: number;
  totale: number;
  celle: CellaTour[];
}) {
  const { storia } = tappa;
  const contorno = storia.numeri.filter((n) => !n.principale);

  return (
    <Scatola>
      <Occhiello>
        {String(numero).padStart(2, "0")} / {String(totale).padStart(2, "0")}
        <span style={{ color: COLORI.bordo, margin: "0 24px" }}>·</span>
        {storia.titolo}
      </Occhiello>
      <div style={{ fontSize: TIPI.titolo, lineHeight: 1.05, marginTop: 20, fontWeight: 600 }}>
        {storia.luogo}
      </div>
      <p
        style={{
          fontSize: TIPI.corrente,
          lineHeight: 1.3,
          color: "rgba(255,255,255,0.78)",
          marginTop: 28,
          maxWidth: LARGHEZZA_PANNELLO,
        }}
      >
        {storia.testo}
      </p>

      <div style={{ display: "flex", gap: 56, marginTop: 36, alignItems: "flex-end" }}>
        <Localizzatore celle={celle} sue={tappa.celle} larghezza={560} altezza={250} />
        <div style={{ flex: 1 }}>
          {contorno.map((n) => (
            <RigaPiccola key={n.etichetta} numero={n} />
          ))}
        </div>
      </div>
    </Scatola>
  );
}

function RigaPiccola({ numero }: { numero: Numero }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: `${SPAZI.riga / 2}px 0`,
        borderTop: `2px solid ${COLORI.bordo}`,
      }}
    >
      <span style={{ fontSize: TIPI.minimo, color: COLORI.smorzato }}>{numero.etichetta}</span>
      <span style={{ fontSize: TIPI.corrente, fontVariantNumeric: "tabular-nums" }}>
        {numero.valore}
      </span>
    </div>
  );
}

/**
 * Dove siamo, nel paese.
 *
 * Una volta scesi su una citta' l'orientamento si perde: il muro mostra
 * quaranta chilometri di periferia, e nessuno in sala sa piu' se e' Texas o
 * Florida. Il paese si disegna con le stesse celle del rilievo, come punti:
 * nessuna geometria dei confini da scaricare, e la forma che si riconosce e'
 * quella dei dati.
 */
function Localizzatore({
  celle,
  sue,
  larghezza,
  altezza,
}: {
  celle: CellaTour[];
  sue: Set<number>;
  larghezza: number;
  altezza: number;
}) {
  const proiettate = celle.map((c) => mercatore(c.centro[0], c.centro[1]));
  // I confini del disegno sul paese continentale: le poche celle dell'Alaska e
  // delle Hawaii schiaccerebbero tutto il resto in un angolo.
  const dentro = proiettate.filter((_, i) => {
    const [lng, lat] = celle[i].centro;
    return lng > -126 && lng < -66 && lat > 24 && lat < 50;
  });
  const xs = dentro.map((p) => p[0]);
  const ys = dentro.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const scala = Math.min(larghezza / (x1 - x0), altezza / (y1 - y0));
  const ox = (larghezza - (x1 - x0) * scala) / 2;
  const oy = (altezza - (y1 - y0) * scala) / 2;

  return (
    <svg width={larghezza} height={altezza} viewBox={`0 0 ${larghezza} ${altezza}`} aria-hidden>
      {proiettate.map(([x, y], i) => {
        const [lng, lat] = celle[i].centro;
        if (!(lng > -126 && lng < -66 && lat > 24 && lat < 50)) return null;
        const sua = sue.has(i);
        return (
          <circle
            key={i}
            cx={ox + (x - x0) * scala}
            cy={altezza - (oy + (y - y0) * scala)}
            r={sua ? 9 : 4.5}
            fill={sua ? COLORI.accento : "#ffffff"}
            opacity={sua ? 1 : 0.22}
          />
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------- il pannello destro */

/**
 * I numeri grandi: prima quelli della storia, poi crescita e potenziale.
 *
 * Il motore mette in testa i numeri di base, uguali per tutte le storie. Sul
 * muro l'ordine si inverte: la cifra che distingue questa storia dalle altre —
 * «4.8x», «+61% di concorrenza» — e' quella che la sala deve leggere per
 * prima.
 */
function principaliDi(numeri: Numero[]): Numero[] {
  const base = new Set(["unrealised potential", "possible growth"]);
  const principali = numeri.filter((n) => n.principale);
  // Il piu' corto per primo: il numero grande deve stare in una riga a 150
  // pixel, e «9 states of 51» ci sta male dove «50%» dice la stessa storia.
  const propri = principali
    .filter((n) => !base.has(n.etichetta))
    .map((n, i) => ({ n, i }))
    .sort((a, b) => a.n.valore.length - b.n.valore.length || a.i - b.i)
    .map(({ n }) => n);
  const comuni = ["possible growth", "unrealised potential"]
    .map((e) => principali.find((n) => n.etichetta === e))
    .filter((n): n is Numero => Boolean(n));
  return [...propri, ...comuni].slice(0, 3);
}

export function PannelloNumeri({ tappa, celle }: { tappa: Tappa; celle: CellaTour[] }) {
  const { storia } = tappa;
  const numeri = principaliDi(storia.numeri);

  return (
    <Scatola>
      <div style={{ display: "flex", gap: 64 }}>
        {numeri.map((n, i) => (
          <div key={n.etichetta} style={{ flex: i === 0 ? 1.25 : 1, minWidth: 0 }}>
            <div
              style={{
                fontSize: i === 0 ? TIPI.eroe : TIPI.titolo,
                lineHeight: 1,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: i === 0 ? COLORI.accento : COLORI.testo,
                whiteSpace: "nowrap",
                height: TIPI.eroe,
                display: "flex",
                alignItems: "flex-end",
              }}
            >
              <Conta testo={n.valore} />
            </div>
            <div style={{ fontSize: TIPI.minimo, color: COLORI.smorzato, marginTop: 10 }}>
              {n.etichetta}
            </div>
          </div>
        ))}
      </div>

      <div style={{ height: 2, background: COLORI.bordo, margin: "26px 0 22px" }} />
      <Approfondimento tappa={tappa} celle={celle} />
    </Scatola>
  );
}

/** La seconda lettura: cosa accende la mappa, e perche' l'area spicca. */
function Approfondimento({ tappa, celle }: { tappa: Tappa; celle: CellaTour[] }) {
  const { storia } = tappa;

  if (!tappa.locale) {
    const stati = [...storia.aree]
      .sort((a, b) => b.sintesi.potenziale - a.sintesi.potenziale)
      .slice(0, 5);
    const massimo = Math.max(...stati.map((s) => s.sintesi.potenziale), 1);
    return (
      <div>
        <Occhiello colore={COLORI.smorzato}>where the potential sits</Occhiello>
        <div style={{ marginTop: 20 }}>
          {stati.map((s) => (
            <div
              key={s.id}
              style={{ display: "flex", alignItems: "center", gap: 32, height: 58 }}
            >
              <span style={{ width: 420, fontSize: TIPI.minimo, color: COLORI.testo }}>
                {s.nome}
              </span>
              <div style={{ flex: 1, height: 26, position: "relative" }}>
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: `${(s.sintesi.potenziale / massimo) * 100}%`,
                    background: COLORI.accento,
                  }}
                />
              </div>
              <span
                style={{
                  width: 220,
                  textAlign: "right",
                  fontSize: TIPI.minimo,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {valuta(s.sintesi.potenziale)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (tappa.profilo) {
    /**
     * Solo le voci in cui l'area si discosta di piu', non tutte.
     *
     * La storia dice che il bacino e' fatto diversamente dal paese: la prova
     * sono le poche voci in cui la differenza c'e', e le altre sono barre
     * uguali alla tacca che occupano spazio senza aggiungere niente. Con tutte
     * e otto le voci dell'etnia il pannello finiva sotto la barra dei capitoli.
     */
    const voci = tappa.profilo.voci
      .map((v, i) => ({ v, i }))
      .sort(
        (a, b) =>
          Math.abs(b.v.valore - b.v.riferimento) - Math.abs(a.v.valore - a.v.riferimento) ||
          a.i - b.i,
      )
      .slice(0, VOCI_PROFILO)
      .map(({ v }) => v);
    return (
      <div>
        <Occhiello colore={COLORI.smorzato}>
          the catchment by {nomeGruppo(tappa.profilo.gruppo)} · largest gaps
        </Occhiello>
        <div style={{ marginTop: 12 }}>
          <Barre voci={voci} larghezza={LARGHEZZA_PANNELLO} scala={0.7} />
        </div>
        <Legenda>bar: this area · tick: national average</Legenda>
      </div>
    );
  }

  const legenda =
    storia.regia.strato === "concorrenti" ? (
      <Legenda>
        <Anello colore={storia.archetipo === "sottoAssedio" ? ROSSO : ACQUA} />
        competitors around each store <Anello colore="rgba(255,255,255,0.5)" /> the national
        median
      </Legenda>
    ) : storia.regia.strato === "modello" ? (
      <Legenda>
        <Anello colore={ROSSO} />
        red: stores the P&G model rates below expectations
      </Legenda>
    ) : null;

  return (
    <div>
      <Classifica celle={celle} sue={tappa.celle} />
      {legenda}
    </div>
  );
}

/**
 * Dove sta l'area fra tutte quelle del paese.
 *
 * Le seicento celle del rilievo in fila, dalla piu' ricca alla piu' povera,
 * con la stessa scala del rilievo sulla mappa. E' la risposta a colpo d'occhio
 * alla domanda che il numero da solo non chiude — «tanto rispetto a cosa?» —
 * e al contrario del profilo regionale funziona anche per un'area isolata,
 * dove attorno non c'e' niente con cui confrontarla.
 */
function Classifica({ celle, sue }: { celle: CellaTour[]; sue: Set<number> }) {
  const ordine = celle
    .map((c, i) => ({ v: c.valore, i }))
    .sort((a, b) => b.v - a.v || a.i - b.i);
  const posizione = ordine.findIndex((o) => sue.has(o.i));
  const larghezza = LARGHEZZA_PANNELLO;
  const altezza = 110;
  const passo = larghezza / ordine.length;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <Occhiello colore={COLORI.smorzato}>among all {ordine.length} areas of the country</Occhiello>
        <span style={{ fontSize: TIPI.corrente, color: COLORI.accento, fontVariantNumeric: "tabular-nums" }}>
          #{posizione + 1}
        </span>
      </div>
      <svg
        width="100%"
        height={altezza}
        viewBox={`0 0 ${larghezza} ${altezza}`}
        preserveAspectRatio="none"
        style={{ marginTop: 12, display: "block" }}
        aria-hidden
      >
        {ordine.map((o, k) => {
          const sua = sue.has(o.i);
          const h = Math.max(2, Math.sqrt(o.v) * (altezza - 4));
          return (
            <rect
              key={o.i}
              x={k * passo}
              y={altezza - h}
              width={sua ? Math.max(8, passo) : Math.max(1, passo * 0.7)}
              height={h}
              fill={sua ? COLORI.accento : "#ffffff"}
              opacity={sua ? 1 : 0.2}
            />
          );
        })}
      </svg>
      <Legenda>unrealised potential, same scale as the relief · richest on the left</Legenda>
    </div>
  );
}

function Legenda({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        fontSize: TIPI.minimo,
        color: COLORI.smorzato,
        marginTop: 12,
      }}
    >
      {children}
    </div>
  );
}

function Anello({ colore }: { colore: string }) {
  return (
    <svg width={44} height={44} viewBox="0 0 44 44" aria-hidden style={{ flex: "none" }}>
      <circle cx={22} cy={22} r={17} fill="none" stroke={colore} strokeWidth={4} />
    </svg>
  );
}

/* ------------------------------------------------------------ la fascia alta */

export function Titolo({ grande, testo }: { grande: string; testo: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 40,
        padding: "0 48px",
        background: COLORI.fondo,
        borderRadius: 12,
        border: `2px solid ${COLORI.bordo}`,
        height: 124,
        marginTop: 16,
      }}
    >
      <span
        style={{
          fontSize: TIPI.titolo,
          fontWeight: 600,
          color: COLORI.accento,
          fontVariantNumeric: "tabular-nums",
          lineHeight: "124px",
        }}
      >
        <Conta testo={grande} durata={1400} />
      </span>
      <span style={{ fontSize: TIPI.corrente, color: COLORI.testo }}>{testo}</span>
    </div>
  );
}

/* ------------------------------------------------------ la barra dei capitoli */

/**
 * I capitoli del giro, sempre in vista.
 *
 * Sostituisce la striscia di contesto di T12 e ne fa lo stesso lavoro — chi
 * entra a meta' sa dove si e' — con in piu' la risposta alla domanda che una
 * sala si fa sempre durante una presentazione: quanto manca. Ogni capitolo si
 * puo' anche toccare, e il giro salta li'.
 *
 * L'avanzamento e' un'animazione CSS di una trasformazione, non una larghezza
 * aggiornata da React: la compone la scheda video senza rifare la
 * disposizione, e si ferma con la pausa senza che nessuno debba ricordarsi
 * dove era arrivata.
 */
export function Capitoli({
  tappe,
  attiva,
  arrivi,
  inSosta,
  inPausa,
  sostaMs,
  onScegli,
}: {
  tappe: Tappa[];
  attiva: number;
  arrivi: number;
  inSosta: boolean;
  inPausa: boolean;
  sostaMs: number;
  onScegli: (i: number) => void;
}) {
  return (
    <div
      style={{
        height: "100%",
        display: "flex",
        background: COLORI.fondo,
        borderTop: `2px solid ${COLORI.bordo}`,
        pointerEvents: "auto",
      }}
    >
      <style>{`@keyframes t13-avanza { from { transform: scaleX(0) } to { transform: scaleX(1) } }`}</style>
      {tappe.map((t, i) => {
        const corrente = i === attiva;
        const fatto = attiva >= 0 && i < attiva;
        return (
          <button
            key={t.storia.id}
            type="button"
            onClick={() => onScegli(i)}
            style={{
              flex: 1,
              position: "relative",
              display: "flex",
              alignItems: "center",
              gap: 24,
              padding: "0 36px",
              borderLeft: i ? `2px solid ${COLORI.bordo}` : "none",
              background: corrente ? "rgba(255, 179, 92, 0.08)" : "transparent",
              color: corrente ? COLORI.testo : COLORI.smorzato,
              fontSize: TIPI.minimo,
              textAlign: "left",
              cursor: "pointer",
              transition: "background 500ms, color 500ms",
              overflow: "hidden",
              whiteSpace: "nowrap",
            }}
          >
            <span
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: 0,
                height: 6,
                background: COLORI.accento,
                transformOrigin: "left center",
                opacity: corrente ? 1 : fatto ? 0.35 : 0,
                transform: fatto ? "scaleX(1)" : "scaleX(0)",
                animation:
                  corrente && inSosta ? `t13-avanza ${sostaMs}ms linear forwards` : undefined,
                animationPlayState: inPausa ? "paused" : "running",
              }}
              key={corrente ? `in-${arrivi}` : "fermo"}
            />
            <span
              style={{
                color: corrente ? COLORI.accento : COLORI.smorzato,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
              {t.locale ? t.storia.luogo : "The whole country"}
            </span>
          </button>
        );
      })}
    </div>
  );
}
