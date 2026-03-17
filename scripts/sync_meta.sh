#!/bin/bash
echo "--- [LAYER INTEGRITY] PhotoVerify Ecosystem Sync ---"

# De bron van de waarheid (Master)
META_DIR="../Meta_PhotoVerify"

# Core bestanden die NOOIT lokaal gewijzigd mogen worden
CORE_FILES=(
  "src/utils/perceptualHash.ts"
  "src/utils/timeAnchor.ts"
  "src/utils/zipper.ts"
  "src/utils/forensics.ts"
  "src/utils/watermark.ts"
  "src/components/ZipVerifier.tsx"
  "public/content-config.json"
  "public/ui-config.json"
  "license-manager.html"
  "src/utils/runtime.ts"
  "src/utils/machineId.ts"
  "src/utils/metadata.ts"
  "src/utils/pdfGenerator.ts"
)

# 1. Controleer of de Meta-repository lokaal aanwezig is
if [ ! -d "$META_DIR" ]; then
  echo "FATAL: Meta_PhotoVerify (Master) niet gevonden. Build afgebroken."
  echo "Regie-fout: Platform-repo's mogen niet autonoom bouwen zonder Master-sync."
  exit 1
fi

# 2. Toetsing op 'Abstraction Layer Violation'
VIOLATIONS=0
for file in "${CORE_FILES[@]}"; do
  if [ -f "$file" ] && [ -f "$META_DIR/$file" ]; then
    if ! cmp -s "$file" "$META_DIR/$file"; then
       echo "[!] ABSTRACTION VIOLATION: $file is lokaal gewijzigd!"
       echo "    -> Regel: Wijzigingen in de kernlogica MOETEN in Meta_PhotoVerify gebeuren."
       echo "    -> Oplossing: Verplaats je wijzigingen naar de Meta-repo en run de build opnieuw."
       VIOLATIONS=$((VIOLATIONS+1))
    fi
  fi
done

if [ $VIOLATIONS -gt 0 ]; then
  echo "--- BUILD ABORTED: $VIOLATIONS Layer Violations gevonden ---"
  exit 1
fi

# 3. Voer de synchronisatie uit
echo "[OK] Alle core-bestanden zijn in sync met Master."
for file in "${CORE_FILES[@]}"; do
  cp "$META_DIR/$file" "$file"
  echo "[SYNCED] $file"
done

echo "--- [LAYER INTEGRITY] Sync geslaagd. Build mag doorgaan. ---"
