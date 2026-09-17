# I test

Si parte da zero dentro questo progetto. Nessun dataset reale, nessuna interfaccia: ogni test è una
pagina isolata che fa una cosa sola e la misura.

Formato fisso: **domanda → cosa si costruisce → cosa si misura → quando è promosso → se fallisce**.

---

# Blocco A — Impianto e mappa

La libreria di base di partenza è **MapLibre**: sorgente aperta, nessun token, stessa famiglia di
Mapbox e quindi interfaccia molto simile, supportata da deck.gl allo stesso modo. Mapbox resta
disponibile come alternativa se emergono limiti (vedi `02-alternative.md`).

---

## T0 — L'impianto

**Domanda.** Il progetto disegna davvero 5760×1080, e quanto costa farlo a vuoto?

**Cosa si costruisce.** L'ossatura che useranno tutti i test successivi:

- una pagina che rende un canvas dimensionato a 5760×1080, con il contenitore scalato otticamente
  per stare nello schermo del portatile;
- rapporto pixel forzato a 1;
- un contatore di fotogrammi permanente, con mediana e minimo su una finestra mobile;
- **una scritta a schermo con le dimensioni reali del buffer di disegno**, letta dal canvas e non
  dichiarata a mano;
- una scena banale — un fondo che cambia colore — per avere il costo della sola superficie.

**Cosa si misura.** Fotogrammi a vuoto a 5760×1080, e gli stessi a 1920×1080 per il rapporto.

**Quando è promosso.** Scena vuota stabile a 60/s, e il buffer dichiarato è davvero 5760×1080.

**Se fallisce.** Il collo di bottiglia è il numero di pixel, non il contenuto: si va direttamente
alle alternative sulla risoluzione prima di provare qualsiasi cosa in tre dimensioni.

**Perché è il primo.** Non è un test del prodotto, è la bilancia. Tutti i numeri successivi si
leggono in rapporto a questo, e la scritta con le dimensioni del buffer evita l'errore più
probabile di tutta la serie: misurare una finestra piccola convinti di misurare il muro.

---

## T1 — La discesa su una città

**Il test che decide se ha senso continuare.** Concentra in venti secondi quasi tutti i rischi:
cambio di scala estremo, caricamento delle tessere sotto stress, eventuale cambio di proiezione,
movimento di camera continuo — tutto a 5760×1080.

**Domanda.** Si scende da lontano fino a scala stradale su una città qualunque, in modo continuo e
senza che l'immagine si sfaldi?

**Cosa si costruisce.** Una mappa MapLibre a tutto schermo, stile scuro, e un movimento di camera
ripetibile con un tasto, con durata regolabile (3, 6, 12 secondi). Tre partenze da confrontare:

- **1a — dal globo**, se la versione di MapLibre in uso supporta la proiezione a globo: si parte dal
  pianeta intero e si attraversa il passaggio a proiezione piana;
- **1b — da scala continentale**, senza alcun cambio di proiezione;
- **1c — da scala statale**, la discesa breve che useremo più spesso durante una sessione.

Arrivo: scala stradale su una città a caso — Kansas City va bene, è quella che usiamo negli esempi.

**Cosa si misura.**

| Cosa | Perché |
| --- | --- |
| Fotogrammi durante la discesa | La metrica ovvia |
| **Come si comportano le tessere** | Il rischio vero, vedi sotto |
| Stacco al cambio di proiezione | Solo in 1a. Si vede? A che altezza avviene? |
| Tempo di assestamento all'arrivo | Quanto passa fra la fine del movimento e l'immagine definitiva |
| Differenza fra le tre durate | Una discesa lenta è più facile da reggere di una rapida |

**Il rischio vero non sono i fotogrammi, sono le tessere.** Scendendo dal pianeta a una strada si
attraversano una quindicina di livelli di zoom, e le tessere arrivano dalla rete in modo
asincrono. Il pericolo non è che scatti: è che l'immagine appaia **sfocata, a blocchi, o si
ricomponga a pezzi durante il volo** — e su un muro di sei metri quell'effetto è molto più
evidente che su un portatile.

Va quindi osservato a occhio, non solo misurato, e va annotato *dove* nella discesa il degrado si
manifesta.

**Quando è promosso.** La discesa è continua, senza stacchi percepibili, sopra i 30/s per tutta la
durata, e l'immagine resta accettabile durante il volo — non solo all'arrivo.

**Se fallisce.** Dipende da cosa fallisce, e le risposte sono diverse:

- *scattano i fotogrammi* → problema di rendering, si legge insieme a T0;
- *le tessere non tengono il passo* → discesa più lenta, precaricamento delle tessere lungo il
  percorso, oppure una base più leggera (vedi `02-alternative.md`);
