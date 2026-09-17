# Risultati

Da riempire durante l'esecuzione. Un test senza il suo contesto di misura non vale niente: la
macchina va indicata **ogni volta**.

## Macchine di prova

| Sigla | Macchina | CPU | GPU | Sistema | Browser |
| --- | --- | --- | --- | --- | --- |
| M1 | MacBook Pro, 16 GB | Apple M2, 8 core | Apple M2 integrata (ANGLE/Metal) | macOS 25.5 | Chrome 152 |
| SALA | *(da compilare quando avremo le specifiche)* | | | | |
| SALA | *(da compilare quando avremo le specifiche)* | | | | |

## Esito dei test

| Test | Macchina | Risoluzione | Fotogrammi (mediana / minimo) | Note | Esito |
| --- | --- | --- | --- | --- | --- |
| T0 scena vuota | | 5760×1080 | | | |
| T0 confronto | | 1920×1080 | | | |
| T1a discesa dal globo | | 5760×1080 | | *(stacco di proiezione? tessere?)* | |
| T1b discesa da scala continentale | | 5760×1080 | | *(tessere?)* | |
| T1c discesa da scala statale | | 5760×1080 | | | |
| T1 — sorgente tessere A (rete) | | 5760×1080 | | | |
| T1 — sorgente tessere B (locale) | | 5760×1080 | | | |
| T2a stile minimale *(taratura)* | | 5760×1080 | | | |
| T2b stile completo | | 5760×1080 | | | |
| T2c con terreno | | 5760×1080 | | *(sorgente disponibile?)* | |
| T2d con edifici 3D | | 5760×1080 | | *(sorgente disponibile?)* | |
| T3 — deck.gl funziona con MapLibre? | | — | — | *(sì/no, in quali modalità)* | |
| T3a sovrapposto | | 5760×1080 | | | |
| T3b interlacciato | | 5760×1080 | | | |
| T4a celle 500 | | 5760×1080 | | | |
| T4a celle 2.000 | | 5760×1080 | | | |
| T4a celle 10.000 | | 5760×1080 | | | |
| T4b aggregazione 10k punti | | — | *(tempo in ms)* | | |
| T4b aggregazione 27k punti | | — | *(tempo in ms)* | | |
| T4c transizione altezza | | 5760×1080 | | | |
| T4d con ombre | | 5760×1080 | | | |
| T5 archi 500 | | 5760×1080 | | | |
| T5 archi 5.000 | | 5760×1080 | | | |
| T5 archi 50.000 | | 5760×1080 | | | |
| T5 archi animati 500 | | 5760×1080 | | | |
| T6 punti 27.000 | | 5760×1080 | | | |
| T6 punti 27.000 + selezione | | 5760×1080 | | | |
| T7 trascinamento continuo | | 5760×1080 | | *(latenza in ms)* | |
| T8a canvas unico | | 5760×1080 | | | |
| T8b tre finestre | | 3×1920 | | *(allineamento)* | |
| T9 leggibilità | | — | — | *(dimensioni minime)* | |

## Decisioni prese

| Cancello | Data | Decisione | Motivo |
| --- | --- | --- | --- |
| Blocco A — impianto e mappa | | | |
| Blocco B — 3D e interazioni | | | |
| Blocco C — la sala | | | |

## Cosa è cambiato nel concept

Da compilare alla fine: quali parti del concept vanno riscritte alla luce dei risultati, e in che
modo.

| Parte del concept | Reggeva? | Cosa cambia |
| --- | --- | --- |
| Rilievo a celle esagonali | | |
| Ombre come segnale di altezza | | |
| Respiro anno su anno | | |
| Archi hub → negozio | | |
| Selezione a pennello | | |
| Livello legato allo zoom | | |
| Discesa dal globo | | |
| Sorgente tessere scelta | | |

## Serie del 17 settembre 2026 — macchina M1

Eseguite dal banco automatico su `/bench`, in un Chrome avviato con la sospensione dei fotogrammi
disattivata. Due serie: una con il sincronismo verticale attivo (dice **se** arriviamo a 60
fotogrammi al secondo) e una senza (dice **quanto costa davvero** un fotogramma, senza il tetto dei
16,7 ms imposto dal monitor).

Tutte le misure a 5760x1080 salvo dove indicato, rapporto pixel 1, buffer verificato a schermo.

