"use client";

import { useCallback, useEffect, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { AloneGlobo } from "@/components/tour/AloneGlobo";
import { EtichetteNegozi } from "@/components/tour/EtichetteNegozi";
import { Capitoli, PannelloNumeri, PannelloStoria, Titolo } from "@/components/tour/Pannelli";
import { Cornice } from "@/components/wall/Cornice";
import { caricaDataset } from "@/lib/data/schema";
import { conta, percentuale, valuta } from "@/lib/format";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { START_ZOOM } from "@/lib/scena/sequenza";
import { costruisciTour, type DatiTour } from "@/lib/scena/tour";
import { NOMI_MOMENTO, SOSTA_MS, useTour } from "@/lib/scena/useTour";
import { calcolaStorie } from "@/lib/stories";

/**
 * T13 — il tour delle storie.
 *
 * La stessa apertura di T12 — il globo, la discesa, il paese — e poi, invece
 * della stretta su una stella della rete, **un giro delle storie che il motore
 * ha trovato**: ciascuna con la propria inquadratura, i propri negozi e il
 * proprio strato. E' la prima pagina in cui T11 e la scena si parlano: la
 * regia che T11 si limitava a mostrare, qui la esegue la camera.
 *
 * Non e' un film ma una presentazione. Si guida con la tastiera o con un
 * telecomando da presentatore, che manda gli stessi tasti:
 *
 *   → / PagGiu'    storia successiva      ← / PagSu'   precedente
 *   spazio         pausa                  1–8          salta a una storia
 *   0              torna al paese         R            ricomincia dal globo
 *   H              diagnostica
 *
 * Per le prove: `?tappa=N` parte dalla storia N, `?storie=1,3,5` ne tiene solo
 * alcune.
 *
 * Lasciato andare, il giro si ripete da solo: finita l'ultima storia torna al
 * paese e ricomincia, cosi' fra una presentazione e l'altra il muro non resta
 * fermo su un'immagine.
 */

const WIDTH = 5760;
const HEIGHT = 1080;
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

type Caricato = { dati: DatiTour };

/**
 * `?storie=1,3,5` tiene solo alcune tappe, nell'ordine del giro.
 *
 * Otto storie da dodici secondi sono due minuti e mezzo: vanno bene lasciate
 * girare da sole, sono troppe per una presentazione in cui ogni tappa va
 * anche commentata. Chi presenta sceglie le sue, e il giro — capitoli, numeri,
 * chiusura — si ricompone attorno a quelle.
 */
function scegli(dati: DatiTour): DatiTour {
  const voce = new URLSearchParams(window.location.search).get("storie");
  if (!voce) return dati;
  const scelte = new Set(voce.split(",").map((v) => Number(v.trim()) - 1));
  const tappe = dati.tappe.filter((_, i) => scelte.has(i));
  if (!tappe.length) return dati;
  return {
    ...dati,
    tappe,
    potenzialeRaccontato: tappe
      .filter((t) => t.locale)
      .reduce((somma, t) => somma + t.storia.sintesi.potenziale, 0),
  };
}

export default function T13Page() {
  const [caricato, setCaricato] = useState<Caricato | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [map, setMap] = useState<MapHandle | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();

  useEffect(() => {
    let vivo = true;
    caricaDataset()
      .then(({ dataset, glossario }) => {
        if (!vivo) return;
        const { storie, contesto } = calcolaStorie(dataset);
        setCaricato({ dati: scegli(costruisciTour(dataset, storie, contesto, glossario)) });
      })
      .catch((e: unknown) => {
        if (vivo) setErrore(e instanceof Error ? e.message : "dataset non caricato");
      });
    return () => {
      vivo = false;
    };
  }, []);

  const handleReady = useCallback((m: MapHandle) => {
    m.jumpTo({ center: [-96, 38], zoom: START_ZOOM, pitch: 0, bearing: 0 });
    setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
    setMap(m);
    // Quando MapSurface la ricrea, la vecchia non deve restare nello stato:
    // il giro ripartirebbe su una mappa gia' distrutta.
    m.once("remove", () => setMap((attuale) => (attuale === m ? null : attuale)));
  }, []);

  if (errore) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/70">
        <p className="text-red-400">Dataset unavailable — {errore}</p>
        <p className="mt-4">
          Prepare it with <code className="text-white">pnpm build:dataset</code>.
        </p>
      </main>
    );
  }

  if (!caricato) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/50">
        loading the dataset and computing the stories…
      </main>
    );
  }

  return <Tour caricato={caricato} map={map} labelId={labelId} onReady={handleReady} />;
}

