#!/bin/bash
echo "--- [LAYER INTEGRITY] PhotoVerify Ecosystem Sync ---"

# De bron van de waarheid (Master)
META_DIR="../Meta_PhotoVerify"

# Core bestanden die NOOIT lokaal gewijzigd mogen worden
CORE_FILES=(
  # Utilities (core logic)
  "src/utils/perceptualHash.ts"
  "src/utils/timeAnchor.ts"
  "src/utils/zipper.ts"
  "src/utils/forensics.ts"
  "src/utils/watermark.ts"
  "src/utils/virtualStorage.ts"
  "src/utils/history.ts"
  "src/utils/license.ts"
  "src/utils/machineId.ts"
  "src/utils/runtime.ts"
  "src/utils/metadata.ts"
  "src/utils/pdfGenerator.ts"
  "src/utils/fileSaver.ts"
  # Components — Verifiers
  "src/components/ZipVerifier.tsx"
  "src/components/LegacyBorderVerifier.tsx"
  "src/components/CopyrightVerifier.tsx"
  "src/components/TimeAnchorVerifier.tsx"
  "src/components/ProcessingOverlay.tsx"
  "src/components/MatrixRainCanvas.tsx"
  # Components — Creators
  "src/components/CopyrightCreator.tsx"
  "src/components/TimeAnchorCreator.tsx"
  "src/components/LegacyBorderCreator.tsx"
  "src/components/ImageLab.tsx"
  # Workers
  "src/workers/zip.worker.ts"
  # App entry (SSOT for all screens: ABOUT, INFO, SETTINGS, etc.)
  "src/App.tsx"
  "src/App.css"
  # Config & data
  "src/engine_version.json"
  "public/content-config.json"
  "public/ui-config.json"
  "license-manager.html"
)

# 1. Controleer of de Meta-repository lokaal aanwezig is
if [ ! -d "$META_DIR" ]; then
  echo "FATAL: Meta_PhotoVerify (Master) niet gevonden."
  exit 1
fi

# 2. Toetsing op 'Abstraction Layer Violation'
VIOLATIONS=0
for file in "${CORE_FILES[@]}"; do
  if [ -f "$file" ] && [ -f "$META_DIR/$file" ]; then
    if ! cmp -s "$file" "$META_DIR/$file"; then
       echo "[!] ABSTRACTION VIOLATION: $file is lokaal gewijzigd!"
       VIOLATIONS=$((VIOLATIONS+1))
    fi
  fi
done

if [ $VIOLATIONS -gt 0 ]; then
  echo "--- BUILD ABORTED: $VIOLATIONS Layer Violations gevonden ---"
  exit 1
fi

# 3. Voer de synchronisatie uit
for file in "${CORE_FILES[@]}"; do
  mkdir -p "$(dirname "$file")"
  if [ -f "$META_DIR/$file" ]; then
    cp "$META_DIR/$file" "$file"
    echo "[SYNCED] $file"
  fi
done

echo "--- [LAYER INTEGRITY] Sync geslaagd. ---"
