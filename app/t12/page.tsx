"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { measure, wait, type Sample } from "@/lib/lab/measure";
import { Hud, HudPanel, Row, fpsTone } from "@/components/lab/Hud";
import { MapSurface, type MapHandle } from "@/components/lab/MapSurface";
import { Stage } from "@/components/lab/Stage";
import { EtichetteHub } from "@/components/scena/EtichetteHub";
import { Barre, type Voce } from "@/components/viz/Barre";
import { Cornice, Pannello, Riga, Striscia } from "@/components/wall/Cornice";
import { COLORI, TIPI } from "@/components/wall/tokens";
import { aggrega, composizioneDi, composizioneMedia } from "@/lib/data/metrics";
import { caricaDataset, type Dataset, type Glossario, type Rotte } from "@/lib/data/schema";
import { conta, percentuale, valuta } from "@/lib/format";
import { useFrameMeter } from "@/lib/lab/useFrameMeter";
import { useRenderTrust } from "@/lib/lab/useRenderTrust";
import { costruisciScena, type DatiScena } from "@/lib/scena/dati";
import {
  START_ZOOM,
  nomeFase,
  useSequenza,
  type Fase,
  type Inclinazione,
} from "@/lib/scena/sequenza";

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

/**
 * Quanto dura ciascuna delle otto misure.
 *
 * Tre secondi sono un centinaio e ottanta fotogrammi: abbondanti per una
 * mediana e per un novantacinquesimo percentile, appena sufficienti per il
 * peggior fotogramma, che su una finestra corta e' piu' ballerino. Si tiene
 * corta perche' la prova intera deve stare dentro il tempo in cui qualcuno
 * riesce a tenere la finestra davanti senza distrarsi: una misura che nessuno
 * completa vale meno di una misura un po' piu' rumorosa.
 */
const DURATA_MS = 5000;

type Zone = { alta: boolean; sinistra: boolean; destra: boolean; striscia: boolean };
const NIENTE: Zone = { alta: false, sinistra: false, destra: false, striscia: false };

/**
 * Quando ciascuna zona e' accesa, secondo il documento dei layout.
 *
 * Dipende dall'ordine dell'inclinazione, perche' i due ordini hanno due finali
 * diversi. In quello inclinato — il predefinito — **i pannelli arrivano per
 * ultimi**, quando il rilievo si e' alzato e la scena e' ferma: finche'
 * qualcosa si muove un pannello e' una seconda cosa da guardare nello stesso
 * istante, e le cifre finiscono per competere con il movimento invece di
 * spiegarlo.
 */
function zoneDi(fase: Fase, inclinazione: Inclinazione): Zone {
  if (fase === "attesa" || fase === "preparazione" || fase === "globo") return NIENTE;

  /**
   * La striscia di contesto compare **durante la discesa sul paese**, non dopo.
   *
   * Arriva mentre la camera si sta ancora muovendo, cosi' quando il volo si
   * ferma la sala ha gia' sotto gli occhi di che perimetro si parla. Farla
   * comparire a movimento finito aggiungerebbe un'apparizione dopo una sosta,
   * cioe' due eventi dove ne basta uno.
   */
  const conStriscia: Zone = { ...NIENTE, striscia: true };
  if (fase === "discesa" || fase === "paese") return conStriscia;

  if (inclinazione === "fuoco") {
    // M4 e M9 insieme, alla fine: i numeri dell'area e il grafico di
    // approfondimento arrivano sul rilievo gia' alzato.
    return fase === "numeri" ? { ...conStriscia, sinistra: true, destra: true } : conStriscia;
  }

  // Ordine originale: il pannello del soggetto entra con la stretta (M4), il
  // grafico si affianca durante il flusso (M9).
  if (fase === "fuoco") return { ...conStriscia, sinistra: true };
  if (fase === "flusso" || fase === "rilievo" || fase === "numeri") {
    return { ...conStriscia, sinistra: true, destra: true };
  }
  return conStriscia;
}

