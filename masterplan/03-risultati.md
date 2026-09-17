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
