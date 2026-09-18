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

## Il costo dei pannelli

Eseguita in una **finestra vera di Chrome**, avviata con lo strozzamento delle finestre in
secondo piano disattivato. Otto misure da cinque secondi, 301 fotogrammi ciascuna, zero
fotogrammi non assestati, tutte valide. Dati grezzi in `masterplan/results/serie-8.jsonl.bak`.

### Con il vsync: nessuna configurazione esce dal budget

| | camera ferma | camera in movimento |
| --- | --- | --- |
| scena sola | 59,9/s — peggiore 17,7 ms | 59,9/s — peggiore 17,7 ms |
| con i pannelli | 59,9/s — peggiore 17,7 ms | 59,9/s — peggiore 17,7 ms |
| + sfocatura di fondo | 59,9/s — peggiore 17,7 ms | 59,9/s — peggiore 17,6 ms |
| + numeri vivi | 59,9/s — peggiore 17,8 ms | 59,9/s — peggiore 17,7 ms |

Otto righe identiche. **Questa tabella non dice che i pannelli sono gratis: dice che nessuna
configurazione esce dai 16,7 millisecondi.** Con il vsync la mediana è inchiodata alla frequenza
dello schermo e non può peggiorare finché c'è margine, quindi una misura fatta così non
distingue fra «costa poco» e «non costa niente». Per separarli serve toglierlo.

### Senza vsync: quanto costa davvero

| | camera ferma | in movimento | costo per fotogramma |
| --- | --- | --- | --- |
| scena sola | 2,80 ms | 3,10 ms | — |
| con i pannelli | 2,70 ms | 3,10 ms | **0,0 ms** |
| + sfocatura di fondo | 2,60 ms | 3,10 ms | **0,0 ms** |
| + numeri vivi | 2,90 ms | 3,20 ms | **+0,1 ms** |

**I pannelli non costano niente di misurabile**, né fermi né mentre la camera si muove: le
differenze sono di un decimo di millisecondo e cambiano segno fra una configurazione e l'altra,
cioè sono rumore. Testo, grafici in SVG e cornice si compongono una volta e il browser li
ricicla.

L'unica voce con un costo costante, in entrambe le condizioni, sono i **numeri che si riscrivono
a ogni fotogramma: +0,1 ms**, cioè lo 0,6% del budget. È reale ma trascurabile: se i numeri
devono salire, possono salire.

**La sfocatura non si conferma.** Una misura precedente, presa nel pannello incorporato dell'app,
aveva mostrato un intoppo da 100 millisecondi al primo disegno della sfocatura. In una finestra
vera non si riproduce. Teneva la regola per il motivo sbagliato: la regola resta — niente
`backdrop-filter` — ma perché **non serve a niente**, non perché costi.

### Il margine

Il numero più utile della prova non è nella tabella: la scena intera, cinquecento rotte,
cinquantamila chilometri di archi, i carichi in movimento, i pannelli e i grafici, **costa 3,1
millisecondi per fotogramma su un budget di 16,7**. Un margine di cinque volte.

Va detto con la solita cautela: è la mia macchina, non quella della sala. Resta la domanda aperta
su che cosa piloti il muro, e questo margine è esattamente ciò che verrà mangiato da una scheda
video integrata.

---

# La sosta sul paese

La discesa non va più dal globo all'area in un volo solo: si ferma per un attimo su
**un'inquadratura che contiene tutta la parte continentale degli Stati Uniti**, poi riparte.

Due dettagli non ovvi:

- **L'inquadratura la calcola la mappa**, con `cameraForBounds`, non noi. È lei a sapere quanto è
  grande la propria tela e come si traduce uno zoom in metri per pixel; una formula nostra
  sarebbe una seconda versione della stessa cosa, con una costante sbagliata prima o poi.
- **La sosta va precaricata a parte.** Il corridoio del precaricamento è una retta fra due zoom
  sullo stesso centro: una fermata su un altro centro non ci cade dentro, e quelle tessere
  arriverebbero durante il volo invece che prima. `prefetchDescent` accetta ora delle tappe fuori
  corridoio. Il precaricamento passa da 4 a 5,4 secondi a cache fredda.

Il paese si guarda **a picco anche quando il resto della discesa sarà inclinato**: serve a
riconoscere una forma, e una forma vista di scorcio è un'altra forma. Confini presi larghi e
senza Alaska né Hawaii: includerle costringerebbe a inquadrare mezzo emisfero per mostrare uno
stato in cui non si scenderà mai, e quello che avanza ai lati — Canada, Messico, oceano — non è
un problema, è il contesto.

Gli **hub compaiono durante questa prima tratta**, non dopo. Sono la struttura fissa del
territorio, non un dato che emerge: quando la sala vede il paese, i punti di rifornimento ci sono
già. I negozi arrivano molto dopo, ed è quella la differenza da far sentire — prima il posto, poi
quello che ci succede dentro.

Ne è seguita una pulizia: la presenza dell'hub era legata all'appiattimento delle celle, e quindi
compariva e spariva per effetto di cose che non lo riguardavano. Ora è dichiarata momento per
momento, come tutte le altre grandezze della scena.

**Sull'inquadratura del paese gli hub sono ingranditi, e tornano alla loro misura mentre ci si
avvicina.** Alla misura vera sarebbero meno di un pixel, e un punto che non si vede non è un
punto discreto, è un punto assente. Scendendo, il territorio fa il lavoro da solo e
l'ingrandimento diventa una bugia: si riassorbe insieme al volo invece di sparire a destinazione.