- *il cambio di proiezione si vede* → si parte da scala continentale e si rinuncia al pianeta;
- *niente di tutto ciò basta* → la discesa d'apertura si pre-renderizza.

**Nota sulle sorgenti delle tessere.** MapLibre non porta con sé dei dati di mappa: serve scegliere
una sorgente. Vale la pena provarne almeno due, perché incidono molto sul risultato di questo test:
una sorgente in rete e una **servita da noi**. La seconda è rilevante oltre il test — una
installazione in una sala cliente con rete limitata non dovrebbe dipendere da un servizio esterno
per funzionare.

---

## T2 — Il costo della mappa base

**Domanda.** Quanto costa la mappa a questa risoluzione, e quanto costa **ogni singola funzione**?

**Cosa si costruisce.** Una mappa a tutto schermo in varianti misurate separatamente: stile scuro
minimale, stile completo con etichette, con rilievo del terreno, con edifici in 3D. Le ultime due
richiedono sorgenti dati apposite: se non sono facilmente disponibili, si saltano e si annota il
motivo — nel nostro concept non servono.

**Cosa si misura.** Fotogrammi durante pan, zoom continuo, rotazione e inclinazione, per ciascuna
variante.

**Quando è promosso.** Interazione ≥ 55/s con stile minimale e inclinazione alta.

**Perché le varianti separate.** Serve il costo di ogni funzione, non il totale: se il terreno costa
dieci fotogrammi e a noi non serve, è un'informazione che vale quanto un'intera ottimizzazione.

**Nota.** L'inclinazione alta è il caso peggiore — più territorio entra nell'inquadratura, più
geometria e più tessere. Va misurata inclinata, non dall'alto.

**Questo test è anche la nostra taratura**: il valore della variante minimale è il numero a cui
rapportare tutto quello che aggiungeremo sopra nel blocco B.

---

# Blocco B — Il 3D e le interazioni

## T3 — deck.gl sopra MapLibre: sovrapposto o interlacciato

**Domanda.** Le due modalità di integrazione costano diversamente, e quanto?

**Cosa si costruisce.** Lo stesso contenuto — qualche migliaio di colonne esagonali — montato in due
modi: deck.gl come tela separata sopra la mappa con le camere sincronizzate, oppure i suoi layer
dentro il contesto di rendering di MapLibre.

Prima di tutto va verificato che l'integrazione con MapLibre funzioni in entrambe le modalità: è il
punto in cui la scelta di MapLibre al posto di Mapbox potrebbe costare qualcosa, ed è meglio
saperlo subito.

**Cosa si misura.** Fotogrammi nelle due modalità, più una verifica funzionale: nella modalità
interlacciata, una colonna dietro un edificio deve risultare correttamente nascosta.

**Quando è promosso.** Almeno una delle due rispetta i criteri.

**Cosa ci facciamo.** L'interlacciato serve solo se vogliamo che i nostri oggetti si nascondano
dietro elementi della mappa, e **a noi non servono edifici**. Se costa di più, il sovrapposto è la
scelta giusta e non perdiamo niente.

---

## T4 — Le colonne esagonali (il rilievo)

Il test più importante della serie: è la vista principale del prodotto.

**T4a — Celle pre-aggregate.**
Colonne già calcolate, fornite come dati pronti, in tre quantità: 500, 2.000, 10.000. Fotogrammi in
interazione con inclinazione alta.
È lo scenario reale: nel concept l'aggregazione avviene una volta al caricamento.

**T4b — Aggregazione a runtime.**
Lo stesso partendo da 10.000 e 27.000 punti grezzi, lasciando aggregare alla libreria. Qui la cosa
da misurare **non sono i fotogrammi ma il tempo**: quanto passa fra il cambio di parametro e il
rilievo aggiornato.
Serve a decidere se il raggio delle celle può essere un controllo dal vivo o va deciso in
preparazione.

**T4c — Transizione di altezza.**
Le stesse celle che cambiano altezza in circa un secondo e mezzo: è il "respiro" fra un anno fa e
oggi. Verificare che la transizione avvenga sugli attributi già caricati e non ricostruendo tutto.
È il momento più scenico del concept: se qui scatta, perdiamo l'effetto migliore che abbiamo.

**T4d — Ombre.**
Le stesse colonne con illuminazione e ombre proiettate. Nel concept le ombre non sono decorazione:
sono ciò che rende percepibile l'altezza da dodici metri. Vanno misurate a parte perché sono fra le
cose più care in assoluto.

**Quando è promosso.** 4a e 4c entro i criteri a 2.000 celle con ombre attive. 4b sotto i due
secondi.

---

