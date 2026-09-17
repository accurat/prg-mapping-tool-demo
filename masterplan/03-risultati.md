# Risultati

Da riempire durante l'esecuzione. Un test senza il suo contesto di misura non vale niente: la
macchina va indicata **ogni volta**.

## Macchine di prova

| Sigla | Macchina | CPU | GPU | Sistema | Browser |
| --- | --- | --- | --- | --- | --- |
| M1 | | | | | |
| M2 | | | | | |
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
