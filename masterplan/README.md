---
titolo: Masterplan — test di fattibilità 3D su mappa
progetto: prg-mapping-tool-demo
stato: da eseguire
aggiornato: 2026-09-17
---

# Masterplan — test di fattibilità

## Cosa è questo

Una serie di test tecnici per rispondere a **una sola domanda**: il concept 2026 — territorio in
rilievo, archi, discesa dal globo, interazioni touch — è realizzabile a 5760×1080 con prestazioni
accettabili in una sala, e con quale stack?

## Cosa non è

Non è un prototipo del prodotto. Non c'è dataset reale, non c'è interfaccia, non c'è storytelling.
Ogni test è una pagina isolata che fa una cosa sola e la misura. Se al termine abbiamo del codice
riutilizzabile è un guadagno accessorio, non l'obiettivo.

## I file

| File | Contenuto |
| --- | --- |
| `README.md` | Obiettivo, vincoli, metodo di misura, criteri di accettazione, sequenza |
| `01-test.md` | I test, uno per uno: cosa si costruisce, cosa si misura, quando è promosso |
| `02-alternative.md` | Le vie d'uscita, in cascata, per ogni possibile fallimento |
| `03-risultati.md` | Tabella da riempire durante l'esecuzione |

---

## Vincoli noti

- **Risoluzione di destinazione: 5760×1080** — 6,2 milioni di pixel, tre volte un 1080p.
- Il tool attuale gira già a questa risoluzione con Mapbox in 2D: sappiamo quindi che **la
  risoluzione di per sé non è un ostacolo insormontabile**. Quello che non sappiamo è quanto
  margine resti una volta aggiunto il 3D.
- **Libreria di mappa: MapLibre** — sorgente aperta, nessun token, interfaccia molto simile a
  Mapbox, supportata da deck.gl. Mapbox resta come alternativa.
- MapLibre non porta con sé i dati di mappa: va scelta una sorgente di tessere, e la scelta incide
  sulle prestazioni. Se ne provano almeno due, di cui una servita da noi.
- Ambiente: Next 16.3.5, React 19, pnpm. Prima di scrivere codice, leggere le guide in
  `node_modules/next/dist/docs/` — questa versione ha cambiamenti rispetto alle precedenti
  (vedi `AGENTS.md`).
- Le librerie di mappa richiedono il DOM: i componenti vanno resi solo lato client.

## Incognite che bloccano l'interpretazione dei risultati

Queste vanno chieste **prima** di dare un giudizio definitivo, perché senza di esse misuriamo la
nostra macchina e non la sala:

1. **Che macchina pilota il muro?** CPU, GPU, RAM, sistema operativo. È l'incognita più importante:
   una scheda video integrata e una dedicata danno risultati diversi di un ordine di grandezza.
2. **I tre schermi sono una sola superficie o tre uscite distinte?** Cambia se serve un canvas da
   5760 o tre da 1920.
3. **Quale browser e quale versione** girano in sala, e se è possibile avviarlo con parametri
   (accelerazione hardware, dimensione finestra).
4. **Vincoli di rete della sala**: la macchina che pilota il muro ha accesso a internet durante le
   sessioni? Se no, le tessere di mappa vanno servite in locale, e questo va saputo presto.
5. **Abbiamo accesso alla sala** per una prova sul posto, e quando?

Fino a che non abbiamo almeno la prima, tutti i numeri raccolti sono **relativi**: servono a
confrontare le opzioni fra loro, non a dire "funzionerà".

---

## Come si misura a 5760×1080 senza avere il muro

Il punto chiave: bisogna distinguere **quanti pixel il browser disegna** da **quanti pixel vediamo
noi sul portatile**. La cosa che pesa è la prima.

Approccio previsto: il canvas viene dimensionato esplicitamente a 5760×1080 e il contenitore viene
scalato otticamente per stare nello schermo. La GPU continua a disegnare 6,2 milioni di pixel; noi
ne vediamo una miniatura. Nel test va **verificato esplicitamente** che il buffer di disegno sia
davvero 5760×1080 e non ridimensionato di nascosto.