## T5 — Gli archi negozio ↔ hub

**Domanda.** Quanti archi reggiamo, e quanto costa animarli?

**Cosa si costruisce.** Archi fra coppie di coordinate in tre quantità — 500 (la dimensione reale
del dataset di rete), 5.000, 50.000 — prima statici, poi con animazione di scorrimento lungo
l'arco.

**Cosa si misura.** Fotogrammi, statici e animati, a inclinazione alta e bassa.

**Quando è promosso.** 500 archi animati senza cali. È la quantità che ci serve davvero; il resto
serve solo a sapere quanto margine abbiamo.

**Nota.** Con 500 archi reali questo test dovrebbe passare largamente. Se non passa, il problema sta
altrove — nella risoluzione o nell'integrazione — e va riletto insieme a T0 e T3.

**Da provare anche a scala ravvicinata.** Nel concept gli archi compaiono quando si parla di un'area
specifica, quindi il caso reale è pochi archi visti da vicino e inclinati, non cinquantamila visti
dall'alto.

---

## T6 — I punti, e il costo della selezione

**Domanda.** 27.000 punti si disegnano, e quanto costa poterli toccare?

**Cosa si costruisce.** Punti sparsi in tre quantità — 10.000, 27.000, 100.000 — prima senza
interazione, poi con il rilevamento del tocco attivo.

**Cosa si misura.** La differenza fra le due condizioni. Il rilevamento del tocco comporta un
passaggio di rendering aggiuntivo: è un costo reale e va isolato.

**Quando è promosso.** 27.000 punti con rilevamento attivo entro i criteri.

**Perché conta.** Nel concept i punti singoli compaiono solo a scala ravvicinata, quindi non ne
disegneremo mai 27.000 insieme. Questo test serve a sapere quanto possiamo permetterci di essere
pigri, non a validare uno scenario reale.

---

## T7 — Le interazioni

**Domanda.** I gesti previsti dal concept sono realizzabili e restano fluidi?

**Cosa si costruisce.** Sopra la scena di T4a, l'insieme dei gesti:

| Gesto | Cosa verificare |
| --- | --- |
| Pan, zoom, inclinazione, rotazione | Fluidità continua, non a scatti |
| Volo verso un punto | Movimento continuo, durata controllabile |
| Tocco su una cella | Latenza dal tocco all'evidenziazione |
| **Trascinamento con selezione continua** | Il caso peggiore: rilevamento a ogni fotogramma |
| Cambio di livello legato allo zoom | Passaggio fra granularità diverse senza stacco |

**Quando è promosso.** Il trascinamento con selezione continua resta sopra i 30/s e la risposta al
tocco sta sotto i 100 ms.

**Perché il trascinamento è il caso peggiore.** È l'unico gesto che richiede di interrogare la scena
a ogni fotogramma mentre la scena si sta anche ridisegnando. Se regge quello, reggono tutti.

---

# Blocco C — La sala

## T8 — Tre schermi

**Domanda.** Un canvas da 5760, o tre da 1920?

**Cosa si costruisce.** La stessa scena in due configurazioni: una finestra da 5760×1080, e tre
finestre da 1920×1080 con camere sfalsate che compongono la stessa inquadratura.

**Cosa si misura.** Fotogrammi nelle due configurazioni, e soprattutto **l'allineamento**: nella
versione a tre finestre il contenuto deve combaciare esattamente alle giunzioni durante
l'interazione, non solo da fermo.

**Quando è promosso.** Almeno una delle due funziona.

**Da eseguire solo dopo** aver saputo come sono collegati gli schermi in sala. Se il muro è già una
superficie unica per il sistema operativo, la versione a tre finestre resta un ripiego teorico.

**Avvertenza.** Sincronizzare tre istanze indipendenti è difficile: un fotogramma di sfasamento fra
due schermi adiacenti si vede e dà fastidio. Non è una strada da imboccare a cuor leggero.

---

## T9 — Leggibilità a distanza

**Domanda.** Le dimensioni che stiamo ipotizzando si leggono davvero da dodici metri?

**Cosa si costruisce.** Una pagina statica con testo, celle e colonne a dimensioni crescenti, da
proiettare e guardare da lontano.

**Cosa si misura.** Niente di automatico: si guarda e si annota. Dimensione minima leggibile di
testo, dimensione minima di cella distinguibile, e **differenza di altezza minima percepibile fra
due colonne adiacenti**.

**Perché vale la pena.** Non è un test di prestazioni, costa quasi nulla e produce i numeri che
serviranno a disegnare tutto il resto. L'ultimo dato è quello che determina quanto va amplificato
il rilievo, cioè un parametro che nel concept abbiamo lasciato aperto.
