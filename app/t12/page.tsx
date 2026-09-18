"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { Barre, type Voce } from "@/components/viz/Barre";
import { Cornice, Pannello, Riga, Striscia } from "@/components/wall/Cornice";
import { COLORI, TIPI } from "@/components/wall/tokens";
import { aggrega, composizioneDi, composizioneMedia } from "@/lib/data/metrics";
import { caricaDataset, type Dataset, type Glossario, type Rotte } from "@/lib/data/schema";
import { conta, percentuale, valuta } from "@/lib/format";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import { costruisciScena, type DatiScena } from "@/lib/scena/dati";
import { NOMI_FASE, START_ZOOM, useSequenza, type Fase } from "@/lib/scena/sequenza";
import { nomeDominante } from "@/lib/stories/contesto";

/**
 * T12 — i pannelli sul muro.
 *
 * Stessa sequenza di T10, stessi identici disegni: l'unica differenza sono le
 * zone del documento dei layout sovrapposte alla scena, e i dati veri sotto.
 * Serve a rispondere a una domanda che nessuna misura precedente ha toccato,
 * perche' finora tutto quello che abbiamo misurato stava dentro WebGL:
 * **comporre testo e grafici sopra il canvas costa fotogrammi, e quanto?**
 *
 * Tre interruttori, uno per ciascun sospetto, cosi' la risposta non e' un solo
 * numero ma la quota di ciascuna causa:
 *
 *   P  i pannelli
 *   B  la sfocatura di fondo
 *   N  i numeri che si incrementano a ogni fotogramma
 */

const WIDTH = 5760;
const HEIGHT = 1080;
const STYLE = "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";
const DATA = "18.09.2026";

/** Quando ciascuna zona e' accesa, secondo il documento dei layout. */
const VISIBILITA: Record<Fase, { alta: boolean; sinistra: boolean; destra: boolean; striscia: boolean }> = {
  attesa: { alta: false, sinistra: false, destra: false, striscia: false },
  // M2: titolo e data solo in apertura, la striscia compare a discesa finita.
  preparazione: { alta: true, sinistra: false, destra: false, striscia: false },
  discesa: { alta: true, sinistra: false, destra: false, striscia: false },
  colonne: { alta: false, sinistra: false, destra: false, striscia: true },
  lettura: { alta: false, sinistra: false, destra: false, striscia: true },
  appiattimento: { alta: false, sinistra: false, destra: false, striscia: true },
  archi: { alta: false, sinistra: false, destra: false, striscia: true },
  // M4: il pannello del soggetto entra insieme alla stretta sull'area.
  fuoco: { alta: false, sinistra: true, destra: false, striscia: true },
  // M9: il grafico di approfondimento compare accanto, non al posto della scena.
  flusso: { alta: false, sinistra: true, destra: true, striscia: true },
};

type Caricato = { dataset: Dataset; rotte: Rotte; glossario: Glossario; scena: DatiScena };

export default function T12Page() {
  const [caricato, setCaricato] = useState<Caricato | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [map, setMap] = useState<MapHandle | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();

  const [pannelli, setPannelli] = useState(true);
  const [sfocatura, setSfocatura] = useState(false);
  const [numeriVivi, setNumeriVivi] = useState(false);

  const { stats } = useFrameMeter();
  const trust = useRenderTrust(stats.medianMs);

  useEffect(() => {
    let vivo = true;
    caricaDataset()
      .then(({ dataset, rotte, glossario }) => {
        if (!vivo) return;
        setCaricato({ dataset, rotte, glossario, scena: costruisciScena(dataset, rotte) });
      })
      .catch((e: unknown) => {
        if (vivo) setErrore(e instanceof Error ? e.message : "dataset non caricato");
      });
    return () => {
      vivo = false;
    };
  }, []);

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (e.key === "p" || e.key === "P") setPannelli((v) => !v);
      if (e.key === "b" || e.key === "B") setSfocatura((v) => !v);
      if (e.key === "n" || e.key === "N") setNumeriVivi((v) => !v);
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, []);

  const handleReady = useCallback(
    (m: MapHandle) => {
      if (!caricato) return;
      m.jumpTo({ center: caricato.scena.centro, zoom: START_ZOOM, pitch: 0, bearing: 0 });
      setLabelId(m.getStyle().layers.find((l) => l.type === "symbol")?.id);
      setMap(m);
    },
    [caricato],
  );

  if (errore) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/70">
        <p className="text-red-400">Dataset non disponibile — {errore}</p>
        <p className="mt-4">
          Si prepara con <code className="text-white">pnpm build:dataset</code>.
        </p>
      </main>
    );
  }

  if (!caricato) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-24 font-mono text-sm text-white/50">
        caricamento del dataset…
      </main>
    );
  }

  return (
    <Scena
      caricato={caricato}
      map={map}
      labelId={labelId}
      onReady={handleReady}
      pannelli={pannelli}
      sfocatura={sfocatura}
      numeriVivi={numeriVivi}
      stats={stats}
      trust={trust}
    />
  );
}

