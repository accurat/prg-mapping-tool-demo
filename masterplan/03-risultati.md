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

## Domande ancora aperte al cliente

- [ ] Specifiche della macchina che pilota il muro
- [ ] I tre schermi sono una superficie unica o tre uscite?
- [ ] Browser e versione in sala, avviabile con parametri?
- [ ] La macchina del muro ha accesso a internet durante le sessioni?
- [ ] Possiamo fare una prova sul posto? Quando?
