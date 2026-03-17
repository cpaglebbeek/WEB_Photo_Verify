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
  rawExif?: string; // Base64 encoded EXIF binary string
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
      
      // Attempt to get raw EXIF for injection later
      let rawExif: string | undefined;
      try {
        rawExif = piexif.load(binaryString);
      } catch (err) {
        console.warn('[Metadata] Failed to load raw EXIF binary string', err);
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
 * Injects metadata and a Base64 PDF report into a JPEG/PNG image.
 * Note: Browser Canvas exports data-urls. Piexif works best with JPEGs.
 */
export function injectForensicMetadata(
  imageDataUrl: string, 
  originalRawExif: string | undefined, 
  author: string, 
  company: string, 
  pdfBase64?: string
): string {
  try {
    // 1. Prepare EXIF object
    let exifObj: any = originalRawExif ? piexif.load(originalRawExif) : { "0th": {}, "Exif": {}, "GPS": {} };

    // 2. Inject Author/Company into Standard Fields
    if (author) {
      exifObj["0th"][piexif.ImageIFD.Artist] = author;
    }
    if (company) {
      exifObj["0th"][piexif.ImageIFD.Copyright] = `(c) ${new Date().getFullYear()} ${company}`;
    }

    // 3. Inject PDF Report into a custom tag if provided
    // We use ImageDescription (0x010e) or a custom UserComment (0x9286) for the Base64 PDF
    if (pdfBase64) {
      const forensicMarker = `PV_REPORT_B64:${pdfBase64}`;
      exifObj["0th"][piexif.ImageIFD.ImageDescription] = forensicMarker;
    }

    // 4. Update DateTime
    exifObj["0th"][piexif.ImageIFD.DateTime] = new Date().toISOString().replace(/T/, ' ').replace(/\..+/, '');

    const exifBytes = piexif.dump(exifObj);
    return piexif.insert(exifBytes, imageDataUrl);
  } catch (err) {
    console.error('[Metadata] Injection failed:', err);
    return imageDataUrl; // Return original if injection fails
  }
}

/**
 * Extracts a Base64 PDF report from an image if present.
 */
export function extractEmbeddedReport(imageDataUrl: string): string | null {
  try {
    const exifObj = piexif.load(imageDataUrl);
    const desc = exifObj["0th"]?.[piexif.ImageIFD.ImageDescription];
    if (typeof desc === 'string' && desc.startsWith('PV_REPORT_B64:')) {
      return desc.replace('PV_REPORT_B64:', '');
    }
  } catch (err) {
    console.warn('[Metadata] No embedded report found or parsing failed');
  }
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
