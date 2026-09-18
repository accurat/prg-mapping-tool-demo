"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { measure, wait, type Sample } from "@/lib/lab/measure";
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
  stats,
  trust,
}: {
  caricato: Caricato;
  map: MapHandle | null;
  labelId: string | undefined;
  onReady: (m: MapHandle) => void;
  stats: ReturnType<typeof useFrameMeter>["stats"];
  trust: ReturnType<typeof useRenderTrust>;
}) {
  const { dataset, glossario, scena } = caricato;
  const { fase, prefetchMs } = useSequenza({ map, labelId, dati: scena });

  const [pannelli, setPannelli] = useState(true);
  const [sfocatura, setSfocatura] = useState(false);
  const [numeriVivi, setNumeriVivi] = useState(false);
  const [prova, setProva] = useState<Misura[] | null>(null);
  const [inCorso, setInCorso] = useState(false);

  /**
   * La prova: quattro configurazioni misurate di seguito, senza che nessuno
   * debba premere niente in mezzo ne' trascrivere numeri.
   *
   * Esiste perche' la misura a mano non e' praticabile: il browser scende a un
   * fotogramma al secondo appena la finestra passa dietro, e una lettura presa
   * in quel momento sembra un risultato. Qui la pagina se ne accorge da sola —
   * un fotogramma mediano sopra i 40 ms su questa scena non e' una scheda video
   * lenta, e' il browser che ha smesso di disegnare — e dichiara la riga non
   * valida invece di consegnare un numero inventato.
   */
  const eseguiProva = useCallback(async () => {
    if (inCorso) return;
    setInCorso(true);
    setProva(null);
    const configurazioni = [
      { nome: "scena sola", p: false, b: false, n: false },
      { nome: "con i pannelli", p: true, b: false, n: false },
      { nome: "+ sfocatura di fondo", p: true, b: true, n: false },
      { nome: "+ numeri vivi", p: true, b: false, n: true },
    ];
    const raccolte: Misura[] = [];
    for (const c of configurazioni) {
      setPannelli(c.p);
      setSfocatura(c.b);
      setNumeriVivi(c.n);
      // Un secondo perche' la transizione delle opacita' finisca: misurare
      // durante la dissolvenza misurerebbe la dissolvenza.
      await wait(1200);
      const campione = await measure(5000);
      raccolte.push({ nome: c.nome, campione });
      setProva([...raccolte]);
    }
    setPannelli(true);
    setSfocatura(false);
    setNumeriVivi(false);
    setInCorso(false);
  }, [inCorso]);

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (inCorso) return;
      if (e.key === "p" || e.key === "P") setPannelli((v) => !v);
      if (e.key === "b" || e.key === "B") setSfocatura((v) => !v);
      if (e.key === "n" || e.key === "N") setNumeriVivi((v) => !v);
      if (e.key === "m" || e.key === "M") void eseguiProva();
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [eseguiProva, inCorso]);

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

        <div className="flex flex-col gap-2">
          {prova ? <Risultati righe={prova} inCorso={inCorso} /> : null}
          <HudPanel>
            <div className="text-white/60">
              <b className="text-white">M</b> esegui la prova (4 × 5 s) · <b className="text-white">R</b>{" "}
              ripeti la sequenza · <b className="text-white">P</b> pannelli ·{" "}
              <b className="text-white">B</b> sfocatura · <b className="text-white">N</b> numeri vivi
            </div>
          </HudPanel>
        </div>
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

type Misura = { nome: string; campione: Sample };

/**
 * I risultati della prova.
 *
 * La prima riga e' il riferimento: tutte le altre si leggono come differenza da
 * quella, perche' la domanda non e' «quanti fotogrammi fa» ma «quanti ne costa
 * questa cosa».
 */
function Risultati({ righe, inCorso }: { righe: Misura[]; inCorso: boolean }) {
  const base = righe[0]?.campione.median ?? 0;
  const valida = (c: Sample) => c.medianMs < 40 && c.frames > 60;

  return (
    <HudPanel title={inCorso ? `prova in corso — ${righe.length} di 4` : "prova completata"}>
      <div className="grid grid-cols-[13rem_5rem_5rem_5rem_6rem] gap-x-4 leading-6">
        <span className="text-white/40" />
        <span className="text-right text-white/40">mediana</span>
        <span className="text-right text-white/40">p95</span>
        <span className="text-right text-white/40">peggiore</span>
        <span className="text-right text-white/40">costo</span>
        {righe.map(({ nome, campione }, i) => {
          const buona = valida(campione);
          const differenza = campione.median - base;
          return (
            <div key={nome} className="contents">
              <span className={buona ? "text-white" : "text-red-400"}>{nome}</span>
              <span className="text-right tabular-nums">
                {buona ? `${campione.median.toFixed(1)}/s` : "—"}
              </span>
              <span className="text-right tabular-nums text-white/70">
                {buona ? `${campione.p95Ms.toFixed(1)} ms` : "—"}
              </span>
              <span className="text-right tabular-nums text-white/70">
                {buona ? `${campione.worstMs.toFixed(1)} ms` : "—"}
              </span>
              <span
                className={`text-right tabular-nums ${
                  !buona || i === 0 ? "text-white/40" : differenza < -2 ? "text-red-400" : "text-emerald-400"
                }`}
              >
                {!buona
                  ? "non valida"
                  : i === 0
                    ? "riferimento"
                    : `${differenza >= 0 ? "+" : ""}${differenza.toFixed(1)}/s`}
              </span>
            </div>
          );
        })}
      </div>
      {righe.some((r) => !valida(r.campione)) ? (
        <div className="mt-2 max-w-xl text-red-400">
          Una riga non valida significa che il browser ha smesso di disegnare: succede quando la
          finestra passa dietro. Rimettila davanti e ripeti con M.
        </div>
      ) : null}
    </HudPanel>
  );
}
