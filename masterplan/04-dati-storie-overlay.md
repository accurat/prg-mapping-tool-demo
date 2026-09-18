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

Non è una scoperta: il concept lo aveva già rilevato e documentato in §7.3, insieme ad altre due
colonne vuote (`store_ttl_hhd` e `store_sales_by_ttl_hhd`). Quello che aggiungiamo qui è la
verifica indipendente sul file e il calcolo del ripiego. Resta aperta la domanda al cliente, che
riguarda la **produzione**: se lì quelle colonne sono valorizzate, diventano la definizione
preferibile. Non blocca niente, perché il potenziale inespresso si ricava dalle colonne che ci sono, ed è la definizione
già scelta nel concept (§2.2): la differenza fra la quota del negozio e la quota del proprio
bacino, applicata al fatturato del bacino.

### Le quote pronte sono arrotondate al punto da non essere usabili

Il concept (§2.2 a) calcola il potenziale da due colonne di quota: quella realizzata dentro il
negozio e quella realizzata nel bacino. Quelle colonne esistono e sono complete, ma sono
**arrotondate a due decimali**, e a questa scala l'arrotondamento non è un dettaglio:

| Colonna | Valori distinti su 10.466 negozi |
| --- | --- |
| `store_numer_sales_usd_share_pct` | 53 |
| `trade_area_numer_sales_usd_share_pct` | 22 |

La quota tipica di un negozio è 0,02% e quella del suo bacino 0,07%. La differenza fra le due —
cioè esattamente il potenziale inespresso — vale uno o due scalini di arrotondamento. **L'errore
sarebbe grande quanto la grandezza misurata.**

Gli importi da cui quelle quote derivano sono però presenti, completi e non arrotondati. Il
passo di preparazione trasporta quelli, e la quota si calcola a precisione piena. Stessa
definizione del concept, numeri diversi:

| | Dalle colonne arrotondate | Dagli importi |
| --- | --- | --- |
| Negozi sotto la quota del proprio bacino | 6.518 (62,3%) | **5.689 (54,4%)** |
| Potenziale inespresso complessivo | 150 M$ | **2,0 M$** |

**Il 62% e i «circa 200 milioni» scritti nel concept vanno corretti.** Il 62% è un artefatto
dell'arrotondamento. Il valore in denaro lo è due volte, perché nasce anche da un secondo errore:
i punti di quota mancanti moltiplicati per il fatturato del **bacino** invece che per quello del
**negozio**. Il concept dice giustamente «× fatturato del negozio», ma il numero citato non viene
da lì — applicare la formula giusta agli importi giusti dà 2,0 M$, applicarla al bacino ne dà 110.

Due milioni sembra poco solo finché non si guarda la scala giusta: le vendite P&G in questi
10.466 negozi sono **9,67 M$** in tutto, su 13,1 miliardi di fatturato complessivo dei negozi —
una quota dello 0,074%. Il potenziale inespresso è quindi **+21% sulle vendite P&G attuali**,
che come titolo di una sessione funziona meglio di una cifra assoluta grande e sbagliata.

Conseguenza pratica per i layout: gli esempi del documento dei layout parlano di «4,2 M$
inespressi» per un'area. Con i numeri veri un'area vale qualche migliaio di dollari, e il
formato delle etichette va rifatto di conseguenza.

### Altre due cose emerse dal file

- **1.032 negozi su 10.466 hanno vendite a zero.** Non hanno una quota, quindi non hanno un
  potenziale: vanno esclusi dal calcolo invece di entrarci come zero, che li farebbe sembrare
  negozi perfettamente allineati al proprio bacino.
- **Le 500 rotte si agganciano tutte**, su entrambi gli estremi, con 50 destinazioni e 550
  negozi toccati in tutto. Lo strato della rete copre quindi il 5% dei negozi, come il concept
  (§7.4) aveva previsto.

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

---

# Esiti del motore delle storie

Eseguito con `pnpm run check:storie`. Sei verifiche su sei, **51 ms** per calcolare le storie su
10.466 negozi — il criterio era 200 — e due esecuzioni con la stessa impronta.

## Quello che la verifica ha trovato

**«L'anno perduto» con una soglia assoluta scattava sul 43% delle aree.** La causa non è il
criterio, è il dataset: le vendite P&G arretrano ovunque.

| Serie | Mediana anno su anno | Negozi in calo |
| --- | --- | --- |
| Vendite totali del negozio | +1,5% | 39% |
| **Vendite P&G del negozio** | **−21,4%** | **81%** |
| Vendite totali del bacino | +3,3% | 6% |
| **Vendite P&G del bacino** | **−20,6%** | **99%** |

Il «+1,5% con code a −9% e +27%» che il concept cita in §7.2 è la prima riga, cioè il fatturato
complessivo dei negozi. Ma la storia temporale del tool riguarda la linea P&G, che si comporta in
modo opposto. **Con quel dato, un'area che cala del 30% non è una storia, è la norma.**

