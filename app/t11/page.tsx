"use client";

import { useEffect, useMemo, useState } from "react";
import { Scheda } from "@/components/storie/Scheda";
import { caricaDataset } from "@/lib/data/schema";
import { conta, percentuale, valuta } from "@/lib/format";
import { calcolaStorie, ETICHETTE, type Contesto, type Storia } from "@/lib/stories";
import { profiloDi } from "@/lib/viz/profilo";

/**
 * T11 — la dashboard delle storie.
 *
 * Non e' una superficie del prodotto: le storie del prodotto vivono sul tablet
 * e sul muro. Questa pagina e' lo **strumento per leggere il risultato del
 * motore** — serve a rispondere a due domande che nessuna verifica automatica
 * puo' risolvere: le frasi si capiscono, e la lista e' varia o e' otto volte la
 * stessa cosa.
 *
 * Per questo mostra anche quello che una vista di prodotto nasconderebbe:
 * quante candidate ha prodotto ogni criterio, quanto e' costato il calcolo, e
 * la regia che ogni storia consegnerebbe alla scena.
 */

type Esito = {
  storie: Storia[];
  candidate: number;
  perArchetipo: Record<string, number>;
  contesto: Contesto;
  durataMs: number;
};

export default function T11Page() {
  const [esito, setEsito] = useState<Esito | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [sceltaManuale, setSceltaManuale] = useState<string | null>(null);

  // Caricamento e calcolo avvengono insieme, una volta sola all'avvio. Il
  // calcolo starebbe anche in una derivazione — e' una funzione pura del
  // dataset — ma misurarne la durata non lo e', e quanto costa e' proprio una
  // delle cose che questa pagina deve dire.
  useEffect(() => {
    let vivo = true;
    caricaDataset()
      .then(({ dataset }) => {
        if (!vivo) return;
        const inizio = performance.now();
        const risultato = calcolaStorie(dataset);
        setEsito({ ...risultato, durataMs: performance.now() - inizio });
      })
      .catch((e: unknown) => {
        if (vivo) setErrore(e instanceof Error ? e.message : "dataset non caricato");
      });
    return () => {
      vivo = false;
    };
  }, []);

  const profili = useMemo(() => {
    if (!esito) return new Map<string, ReturnType<typeof profiloDi>>();
    return new Map(
      esito.storie.map((s) => [s.id, profiloDi(s, esito.contesto.unita)] as const),
    );
  }, [esito]);

  // Finche' nessuno ha scelto, si mostra la prima: una dashboard che si apre
  // vuota costringe a un tocco per vedere qualcosa.
  const scelta = sceltaManuale ?? esito?.storie[0]?.id ?? null;
  const corrente = esito?.storie.find((s) => s.id === scelta) ?? null;

  if (errore) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/70">
        <p className="text-red-400">Dataset unavailable — {errore}</p>
        <p className="mt-4">
          The client data does not live in this repository. Prepare it with{" "}
          <code className="text-white">pnpm build:dataset</code>, which reads it from the 2025 tool
          repository sitting alongside this one.
        </p>
      </main>
    );
  }

  if (!esito) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/50">
        loading the dataset and computing the stories…
      </main>
    );
  }

  const n = esito.contesto.nazionale;

  return (
    <main className="min-h-screen bg-black pb-16 text-white">
      <header className="border-b border-white/10 px-6 py-8 sm:px-10">
        <h1 className="text-sm uppercase tracking-[0.2em] text-white/40">
          T11 — the stories drawn from the data
        </h1>
        <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4 font-mono text-sm">
          <Totale etichetta="stores" valore={conta(n.negozi)} />
          <Totale etichetta="with sales" valore={conta(n.misurabili)} />
          <Totale etichetta="below the reference" valore={conta(n.sotto)} />
          <Totale etichetta="unrealised potential" valore={valuta(n.potenziale)} />
          <Totale
            etichetta="possible growth"
            valore={n.crescita === null ? "—" : percentuale(n.crescita, { segno: true })}
            forte
          />
          <Totale etichetta="relief cells" valore={conta(esito.contesto.unita.length)} />
          <Totale etichetta="computed in" valore={`${esito.durataMs.toFixed(0)} ms`} />
        </dl>
      </header>

      <section
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 py-8 sm:px-10"
        aria-label="stories"
      >
        {esito.storie.map((s) => (
          <Scheda
            key={s.id}
            storia={s}
            barre={profili.get(s.id) ?? []}
            scelta={s.id === scelta}
            onScegli={() => setSceltaManuale(s.id)}
          />
        ))}
      </section>

      {corrente ? <Dettaglio storia={corrente} /> : null}

      <section className="mt-12 px-6 sm:px-10">
        <h2 className="text-xs uppercase tracking-[0.18em] text-white/35">
          Candidates per criterion
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-white/45">
          How many areas each criterion flagged, before the filters. A criterion that finds
          nothing and one that finds hundreds of cases are two ways of saying nothing.
        </p>
        <table className="mt-5 font-mono text-xs">
          <tbody>
            {Object.entries(esito.perArchetipo).map(([id, quante]) => {
              const scelte = esito.storie.filter((s) => s.archetipo === id).length;
              return (
                <tr key={id} className={scelte ? "" : "text-white/35"}>
                  <td className="py-1 pr-8">{ETICHETTE[id as keyof typeof ETICHETTE]}</td>
                  <td className="py-1 pr-6 text-right tabular-nums">{quante}</td>
                  <td className="py-1 text-white/40">
                    {scelte ? `${scelte} in the list` : "none in the list"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Totale({
  etichetta,
  valore,
  forte = false,
}: {
  etichetta: string;
  valore: string;
  forte?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-white/35">{etichetta}</dt>
      <dd className={`mt-1 tabular-nums ${forte ? "text-lg text-amber-300" : "text-white"}`}>
        {valore}
      </dd>
    </div>
  );
}

/**
 * Il dettaglio della storia scelta, compresa la regia.
 *
 * La regia si mostra perche' e' il contratto con la scena: e' quello che il
 * tablet manderebbe al muro. Vederla qui, prima che esista un muro da
 * comandare, e' il modo di accorgersi adesso se una storia atterrerebbe nel
 * posto sbagliato o da un'altezza sbagliata.
 */
function Dettaglio({ storia }: { storia: Storia }) {
  return (
    <section className="border-y border-white/10 bg-white/[0.02] px-6 py-8 sm:px-10">
      <div className="flex flex-wrap gap-x-16 gap-y-8">
        <div className="max-w-md">
          <div className="text-[11px] uppercase tracking-[0.18em] text-amber-300/80">
            {storia.titolo}
          </div>
          <h2 className="mt-1 text-2xl">{storia.luogo}</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">{storia.testo}</p>
        </div>

        <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 font-mono text-xs">
          {storia.numeri.map((n) => (
            <div key={n.etichetta} className="contents">
              <dt className="py-0.5 text-white/40">{n.etichetta}</dt>
              <dd
                className={`py-0.5 text-right tabular-nums ${n.principale ? "text-amber-300" : "text-white"}`}
              >
                {n.valore}
              </dd>
            </div>
          ))}
        </dl>

        <dl className="grid grid-cols-[auto_auto] gap-x-8 gap-y-1 self-start font-mono text-xs">
          <dt className="col-span-2 pb-2 text-[11px] uppercase tracking-wider text-white/35">
            what the scene receives
          </dt>
          <dt className="py-0.5 text-white/40">centre</dt>
          <dd className="py-0.5 text-right tabular-nums">
            {storia.regia.centro[0].toFixed(3)}, {storia.regia.centro[1].toFixed(3)}
          </dd>
          <dt className="py-0.5 text-white/40">zoom</dt>
          <dd className="py-0.5 text-right tabular-nums">{storia.regia.zoom}</dd>
          <dt className="py-0.5 text-white/40">layer</dt>
          <dd className="py-0.5 text-right">{storia.regia.strato ?? "none"}</dd>
          <dt className="py-0.5 text-white/40">score</dt>
          <dd className="py-0.5 text-right tabular-nums">{storia.punteggio.toFixed(3)}</dd>
        </dl>
      </div>
    </section>
  );
}
