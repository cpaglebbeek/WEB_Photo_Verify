import json
import os
import sys

def validate_repo():
    repo_path = 'META_PHOTOVERIFY_REPO.json'
    if not os.path.exists(repo_path):
        print(f"Error: {repo_path} not found.")
        sys.exit(1)
        
    with open(repo_path, 'r') as f:
        repo = json.load(f)
        
    print(f"--- Meta_PhotoVerify Build Validation (v{repo['project']['version']}) ---")
    
    # Files to verify based on technical mappings
    files_to_check = [
        "src/App.tsx",
        "src/components/ZipVerifier.tsx",
        "src/utils/zipper.ts",
        "src/utils/license.ts",
        "src/utils/virtualStorage.ts",
        "src/utils/perceptualHash.ts",
        "src/components/LegacyBorderVerifier.tsx",
        "src/utils/timeAnchor.ts",
        "android/app/src/main/java/nl/fotolerant/photovault/MainActivity.java",
        "android/app/src/main/java/nl/fotolerant/photovault/NativeBridgePlugin.java"
    ]
    
    missing_files = []
    for f_path in files_to_check:
        if os.path.exists(f_path):
            print(f"[OK] {f_path}")
        else:
            print(f"[MISSING] {f_path}")
            missing_files.append(f_path)
            
    if missing_files:
        print("\nFATAL: Build aborted. The following core components are missing:")
        for m in missing_files:
            print(f"  - {m}")
        sys.exit(1)
    else:
        print("\nSUCCESS: All functional components are technically verified.")
        sys.exit(0)

if __name__ == "__main__":
    validate_repo()
