import EXIF from 'exif-js';

export interface ImageMetadata {
  filename: string;
  size: number;
  width: number;
  height: number;
  colorDepth: string;
  compression: string;
  dpi: string;
  exif: any;
}

export function extractMetadata(file: File, img: HTMLImageElement): Promise<ImageMetadata> {
  return new Promise((resolve) => {
    EXIF.getData(file as any, function(this: any) {
      const allMetaData = EXIF.getAllTags(this);
      
      const meta: ImageMetadata = {
        filename: file.name,
        size: file.size,
        width: img.naturalWidth,
        height: img.naturalHeight,
        colorDepth: '24-bit (SRGB)',
        compression: file.type === 'image/png' ? 'Deflate (Lossless)' : 'JPEG (Lossy)',
        dpi: allMetaData.XResolution ? `${allMetaData.XResolution} dpi` : '72 dpi (Estimated)',
        exif: allMetaData
      };
      
      resolve(meta);
    });
  });
}

export function formatExifSummary(exif: any): string {
  if (!exif || Object.keys(exif).length === 0) return 'No EXIF data found.';
  
  const relevant = [
    exif.Make ? `Camera: ${exif.Make} ${exif.Model || ''}` : null,
    exif.DateTime ? `Date: ${exif.DateTime}` : null,
    exif.Software ? `Software: ${exif.Software}` : null,
    exif.GPSLatitude ? `Location: Data present` : null,
    exif.Artist ? `Artist: ${exif.Artist}` : null,
    exif.Copyright ? `Copyright: ${exif.Copyright}` : null
  ].filter(Boolean);
  
  return relevant.length > 0 ? relevant.join(' | ') : 'Basic metadata present.';
}