| Test | Scenario | vsync: mediana | vsync: p95 | vsync: peggiore | **senza vsync: mediana** | senza vsync: p95 | tessere in ritardo |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T0 | scena vuota, 1 passaggi di riempimento | 16.7 ms | 17.5 ms | 18 ms | **0.4 ms** | 2.4 ms | 0% |
| T0 | scena vuota, 4 passaggi di riempimento | 16.7 ms | 17.6 ms | 18 ms | **2.2 ms** | 2.4 ms | 0% |
| T0 | scena vuota, 8 passaggi di riempimento | 16.7 ms | 17.6 ms | 20 ms | **2.3 ms** | 2.4 ms | 0% |
| T0 | scena vuota, 1 passaggio di riempimento | 16.7 ms | 17.7 ms | 18 ms | **2.2 ms** | 2.4 ms | 0% |
| T2 | CARTO dark matter · rotazione continua, inclinazione 55 | 16.7 ms | 16.8 ms | 18 ms | **4.6 ms** | 7.9 ms | 40% |
| T2 | CARTO dark matter · zoom continuo | 16.7 ms | 16.8 ms | 33 ms | **4.9 ms** | 11.1 ms | 31% |
| T1 | CARTO dark matter · discesa dal globo · 6s · globo | 16.7 ms | 16.8 ms | 49 ms | **4.5 ms** | 11.5 ms | 43% |
| T1 | CARTO dark matter · discesa continentale · 6s · globo | 16.7 ms | 17.5 ms | 50 ms | **2.8 ms** | 13.1 ms | 43% |
| T1 | CARTO dark matter · discesa statale · 6s · globo | 16.7 ms | 16.9 ms | 33 ms | **4.0 ms** | 14.1 ms | 28% |
| T2 | OpenFreeMap dark · rotazione continua, inclinazione 55 | 16.7 ms | 16.8 ms | 17 ms | **3.0 ms** | 5.2 ms | 56% |
| T2 | OpenFreeMap dark · zoom continuo | 16.7 ms | 16.8 ms | 18 ms | **3.5 ms** | 6.5 ms | 31% |
| T1 | OpenFreeMap dark · discesa dal globo · 6s · globo | 16.7 ms | 17.1 ms | 83 ms | **3.6 ms** | 7.1 ms | 43% |
| T1 | OpenFreeMap dark · discesa continentale · 6s · globo | 16.7 ms | 16.8 ms | 18 ms | **3.2 ms** | 7.7 ms | 39% |
| T1 | OpenFreeMap dark · discesa statale · 6s · globo | 16.7 ms | 16.8 ms | 18 ms | **3.6 ms** | 7.6 ms | 27% |

### Come si leggono

**Con il sincronismo attivo, tutto sta a 60 fotogrammi al secondo.** Mediana 16,7 ms ovunque:
scena vuota, mappa in rotazione, mappa in zoom, tutte e sei le discese. Il criterio di
accettazione principale del masterplan e' rispettato su questa macchina.

**Senza sincronismo si vede il margine, ed e' molto ampio.** Un fotogramma costa da 2,2 a 4,9
millisecondi contro i 16,7 disponibili: **resta circa il 70-85% del tempo di calcolo libero** per
tutto quello che dovremo aggiungere sopra (colonne, archi, punti, selezione).

**Il riempimento dei pixel non e' il collo di bottiglia.** Otto passaggi a tutto schermo su
5760x1080 costano quanto uno: 2,3 contro 2,2 millisecondi. E 1920x1080 costa quanto 5760x1080. Il
costo fisso per fotogramma domina, i pixel no. La risoluzione del muro, da sola, non e' un
problema.

**I cali di fotogrammi ci sono, e stanno tutti nelle discese.** Il peggior fotogramma durante le
discese arriva a 49-50 ms con CARTO e 83 ms con OpenFreeMap: da tre a cinque fotogrammi persi in un
colpo. Il masterplan chiede che non ci siano cali sotto i 30 fotogrammi al secondo, e questi li
violano. Non e' carico grafico — la mediana resta a 16,7 — sono intoppi puntuali, verosimilmente
elaborazione delle tessere sul filo principale.

**Le tessere sono in ritardo per un quarto o meta' della discesa.** Dal 27% al 56% dei fotogrammi
di una discesa hanno ancora tessere in arrivo. E' la conferma quantitativa del rischio che il
masterplan indicava come principale, e la conferma visiva e' peggiore del numero (vedi sotto).

**Nota sulla prima riga.** Il valore di 0,4 ms della prima misura e' un artefatto: e' il primo
scenario della serie e la scena non stava ancora disegnando. Le altre tre righe di T0, con la
stessa configurazione, sono coerenti fra loro a 2,2-2,3 ms.

### La discesa vista con gli occhi

Fotogrammi catturati durante una discesa dal globo con CARTO, durata 6 secondi.

**A meta' volo, intorno a zoom 13,8, il muro e' quasi vuoto.** Al centro c'e' una chiazza di citta'
con bordi netti; tutto il resto dei 5760 pixel e' nero. Non e' un difetto di prestazioni — il
contatore in quel momento segna 59,9 fotogrammi al secondo con minimo 57,5 — sono le tessere che
non arrivano abbastanza in fretta per coprire un'inquadratura cosi' larga e cosi' inclinata.

**Verso la fine, a zoom 15,2, l'immagine e' piena e nitida**, e alla scala d'arrivo il formato
ultra largo e' notevole.

Quindi il problema della discesa non e' la fluidita': e' **la copertura**. Le contromisure da
provare, in ordine: discesa piu' lenta, precaricamento lungo il percorso, inclinazione che cresce
solo verso la fine invece che per tutto il volo, partenza da scala continentale invece che dal
globo.

### Quale sorgente di tessere

Le due si equivalgono nel costo di calcolo. OpenFreeMap e' leggermente piu' economica in rotazione
e zoom, CARTO ha intoppi un po' meno gravi nelle discese. In una prima serie precedente
OpenFreeMap aveva mostrato ritardi molto piu' alti (fino al 100% della discesa, con 4,75 secondi di
assestamento), quindi **i dati di rete sono rumorosi e vanno rifatti**, possibilmente con una
sorgente servita da noi come terzo termine di confronto.

## Contromisura: il precaricamento della discesa

Delle quattro contromisure ipotizzate, tre sono state escluse per scelta di progetto: la partenza
resta dal globo, l'inclinazione e la durata restano quelle attuali. Resta il precaricamento, ed e'
sufficiente.

### Come funziona