/**
 * La scena vera e propria, montata solo a dati pronti.
 *
 * La sequenza si avvia da sola alla comparsa della mappa, e la mappa non deve
 * comparire prima dei dati: altrimenti il precaricamento partirebbe verso un
 * centro che non conosciamo ancora.
 */
function Scena({
  caricato,
  map,
  labelId,
  onReady,
  pannelli,
  sfocatura,
  numeriVivi,
  stats,
  trust,
}: {
  caricato: Caricato;
  map: MapHandle | null;
  labelId: string | undefined;
  onReady: (m: MapHandle) => void;
  pannelli: boolean;
  sfocatura: boolean;
  numeriVivi: boolean;
  stats: ReturnType<typeof useFrameMeter>["stats"];
  trust: ReturnType<typeof useRenderTrust>;
}) {
  const { dataset, glossario, scena } = caricato;
  const { fase, prefetchMs } = useSequenza({ map, labelId, dati: scena });

  const indiciFuoco = scena.indiciPerHub[scena.fuoco];
  const sintesi = useMemo(() => aggrega(dataset, indiciFuoco), [dataset, indiciFuoco]);
  const nazionale = useMemo(
    () => aggrega(dataset, Int32Array.from({ length: dataset.conteggio }, (_, i) => i)),
    [dataset],
  );
  const luogo = useMemo(() => nomeDominante(dataset, indiciFuoco), [dataset, indiciFuoco]);

  const voci = useMemo<Voce[]>(() => {
    const media = composizioneMedia(dataset, "eta");
    const locale = composizioneDi(dataset, "eta", indiciFuoco);
    return dataset.demografia.eta.campi.map((campo, i) => ({
      etichetta: glossario.etichette[campo]?.etichetta ?? campo,
      valore: locale[i],
      riferimento: media[i],
    }));
  }, [dataset, glossario, indiciFuoco]);

  const visibili = VISIBILITA[fase];
  const spente = { alta: false, sinistra: false, destra: false, striscia: false };

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
          <Cornice
            larghezza={WIDTH}
            altezza={HEIGHT}
            visibili={pannelli ? visibili : spente}
            zone={{
              alta: (
                <div style={{ fontSize: TIPI.titolo, letterSpacing: "0.12em" }}>
                  P&amp;G MAPPING TOOL <span style={{ color: COLORI.smorzato }}>·</span> {DATA}
                </div>
              ),
              sinistra: (
                <Pannello titolo="rete di rifornimento">
                  <div style={{ fontSize: TIPI.titolo, lineHeight: 1.05 }}>{luogo}</div>
                  <div style={{ height: 24 }} />
                  <Riga
                    etichetta="crescita possibile"
                    valore={
                      numeriVivi ? (
                        <Vivo base={sintesi.crescita ?? 0} />
                      ) : (
                        percentuale(sintesi.crescita ?? 0, { segno: true })
                      )
                    }
                    grande
                  />
                  <Riga etichetta="potenziale inespresso" valore={valuta(sintesi.potenziale)} />
                  <Riga etichetta="negozi riforniti" valore={conta(sintesi.negozi)} />
                  <Riga
                    etichetta="sotto il riferimento"
                    valore={`${sintesi.sotto} su ${sintesi.misurabili}`}
                  />
                </Pannello>
              ),
              destra: (
                <Pannello titolo="profilo shopper">
                  <Barre voci={voci} larghezza={1792 - 80} />
                  <div style={{ fontSize: TIPI.minimo, color: COLORI.smorzato, marginTop: 16 }}>
                    barra: la selezione <span style={{ color: COLORI.bordo }}>·</span> tacca: media
                    nazionale
                  </div>
                </Pannello>
              ),
              striscia: (
                <Striscia
                  voci={[
                    luogo,
                    `${conta(sintesi.negozi)} negozi riforniti`,
                    valuta(sintesi.potenziale),
                    `${percentuale(sintesi.crescita ?? 0, { segno: true })} possibile`,
                    `paese ${percentuale(nazionale.crescita ?? 0, { segno: true })}`,
                  ]}
                />
              ),
            }}
          />
          {sfocatura ? (
            // Solo per la misura: e' esattamente quello che il pannello di
            // diagnosi fa con `backdrop-blur`, su una superficie trenta volte
            // piu' grande.
            <div
              className="pointer-events-none absolute"
              style={{
                left: 0,
                top: HEIGHT - 96,
                width: WIDTH,
                height: 96,
                backdropFilter: "blur(12px)",
              }}
            />
          ) : null}
        </div>
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T12 — pannelli sul muro">
            <Row label="momento" value={NOMI_FASE[fase]} tone="good" />
            <Row
              label="fotogrammi mediana"
              value={`${stats.median.toFixed(1)}/s`}
              tone={stats.median ? fpsTone(stats.median) : "normal"}
            />
            <Row
              label="minimo (finestra)"
              value={`${stats.min.toFixed(1)}/s`}
              tone={stats.min ? fpsTone(stats.min) : "normal"}
            />
            <Row
              label="peggiore (sessione)"
              value={`${stats.worst.toFixed(1)}/s`}
              tone={stats.worst ? fpsTone(stats.worst) : "normal"}
            />
            <Row
              label="misura attendibile"
              value={trust.suspect ? "NO" : "si"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="interruttori">
            <Row label="P  pannelli" value={pannelli ? "accesi" : "spenti"} tone={pannelli ? "good" : "normal"} />
            <Row label="B  sfocatura" value={sfocatura ? "accesa" : "spenta"} tone={sfocatura ? "bad" : "normal"} />
            <Row label="N  numeri vivi" value={numeriVivi ? "accesi" : "spenti"} tone={numeriVivi ? "warn" : "normal"} />
          </HudPanel>

          <HudPanel title="scena">
            <Row label="rotte" value={scena.stores.length} />
            <Row label="destinazioni" value={scena.hubs.length} />
            <Row
              label="precaricamento"
              value={prefetchMs === null ? "—" : `${(prefetchMs / 1000).toFixed(1)} s`}
            />
          </HudPanel>
        </div>

        <HudPanel>
          <div className="text-white/60">
            <b className="text-white">R</b> ripeti · <b className="text-white">P</b> pannelli ·{" "}
            <b className="text-white">B</b> sfocatura · <b className="text-white">N</b> numeri vivi
          </div>
        </HudPanel>
      </Hud>
    </main>
  );
}

/**
 * Un numero che si riscrive a ogni fotogramma.
 *
 * Non serve a niente: esiste per misurare quanto costa. Riscrivere del testo
 * sessanta volte al secondo obbliga il browser a rifare la disposizione di
 * quella porzione a ogni disegno, ed e' il tipo di costo che si paga proprio
 * mentre la camera si muove.
 */
function Vivo({ base }: { base: number }) {
  const [v, setV] = useState(base);
  useEffect(() => {
    let raf = 0;
    const inizio = performance.now();
    const giro = () => {
      const t = Math.min(1, (performance.now() - inizio) / 2000);
      setV(base * t);
      raf = requestAnimationFrame(giro);
    };
    raf = requestAnimationFrame(giro);
    return () => cancelAnimationFrame(raf);
  }, [base]);
  return <>{percentuale(v, { segno: true })}</>;
}