Il criterio ora misura lo scarto dalla variazione tipica del paese, e la diffusione conta i
negozi che vanno *peggio della media* invece che quelli in calo. Le candidate passano da 272 a
11, e nessuna entra negli otto: su questo dataset il calo è nazionale e non è una storia su un
luogo. È il comportamento giusto — l'alternativa era raccontare otto volte che è stato un anno
brutto.

**Due difetti di forma, trovati leggendo la lista e non dal codice.** Una storia diceva
«Pittsburgh, Ohio»: il nome della città veniva dal gruppo dominante e lo stato da un negozio
qualsiasi dell'area, che stava dall'altra parte del confine. Ora si contano le coppie città-stato
insieme. E «Kansas City» perdeva lo stato, perché il controllo per non ripetere lo stato già
presente nel nome cercava la stringa ovunque invece che in coda.

## La lista che ne esce

Cinque archetipi su sette, 163 candidate, otto scelte:

| | Archetipo | Luogo |
| --- | --- | --- |
| 1 | Anomalie rispetto al modello | Houston, Texas |
| 2 | Anomalie rispetto al modello | Kansas City, Missouri |
| 3 | La concentrazione | 9 stati, il 50% del potenziale |
| 4 | Campo libero | Odessa, Texas |
| 5 | Sotto assedio | Miami, Florida |
| 6 | Sotto assedio | Fort Worth, Texas |
| 7 | Campo libero | Austin, Texas |
| 8 | Il pubblico che non torna | Carthage, Mississippi |

## La pagina

`/t11`, responsive, schede verticali scorrevoli in orizzontale. Non è una superficie del
prodotto — le storie del prodotto vivono sul tablet e sul muro — ma lo strumento per rispondere a
due domande che nessuna verifica automatica risolve: **le frasi si capiscono**, e **la lista è
varia**.

Per questo mostra anche quello che una vista di prodotto nasconderebbe: quante candidate ha
prodotto ogni criterio prima dei filtri, quanto è costato il calcolo, e la regia che ogni storia
consegnerebbe alla scena — centro, zoom, strato. Vedere la regia adesso, prima che esista un muro
da comandare, è il modo di accorgersi che una storia atterrerebbe da un'altezza sbagliata: è così
che è saltato fuori che l'inquadratura, misurata sui centri delle aree invece che sui negozi,
scendeva a zoom 11 su una cella da 60 km.

La miniatura è un profilo del rilievo della regione, con evidenziate le celle della storia. Dice
una cosa che il testo non dice: **quanto quell'area spicca rispetto a quello che le sta intorno**.
Odessa esce come una barra alta e isolata, Austin come una barra alta accanto a una più alta — e
sono due storie diverse che nessun numero comunica altrettanto in fretta.

Un difetto trovato guardandola: l'evidenziazione della concentrazione non compariva, perché quella
storia parla di stati mentre il profilo è fatto di celle, e due livelli di aggregazione non hanno
chiavi in comune. L'appartenenza ora si decide sui negozi, che sono la stessa cosa a qualsiasi
livello la si guardi.

## Cosa resta da decidere

- **«I gemelli divergenti» produce 26 candidate e non entra mai negli otto.** È l'archetipo che
  il concept considera il più persuasivo in sala. O il punteggio lo penalizza — una coppia di
  aree medie vale meno di una grande area anomala — o le soglie sono strette. Va guardato con i
  numeri davanti, non tarato a occhio.
- **I 2.535 negozi che non vendono niente di P&G valgono il 41% del potenziale e non hanno un
  archetipo.** Non sono sotto-performance ma assenza dall'assortimento, e sono la storia più
  grande che il dataset contiene. Vale la pena aggiungere un ottavo criterio.
- **Il rilievo nazionale ha 632 celle da 61 km, e 252 — il 40% — restano piatte** perché hanno
  meno di cinque negozi. O si accetta un rilievo sparso, o si usano celle più grandi al livello
  nazionale, o si abbassa la soglia. È una decisione da prendere guardandolo.

---

# Esiti di T12 — i pannelli sul muro

`/t12`. Stessa sequenza di T10, stessi identici disegni: l'unica differenza sono le zone del
documento dei layout sovrapposte e i dati veri sotto. La sequenza è stata **estratta** in
`lib/scena/sequenza.ts` e le due pagine la condividono — duplicarla avrebbe prodotto due copie di
settecento righe destinate a separarsi al primo ritocco, e una misura di T12 che non direbbe più
niente su T10.

## La rete vera è nazionale, non cittadina

Misurato sulle 500 rotte:

| | |
| --- | --- |
| Lunghezza mediana di una rotta | **1.136 km** |
| Decile inferiore / superiore | 347 km / 2.994 km |
| La più lunga | 6.196 km |
| Destinazioni | 50, con una decina di rami ciascuna |
| La stella più compatta | raggio 695 km |