Prima del volo la camera percorre a salti lo stesso corridoio della discesa — otto passi da zoom
0,4 a zoom 15,5 — e a ogni passo si attende che le tessere siano arrivate. Poi torna alla partenza
e il volo vero trova tutto gia' in cache.

Il corridoio non viene calcolato da noi: e' la mappa stessa, spostando la camera, a decidere quali
tessere servono per quell'inquadratura con la sua proiezione e la sua inclinazione. Qualsiasi
calcolo nostro degli indirizzi sarebbe una riapprossimazione destinata a divergere.

Due dettagli che fanno la differenza fra funzionare e non funzionare:

- **La cache deve poter trattenere l'intero corridoio.** Il valore predefinito della libreria
  tiene pochi livelli di zoom: le tessere dei primi passi verrebbero sfrattate prima che il volo le
  raggiunga, e il precaricamento non servirebbe a nulla. Alzato a ventiquattro livelli.
- **Vanno attesi due fotogrammi dopo ogni salto prima di interrogare lo stato.** Subito dopo un
  salto di camera la mappa risponde ancora sulla situazione precedente. Nella prima versione il
  precaricamento dichiarava di aver finito in 0,0 secondi senza aver atteso niente; migliorava
  comunque le cose, ma per caso.

### Risultato

| Sorgente | Tessere in ritardo, senza | Tessere in ritardo, con | Peggior fotogramma, senza | con |
| --- | --- | --- | --- | --- |
| CARTO dark matter | 42% della discesa | **8%** | 34 ms | 33 ms |
| OpenFreeMap dark | 43% della discesa | **13%** | 18 ms | 18 ms |

La conferma che conta e' pero' visiva. Senza precaricamento, a zoom 13,8, il muro mostrava una
chiazza di citta' al centro e nero su tutto il resto. Con il precaricamento la copertura e'
**completa da bordo a bordo a ogni altezza**: a zoom 9,3 si legge da Topeka a Columbia, a zoom 14,4
tutta la citta' con etichette, fiume e svincoli. Il problema e' chiuso.

### Cosa costa

**Da due a sei secondi**, a seconda che la cache sia fredda o gia' calda, e della rete. Nessuno
degli otto passi e' scaduto.

Ne discendono due requisiti per il prodotto, non per il test:

1. **Il precaricamento va nascosto dietro il momento del titolo.** Il concept prevede gia'
   un'apertura con titolo e data: e' li' che va eseguito. La sessione non deve mai mostrare la
   camera che salta lungo il corridoio.
2. **Va avviato appena si conosce la destinazione**, cioe' appena e' nota la prima storia — quindi
   alla fine del caricamento del dataset, non al momento in cui qualcuno preme avvia.

### Cosa resta da verificare

- Il tempo di precaricamento dipende dalla rete: sei secondi qui, ignoti nella sala del cliente.
  Con una sorgente servita in locale sarebbe quasi istantaneo, ed e' un argomento in piu' a favore
  di quella scelta.
- Non e' stato provato il precaricamento di destinazioni diverse dalla stessa: cambiando storia
  cambia il corridoio, e la cache va dimensionata per piu' di un corridoio o ricostruita.

## T3 — deck.gl sopra MapLibre: sovrapposto contro interlacciato

Colonne esagonali su una griglia generata, a 5760x1080, inclinazione 55, sorgente CARTO.
Tre quantita' di colonne per ogni modalita', camera ferma e camera in rotazione continua.

| Scenario | p95 con sincronismo | Costo reale, mediana | Costo reale, p95 |
| --- | --- | --- | --- |
| sovrapposto, 500 colonne, rotazione | 33,4 ms | 19,3 ms | 35,4 ms |
| sovrapposto, 2.000 colonne, rotazione | 33,4 ms | 19,8 ms | 38,1 ms |
| sovrapposto, 10.000 colonne, rotazione | 33,4 ms | 20,1 ms | 39,3 ms |
| **interlacciato, 500 colonne, rotazione** | 16,8 ms | **4,2 ms** | 8,2 ms |
| **interlacciato, 2.000 colonne, rotazione** | 16,7 ms | **4,3 ms** | 8,2 ms |
| **interlacciato, 10.000 colonne, rotazione** | 16,8 ms | **4,1 ms** | 8,1 ms |

*Le righe a camera ferma non compaiono perche' non misurano niente: se la camera non si muove la
mappa non ridisegna, e il valore letto e' la cadenza a riposo, non un costo.*

### L'esito ribalta l'ipotesi di partenza

Il masterplan dava per scontato che l'interlacciato costasse di piu', e che il sovrapposto fosse la
scelta giusta visto che non ci servono edifici tridimensionali. **E' vero il contrario.**

**Con il sincronismo attivo, il sovrapposto scende a 30 fotogrammi al secondo appena la camera si
muove.** Il p95 di 33,4 millisecondi e' esattamente il doppio di un intervallo di aggiornamento: e'
la firma di due tele che vengono composte fuori sincrono, non di un carico eccessivo. Lo si vede
dal fatto che **il numero di colonne non cambia nulla**: 500 si comportano come 10.000.

**Senza sincronismo si misura il costo vero, ed e' cinque volte tanto:** 19-20 millisecondi contro
4. Due contesti grafici e due tele da comporre a ogni fotogramma costano piu' di tutto il resto
messo insieme.

**In piu' l'interlacciato fa anche quello che serve.** Inserendo le colonne sotto il primo livello
di etichette, i nomi delle citta' restano leggibili sopra il rilievo. In modalita' sovrapposta le
colonne coprono tutto, etichette comprese: sul muro significherebbe perdere i nomi dei luoghi
esattamente dove si sta guardando.