Due accortezze:

- **Forzare il rapporto pixel a 1.** Su uno schermo Retina il browser raddoppierebbe la
  risoluzione, misurando quattro volte il carico reale.
- **Dichiarare sempre su quale macchina è stata presa la misura.** Un numero senza la macchina
  accanto non vale niente.

Strumenti: contatore di fotogrammi a schermo, pannello prestazioni del browser con la traccia GPU,
e le metriche interne della libreria di rendering quando disponibili.

### La trappola: la finestra deve essere davvero visibile

Il browser smette di produrre fotogrammi quando la finestra e' in secondo piano **o semplicemente
coperta da un'altra finestra**. Nel secondo caso non c'e' alcun segnale evidente: la pagina
continua a dichiararsi visibile, e il contatore mostra due fotogrammi al secondo.

E' successo davvero durante la costruzione di T0, e per un momento e' sembrato un problema di
prestazioni. Da qui due regole:

- **Ogni misura si prende con la finestra in primo piano, non coperta, e senza altre finestre
  sovrapposte.** Niente misure da una scheda in secondo piano, da un pannello incorporato, o da un
  monitor secondario spento.
- **Le pagine di test dichiarano da sole se la misura e' attendibile.** Sopra i 60 millisecondi per
  fotogramma su una scena banale la pagina lo segnala in rosso: un numero del genere non e' una
  scheda video lenta, e' il browser che ha smesso di disegnare. Un numero annotato mentre quel
  segnale e' acceso va buttato.

---

## Criteri di accettazione

| Metrica | Soglia buona | Soglia minima | Note |
| --- | --- | --- | --- |
| Fotogrammi durante l'interazione | ≥ 55/s mediana | ≥ 30/s | Pan, zoom, rotazione, inclinazione continui |
| Cali di fotogrammi | nessuno sotto 30/s | — | Un singolo scatto visibile in sala è peggio di 5 fps in meno costanti |
| Risposta alla selezione | < 100 ms | < 200 ms | Dal tocco all'evidenziazione |
| Transizione di stato (tempo, storia) | fluida a ≥ 30/s | — | Il "respiro" anno su anno è il caso peggiore |
| Caricamento iniziale | < 5 s con 27.000 punti | < 10 s | Avviene una volta per sessione |
| Memoria GPU | stabile nel tempo | — | Deve reggere ore in modalità autonoma |

**Una nota sul 60.** Sessanta fotogrammi al secondo sono l'obiettivo per l'interazione diretta,
dove il dito segue il contenuto. Per i momenti cinematografici — la discesa, il respiro temporale —
trenta stabili sono accettabili, purché stabili: è l'irregolarità che si nota, non la frequenza.

---

## Sequenza e cancelli decisionali

I test sono raggruppati in tre blocchi. Alla fine di ogni blocco si prende una decisione e si
decide se proseguire, cambiare strada o fermarsi.

**Blocco A — Impianto e mappa** (T0 → T2)
Impianto a 5760×1080 con contatore di fotogrammi, la discesa su una città, il costo della mappa
base con MapLibre.
→ *Decisione:* la risoluzione è sostenibile, MapLibre è la scelta giusta, e come si costruisce la
discesa.

**T1 è il test che decide se ha senso continuare**: una discesa da lontano fino a scala stradale
concentra in venti secondi quasi tutti i rischi del progetto.

**Blocco B — Il 3D e le interazioni** (T3 → T7)
Integrazione di deck.gl, colonne esagonali, archi, punti, gesti e selezione.
→ *Decisione:* quali elementi del concept sono realizzabili come descritti, quali vanno ripensati,
quali vanno tolti.

**Blocco C — La sala** (T8 → T9)
Comportamento su tre schermi, leggibilità a distanza.
→ *Decisione:* architettura di rendering definitiva e dimensioni minime per il disegno.

Ogni blocco produce una riga in `03-risultati.md`. Nessun blocco viene saltato per fretta: un
risultato negativo conosciuto vale più di un dubbio rimandato.
