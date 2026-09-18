---
titolo: Dati veri, storie deterministiche, pannelli sul muro
progetto: prg-mapping-tool-demo
stato: da eseguire
aggiornato: 2026-09-18
---

# Secondo blocco — dai test alla scena con dentro dei numeri

I test T0–T10 hanno risposto alla domanda tecnica: la scena regge. Da qui in avanti la domanda
cambia, ed è **se quello che regge dice qualcosa**. Servono due cose, e condividono quasi tutto:

1. i **pannelli e i grafici sopra la mappa** in T10, secondo le zone di `2026-layout-ia.md` §M0;
2. **T11**, la dashboard delle storie estratte dai dati in modo deterministico.

Entrambe poggiano sugli stessi numeri e sugli stessi grafici. Se si costruiscono in quest'ordine
— prima i dati e il motore, poi le viste — si scrivono una volta sola.

---

## Cosa è cambiato rispetto al primo blocco

**Si passa ai dati veri, ovunque, anche in T10.** I generatori sintetici (`hexGrid`, `points`,
`routes`, `network`) restano dove sono: servono ancora ai test isolati, dove avere un numero di
elementi scelto a piacere è il punto. Ma la sequenza di T10 e la dashboard di T11 lavorano sul
dataset che il tool usa davvero.

Il dataset sta in `prg-mapping-tool/public/data/`:

| File | Contenuto |
| --- | --- |
| `dataset_og.tsv.txt` | 10.466 negozi, 140 colonne: coordinate, città/contea/DMA/stato, 40 demografiche, 13 insegne concorrenti, le colonne `_ya`, la classificazione del modello |
| `dataset_network.tsv.txt` | Le rotte di rifornimento: origine, destinazione, `Cases` / `Units` / `Dollars` |
| `dataset_glossary.tsv.txt` | Le etichette leggibili delle colonne |

### Due colonne su cui il concept contava non ci sono

Verificato riga per riga:

- **`size_of_prize` è `null` su tutte le 10.466 righe.**
- **`share_gap` è `0` su tutte le 10.466 righe.**

Risponde in negativo a una delle domande aperte al cliente in `03-risultati.md`. Non blocca
niente, perché il potenziale inespresso si ricava dalle colonne che ci sono, ed è la definizione
già scelta nel concept (§2.2): la differenza fra la quota del negozio e la quota del proprio
bacino, applicata al fatturato del bacino.

Il calcolo, eseguito sul dataset:

- **6.518 negozi su 10.466 sotto la quota del proprio bacino — il 62,3%**;
- **circa 150 M$ di potenziale inespresso complessivo.**

Il 62% citato nel concept viene da qui, quindi la definizione regge e il numero si riproduce.
Va detto al cliente che le due colonne pronte sono vuote e che il valore lo calcoliamo noi: è una
differenza di responsabilità, non solo di implementazione.

### Un rischio nuovo, che nessun test precedente ha toccato

Tutto quello che abbiamo misurato finora sta dentro WebGL. Un pannello di testo sopra un canvas
da 5760×1080 è **un livello di composizione in più**, e non sappiamo cosa costi. Due trappole già
visibili nel codice attuale:

- `HudPanel` usa `backdrop-blur`. Su questa superficie è una rilettura di mezzo schermo a ogni
  fotogramma, ed è esattamente il genere di costo che non si vede sul portatile e si vede in sala.
- `Hud` è `fixed inset-0`, cioè vive nello spazio dello **schermo**. La cornice del muro deve
  vivere dentro lo `Stage`, nello spazio del **muro**, altrimenti «36 px» non vuol dire niente:
  sarebbero 36 px di finestra, cioè un decimo di quello che serve.

La cornice va quindi scritta, non riusata dal pannello di diagnosi.

---

# La struttura condivisa

Quattro cartelle nuove. Sono la parte che evita di scrivere due volte le stesse cose, ed è per
questo che vengono prima delle due viste.

## A. `lib/data/` — i dati veri