type Caricato = { dataset: Dataset; rotte: Rotte; glossario: Glossario; scena: DatiScena };

export default function T12Page() {
  const [caricato, setCaricato] = useState<Caricato | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [map, setMap] = useState<MapHandle | null>(null);
  const [labelId, setLabelId] = useState<string | undefined>();
  const [inclinazione, setInclinazione] = useState<Inclinazione>("fuoco");

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
        loading the dataset…
      </main>
    );
  }

  return (
    <Scena
      caricato={caricato}
      map={map}
      labelId={labelId}
      onReady={handleReady}
      inclinazione={inclinazione}
      onInclinazione={setInclinazione}
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
  inclinazione,
  onInclinazione,
  stats,
  trust,
}: {
  caricato: Caricato;
  map: MapHandle | null;
  labelId: string | undefined;
  onReady: (m: MapHandle) => void;
  inclinazione: Inclinazione;
  onInclinazione: (v: Inclinazione) => void;
  stats: ReturnType<typeof useFrameMeter>["stats"];
  trust: ReturnType<typeof useRenderTrust>;
}) {
  const { dataset, glossario, scena } = caricato;
  const { fase, prefetchMs, esegui, etichetteHub, opacitaEtichette } = useSequenza({
    map,
    labelId,
    dati: scena,
    inclinazione,
  });

  const [pannelli, setPannelli] = useState(true);
  const [sfocatura, setSfocatura] = useState(false);
  const [numeriVivi, setNumeriVivi] = useState(false);
  const [prova, setProva] = useState<Misura[] | null>(null);
  const primoGiro = useRef(true);
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
    if (inCorso || !map) return;
    setInCorso(true);
    setProva(null);

    /**
     * Ogni configurazione si misura due volte: a camera still e a camera in
     * movimento.
     *
     * Il momento che preoccupa non e' quello in cui il muro sta fermo — li' un
     * pannello e' un rettangolo gia' composto e non costa niente — ma quello in
     * cui **la camera si muove e l'overlay si muove insieme a lei**, cioe' la
     * stretta finale. Misurare solo da fermi risponderebbe alla domanda facile.
     *
     * Il movimento e' una rotazione lenta e costante invece che la stretta
     * vera: dura quanto serve e soprattutto e' **identico per tutte e quattro
     * le configurazioni**, che e' l'unico modo perche' le righe siano
     * confrontabili fra loro.
     */
    const configurazioni = [
      { nome: "scene only", p: false, b: false, n: false },
      { nome: "with the panels", p: true, b: false, n: false },
      { nome: "+ backdrop blur", p: true, b: true, n: false },
      { nome: "+ live numbers", p: true, b: false, n: true },
    ];

    const raccolte: Misura[] = [];
    for (const c of configurazioni) {
      setPannelli(c.p);
      setSfocatura(c.b);
      setNumeriVivi(c.n);
      // Un secondo perche' la transizione delle opacita' finisca: misurare
      // durante la dissolvenza misurerebbe la dissolvenza.
      await wait(1000);
      const ferma = await measure(DURATA_MS);

      let raf = 0;
      const ruota = () => {
        map.setBearing((map.getBearing() + 0.12) % 360);
        raf = requestAnimationFrame(ruota);
      };
      raf = requestAnimationFrame(ruota);
      await wait(500);
      const mossa = await measure(DURATA_MS);
      cancelAnimationFrame(raf);
      map.setBearing(0);

      raccolte.push({ nome: c.nome, ferma, mossa });
      setProva([...raccolte]);
    }

    setPannelli(true);
    setSfocatura(false);
    setNumeriVivi(false);
    setInCorso(false);

    // I numeri finiscono su file invece che sullo schermo soltanto. Chi esegue
    // la prova deve solo tenere la finestra davanti: non deve leggere niente,
    // non deve trascrivere niente, e soprattutto non puo' sbagliare a copiare.
    void fetch("/api/bench", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        test: "t12",
        quando: new Date().toISOString(),
        durataMisuraMs: DURATA_MS,
        rotte: scena.stores.length,
        rows: raccolte.map((r) => ({
          configurazione: r.nome,
          ferma: r.ferma,
          mossa: r.mossa,
        })),
      }),
    }).catch(() => {});
  }, [inCorso, map, scena.stores.length]);

  // Cambiare l'ordine a meta' sequenza non direbbe niente: i due ordini si
  // confrontano solo dall'inizio, quindi l'interruttore fa ripartire il volo.
  useEffect(() => {
    if (primoGiro.current) {
      primoGiro.current = false;
      return;
    }
    void esegui();
  }, [inclinazione, esegui]);

  /**
   * Avvio automatico con `?prova=1`.
   *
   * La prova parte da sola quando la scena e' arrivata a regime, cioe' quando
   * la camera ha finito di muoversi per conto suo: misurare durante la discesa
   * misurerebbe la discesa. E' l'unico modo di eseguirla senza che qualcuno
   * debba azzeccare il momento in cui premere un tasto.
   */
  const automatica = useRef(false);
  useEffect(() => {
    if (automatica.current || fase !== "flusso") return;
    if (new URLSearchParams(window.location.search).get("prova") !== "1") return;
    automatica.current = true;
    // Un secondo e mezzo prima di cominciare: il flusso e' appena partito e i
    // primi carichi sono ancora in dissolvenza d'ingresso. Serve anche a non
    // far partire la misura dentro all'effetto, che e' la stessa ragione per
    // cui la scena non si disegna mai durante il render.
    const attesa = setTimeout(() => void eseguiProva(), 1500);
    return () => clearTimeout(attesa);
  }, [fase, eseguiProva]);

  useEffect(() => {
    const suTasto = (e: KeyboardEvent) => {
      if (inCorso) return;
      if (e.key === "p" || e.key === "P") setPannelli((v) => !v);
      if (e.key === "b" || e.key === "B") setSfocatura((v) => !v);
      if (e.key === "n" || e.key === "N") setNumeriVivi((v) => !v);
      if (e.key === "m" || e.key === "M") void eseguiProva();
      if (e.key === "i" || e.key === "I") {
        onInclinazione(inclinazione === "discesa" ? "fuoco" : "discesa");
      }
    };
    window.addEventListener("keydown", suTasto);
    return () => window.removeEventListener("keydown", suTasto);
  }, [eseguiProva, inCorso, inclinazione, onInclinazione]);

  const indiciFuoco = scena.indiciPerHub[scena.fuoco];
  const sintesi = useMemo(() => aggrega(dataset, indiciFuoco), [dataset, indiciFuoco]);
  const nazionale = useMemo(
    () => aggrega(dataset, Int32Array.from({ length: dataset.conteggio }, (_, i) => i)),
    [dataset],
  );
  // Il nome viene dall'hub, non dai negozi che gli fanno capo: quelli stanno
  // sparsi su mezzo stato e il loro capoluogo piu' rappresentato e' un'altra
  // citta' — la striscia diceva un nome e la scena ne mostrava un altro.
  const luogo = scena.nomiHub[scena.fuoco];

  const voci = useMemo<Voce[]>(() => {
    const media = composizioneMedia(dataset, "eta");
    const locale = composizioneDi(dataset, "eta", indiciFuoco);
    return dataset.demografia.eta.campi.map((campo, i) => ({
      etichetta: glossario.etichette[campo]?.etichetta ?? campo,
      valore: locale[i],
      riferimento: media[i],
    }));
  }, [dataset, glossario, indiciFuoco]);

  const visibili = zoneDi(fase, inclinazione);

  /**
   * La striscia parla del perimetro corrente.
   *
   * Finche' si guarda il paese dice i totali del paese; quando la scena si
   * stringe passa a quelli dell'area. E' quello che chiede il documento dei
   * layout (M3 poi M4), ed e' anche l'unica versione onesta: annunciare
   * «Dallas» mentre la camera sta ancora scendendo sull'intero territorio
   * vorrebbe dire dare per visto qualcosa che non si e' ancora visto.
   */
  const suUnArea =
    fase === "fuoco" || fase === "flusso" || fase === "rilievo" || fase === "numeri";
  const vociStriscia = suUnArea
    ? [
        luogo,
        `${conta(sintesi.negozi)} connected stores`,
        valuta(sintesi.potenziale),
        `${percentuale(sintesi.crescita ?? 0, { segno: true })} possible`,
        `country ${percentuale(nazionale.crescita ?? 0, { segno: true })}`,
      ]
    : [
        "United States",
        `${conta(nazionale.misurabili)} stores with sales`,
        `${conta(scena.stores.length)} supply routes`,
        valuta(nazionale.potenziale),
        `${percentuale(nazionale.crescita ?? 0, { segno: true })} possible`,
      ];

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
          <EtichetteHub
            map={map}
            etichette={etichetteHub}
            opacita={opacitaEtichette}
            larghezza={WIDTH}
            altezza={HEIGHT}
          />
          <Cornice
            larghezza={WIDTH}
            altezza={HEIGHT}
            visibili={pannelli ? visibili : NIENTE}
            zone={{
              sinistra: (
                <Pannello titolo="supply network" sfocato={sfocatura}>
                  <div style={{ fontSize: TIPI.titolo, lineHeight: 1.05 }}>{luogo}</div>
                  <div style={{ height: 24 }} />
                  <Riga
                    etichetta="possible growth"
                    valore={
                      numeriVivi ? (
                        <Vivo base={sintesi.crescita ?? 0} />
                      ) : (
                        percentuale(sintesi.crescita ?? 0, { segno: true })
                      )
                    }
                    grande
                  />
                  <Riga etichetta="unrealised potential" valore={valuta(sintesi.potenziale)} />
                  <Riga etichetta="connected stores" valore={conta(sintesi.negozi)} />
                  <Riga
                    etichetta="below the reference"
                    valore={`${sintesi.sotto} of ${sintesi.misurabili}`}
                  />
                </Pannello>
              ),
              destra: (
                <Pannello titolo="shopper profile" sfocato={sfocatura}>
                  <Barre voci={voci} larghezza={1792 - 80} />
                  <div style={{ fontSize: TIPI.minimo, color: COLORI.smorzato, marginTop: 16 }}>
                    bar: the selection <span style={{ color: COLORI.bordo }}>·</span> tick:
                    national average
                  </div>
                </Pannello>
              ),
              // La sfocatura riguarda tutte le zone insieme: sfoca cio' che
              // sta dietro, che e' l'unica cosa che avrebbe senso sfocare.
              striscia: <Striscia sfocata={sfocatura} voci={vociStriscia} />,
            }}
          />
        </div>
      </Stage>

      <Hud>
        <div className="flex items-start gap-3">
          <HudPanel title="T12 — the scene">
            <Row label="moment" value={nomeFase(fase, inclinazione)} tone="good" />
            <Row
              label="tilt"
              value={inclinazione === "discesa" ? "in the descent" : "in the close-up"}
              tone="warn"
            />
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
              label="worst (session)"
              value={`${stats.worst.toFixed(1)}/s`}
              tone={stats.worst ? fpsTone(stats.worst) : "normal"}
            />
            <Row
              label="measurement valid"
              value={trust.suspect ? "NO" : "yes"}
              tone={trust.suspect ? "bad" : "good"}
            />
          </HudPanel>

          <HudPanel title="switches">
            <Row label="P  panels" value={pannelli ? "on" : "off"} tone={pannelli ? "good" : "normal"} />
            <Row label="B  blur" value={sfocatura ? "on" : "off"} tone={sfocatura ? "bad" : "normal"} />
            <Row label="N  live numbers" value={numeriVivi ? "on" : "off"} tone={numeriVivi ? "warn" : "normal"} />
          </HudPanel>

          <HudPanel title="scene">
            <Row label="routes" value={scena.stores.length} />
            <Row label="destinations" value={scena.hubs.length} />
            <Row
              label="preload"
              value={prefetchMs === null ? "—" : `${(prefetchMs / 1000).toFixed(1)} s`}
            />
          </HudPanel>
        </div>

        <div className="flex flex-col gap-2">
          {prova ? <Risultati righe={prova} inCorso={inCorso} /> : null}
          <HudPanel>
            <div className="text-white/60">
              <b className="text-white">R</b> replay · <b className="text-white">I</b> tilt ·{" "}
              <b className="text-white">P</b> panels · <b className="text-white">B</b> blur ·{" "}
              <b className="text-white">N</b> live numbers · <b className="text-white">M</b> test
              (8 × 5 s)
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