**La stella che T10 disegna — un hub con i suoi negozi a pochi chilometri — non esiste nei dati.**
Quello che esiste è un centro di distribuzione rifornito da mezzo paese. A scala di città si
vedrebbe un punto e delle linee che escono dall'inquadratura. La sequenza di T12 si svolge quindi
a scala nazionale, e il momento in cui ci si stringe è su una stella, non su una città.

## Il muro non può inquadrare gli Stati Uniti

Conseguenza della geometria, non del codice. Il muro è largo cinque volte la propria altezza.
Per far stare il paese in altezza servono circa 3.700 metri per pixel, e a quella scala i 5.760
pixel di larghezza coprono **ventunmila chilometri**: metà pianeta. In proiezione a globo la
curvatura si vede, ed è esattamente quello che compare a schermo.

Le alternative sono tre e vanno decise guardandole: accettare che la vista nazionale mostri il
globo — che è scenografico e onesto; inquadrare sulla larghezza, che taglia fuori metà del paese
in altezza; oppure passare a proiezione piatta al livello nazionale, che T10 ha già escluso
perché il passaggio fra sfera e piano si vede sempre.

## Cosa è verificato

**Leggibilità: 40 elementi di testo, quattro sole misure in uso — 36, 48, 72, 96 pixel — nessuna
sotto la soglia.** Misurato nel documento, non stimato: la cornice vive dentro lo `Stage` e quindi
in pixel di muro, che è la ragione per cui è stata scritta da capo invece di riusare il pannello
di diagnosi, che vive in pixel di finestra.

I contenuti sono agganciati ai momenti che la sequenza già aveva: titolo e data in apertura (M2),
striscia di contesto da quando il rilievo emerge (M3), pannello del soggetto quando la scena si
stringe (M4), grafico di approfondimento accanto alla scena durante il flusso (M9). Nessuna fase
nuova.

## Il costo dei pannelli — misura parziale

Presa con la pagina che disegnava davvero, `misura attendibile: sì`, finestre da cinque secondi,
**nel momento a camera ferma** (il flusso in corso, l'inquadratura immobile):

| | mediana | p95 | peggior fotogramma |
| --- | --- | --- | --- |
| scena sola | 59,9/s | 16,7 ms | 17,5 ms |
| con i pannelli | 59,9/s | 16,8 ms | 17,4 ms |
| + sfocatura di fondo | 59,9/s | 16,8 ms | **100,1 ms** |
| + numeri vivi | 59,9/s | 16,8 ms | 17,7 ms |

**I pannelli non costano niente.** Né il testo, né i grafici in SVG, né i numeri riscritti a ogni
fotogramma: mediana e p95 identici alla scena da sola, entro il rumore di misura. A schermo fermo
un pannello è un rettangolo già composto, e il browser lo ricompone senza ridisegnarlo.

**La sfocatura di fondo costa un intoppo da 100 millisecondi**, cioè sei fotogrammi persi in un
colpo solo — e lo fa senza spostare né la mediana né il p95, quindi una misura che guardasse solo
la mediana l'avrebbe dichiarata gratis. È il momento in cui il browser costruisce il livello di
composizione per la sfocatura. In sala si vedrebbe come uno scatto, non come una lentezza.
Conferma la regola già adottata nella cornice: **niente `backdrop-filter` sopra il canvas**.

### Quello che manca

La stessa tabella **a camera in movimento**, che è il caso che preoccupa davvero: quando la
stretta finale muove l'inquadratura, l'overlay si muove con lei e il browser deve ricomporre a
ogni fotogramma invece di riusare quello di prima. Lì un pannello potrebbe non essere più gratis.

La prova ora misura anche quel caso — ogni configurazione due volte, ferma e con una rotazione
lenta identica per tutte, così le righe restano confrontabili — ma **non è eseguibile da un
agente**: il browser scende a un fotogramma al secondo appena la finestra passa dietro, e le
otto misure durano più di quanto si riesca a tenerlo sveglio dall'esterno. La pagina se ne accorge
da sola e dichiara le righe non valide invece di consegnare numeri inventati.

Si esegue così, con la finestra in primo piano per circa un minuto e mezzo:

```
http://localhost:3000/t12?prova=1
```

Parte da sola quando la scena è a regime e scrive il risultato in `masterplan/results/runs.jsonl`.
Nessun tasto da premere, nessun numero da trascrivere.

---

## Cosa resta fuori, di proposito

- La palette e l'illuminazione. Restano quelle di prova. Vale quanto detto in T9: è la cosa che
  decide se la sala vede qualcosa, e va progettata, non aggiustata dentro un test.
- T8, i tre schermi: ancora fermo alla risposta del cliente su come sono collegati.
- Il tablet. T11 è responsive perché è uno strumento di lettura, non la schermata del tablet:
  quella arriva quando le storie sono giuste.
