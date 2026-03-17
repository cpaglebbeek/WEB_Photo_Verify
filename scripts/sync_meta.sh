#!/bin/bash
echo "--- Syncing CORE files from Meta_PhotoVerify ---"

# Define core files managed by Meta_PhotoVerify
CORE_FILES=(
  "src/utils/perceptualHash.ts"
  "src/utils/timeAnchor.ts"
  "src/utils/zipper.ts"
  "src/utils/forensics.ts"
  "src/utils/watermark.ts"
  "src/components/ZipVerifier.tsx"
  "public/content-config.json"
  "public/ui-config.json"
)

# Search for the local Meta repo, otherwise clone from github
META_DIR="../Meta_PhotoVerify"
TMP_CLONE=false

if [ ! -d "$META_DIR" ]; then
  echo "Local Meta_PhotoVerify not found. Cloning from GitHub..."
  git clone https://github.com/cpaglebbeek/Meta_Photo_Verify.git .tmp_meta
  META_DIR=".tmp_meta"
  TMP_CLONE=true
fi

for file in "${CORE_FILES[@]}"; do
  if [ -f "$META_DIR/$file" ]; then
    cp "$META_DIR/$file" "$file"
    echo "[SYNCED] $file"
  else
    echo "[WARNING] Core file missing in Meta repo: $file"
  fi
done

if [ "$TMP_CLONE" = true ]; then
  rm -rf .tmp_meta
fi

echo "--- Sync complete ---"
