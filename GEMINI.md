# WEB_PhotoVerify

## Project Mandates
- **Purpose:** Web and ChromeApp variant of the PhotoVerify ecosystem.
- **Scope:** Browser-based forensics, PWA support, and cloud-independent local processing.
- **Master Copy:** Orchestrated by Meta_PhotoVerify.
- **Tech Stack:** React 19, TypeScript 5, Vite, PWA.

## Context-Aware Orchestration Rule
- **Location Independence:** Het maakt niet uit in welke projectmap de gebruiker of AI zich bevindt. De AI MOET uit de context van het verzoek afleiden welk project (Meta, Android, iOS of Web) gewijzigd of gebouwd moet worden.
- **Routing:** Wijzigingen aan core-logica worden ALTIJD in `Meta_PhotoVerify` gedaan. Wijzigingen aan platform-specifieke bridges worden in het bijbehorende platform-project gedaan.
- **Syncing:** Na een wijziging moet de AI automatisch de git commit en push verzorgen voor de *gewijzigde* repository.
- **Explicit Context Formatting:** Elke reactie MOET beginnen EN eindigen met de projectnaam in HOOFDLETTERS tussen haakjes met sterretjes, exact zoals: <****PROJECTNAAM****>.
- **Explicit Context:** Bij elk antwoord moet de AI expliciet vermelden op welk project de actie betrekking heeft.

## Feature & Bugfix Protocol (Color-Coded)
- **Nieuwe Feature:**
  - **Groen:** Minor (Code only, no design/arch impact).
  - **Oranje:** Design impact (Functional/Technical), but Logical Architecture remains stable.
  - **Rood:** Major impact (Redesign, Meta-implications, Conceptual/Logical/Physical shift).
- **Bugfix:**
  - **Groen:** Snel herstel (Fysiek niveau).
  - **Geel:** Out-of-physical-box (Logische architectuur van de oplossing).
  - **Rood:** Out-of-the-box (Conceptueel redesign + Security Audit).
  - **Loop:** Debug-loop (Probeer een compleet nieuwe invalshoek).
- **Root Cause Analysis (Mandatory):** Bij elke bugfix duid ik de oorzaak op drie niveaus: **Functioneel**, **Technisch**, en **Architectonisch abstractieniveau**.

## Build & Testing Mandate
- **Scope-Dependent Build:** Het commando 'build' slaat ALTIJD alleen op de scope van het huidige actieve project (Meta, Web, Android, of iOS).
- **Confirmation & WhatIf Protocol:** Voor elke build MOET de AI een 'WhatIf' analyse geven: wat gaat er precies gebeuren? (bijv. syncen, valideren, compileren, previewen). De AI vraagt pas na deze analyse om akkoord.
- **Change Detection:** Als er sinds de laatste build geen wijzigingen zijn gedetecteerd (bijv. in .ts, .tsx, .html, .css), meldt de AI dit en vraagt of een 'force build' alsnog gewenst is.
- **Local Browser Testing (Web):** Elke succesvolle build (`npm run build`) MOET direct leiden tot een lokale test via een webbrowser om de PWA-functionaliteit en de Machine Hash stabiliteit te verifiëren.
- **Preview Command:** Gebruik `npm run preview` om de productie-build lokaal te hosten.
- **No Implicit APK:** Bij een 'build' opdracht in de context van Web of Meta wordt NOOIT automatisch een Android APK gegenereerd. Dit moet specifiek gevraagd worden.
