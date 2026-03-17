import JSZip from 'jszip';
import { saveFile } from './fileSaver';

export const bundleEvidence = async (
  originalUrl: string,
  borderUrl: string | null,
  protectedUrl: string,
  deed: object,
  baseName: string
) => {
  const zip = new JSZip();
  
  // 1. Original
  const originalData = originalUrl.split(',')[1];
  zip.file(`${baseName}_original.png`, originalData, { base64: true });

  // 2. Border Proof (Optional)
  if (borderUrl) {
    const borderData = borderUrl.split(',')[1];
    zip.file(`${baseName}_1-pixel_border_proof.png`, borderData, { base64: true });
  }

  // 3. Protected Interior
  const protectedData = protectedUrl.split(',')[1];
  zip.file(`${baseName}_protected_interior.png`, protectedData, { base64: true });

  // 4. JSON Deed
  zip.file(`${baseName}_deed.json`, JSON.stringify(deed, null, 2));

  // Generate ZIP
  const content = await zip.generateAsync({ type: 'base64' });
  const dataUrl = `data:application/zip;base64,${content}`;
  
  await saveFile(dataUrl, `${baseName}_full_evidence.zip`, 'deed');
};
