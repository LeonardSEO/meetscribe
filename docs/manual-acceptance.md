# Handmatige acceptatie

Deze controles vragen een persoon met echte vergaderingen en echte accounts. Ze zijn **niet uitgevoerd** door de geautomatiseerde eindcontrole (zie `.superpowers/sdd/2026-11-10-meeting-assistant/task-13-report.md`). Vink af wat je gedaan hebt en noteer datum, platform en build.

Platformen: macOS Apple Silicon (macOS 15.5 of nieuwer) en Windows x64. Gebruik een schone gebruikersmap per installatie.

## Matrix

| # | Scenario | macOS arm64 | Windows x64 |
|---|---|---|---|
| 1 | Schone installatie vraagt geen account; Orukeet wordt gedownload met SHA-256-controle | [ ] | [ ] |
| 2 | Vergadering met meerdere sprekers: sprekers worden na afloop onderscheiden | [ ] | [ ] |
| 3 | Opname van minstens 60 minuten blijft stabiel (geheugen, geen verlies van tekst) | [ ] | [ ] |
| 4 | Geweigerde microfoonrechten: duidelijke melding, geen crash, rechtenuitleg werkt | [ ] | [ ] |
| 5 | Transcriptie offline (netwerk uit): opnemen, transcriberen en lokaal terugvinden lukt | [ ] | [ ] |
| 6 | Nederlands en Engels door elkaar in één vergadering | [ ] | [ ] |
| 7 | App geforceerd afsluiten tijdens opname, daarna herstellen: opname en tekst tot dat punt zijn terug | [ ] | [ ] |
| 8 | Opname-tot-chat van begin tot eind: opnemen, transcript, notulen, vraag stellen, bronnen controleren | [ ] | [ ] |
| 9 | Met netwerk aan gaat alleen verkeer naar het ingestelde LLM-endpoint (controle met een proxy of netwerkmonitor) | [ ] | [ ] |
| 10 | Model ontbreekt of download is corrupt: melding, opname blijft bewaard, geen terugval op cloud | [ ] | [ ] |

## Bekende punten om in de matrix te beoordelen

- Live transcriptie knipt audio om de 5 seconden zonder overlap. Woorden op een grens kunnen wegvallen. Beoordeel dit bij scenario 3 en 6 voordat je het aanpakt.
- De diarization-modellen worden bij de eerste start van GitHub gedownload, zonder checksum. Mislukt dat, dan werkt transcriptie, maar zonder sprekers na afloop. Controleer dit bij scenario 2.

## Acceptatiechecks per fase die niet zijn uitgevoerd

- [ ] **Nederlandse opname offline** op macOS en op Windows: opnemen, transcriberen en terugvinden zonder netwerk.
- [ ] **Samenvatting en notulen op Azure Foundry** en op minstens één andere OpenAI-compatibele provider, met een echte key.
- [ ] **Notulen**: bewerken, opnieuw genereren en als Markdown exporteren. Zonder geldige configuratie blijven transcript en bestaande notulen onaangeroerd en wijst de melding naar Instellingen.
- [ ] **Chat over eerdere vergaderingen**: de vraag "wat hebben we vorige week besloten over project X?" geeft een antwoord met controleerbare bronnen (genummerde passages met vergadering, spreker en tijd). Een vraag zonder treffer geeft een duidelijke "niets gevonden".
- [ ] **Windows-build** (`npm run build:local:win`) op een Windows-machine, installeren op een schone gebruikersmap.
- [ ] **Ondertekende installers**: blijft open zolang er geen eigen certificaten zijn. Eigen signing en een eigen update-feed zijn later configuratie plus het weghalen van de updater-guard.

## Niet in scope

Een Nederlandse app-interface, Entra ID en vectorzoekopdrachten voor de passage-index.
