# Le alternative

Organizzate per **causa del fallimento**, non per tecnologia: quando un test va male, si entra dalla
sezione corrispondente.

Regola generale: si scende di un gradino per volta. Cambiare tutto lo stack al primo problema è
quasi sempre la reazione sbagliata, perché il collo di bottiglia più probabile è la risoluzione, e
la risoluzione non cambia cambiando libreria.

---

## Se il collo di bottiglia è la risoluzione (T0 fallisce)

Il caso in cui anche una scena vuota fatica. Il problema è il numero di pixel, e nessuna libreria
lo risolve.

**A1 — Disegnare a risoluzione ridotta e ingrandire.**
Si disegna internamente a una frazione della risoluzione e si lascia che sia lo schermo a
ingrandire. Dimezzando si dividono i pixel per quattro.
*Costo:* bordi meno nitidi. Su un muro guardato da dodici metri incide molto meno che su un
monitor da scrivania, e vale la pena verificarlo prima di scartarlo.
*È il primo gradino da provare, sempre.*

**A2 — Ridurre il contenuto, non i pixel.**
Stile della mappa più povero, meno etichette, niente terreno, nessuna ombra. Spesso basta.

**A3 — Tre istanze da 1920.**
Una per schermo, con camere sfalsate (vedi T8).
*Costo:* sincronizzazione difficile, tre volte il consumo di memoria, e il rischio di sfasamento
visibile alle giunzioni. Da tenere come ripiego serio, non come scelta di partenza.

**A4 — Hardware.**
Se il muro è pilotato da una macchina inadeguata, la risposta giusta può essere una scheda video,
non un ripiego tecnico. Va detto al cliente con dei numeri in mano, e questi test servono anche a
produrre quei numeri.

---

## Se il collo di bottiglia è la mappa base (T2 fallisce)

**B1 — Stile minimale fatto da noi.**
Gli stili standard contengono decine di livelli che non useremo mai. Uno stile ridotto all'osso —
costa, confini, poche etichette — può valere più di qualsiasi ottimizzazione.
*Nel nostro caso è anche esteticamente desiderabile:* il concept vuole una base scura e a basso
contrasto che non competa con il rilievo.

**B2 — Cambiare sorgente delle tessere.**
Prima di cambiare libreria, va cambiata la sorgente dei dati: fra un servizio in rete e un file
servito da noi la differenza può essere enorme, sia in fluidità sia in affidabilità.
**Una sorgente servita da noi elimina anche la dipendenza dalla rete della sala**, che è un rischio
di installazione oltre che di prestazioni.

**B2bis — Mapbox al posto di MapLibre.**
Il percorso inverso rispetto alla scelta di partenza. Ha senso solo se emergono limiti concreti:
una funzione che ci serve e che MapLibre non ha, oppure una differenza di prestazioni misurata.
*Costo:* torna la dipendenza dal token e dal conteggio delle chiamate.

**B3 — Tessere raster invece di vettoriali.**
Una base raster è molto più leggera da disegnare perché non c'è geometria da comporre a ogni
fotogramma.
*Costo:* niente inclinazione fluida della base, niente etichette che si riorientano. Da valutare
solo se serve davvero.

**B4 — Nessuna mappa base.**
Il fondale diventa un contorno geografico disegnato da noi — stati, coste — sopra il nero.
*Non è una rinuncia estetica:* il concept dice che la base dev'essere scura e discreta. È possibile
che la mappa più bella sia anche la più economica. **Vale la pena provarla presto**, non solo come
ripiego.

---

## Se il collo di bottiglia è deck.gl sopra la mappa (T3 fallisce)

**C1 — Sovrapposto invece di interlacciato.**
Se è l'interlacciato a costare, si usa il sovrapposto. Si perde solo la capacità di nascondere i
nostri oggetti dietro elementi della mappa, che a noi non serve.

**C2 — Solo Mapbox nativo, niente deck.gl.**
Il rilievo si può fare con l'estrusione nativa della mappa: si generano gli esagoni come geometrie
e si estrudono in base a un attributo. È lo stesso meccanismo degli edifici 3D, ed è molto
efficiente.
*Cosa si perde:* gli archi in 3D, che nativamente non esistono, e la comodità di aggregazione.
*Cosa si guadagna:* un solo motore di rendering, un contesto grafico unico, nessuna
sincronizzazione fra camere.
**È l'alternativa più seria di tutte** e va tenuta sul tavolo fino alla fine. Se gli archi si
possono ottenere in altro modo, questa strada è più semplice e più solida.

