# PhotoVerify: Android Permissions Guide

Dit document beschrijft hoe de opslagrechten voor de PhotoVerify app moeten worden ingesteld voor een correcte werking van de One-Click Shield (opslaan in Documents).

## 1. Automatische Methode
De app vraagt bij het opstarten (sinds v0.9.9) automatisch om de benodigde permissies via een systeem-dialoogvenster. Kies hier voor **"Toestaan"**.

## 2. Handmatige Methode (Android Instellingen)
Mochten downloads falen, controleer dan de volgende instellingen op het toestel:

### Basis Machtigingen
1. Open **Instellingen**.
2. Ga naar **Apps** > **PhotoVerify**.
3. Tik op **Machtigingen**.
4. Zorg dat **Bestanden en media** (of Opslag) is ingesteld op **"Altijd toestaan"** of **"Alleen bij gebruik van app"**.

### Speciale Toegang (All Files Access)
Voor directe toegang tot de publieke `Documents` map op Android 11 en hoger:
1. Open **Instellingen**.
2. Zoek via de zoekbalk bovenin naar **"Toegang tot alle bestanden"** (All files access).
3. Zoek **PhotoVerify** in de lijst.
4. Zet de schakelaar op **Aan**.

## 3. Ontwikkelaars Informatie
In de code zijn de volgende instellingen actief:
- `AndroidManifest.xml`: Bevat `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE` en `MANAGE_EXTERNAL_STORAGE`.
- `App.tsx`: Voert `Filesystem.requestPermissions()` uit in de `startup` cycle.
- `build.gradle`: Gebruikt `requestLegacyExternalStorage="true"`.
