# Ontwikkelplan: open-source AI Meeting Assistant

Basis: fork van OpenWhispr (MIT). Twee hoofdaanpassingen: lokale spraakherkenning met Orukeet en externe LLM-verwerking via Azure AI Foundry of een andere OpenAI-compatible provider.

## Gewenste architectuur

Desktopapp (macOS Apple Silicon en Windows, Electron + React). Lokale audio-opname van microfoon en optioneel systeemaudio. sherpa-onnx met Orukeet INT8, volledig lokaal. Transcript en sprekers. LLM-taken via Azure AI Foundry of OpenAI-compatible: samenvattingen, notulen, besluiten, actiepunten, AI-chat. Lokale SQLite-database voor vergaderingen, transcripten, sprekers, notulen en chatgeschiedenis.

Audio en transcripties worden lokaal opgeslagen. Alleen tekst die nodig is voor een samenvatting of chatvraag wordt naar de gekozen LLM-provider verstuurd. De LLM zelf draait niet lokaal.

## Fases en acceptatie

**Fase 1. Forken en vereenvoudigen.** Behoud desktopinterface, opname, meetinghistorie, notities, sprekerherkenning en lokale database. Verwijder of schakel cloudsync, accounts, teamruimtes, betaalfuncties en overbodige spraakproviders uit. Acceptatie: beide builds starten zonder OpenWhispr-cloudaccount en kunnen een gesprek lokaal opslaan.

**Fase 2. Orukeet als vaste engine.** Gebruik de sherpa-onnx-integratie, gepinde INT8-modelbestanden, downloads en checksums. Orukeet is de standaard en eventueel enige zichtbare engine. Live-opname en geïmporteerde audio gebruiken het model. Sprekerherkenning blijft afzonderlijke verwerking. Acceptatie: dezelfde Nederlandstalige testopname wordt op macOS en Windows lokaal verwerkt, zonder netwerkverkeer tijdens de transcriptie.

**Fase 3. Azure Foundry en OpenAI-compatible API.** Eén uniforme LLM-provider met configureerbare base URL, deployment- of modelnaam en authenticatie. Azure OpenAI v1 (Responses API) en generieke Chat Completions. API-keys in de beveiligde opslag van het besturingssysteem, niet in SQLite of gewone configuratiebestanden. Verbindingstest, foutafhandeling, tokenlimieten en streaming. Acceptatie: samenvattingen werken met een Azure Foundry-deployment en met ten minste één andere OpenAI-compatible provider.

**Fase 4. Gestructureerde notulen.** Samenvatting, bespreekpunten, besluiten en actiepunten met verantwoordelijke en deadline, voor zover daadwerkelijk genoemd. JSON-uitvoer valideren, resultaten gescheiden van het transcript opslaan, hergenereren met een ander model mogelijk. Acceptatie: resultaten zijn bewerkbaar, opnieuw te genereren en te exporteren als Markdown.

**Fase 5. AI-chat over vergaderingen.** Chat voor de huidige en voor meerdere historische vergaderingen. SQLite FTS5 voor relevante transcriptpassages, alleen die passages als context naar de LLM, met bronverwijzingen (vergadering, spreker, tijdstempel). Vector search is een latere uitbreiding. Acceptatie: vragen als "Wat hebben we vorige week over project X besloten?" leveren een antwoord met controleerbare bronpassages.

**Fase 6. Testen en distribueren.** Vergaderingen met meerdere sprekers, lange opnamen, microfoonrechten, offline transcriptie, taalherkenning, crashherstel. Installers, native dependencies, modellicenties. Acceptatie: installers en een volledige opname-tot-chat-test op Windows en macOS.

## Besluiten van de gebruiker

- Orukeet-model: download bij eerste start, met SHA-256-controle. De modellicentie CC BY-SA 4.0 is akkoord.
- Entra ID: niet in v1, alleen API-key.
- Dicteren en assistent blijven, lokaal. AI-opschoning van dictaat staat standaard uit.
- Alleen Apple Silicon en Windows x64. Intel valt af.
- Geen account, geen cloud. De app moet volledig losgekoppeld zijn van OpenWhispr-diensten. Een uit-schakelaar in de code is daarvoor voldoende; de code hoeft niet fysiek verwijderd te worden. Modeldownloads en het zelfgekozen LLM-endpoint blijven het enige externe verkeer.
