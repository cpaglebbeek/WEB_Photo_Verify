# Meta_PhotoVerify Build & Validation Protocol

## 1. Principle: Functional-Technical Mapping
Every build of Meta_PhotoVerify must be explicitly verified against the `META_PHOTOVERIFY_REPO.json`. This repository serves as the **Source of Truth**, mapping functional requirements to their technical implementations.

## 2. Mandatory Validation
The build process (`npm run build`) is strictly dependent on the `npm run validate` step. This step:
1.  Loads the current `META_PHOTOVERIFY_REPO.json`.
2.  Iterates through all core technical components defined in the repo.
3.  Verifies the presence and integrity of these components in the filesystem.
4.  **Aborts the build** if any core component is missing or misaligned.

## 3. Core Components Monitored
The validation script (`scripts/validate_repo.py`) monitors:
- **UI Screens:** App.tsx, About/Info modes.
- **Forensic Layers:** virtualStorage.ts, perceptualHash.ts, LegacyBorderVerifier.tsx, timeAnchor.ts.
- **Bundle Logic:** ZipVerifier.tsx, zipper.ts.
- **System Bridges:** MainActivity.java, NativeBridgePlugin.java (SAF Integration).
- **Security:** license.ts.

## 8. Anti-Caching & UUID Enforcement
To ensure the user always sees the latest code and to prevent Android installation conflicts:

- **UUID Requirement:** Every debug build MUST use a unique `applicationIdSuffix` based on the current timestamp (`.dHHmm`). This forces a fresh installation.
- **Deep Clean:** Before every build, the following folders MUST be purged: `dist/`, `android/app/build/`, and all `.vite` caches.
- **Gradle Clean:** Every Android build must be preceded by a `./gradlew clean` command.
- **Visual Validation:** Every build must include a unique version tag in the header (e.g., `[V1.2.4_FORCED]`) to allow the user to verify the sync state visually.

