# WEB_PhotoVerify

## Project Mandates
- **Purpose:** Web and ChromeApp variant of the PhotoVerify ecosystem.
- **Scope:** Browser-based forensics, PWA support, and cloud-independent local processing.
- **Master Copie:** Orchestrated by Meta_PhotoVerify.
- **Tech Stack:** React 19, TypeScript 5, Vite, PWA.

## Context-Aware Orchestration Rule
- **Location Independence:** Het maakt niet uit in welke projectmap de gebruiker of AI zich bevindt. De AI MOET uit de context van het verzoek afleiden welk project (Meta, Android, iOS of Web) gewijzigd of gebouwd moet worden.
- **Routing:** Wijzigingen aan core-logica worden ALTIJD in `Meta_PhotoVerify` gedaan. Wijzigingen aan platform-specifieke bridges worden in het bijbehorende platform-project gedaan.
- **Syncing:** Na een wijziging moet de AI automatisch de git commit en push verzorgen voor de *gewijzigde* repository.
- **Explicit Context:** Bij elk antwoord moet de AI expliciet vermelden op welk project de actie betrekking heeft.

## Context-Aware Orchestration Rule
- **Location Independence:** Het maakt niet uit in welke projectmap de gebruiker of AI zich bevindt. De AI MOET uit de context van het verzoek afleiden welk project (Meta, Android, iOS of Web) gewijzigd of gebouwd moet worden.
- **Routing:** Wijzigingen aan core-logica worden ALTIJD in `Meta_PhotoVerify` gedaan. Wijzigingen aan platform-specifieke bridges worden in het bijbehorende platform-project gedaan.
- **Syncing:** Na een wijziging moet de AI automatisch de git commit en push verzorgen voor de *gewijzigde* repository.
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