**C3 — Gli archi come geometrie piane animate.**
Se ci serve solo l'*effetto* di flusso dall'hub al negozio, una linea curva con un'animazione di
scorrimento può bastare, senza vera geometria tridimensionale.
Da valutare guardando i due risultati affiancati: la differenza percepita a dodici metri potrebbe
essere nulla.

---

## Se la discesa dal globo non regge (T1 fallisce)

**G1 — Passare al piano prima di mostrare i nostri contenuti.**
Nel concept il globo serve solo all'apertura, quando sullo schermo non c'è ancora niente di nostro.
Se il problema è che i nostri layer non sopravvivono alla proiezione a globo, basta far avvenire il
cambio di proiezione prima che il rilievo compaia.

**G2 — Partire dal continente invece che dal globo.**
Una discesa da scala continentale a scala urbana resta un movimento efficace e non attraversa
nessun cambio di proiezione. Si perde il fotogramma iniziale del pianeta, che è bello ma non
indispensabile.

**G3 — Discesa pre-renderizzata.**
Venti secondi di filmato, con passaggio alla scena interattiva all'atterraggio. Accettabile perché
in quel momento nessuno interagisce.
*Costo:* l'atterraggio non può più essere deciso dai dati del giorno, a meno di pre-renderizzare
una discesa per ciascuna delle aree possibili. Si perde una delle idee del concept, non una
funzione.

---

## Se il collo di bottiglia sono le colonne (T4 fallisce)

**D1 — Aggregare in preparazione, mai a runtime.**
È già quello che dice il concept: le celle si calcolano una volta al caricamento. Se T4b è lento,
la conseguenza è solo che il raggio delle celle non può essere un controllo dal vivo.

**D2 — Meno celle, con livelli di dettaglio.**
Celle grandi a scala nazionale, più fitte avvicinandosi, e in nessun momento più di qualche
migliaio a schermo. È anche il comportamento giusto dal punto di vista della lettura.

**D3 — Rinunciare alle ombre.**
Sono probabilmente la voce più cara. Il rilievo resta leggibile con un'illuminazione semplice e una
differenza di colore fra le facce, senza ombre proiettate.
*Da verificare con T9:* se senza ombre l'altezza non si legge da dodici metri, allora le ombre
sono un requisito e va tagliato altro.

**D4 — Transizione più corta o a gradini.**
Se il "respiro" temporale scatta, si può accorciare, oppure farlo avvenire per gruppi di celle
invece che tutto insieme — il che tra l'altro è anche più leggibile.

---

## Se niente di tutto questo basta

**E1 — Rendering personalizzato con three.js.**
Scena tridimensionale costruita da noi, con la mappa come texture sul piano di base.
*Costo:* moltissimo lavoro, si riscrive la proiezione geografica, la gestione delle tessere,
l'interazione. *Guadagno:* controllo totale e nessuno strato di astrazione da pagare.
Ha senso solo se i test dimostrano che gli strati intermedi sono il problema, il che è improbabile.

**E2 — Momenti cinematografici pre-renderizzati.**
La discesa dal globo e altre transizioni scenografiche diventano filmati, con passaggio alla scena
interattiva al termine.
*È un ripiego accettabile per l'apertura* — sono venti secondi in cui nessuno interagisce — e
inaccettabile per tutto il resto, perché un tool che non risponde non è un tool.

**E3 — Ridurre l'ambizione, non la qualità.**
Se il rilievo in 3D non è sostenibile, l'alternativa non è farlo male: è cambiare rappresentazione.
Il potenziale inespresso si può rendere con dimensione e intensità in 2D, che è meno spettacolare
ma perfettamente leggibile — e resta comunque un salto rispetto al tool attuale.
**Questa opzione va tenuta viva fino alla fine dei test**, perché è l'unica che garantisce di avere
comunque un prodotto da proporre.

---

## Cosa non è un'alternativa

- **Ridurre il dataset.** Il numero di negozi è quello che è, e anzi cresce.
- **Presentare su un solo schermo.** Il muro è il contesto, non una variabile.
- **Rinunciare al touch.** È il modo in cui si usa la sala.