**Decisione: interlacciato.** Vince su entrambi i fronti, e non c'e' controindicazione.

### Un risultato che anticipa T4

Il numero di colonne e' **ininfluente fino a diecimila**: 4,1 millisecondi con diecimila contro 4,2
con cinquecento. La domanda di T4a — quante celle reggiamo — ha gia' una risposta parziale: molte
piu' di quelle che ci servono. A T4 restano il tempo di aggregazione, le transizioni di altezza e
il costo delle ombre.

### Cosa resta da verificare su T3

- Il comportamento con **piu' layer contemporaneamente** (colonne piu' archi piu' punti): qui ce
  n'era uno solo.
- L'interlacciato con il **rilevamento del tocco attivo**, che aggiunge un passaggio di rendering.
- Il comportamento durante la **discesa** invece che in rotazione, con le colonne gia' presenti.

## T4 — il rilievo

Interlacciato, sorgente CARTO, 5760x1080, inclinazione 55.

| Scenario | p95 con sincronismo | Costo reale, mediana |
| --- | --- | --- |
| 2.000 celle, rotazione, senza ombre | 17,6 ms | 4,2 ms |
| 10.000 celle, rotazione, senza ombre | 16,8 ms | 4,2 ms |
| **2.000 celle, rotazione, con ombre** | 16,8 ms | **4,5 ms** |
| **10.000 celle, rotazione, con ombre** | 16,8 ms | **4,6 ms** |
| 10.000 celle, transizione di altezza 1,5s | 17,6 ms | 5,9 ms |

**Tempo di aggregazione da punti grezzi**

| Punti | Su scheda video | Su processore |
| --- | --- | --- |
| 10.000 | 46–50 ms | 26–27 ms |
| 27.000 | 44–56 ms | 32–34 ms |
| 100.000 | 38–55 ms | 40–53 ms |

*Nelle prove di aggregazione la camera e' ferma, quindi il valore di 17,7 ms letto sui fotogrammi
non e' un costo: e' la cadenza a riposo. Il numero che conta e' il tempo di aggregazione.*

### Gli esiti

**Il numero di celle e' ininfluente.** Duemila e diecimila costano lo stesso, 4,2 millisecondi.
Conferma e allarga quanto gia' visto in T3.

**Le ombre sono praticamente gratuite: 0,3-0,4 millisecondi**, meno del 10% in piu'. L'alternativa
D3 del piano — rinunciare alle ombre se costano troppo — **non serve**. E' un risultato che vale la
pena sottolineare, perche' le ombre sono cio' che rende percepibile l'altezza da dodici metri.

**Il "respiro" fra oggi e un anno fa funziona e costa 5,9 millisecondi.** La transizione avviene
sugli attributi gia' caricati, senza ricostruire la geometria: nessun intoppo, nessun fotogramma
perso. Il momento piu' scenico del concept e' realizzabile cosi' com'e' descritto.

**L'aggregazione e' molto piu' veloce del previsto: da 26 a 56 millisecondi**, fino a centomila
punti, sia su processore sia su scheda video. Il tempo cresce pochissimo con la quantita': domina
il costo fisso, non i punti.

### Una conseguenza per il concept

Il documento di concept dava per scontato che l'aggregazione fosse un'operazione di preparazione, e
che il raggio delle celle andasse deciso prima della sessione (punti 2.10 e 5.2). **Con
cinquanta millisecondi non e' piu' vero:** il raggio puo' essere un controllo dal vivo sul tablet,
e cambiarlo davanti alla sala sarebbe istantaneo. Vale la pena riaprire quella decisione — e' una
manopola espressiva in piu', non un compromesso.

Anche la scelta fra aggregare su processore o su scheda video e' indifferente a queste quantita':
si puo' tenere quella su processore, che e' piu' semplice e leggermente piu' rapida sotto i
27.000 punti.

### Cosa il test non dice

**La leggibilita' non e' verificata, e a occhio non e' buona.** Con la palette usata qui — scelta
per il test, non progettata — il rilievo si legge come una trama, non come altezza: le celle
disegnano un tappeto invece di un paesaggio. Le ombre da sole non bastano.

Non e' un problema di prestazioni ed era fuori dallo scopo di T4, ma e' la cosa piu' importante
emersa guardandolo: **la resa dipende dalla scala verticale e dalla palette molto piu' che dalla
tecnologia**, ed e' esattamente quello che T9 deve misurare. Da fare presto, perche' se il rilievo
non si legge il concept non regge, e nessuno dei numeri qui sopra conta.

## T9 — leggibilita' a dodici metri

Spostato in cima alle priorita' dopo T4, dove il rilievo funzionava tecnicamente ma si leggeva come
una trama. Qui non si misurano prestazioni: si misura se la cosa si vede.

### Metodo

Due riferimenti fisici, da cui discende tutto il resto:

- il muro e' largo **6 metri su 5760 pixel**, quindi **un pixel vale 1,04 mm**;
- un occhio normale distingue dettagli separati da **circa un minuto d'arco**, che a dodici metri
  corrisponde a **3,5 pixel**. Sotto quella soglia le cose non si sfocano: spariscono.

La pagina `/t9` mostra questi numeri a schermo e li calcola per la dimensione della cella corrente.
Per giudicare l'effetto complessivo, ogni configurazione e' stata catturata a piena risoluzione e
poi **ridotta di venti volte**: guardare l'immagine ridotta equivale, come angolo visivo, a
guardare il muro da dodici metri.