type Misura = { nome: string; ferma: Sample; mossa: Sample };

/**
 * I risultati della prova.
 *
 * La prima riga e' il riferimento: tutte le altre si leggono come differenza da
 * quella, perche' la domanda non e' «quanti fotogrammi fa» ma «quanti ne costa
 * questa cosa».
 */
function Risultati({ righe, inCorso }: { righe: Misura[]; inCorso: boolean }) {
  const valida = (c: Sample) => c.medianMs < 40 && c.frames > 60;
  const base = righe[0];

  return (
    <HudPanel title={inCorso ? `test running — ${righe.length} of 4` : "test complete"}>
      <div className="grid grid-cols-[12rem_5rem_5rem_6rem_5rem_5rem_6rem] gap-x-4 leading-6">
        <span />
        <span className="col-span-3 border-b border-white/10 text-center text-white/40">
          camera still
        </span>
        <span className="col-span-3 border-b border-white/10 text-center text-white/40">
          camera moving
        </span>
        <span />
        <span className="text-right text-white/40">median</span>
        <span className="text-right text-white/40">p95</span>
        <span className="text-right text-white/40">worst</span>
        <span className="text-right text-white/40">median</span>
        <span className="text-right text-white/40">p95</span>
        <span className="text-right text-white/40">worst</span>

        {righe.map((r, i) => (
          <div key={r.nome} className="contents">
            <span className={valida(r.ferma) && valida(r.mossa) ? "text-white" : "text-red-400"}>
              {r.nome}
            </span>
            {[r.ferma, r.mossa].map((c, k) => {
              const buona = valida(c);
              const riferimento = k === 0 ? base?.ferma : base?.mossa;
              // Il costo si legge sul peggior fotogramma, non sulla mediana: a
              // sessanta fotogrammi al secondo la mediana e' bloccata dal
              // monitor e non puo' peggiorare finche' c'e' margine. Quello che
              // si vede in sala e' l'intoppo.
              const peggioramento = riferimento ? c.worstMs - riferimento.worstMs : 0;
              return (
                <div key={k} className="contents">
                  <span className="text-right tabular-nums">
                    {buona ? `${c.median.toFixed(1)}/s` : "—"}
                  </span>
                  <span className="text-right tabular-nums text-white/70">
                    {buona ? `${c.p95Ms.toFixed(1)} ms` : "—"}
                  </span>
                  <span
                    className={`text-right tabular-nums ${
                      !buona
                        ? "text-red-400"
                        : i > 0 && peggioramento > 8
                          ? "text-amber-400"
                          : "text-white/70"
                    }`}
                  >
                    {buona ? `${c.worstMs.toFixed(1)} ms` : "invalid"}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {righe.some((r) => !valida(r.ferma) || !valida(r.mossa)) ? (
        <div className="mt-2 max-w-xl text-red-400">
          An invalid row means the browser stopped drawing: that happens when the window goes
          behind another one. Bring it back to the front and run M again.
        </div>
      ) : null}
    </HudPanel>
  );
}
