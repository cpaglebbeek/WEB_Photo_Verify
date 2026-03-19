import JSZip from 'jszip';
import { saveFile } from './fileSaver';

// Dynamically import the Web Worker for Vite/Webpack compatibility
const ZipWorker = new Worker(new URL('../workers/zip.worker.ts', import.meta.url), { type: 'module' });

export const bundleEvidence = async (
  originalUrl: string,
  borderUrl: string | null,
  protectedUrl: string,
  deed: object,
  baseName: string,
  onProgress: (p: number) => void // Add progress callback
) => {
  return new Promise<void>((resolve, reject) => {
    // Listen for messages from the worker
    ZipWorker.onmessage = (event: MessageEvent) => {
      const { type, percent, zipBlob, message } = event.data;
      if (type === 'progress') {
        onProgress(Math.floor(20 + (percent * 0.7))); // Scale worker progress (0-70) to overall (20-90)
      } else if (type === 'complete') {
        onProgress(90); // ZIP generation complete, starting save
        saveFile(URL.createObjectURL(zipBlob), `${baseName}_full_evidence.zip`, 'deed', (p) => onProgress(90 + (p * 0.1))); // Scale saveFile progress (90-100)
        resolve();
      } else if (type === 'error') {
        reject(new Error(`Worker error: ${message}`));
      }
    };

    // Send data to the worker
    onProgress(5); // Initial progress for worker setup
    ZipWorker.postMessage({ originalUrl, borderUrl, protectedUrl, deed, baseName });
  });
};