- **Passo di preparazione** (`scripts/build-dataset.mjs`): riduce il TSV alle colonne che
  servono davvero — una venticinquina su 140 — e lo scrive compatto in `public/data/`. Senza,
  la pagina scarica 7,6 MB per usarne meno di uno. Il parser deve reggere il letterale `null` e
  la notazione esponenziale (`5.77E+07`), che nel file c'è.
- **`schema.ts`**: il record del negozio, con i soli campi usati. Tipizzato una volta.
- **`metrics.ts`**: una definizione sola per ciascuna grandezza, e nessuna formula ripetuta nelle
  pagine — potenziale inespresso, quota negozio, quota bacino, variazione annua, densità dei
  concorrenti, vettore demografico come scarto dalla media nazionale.
- **`aggregate.ts`**: dai negozi alle celle (riusando `cellAt` di `hexGrid.ts`, che è già la
  contromisura al costo dell'interrogazione grafica) e alle aree con un nome vero — città, DMA.
  Il tetto di circa tremila celle a schermo viene da T9 e va applicato qui, non lasciato libero.
- **`network.ts`**: le rotte vere. In T10 il volume di merce oggi è inventato; il dataset ha
  `Cases`, `Units` e `Dollars` per rotta, ed è la stessa grandezza.

## B. `lib/stories/` — il motore

Funzioni pure. Niente React, niente DOM, niente accesso alla mappa: dev'essere eseguibile da riga
di comando, perché è l'unico modo di provarne il determinismo.

- **`archetypes.ts`** — i sette criteri di §3.3, ciascuno con le proprie soglie configurabili:
  campo libero, sotto assedio, l'anno perduto, anomalie rispetto al modello, il pubblico che non
  torna, i gemelli divergenti, la concentrazione.
- **`score.ts`** — entità dell'anomalia per valore economico, con il peso relativo configurabile.
- **`filter.ts`** — i tre filtri di §3.4: minimo di negozi, distanza geografica fra due storie,
  massimo due storie per archetipo.
- **`phrase.ts`** — le frasi da template sulle etichette del glossario. Mai testo generato.
- **`index.ts`** — `computeStories(dataset, config): Story[]`.

Il record `Story` porta con sé **anche la regia**: area, inquadratura di arrivo, strato da
accendere. È il contratto fra le due viste. In T10 oggi la stessa cosa la fa `focusHub`,
scegliendo a mano l'hub con la media più alta: quella funzione sparisce e diventa «la prima
storia».

## C. `lib/viz/` — i grafici, in SVG, senza libreria

Scale e cinque primitive: barre confrontate con la media, distribuzione, andamento, classifica,
profilo. Nessuna libreria di grafici, per due motivi concreti: la taglia minima del testo è un
vincolo nostro che nessuna libreria rispetta di suo, e su una superficie da 5760 px conviene
controllare esattamente quanti nodi finiscono nel documento.

Ogni grafico prende `{dati, dimensione}` e prende la taglia tipografica da un token legato a
`wall.ts`. **Lo stesso componente** rende quindi a 36 px minimi sul muro e a misura normale in
una pagina responsive, senza un secondo set di componenti.

## D. `components/wall/` — la cornice di M0

Le quattro zone del documento dei layout: fascia alta, pannello sinistro, pannello destro,
striscia di contesto. Dentro lo `Stage`, in pixel di muro.

Tre regole, tutte conseguenza di misure già fatte:

- **niente testo sotto i 36 px** (T9);
- **niente `backdrop-filter`** sopra il canvas, finché non ne misuriamo il costo;
- **pannelli montati sempre, accesi per opacità.** È la stessa lezione dei layer creati durante il
  precaricamento: il primo disegno costa, e quel costo non deve cadere nell'istante in cui la
  sala guarda.

---

# I test

Formato fisso, come in `01-test.md`: **domanda → cosa si costruisce → cosa si misura → quando è
promosso → se fallisce**.

---

## T11 — Le storie

**Domanda.** Le storie del concept si calcolano davvero dai dati veri, sono deterministiche, e la
lista che ne esce è varia o è otto volte la stessa cosa?

**Cosa si costruisce.**

- Il motore della cartella B, completo dei sette archetipi.
- Una pagina `t11` **responsive alla finestra del browser** — non è una superficie del prodotto,
  è lo strumento per leggere il risultato. Le storie come schede verticali, scorrevoli in
  orizzontale.
- Ogni scheda: archetipo, luogo con il nome vero, valore in denaro, numero di negozi, frase da
  template, miniatura.
- La miniatura è un **profilo SVG delle celle dell'area**, non un rendering della scena: otto
  scene deck.gl costerebbero, un profilo costa nulla ed è deterministico.
- Toccando una scheda, T11 emette la `StorySelection` — inquadratura e strato. Non pilota ancora
  la mappa: serve provare il contratto, che è quello che un domani collegherà tablet e muro.

**Cosa si misura.**

- Tempo di calcolo delle storie su 10.466 negozi (§3.2 dice «millisecondi»: va verificato, non
  creduto).
- **Determinismo**: due esecuzioni da riga di comando, impronta della lista, devono coincidere.
  Il requisito è che chi prova la sessione il giorno prima ritrovi le stesse cose.
- Quante candidate produce ciascun archetipo prima dei filtri e quante ne restano dopo.
- Peso del dato scaricato dopo il passo di preparazione.

**Quando è promosso.** Calcolo sotto i 200 ms, due esecuzioni identiche, e una lista finale che
contiene almeno quattro archetipi diversi su otto storie.

**Se fallisce.** Se il calcolo è lento, si precalcola nel passo di preparazione e la pagina legge
un file — le storie sono ferme durante la sessione, quindi è lecito. Se la lista è monotona, il
problema sono le soglie e i pesi, non il motore: si tarano guardando le candidate scartate.

**Perché prima dei pannelli.** Perché i pannelli di T10 devono mostrare i numeri di una storia
vera. Al contrario, li scriveremmo una volta finti e una volta veri.

---

## T12 — I pannelli sul muro

**Domanda.** Comporre testo e grafici sopra il canvas costa fotogrammi, e quanto?

**Cosa si costruisce.**

- La cornice della cartella D dentro lo `Stage` di T10.
- Il contenuto agganciato ai momenti che la sequenza **già ha**, senza inventarne di nuovi:
  striscia di contesto alla fine della discesa (M2→M3), pannello sinistro quando la scena si
  stringe (M4), grafico a destra durante il flusso (M9).
- T10 passa ai dati veri: negozi veri, volumi dalle rotte, area a fuoco scelta dal motore delle
  storie.

**Cosa si misura.**

- Mediana e p95 con pannelli spenti e accesi, **in particolare durante la stretta finale**, che è
  il momento in cui la camera si muove e l'overlay pure.
- `backdrop-filter` acceso e spento, sulla stessa scena.
- Numeri che si incrementano a ogni fotogramma contro numeri già scritti: il primo è un ricalcolo
  di testo per fotogramma, e decide se i valori «salgono» o compaiono.
- Prova di leggibilità con il metodo di T9 sul fotogramma finale: nessun testo sotto i 36 px.

**Quando è promosso.** Non più di due fotogrammi al secondo di perdita sulla mediana, e nessun
fotogramma oltre i 33 ms imputabile all'overlay.

**Se fallisce.** In cascata: togliere le sfocature; congelare il testo durante i movimenti di
camera e aggiornarlo agli estremi; disegnare i pannelli dentro la scena invece che sopra, come
strato deck.gl. L'ultima è la più costosa da scrivere ed è il motivo per cui si misura prima.

---

## Cosa resta fuori, di proposito

- La palette e l'illuminazione. Restano quelle di prova. Vale quanto detto in T9: è la cosa che
  decide se la sala vede qualcosa, e va progettata, non aggiustata dentro un test.
- T8, i tre schermi: ancora fermo alla risposta del cliente su come sono collegati.
- Il tablet. T11 è responsive perché è uno strumento di lettura, non la schermata del tablet:
  quella arriva quando le storie sono giuste.
