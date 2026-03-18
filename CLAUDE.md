# ****WEB_PHOTO_VERIFY****

## Project Mandates
- **Doel:** Web en ChromeApp variant van het PhotoVerify ecosysteem.
- **Scope:** Browser-based forensics, PWA support, cloud-independent local processing.
- **Master Copy:** Georkestreerd door Meta_PhotoVerify.
- **Tech Stack:** React 19, TypeScript 5, Vite, PWA.
- **GitHub:** `https://github.com/cpaglebbeek/WEB_Photo_Verify.git` (branch: `main`)
- **Lokaal pad:** `/Users/christian/Documents/Gemini_Projects/WEB_Photo_Verify`

## Context-Aware Orchestration
- Platform-specifieke wijzigingen hier; core-logica ALTIJD in `Meta_PhotoVerify`.
- Na elke wijziging: automatisch `git commit` + `git push`.
- Elke reactie begint EN eindigt met: `****WEB_PHOTO_VERIFY****`

## Feature & Bugfix Protocol (Color-Coded)
**Nieuwe Feature:**
- **Groen:** Minor → versie +0.0.1
- **Oranje:** Design impact → versie +0.1.0
- **Rood:** Architectural → versie +1.0.0

**Bugfix:**
- **Groen:** Snel herstel | **Geel:** Logisch niveau | **Rood:** Conceptueel + Security Audit | **Loop:** Nieuwe invalshoek

**Root Cause Analysis (verplicht):** Functioneel + Technisch + Architectonisch niveau.

## Build & Testing Mandate
- WhatIf analyse vóór elke build, daarna akkoord vragen.
- Change detection: controleer wijzigingen in `.ts`, `.tsx`, `.html`, `.css` via `git status`.
- Na succesvolle build → lokale test via `npm run preview` in de browser (PWA + Machine Hash stabiliteit).
- **No Implicit APK:** Nooit automatisch APK genereren vanuit Web context.

## Versioning — Thema: Quantum Leap (facts)
- **GROEN:** +0.0.1 | **ORANJE:** +0.1.0 | **ROOD:** +1.0.0
- Unieke codenaam per build (Quantum Leap feit).
- Update `version.json` en `package.json` vóór build/sync.

## Dashboard Update Mandate
Na elke build of versie-verhoging → update `dashboard_info.html` in Meta_PhotoVerify.
