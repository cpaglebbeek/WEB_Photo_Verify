import EXIF from 'exif-js';
// @ts-ignore - no type declarations available for piexifjs
import * as piexif from 'piexifjs';

export interface ImageMetadata {
  filename: string;
  size: number;
  width: number;
  height: number;
  colorDepth: string;
  compression: string;
  dpi: string;
  exif: any;
  rawExif?: string; 
}

/**
 * Extracts comprehensive metadata from a source file.
 */
export async function extractMetadata(file: File, img: HTMLImageElement): Promise<ImageMetadata> {
  console.log('[Metadata] Starting extraction for:', file.name);
  
  return new Promise(async (resolve) => {
    // 1. Get raw binary for piexif (JPEG only support internally handled by piexif)
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const binaryString = String.fromCharCode(...new Uint8Array(arrayBuffer));
      
      let rawExif: string | undefined;
      try {
        if (file.type === 'image/jpeg' || file.type === 'image/jpg') {
          rawExif = piexif.load(binaryString);
        }
      } catch (err) {
        console.warn('[Metadata] piexif load failed (normal for non-JPEG):', err);
      }

      // 2. Get tags using exif-js
      try {
        // Use the image element itself which is often more reliable for exif-js
        EXIF.getData(img as any, function(this: any) {
          const allMetaData = EXIF.getAllTags(this);
          console.log('[Metadata] exif-js tags found:', Object.keys(allMetaData).length);
          
          resolve({
            filename: file.name,
            size: file.size,
            width: img.naturalWidth,
            height: img.naturalHeight,
            colorDepth: '24-bit (SRGB)',
            compression: file.type === 'image/png' ? 'Deflate (Lossless)' : 'JPEG (Lossy)',
            dpi: allMetaData.XResolution ? `${allMetaData.XResolution} dpi` : '72 dpi (Estimated)',
            exif: allMetaData,
            rawExif
          });
        });
      } catch (exifErr) {
        console.error('[Metadata] exif-js fatal error:', exifErr);
        // Fallback resolve with basic info
        resolve({
          filename: file.name,
          size: file.size,
          width: img.naturalWidth,
          height: img.naturalHeight,
          colorDepth: '24-bit (SRGB)',
          compression: 'Unknown',
          dpi: '72 dpi (Fallback)',
          exif: {},
          rawExif
        });
      }
    };
    reader.readAsArrayBuffer(file);

    // Safety timeout to prevent hanging UI
    setTimeout(() => {
      resolve({
        filename: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        colorDepth: '24-bit (SRGB)',
        compression: 'Timeout',
        dpi: '72 dpi (Timeout)',
        exif: {}
      });
    }, 2000);
  });
}

export function formatExifSummary(exif: any): string {
  if (!exif || Object.keys(exif).length === 0) return 'No EXIF data found.';
  const relevant = [
    exif.Make ? `Camera: ${exif.Make} ${exif.Model || ''}` : null,
    exif.DateTime ? `Date: ${exif.DateTime}` : null,
    exif.Artist ? `Artist: ${exif.Artist}` : null,
    exif.Copyright ? `Copyright: ${exif.Copyright}` : null
  ].filter(Boolean);
  return relevant.length > 0 ? relevant.join(' | ') : 'Basic metadata present.';
}

export function injectForensicMetadata(
  imageDataUrl: string, 
  originalRawExif: string | undefined, 
  author: string, 
  company: string, 
  pdfBase64?: string
): string {
  try {
    let exifObj: any = originalRawExif ? piexif.load(originalRawExif) : { "0th": {}, "Exif": {}, "GPS": {} };
    if (author) exifObj["0th"][piexif.ImageIFD.Artist] = author;
    if (company) exifObj["0th"][piexif.ImageIFD.Copyright] = `(c) ${new Date().getFullYear()} ${company}`;
    if (pdfBase64) exifObj["0th"][piexif.ImageIFD.ImageDescription] = `PV_REPORT_B64:${pdfBase64}`;
    exifObj["0th"][piexif.ImageIFD.DateTime] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');
    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, imageDataUrl);
  } catch (err) {
    console.error('[Metadata] Injection failed:', err);
    return imageDataUrl;
  }
}

export function extractEmbeddedReport(imageDataUrl: string): string | null {
  try {
    const exifObj = piexif.load(imageDataUrl);
    const desc = exifObj["0th"]?.[piexif.ImageIFD.ImageDescription];
    if (typeof desc === 'string' && desc.startsWith('PV_REPORT_B64:')) {
      return desc.replace('PV_REPORT_B64:', '');
    }
  } catch (err) {}
  return null;
}