*Limite del metodo:* la riduzione modella la perdita di risolvenza, non il contrasto percepito, la
luce della sala, ne' il fatto che chi guarda puo' spostarsi e mettere a fuoco. Va confermato su uno
schermo grande vero, ma serve gia' a scartare le configurazioni che non hanno speranza.

### Cosa si vede e cosa no

| Configurazione | Cella a schermo | Angolo | A dodici metri |
| --- | --- | --- | --- |
| Scala urbana, celle 3 km | 8 px | 2,4' | **Sparisce.** Una macchia chiara indistinta |
| Scala nazionale, celle 45 km | 14 px | 4,1' | Trama appena percepibile, nessuna struttura |
| Scala statale, celle 14 km | 19 px | 5,8' | La **forma d'insieme** si vede, le differenze interne no |

**Nessuna delle tre e' sufficiente.** Perche' una cella si legga come un oggetto e non come grana
servono almeno dieci minuti d'arco, cioe' **circa 35 pixel**; per leggerla senza sforzo, una
quindicina di minuti, cioe' **una cinquantina di pixel**.

### La conseguenza piu' importante: il limite non e' tecnico, e' percettivo

A 45 pixel per cella, sull'intera superficie del muro **ci stanno circa tremila celle**. Non
diecimila.

E' un risultato che ribalta la lettura di T3 e T4: li' avevamo stabilito che diecimila celle non
costano nulla, e ne avevamo dedotto che potevamo permettercene quante volevamo. **Il vincolo vero
arriva molto prima, e non dalla scheda video: arriva dall'occhio di chi guarda da dodici metri.**
Aggiungere celle oltre le tremila non aggiunge informazione, aggiunge rumore.

### L'altra scoperta: a distanza parla il colore, non l'altezza

Confrontando le palette a parita' di tutto il resto:

- **chiaroscuro** (altezza uguale luminosita'): a dodici metri resta una cupola chiara. Si capisce
  che qualcosa e' rialzato al centro, ma non **quale** area sia alta. Il rilievo diventa un unico
  blocco;
- **caldo-freddo** (altezza uguale tinta): le differenze restano leggibili. Le zone calde si
  staccano da quelle fredde anche nell'immagine ridotta.

E' la scoperta che tocca piu' da vicino il concept. Il documento assegna **l'altezza al potenziale
inespresso e il colore alla performance attuale**. Se a dodici metri l'altezza non trasmette
differenze e la tinta si', allora **la sala sta leggendo la performance, non l'opportunita'** —
cioe' il contrario di quello che volevamo dire.

Non e' una smentita del concept: l'altezza continua a funzionare quando la camera si avvicina, da
chi guarda lo schermo centrale, e sul tablet. Ma la gerarchia va rivista: **l'informazione
principale deve stare nella tinta**, e l'altezza deve rinforzarla invece di portare da sola un
secondo significato.

### Un effetto collaterale dell'esagerazione verticale

Alzando l'esagerazione da 4x a 8x il rilievo **si scurisce invece di risaltare**: le colonne
diventano alte, si vedono soprattutto le facce laterali che sono in ombra, e i piani superiori —
che sono quelli che portano colore e luce — spariscono dietro le colonne davanti. Oltre un certo
punto piu' esagerazione significa meno leggibilita', non piu'.

### Il testo

Dal provino a schermo, sul muro:

| Dimensione | In millimetri | Angolo a 12 m | Giudizio |
| --- | --- | --- | --- |
| 24 px | 25 mm | 7,2' | visibile, faticoso |
| **36 px** | 38 mm | 10,7' | **minimo accettabile** |
| 48 px | 50 mm | 14,3' | comodo |
| 96 px | 100 mm | 28,6' | titoli |

**Nessun testo sotto i 36 pixel sul muro.** E' un numero che si puo' applicare subito alla striscia
di contesto e ai pannelli laterali descritti nel documento dei layout.

### Cosa fare adesso

1. **Rivedere la gerarchia colore/altezza nel concept** alla luce di quanto sopra.
2. **Fissare il numero massimo di celle a schermo attorno a tremila**, e legarlo alla scala invece
   che lasciarlo libero.
3. **Progettare la palette**, che finora e' stata scelta a caso: e' il singolo elemento che decide
   se la sala vede qualcosa.
4. **Confermare su uno schermo grande vero.** Tutto quanto sopra viene da immagini ridotte.

## T5 — archi negozio / hub

Interlacciato, sorgente CARTO, 5760x1080. Misure senza sincronismo, quindi i valori sono il costo
reale di un fotogramma su un budget di 16,7 millisecondi.

| Scenario | Mediana | p95 | Peggiore |
| --- | --- | --- | --- |
| 500 archi statici, rotazione | 2,8 ms | 5,1 ms | 8 ms |
| 5.000 archi statici, rotazione | 2,9 ms | 5,0 ms | 9 ms |
| 50.000 archi statici, rotazione | 5,8 ms | 11,7 ms | 16 ms |
| 500 rotte, flusso animato | 3,6 ms | 5,4 ms | 8 ms |
| 5.000 rotte, flusso animato | 4,0 ms | 7,1 ms | 9 ms |
| **50.000 rotte, flusso animato** | **24,1 ms** | 32,4 ms | 60 ms |
| **500 rotte, flusso, inquadratura ravvicinata** | **4,9 ms** | 8,1 ms | 9 ms |

### Gli esiti

**Il caso reale sta largo.** Cinquecento rotte in flusso animato, viste da vicino e inclinate —
cioe' esattamente quello che il concept descrive — costano 4,9 millisecondi su 16,7. Tre volte il
margine necessario.

**Gli archi statici sono quasi gratuiti fino a cinquantamila.** Da 500 a 5.000 il costo non cambia
(2,8 contro 2,9 ms); a 50.000 sale a 5,8, ancora dentro il budget.

**Il flusso animato ha un tetto, e sta fra cinquemila e cinquantamila rotte.** Il motivo e' nella
struttura: un arco e' due punti, un percorso animato e' ventiquattro. Cinquecento rotte diventano
dodicimila punti e costano nulla; cinquantamila diventano **un milione e duecentomila punti** e
costano 24 millisecondi, fuori budget.

E' un limite che non ci riguarda — il dataset di rete ne ha cinquecento — ma definisce il confine:
**fino a cinquemila rotte il flusso e' sostenibile, oltre va ripensato** riducendo i punti per
percorso o animando solo le rotte della selezione corrente.

### Una correzione alla regola di T9

Il pannello segnala che una linea da 6 pixel occupa 1,8 minuti d'arco a dodici metri, cioe' "al
limite". Eppure, nell'immagine ridotta di venti volte, **il flusso si legge benissimo**: le scie
calde restano nette sul fondo scuro.

La regola di T9 va quindi precisata: **la soglia di un minuto d'arco vale per distinguere due
elementi vicini fra loro, non per accorgersi di un elemento isolato e luminoso su fondo scuro.**
Una linea sottile perde lo spessore apparente ma non scompare, perche' e' lunga e ha molto
contrasto.

E' anche la spiegazione di perche' il rilievo fallisse la prova e il flusso la superi: le celle
devono essere distinte **l'una dall'altra**, gli archi no.

### Nota di resa

Il flusso animato e' il fotogramma piu' efficace prodotto finora in tutta la serie di test. Vale la
pena tenerne conto nella gerarchia del concept, dove la rete di rifornimento e' oggi uno strato di
supporto fra i tanti.

## T6 — punti e costo della selezione

Interlacciato, sorgente CARTO, 5760x1080, misure senza sincronismo.

| Scenario | Mediana | p95 | Peggiore |
| --- | --- | --- | --- |
| 10.000 punti, non toccabili | 4,0 ms | 7,4 ms | 16 ms |
| 10.000 punti, toccabili | 3,8 ms | 7,1 ms | 10 ms |
| **10.000 punti, rilevamento a ogni fotogramma** | **12,8 ms** | 15,7 ms | 18 ms |
| 27.000 punti, non toccabili | 3,7 ms | 7,1 ms | 11 ms |
| 27.000 punti, toccabili | 3,7 ms | 6,9 ms | 11 ms |
| **27.000 punti, rilevamento a ogni fotogramma** | **13,8 ms** | 16,6 ms | 33 ms |
| 100.000 punti, non toccabili | 4,1 ms | 7,6 ms | 11 ms |
| 100.000 punti, toccabili | 4,1 ms | 7,7 ms | 11 ms |
| **100.000 punti, rilevamento a ogni fotogramma** | **14,9 ms** | 34,0 ms | 36 ms |

Costo della singola interrogazione: **8,9 ms** con 10.000 punti, **9,7 ms** con 27.000, **10,6 ms**
con 100.000.

### Gli esiti

**Disegnare i punti e' gratuito, e la quantita' non conta.** Diecimila, ventisettemila e centomila
costano tutti fra 3,7 e 4,1 millisecondi. Anche centomila punti, che sono quattro volte la
produzione dichiarata, non spostano nulla.

**Rendere i punti toccabili non costa niente.** Marcare il layer come interrogabile e' identico a
non farlo: 3,7 contro 3,7. Il costo non sta nella proprieta', sta nell'atto di interrogare.

**Ogni interrogazione costa circa dieci millisecondi, quasi indipendentemente dai dati.** Da 8,9 a
10,6 millisecondi passando da diecimila a centomila punti: la quantita' incide pochissimo. Il
tempo non se ne va nel cercare fra i punti, se ne va nel **disegnare un fotogramma di servizio e
rileggerlo dalla scheda video**, che e' un'operazione sincrona e blocca il resto.

### La conseguenza per il concept

Dieci millisecondi per un tocco singolo sono impercettibili: il gesto "tocco una cella" e' fuori
discussione.

Il problema e' il gesto che il concept chiama **selezione a pennello**: trascinare il dito
estendendo la selezione. Interrogando a ogni fotogramma si arriva a 13-15 millisecondi su un budget
di 16,7, e con centomila punti il p95 va a 34. **Funziona senza margine, e con margine zero in sala
si scatta.**

Ma non serve farlo cosi'. Il concept stesso dice che si trascina **sulle celle**, e che ogni cella
conosce gia' i propri negozi: quale cella stia sotto il dito si ricava **dalla coordinata
geografica con un calcolo**, senza chiedere niente alla scheda video. Il rilevamento grafico serve
per i singoli punti vendita a scala ravvicinata, dove sono poche decine e il gesto e' un tocco
isolato.

Quindi, come indicazione per l'implementazione:

- **tocco singolo**: interrogazione grafica, 10 ms, nessun problema;
- **trascinamento sulle celle**: nessuna interrogazione grafica, si risolve la cella per via
  geometrica;
- **se proprio serve interrogare durante un trascinamento**, va ridotta la frequenza — una volta
  ogni tre o quattro fotogrammi porta il costo medio sotto i tre millisecondi. Non verificato.

### Una nota di leggibilita'

Un punto con raggio 5 pixel occupa, a dodici metri, poco piu' di **tre minuti d'arco**: al limite
della soglia. Conferma per altra via una scelta gia' presente nel concept, cioe' che **i singoli
punti vendita compaiano solo a scala ravvicinata**: da lontano, un negozio singolo non e' un
oggetto che la sala possa vedere.

## T7 — interazioni

Scena realistica: tremila celle estruse sulla mappa, interlacciato, 5760x1080. La pennellata e'
eseguita dalla pagina lungo un percorso fisso — un trascinamento fatto a mano non e' ripetibile e i
due modi non sarebbero confrontabili.

| Modo del pennello | Risoluzione della cella | Fotogrammi, mediana | Minimo osservato |
| --- | --- | --- | --- |
| **geometrico** (dalla coordinata) | **0,01 ms** | 3,3 ms | — |
| **grafico** (interrogando la scena) | **3,76 ms** medi, fino a 7,7 | 2,9 ms | 35,2/s |

Latenza **dal tocco al fotogramma disegnato: 15 ms**.

### Gli esiti

**I due criteri del piano sono rispettati, anche nel modo peggiore.** Il trascinamento resta sopra
i trenta fotogrammi al secondo e la risposta al tocco e' di quindici millisecondi, contro i cento
ammessi. Non c'e' niente da rinegoziare sui gesti.

**La risoluzione geometrica costa quattrocento volte meno**, ed e' la conferma della contromisura
uscita da T6. Ricavare la cella dalla coordinata sono due divisioni e due arrotondamenti:
un centesimo di millisecondo. Interrogare la scena comporta disegnare un fotogramma di servizio e
rileggerlo.

**Ma il numero non e' l'argomento migliore.** Il punto vero e' un altro: **il costo geometrico non
dipende da cosa c'e' in scena, quello grafico si'.** Qui, con tremila colonne, l'interrogazione
costa 3,8 millisecondi; in T6, con centomila punti, ne costava dieci. La via geometrica costera'
un centesimo di millisecondo in qualunque scena futura, con qualsiasi numero di strati accesi.

E' il motivo per cui la sceglierei anche se oggi i numeri fossero equivalenti.

### Il limite della soluzione geometrica

La cella viene risolta come se la maglia fosse rettangolare invece che esagonale: vicino ai vertici
degli esagoni il risultato puo' cadere sulla cella adiacente. Per un pennello che attraversa decine
di celle e' irrilevante — la cella sbagliata di confine viene comunque toccata un istante dopo. Per
un **tocco singolo di precisione** su una cella sola andrebbe raffinato, oppure si usa
l'interrogazione grafica, che per un tocco isolato costa quanto vale.

Ne esce una divisione dei compiti chiara, da portare nell'implementazione:

| Gesto | Come si risolve |
| --- | --- |
| Tocco singolo su una cella | Interrogazione grafica: precisa, e dieci millisecondi una volta sola |
| Trascinamento del pennello | Via geometrica: gratuita e indipendente dalla scena |
| Tocco su un punto vendita a scala ravvicinata | Interrogazione grafica: sono poche decine di oggetti |

## T10 — la sequenza completa

Tutti i pezzi in fila: discesa dal globo, comparsa del rilievo, appiattimento a segnaposto, rete a
stella, e infine la stretta su una sola area. 450 negozi, 5 hub, interlacciato, 5760x1080.

L'area su cui la sequenza si stringe **non e' fissata a mano**: e' quella con il potenziale medio
piu' alto fra i propri negozi. Cosi' il finale indica sempre l'area che merita attenzione in quel
dataset, invece di una scelta arbitraria — che e' poi il comportamento che il concept chiede alle
storie.

Nella stretta finale il movimento della camera e la dissolvenza di tutto il resto avvengono
**insieme**. Se il muro si svuotasse prima, la sala vedrebbe sparire dei dati e poi un viaggio;
cosi' vede una cosa sola, l'attenzione che si restringe. I segnaposto che svaniscono rientrano
anche nel terreno invece di restare in piedi e sbiadire: un segnaposto trasparente ma alto resta
un ingombro.

**Prestazioni: 59,9 fotogrammi al secondo di mediana per tutta la sequenza**, minimo 56,5. Il
precaricamento del corridoio impiega da 4,4 a 8,1 secondi a cache fredda.

### Due incompatibilita' scoperte solo mettendo insieme i pezzi

Nessuna delle due si vedeva nei test singoli, perche' ogni test provava una cosa sola.

**1. Gli archi non esistono sotto la proiezione a globo.** Finche' la mappa dichiara proiezione a
globo, l'integrazione usa una vista sferica, e sotto quella vista l'`ArcLayer` **non viene
disegnato affatto**. Nessun errore, nessun avviso: semplicemente non c'e'. Le colonne invece
reggono.

E' il rischio che T1 indicava come principale per il globo — "quali dei nostri layer sopravvivono
alla proiezione".

**La contromisura prevista era sbagliata.** Il piano diceva di tornare alla proiezione piana appena
atterrati. Provata in tre varianti — alla fine del volo, a meta' volo, con la camera riaffermata
subito dopo — **il passaggio da sfera a piano si vede sempre**.

Il motivo e' il formato del muro: su un'inquadratura larga 5760 pixel il campo visivo orizzontale
e' enorme, e **la curvatura del globo resta percepibile anche a zoom alti**. Su un monitor normale
le due proiezioni si somigliano gia' a zoom 6; su una striscia larga cinque volte l'altezza, no.
Non esiste un momento in cui il cambio non si noti.

**La soluzione e' non cambiare proiezione.** Si resta in globo per tutta la sequenza, e la rete si
disegna con **percorsi invece che con archi**: il `TripsLayer` sotto vista sferica funziona, a
differenza dell'`ArcLayer`. Il problema sparisce invece di essere spostato.

Il cambio di rappresentazione non e' una rinuncia, e' un miglioramento: un arco e' una primitiva
unica, si puo' far comparire o allungare ma non disegnare poco per volta, e allungarlo significa
cambiargli la forma mentre appare. Un percorso con dei tempi si traccia lungo la sua traiettoria
definitiva, che non cambia mai. E' anche la resa giusta per "la merce che arriva".

### Cosa se ne ricava per il concept

- **La sequenza del concept e' realizzabile come descritta**, a sessanta fotogrammi al secondo, con
  tutti gli elementi insieme.
- **L'apertura dal globo e la rete possono coesistere**, a condizione che la rete sia disegnata
  con percorsi e non con archi. Il vincolo non e' sul momento, e' sul tipo di layer.
- **Il formato del muro cambia quali compromessi sono accettabili.** Un passaggio di proiezione
  che su un monitor sarebbe impercettibile, su una striscia larga cinque volte l'altezza si vede.
  Vale la pena verificare ogni transizione alla proporzione reale, non su una finestra qualunque.
- **Vale la regola generale:** i test isolati non trovano le incompatibilita' fra elementi. Ogni
  combinazione nuova di strati va provata insieme prima di darla per acquisita.

### Il cambio di proiezione va fatto a meta' discesa, non alla fine

Cambiando proiezione all'arrivo, la camera si riassesta in modo visibile: a quel punto
l'inclinazione e' gia' a 55 gradi e le due proiezioni la interpretano diversamente. In proiezione
piana il salto non si verifica, il che conferma che e' il passaggio a causarlo.

La discesa e' quindi in due tratti: dal globo fino a zoom 6 con inclinazione zero, li' si passa
alla proiezione piana, poi il secondo tratto porta a destinazione ed e' li' che entra
l'inclinazione. A zoom 6 con inclinazione zero globo e piano coincidono gia' visivamente, e il
passaggio non si vede.

### Cosa resta aperto

- La palette e l'illuminazione sono ancora quelle di prova: la scena e' scura e il rilievo si legge
  meno di quanto potrebbe. Vale quanto detto in T9 — e' la cosa che decide se la sala vede qualcosa.
- Il precaricamento da otto secondi a cache fredda va nascosto dietro il momento del titolo.

## Note tecniche emerse durante la costruzione

Trappole gia' incontrate, annotate perche' si ripresenterebbero a chiunque rifacesse questi test.

**MapLibre riduce da solo la risoluzione oltre 4096 pixel.** Il valore predefinito di
`maxCanvasSize` e' 4096 e 5760 lo supera: la mappa disegna a risoluzione ridotta e lo dichiara solo
in un avviso in console. Senza alzare quel limite si misurerebbe un muro piu' piccolo di quello
vero, credendo il contrario. E' il motivo per cui ogni pagina di test mostra a schermo le
dimensioni reali del buffer.

**Il worker di MapLibre va servito come file statico.** MapLibre costruisce il worker da un blob
che risolve il modulo tramite `import.meta.url`; con il bundler di sviluppo di Next quel percorso
non viene servito come JavaScript, il worker non parte e la mappa resta nera senza errori
evidenti. Risolto copiando worker e modulo condiviso in `public/maplibre` e indicandoli con
`setWorkerUrl`; `scripts/sync-maplibre-worker.mjs` li tiene allineati alla versione installata.

**Non attendere l'assestamento senza un limite di tempo.** Far partire la discesa solo dopo
l'evento di assestamento sembra corretto, ma se le tessere non arrivano quell'evento non si
verifica mai e l'apertura non parte affatto. In sala sarebbe una sessione che si apre su uno
schermo fermo. Ora l'attesa ha un limite di tre secondi e la pagina dichiara se la partenza era
pulita.

**Il contesto WebGL non va invalidato in fase di pulizia** quando il canvas puo' essere riusato:
in sviluppo React monta i componenti due volte e al secondo montaggio si troverebbe un contesto
morto.

## Osservazioni di progettazione emerse

**Il globo occupa una frazione minima di un muro 5,33:1.** A scala planetaria la sfera e'
dimensionata sull'altezza, quindi su 5760x1080 resta una piccola sfera al centro con enormi campi
neri ai lati. La discesa dal globo, cosi' com'e', non riempie il muro. Da decidere: partire piu'
vicino, affiancare altro contenuto durante l'apertura, o accettare il nero come scelta.

**Il formato ultra largo a scala urbana funziona molto bene.** Alla scala d'arrivo, inclinata, la
striscia di citta' e' leggibile e ha una sua forza: e' un fotogramma che vale la pena mostrare.

## Domande ancora aperte al cliente

- [ ] Specifiche della macchina che pilota il muro
- [ ] I tre schermi sono una superficie unica o tre uscite?
- [ ] Browser e versione in sala, avviabile con parametri?
- [ ] La macchina del muro ha accesso a internet durante le sessioni?
- [ ] Possiamo fare una prova sul posto? Quando?