**Il ridimensionamento segue lo zoom, non il tempo.** Il volo di MapLibre non attraversa gli zoom
in modo uniforme — parte piano, accelera, frena — quindi una scala guidata da una curva temporale,
per quanto ben scelta, resta indietro o va avanti rispetto al terreno che si allarga sotto.
Chiedendo alla mappa dove si trova a ogni fotogramma, le due cose non possono che coincidere.

Quanto ingrandirli **sta nei dati della scena, non nella sequenza**, perché dipende dalla scala:
un hub da cinquantadue chilometri a zoom nazionale è già un disco visibile e gli basta un ritocco
(1,6×), uno da sei chilometri ha bisogno di sei volte la propria misura per esistere. Lo stesso
numero per entrambe sarebbe sbagliato per tutte e due.

La discesa passa da 6,2 a 8,2 secondi: 2,8 fino al paese, 2,0 di sosta, 3,0 fino all'area.

## I nomi degli hub, solo sul paese

Su quell'inquadratura i punti di rifornimento sono lontani e piccoli, e senza un nome sono macchie
uguali fra loro. Compaiono quindi dei connettori con il nome, in dissolvenza, e **se ne vanno per
primi appena il volo riparte**: servivano a distinguere dei punti lontani, e da vicino il
territorio dice già dove si è — un'etichetta che resta diventa un ingombro proprio sopra la cosa
che si è venuti a guardare.

Le etichette stanno su un anello attorno al gruppo, ciascuna nella direzione in cui già sta il
proprio hub rispetto al centro, così non si incrociano. Oltre una dozzina di hub non si mettono
affatto: cinquanta etichette su una vista nazionale non identificano niente, coprono tutto — ed è
il motivo per cui nella scena vera, che ha cinquanta destinazioni, non compaiono.

### Il TextLayer di deck.gl non funziona in questa scena

Tentativo fallito, e vale la pena scriverlo perché **fallisce in silenzio**: il `TextLayer` non
riesce a costruire il proprio atlante dei caratteri — `WebGL: INVALID_VALUE: texSubImage2D: no
canvas` a console — e le etichette restano invisibili senza che niente si rompa. Provato con
l'insieme di caratteri dichiarato invece che dedotto, e con l'atlante a campo di distanza: stesso
esito.

Le etichette sono quindi **testo del documento**, sopra il canvas, con le posizioni ricalcolate a
ogni fotogramma finché si vedono. Anche funzionando, il TextLayer sarebbe stata la scelta
peggiore: così il testo resta nitido a qualsiasi scala, usa gli stessi corpi del muro e quindi la
stessa soglia dei 36 pixel, e T12 ha misurato che comporre testo sopra il canvas non costa
fotogrammi.

---

# L'inclinazione spostata (T10, tasto `I`)

Prova nata da un'osservazione: **l'altezza si legge inclinati, la geografia si legge dall'alto**,
e la sequenza originale le aveva al contrario — arrivava inclinata sul quadro d'insieme e si
metteva a picco proprio quando si stringeva su un'area.

Con `I` i due ordini si confrontano dall'inizio. Nell'ordine invertito:

1. si arriva **a picco**: il paese si legge come una carta, e a parlare è il colore;
2. le celle **compaiono già basse** e la rete si accende — tutto visto dall'alto, dove la
   struttura a stella si legge molto meglio che in prospettiva, perché gli archi non si
   accavallano e le stelle lontane non si schiacciano l'una sull'altra;
3. la scena **si stringe su una stella e si inclina**;
4. dopo qualche istante **la rete si spegne e le colonne si alzano**: le celle tornano a essere
   il dato, viste dall'unica angolazione da cui un'altezza si legge.

Il quarto momento è nato da un difetto del primo tentativo: invertendo solo l'inclinazione, la
camera si inclinava su dodici dischi piatti, perché l'appiattimento avviene due fasi prima. Il
movimento si vedeva, l'informazione no. Ora le celle restano segnaposto anche da vicino — finché
c'è la rete la scena parla di luoghi e di merce — e tornano dato solo quando la rete se ne va: una
cosa per volta.

La rete svanisce più in fretta di quanto le colonne salgano, così non si accavallano: si legge un
cambio di argomento e non una confusione.

**Le celle non crescono, in questo ordine.** A picco un'altezza non esiste: farle salire lo stesso
vorrebbe dire animare qualcosa che nessuno può vedere, e far credere per due secondi che stia
succedendo qualcosa che non succede. Compaiono e basta, e a entrare in scena è il colore — la
fase si chiama «il territorio si popola» e non «il potenziale emerge», perché è un'altra cosa.
Per la stessa ragione sparisce la fase di appiattimento: non c'è niente da appiattire, e una fase
che non sposta niente è una pausa travestita da passaggio.

## Un difetto trovato per strada: due sequenze in corso insieme

Il sintomo era perfido — la scena restava ferma a un momento passato mentre il pannello annunciava
quello giusto. La causa: una sequenza dura mezzo minuto e vive dentro una catena di attese, e
l'interruttore ne faceva partire una seconda mentre la prima era a metà. Le due continuavano a
disegnare sulla stessa scena e vinceva l'ultima che aveva parlato.

Ogni esecuzione prende ora un numero e dopo ogni attesa controlla di essere ancora l'ultima. Non
riguarda solo questo interruttore: vale per qualsiasi cosa faccia ripartire il volo, compreso il
tasto `R` che c'è da sempre.

---

## Cosa resta fuori, di proposito

- La palette e l'illuminazione. Restano quelle di prova. Vale quanto detto in T9: è la cosa che
  decide se la sala vede qualcosa, e va progettata, non aggiustata dentro un test.
- T8, i tre schermi: ancora fermo alla risposta del cliente su come sono collegati.
- Il tablet. T11 è responsive perché è uno strumento di lettura, non la schermata del tablet:
  quella arriva quando le storie sono giuste.
