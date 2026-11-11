# Handmatige acceptatie

Deze controles vragen een persoon met echte vergaderingen en echte accounts. Ze zijn **niet uitgevoerd** door de geautomatiseerde eindcontrole. Vink af wat je gedaan hebt en noteer datum, platform en build.

Platformen: macOS Apple Silicon (macOS 15.5 of nieuwer) en Windows x64. Gebruik een schone gebruikersmap per installatie.

## Matrix

| #   | Scenario                                                                                                        | macOS arm64 | Windows x64 |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------- | ----------- |
| 1   | Schone installatie vraagt geen account; Orukeet wordt gedownload met SHA-256-controle                           | [ ]         | [ ]         |
| 2   | Vergadering met meerdere sprekers: sprekers worden na afloop onderscheiden                                      | [ ]         | [ ]         |
| 3   | Opname van minstens 60 minuten blijft stabiel (geheugen, geen verlies van tekst)                                | [ ]         | [ ]         |
| 4   | Geweigerde microfoonrechten: duidelijke melding, geen crash, rechtenuitleg werkt                                | [ ]         | [ ]         |
| 5   | Transcriptie offline (netwerk uit): opnemen, transcriberen en lokaal terugvinden lukt                           | [ ]         | [ ]         |
| 6   | Nederlands en Engels door elkaar in één vergadering                                                             | [ ]         | [ ]         |
| 7   | App geforceerd afsluiten tijdens opname, daarna herstellen: opname en tekst tot dat punt zijn terug             | [ ]         | [ ]         |
| 8   | Opname-tot-chat van begin tot eind: opnemen, transcript, notulen, vraag stellen, bronnen controleren            | [ ]         | [ ]         |
| 9   | Met netwerk aan gaat alleen verkeer naar het ingestelde LLM-endpoint (controle met een proxy of netwerkmonitor) | [ ]         | [ ]         |
| 10  | Model ontbreekt of download is corrupt: melding, opname blijft bewaard, geen terugval op cloud                  | [ ]         | [ ]         |

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

## Rebrand naar Meetscribe

- [ ] **Bestaande data**: start Meetscribe op een computer met een `OpenWhispr`-datamap (macOS: `~/Library/Application Support/OpenWhispr`, Windows: `%APPDATA%\OpenWhispr`). Notities, notulen, instellingen en audio zijn er; de oude map is verplaatst naar `Meetscribe`.
- [ ] **Oude app draait nog**: met OpenWhispr open start Meetscribe zonder de oude map te verplaatsen; na het sluiten van OpenWhispr verplaatst de volgende start de map alsnog.
- [ ] **Sleutelhanger**: macOS vraagt eenmalig of Meetscribe de sleutelhanger mag gebruiken. Na weigeren start de app, vraagt Instellingen om de Foundry-key en crasht niets.
- [ ] **Namen**: Dock, menubalk, venstertitel en de permissiedialogen (microfoon, systeemaudio, agenda, toegankelijkheid) tonen Meetscribe. Audio MIDI Setup toont tijdens een opname "Meetscribe Audio Tap".
- [ ] **Permissies opnieuw**: door de nieuwe bundle-ID (`com.meetscribe.app`) vraagt macOS microfoon, systeemaudio, agenda en toegankelijkheid opnieuw.
- [ ] **Windows**: installer, Startmenu en Taakbeheer tonen Meetscribe. Een oude OpenWhispr-installatie verwijder je zelf via Instellingen → Apps.

## Niet in scope

Een Nederlandse app-interface, Entra ID en vectorzoekopdrachten voor de passage-index.