function Tour({
  caricato,
  map,
  labelId,
  onReady,
}: {
  caricato: Caricato;
  map: MapHandle | null;
  labelId: string | undefined;
  onReady: (m: MapHandle) => void;
}) {
  const { dati } = caricato;
  const { tappe, celle, nazionale } = dati;
  const tour = useTour({ map, labelId, dati });
  const { stats } = useFrameMeter();
  // La pagina arriva qui solo nel browser, a dati caricati: leggere l'indirizzo
  // nello stato iniziale non puo' divergere da un disegno lato server.
  const [hud, setHud] = useState(
    () => new URLSearchParams(window.location.search).get("hud") === "1",
  );

  const { avanti, indietro, vai, paese, riparti, setInPausa } = tour;
  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight" || e.key === "PageDown") avanti();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") indietro();
      else if (e.key === " ") {
        e.preventDefault();
        setInPausa((v) => !v);
      } else if (e.key === "0" || e.key === "Home") paese();
      else if (/^[1-9]$/.test(e.key) && Number(e.key) <= tappe.length) vai(Number(e.key) - 1);
      else if (e.key === "r" || e.key === "R") riparti();
      else if (e.key === "h" || e.key === "H") setHud((v) => !v);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [avanti, indietro, vai, paese, riparti, setInPausa, tappe.length]);

  const { momento, attiva, mostrata, arrivi, inPausa } = tour;
  const inTappa = momento === "tappa" && mostrata >= 0;
  const sulPaese = momento === "paese" || momento === "ritorno";
  const giroIniziato = momento === "paese" || momento === "volo" || momento === "tappa" || momento === "ritorno";
  const tappaMostrata = mostrata >= 0 ? tappe[mostrata] : null;

  const titolo =
    tour.paeseDi === "ritorno"
      ? {
          grande: valuta(dati.potenzialeRaccontato),
          testo: `unrealised in the ${tappe.filter((t) => t.locale).length} places we just visited — out of ${valuta(nazionale.potenziale)} across the country`,
        }
      : {
          grande: percentuale(nazionale.crescita ?? 0, { segno: true }),
          testo: `possible growth on current P&G sales · ${valuta(nazionale.potenziale)} unrealised across ${conta(nazionale.sotto)} stores below their catchment`,
        };

  return (
    <main className="h-screen w-screen overflow-hidden bg-black">
      <Stage width={WIDTH} height={HEIGHT}>
        <div className="relative" style={{ width: WIDTH, height: HEIGHT }}>
          <MapSurface
            width={WIDTH}
            height={HEIGHT}
            styleUrl={STYLE}
            projection="globe"
            onReady={onReady}
          />
          <AloneGlobo leggi={tour.bordoGlobo} larghezza={WIDTH} altezza={HEIGHT} />
          <EtichetteNegozi leggi={tour.etichette} />

          {/*
            Il sipario copre il precaricamento: la camera salta da una tappa
            all'altra per caricare le tessere, e mostrarlo vorrebbe dire aprire
            la presentazione con otto scatti di mappa.
          */}
          <div
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center bg-black"
            style={{ opacity: tour.sipario ? 1 : 0, transition: "opacity 1200ms ease-out" }}
          >
            <div style={{ fontSize: 36, letterSpacing: "0.3em", color: "#ffb35c" }}>
              MAPPING TOOL 2026
            </div>
            <div style={{ fontSize: 96, fontWeight: 600, color: "#fff", marginTop: 24 }}>
              {tappe.length} stories from {conta(nazionale.negozi)} stores
            </div>
            <div style={{ fontSize: 36, color: "rgba(255,255,255,0.45)", marginTop: 32 }}>
              preparing the tour…
            </div>
          </div>

          <Cornice
            larghezza={WIDTH}
            altezza={HEIGHT}
            visibili={{
              alta: sulPaese,
              sinistra: inTappa,
              destra: inTappa,
              striscia: giroIniziato,
            }}
            zone={{
              alta: <Titolo key={tour.paeseDi} grande={titolo.grande} testo={titolo.testo} />,
              sinistra: tappaMostrata ? (
                <PannelloStoria
                  tappa={tappaMostrata}
                  numero={mostrata + 1}
                  totale={tappe.length}
                  celle={celle}
                />
              ) : null,
              destra: tappaMostrata ? (
                <PannelloNumeri
                  key={`${mostrata}-${arrivi}`}
                  tappa={tappaMostrata}
                  celle={celle}
                />
              ) : null,
              striscia: (
                <Capitoli
                  tappe={tappe}
                  attiva={attiva}
                  arrivi={arrivi}
                  inSosta={momento === "tappa"}
                  inPausa={inPausa}
                  sostaMs={SOSTA_MS}
                  onScegli={vai}
                />
              ),
            }}
          />

          {inPausa ? (
            <div
              className="pointer-events-none absolute"
              style={{
                left: WIDTH / 2 - 120,
                top: 40,
                width: 240,
                textAlign: "center",
                fontSize: 36,
                letterSpacing: "0.2em",
                color: "rgba(255,255,255,0.6)",
              }}
            >
              PAUSED
            </div>
          ) : null}
        </div>
      </Stage>

      {hud ? (
        <Hud>
          <div className="flex items-start gap-3">
            <HudPanel title="T13 — the story tour">
              <Row label="moment" value={NOMI_MOMENTO[momento]} tone="good" />
              <Row label="story" value={attiva >= 0 ? `${attiva + 1} of ${tappe.length}` : "—"} />
              <Row
                label="frames, median"
                value={`${stats.median.toFixed(1)}/s`}
                tone={stats.median ? fpsTone(stats.median) : "normal"}
              />
              <Row
                label="lowest (window)"
                value={`${stats.min.toFixed(1)}/s`}
                tone={stats.min ? fpsTone(stats.min) : "normal"}
              />
              <Row
                label="preload"
                value={tour.prefetchMs === null ? "—" : `${(tour.prefetchMs / 1000).toFixed(1)} s`}
              />
            </HudPanel>
          </div>
          <HudPanel>
            <div className="text-white/60">
              <b className="text-white">→ ←</b> next / previous · <b className="text-white">space</b>{" "}
              pause · <b className="text-white">1–{tappe.length}</b> jump ·{" "}
              <b className="text-white">0</b> country · <b className="text-white">R</b> restart ·{" "}
              <b className="text-white">H</b> hide
            </div>
          </HudPanel>
        </Hud>
      ) : null}
    </main>
  );
}
