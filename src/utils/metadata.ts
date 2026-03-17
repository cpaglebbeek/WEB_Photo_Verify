import EXIF from 'exif-js';
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
export function extractMetadata(file: File, img: HTMLImageElement): Promise<ImageMetadata> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target?.result as ArrayBuffer;
      const binaryString = String.fromCharCode(...new Uint8Array(arrayBuffer));
      
      let rawExif: string | undefined;
      try {
        rawExif = piexif.load(binaryString);
      } catch (err) {
        console.warn('[Metadata] No raw EXIF found or parsing failed', err);
      }

      EXIF.getData(file as any, function(this: any) {
        const allMetaData = EXIF.getAllTags(this);
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
    };
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Injects metadata and a Base64 PDF report into a JPEG image.
 */
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

    if (pdfBase64) {
      // Use ImageDescription to store the forensic marker
      exifObj["0th"][piexif.ImageIFD.ImageDescription] = `PV_REPORT_B64:${pdfBase64}`;
    }

    exifObj["0th"][piexif.ImageIFD.DateTime] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, imageDataUrl);
  } catch (err) {
    console.error('[Metadata] Injection failed:', err);
    return imageDataUrl;
  }
}

/**
 * Extracts an embedded Base64 PDF report from an image.
 */
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
