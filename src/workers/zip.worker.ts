import JSZip from 'jszip';

self.onmessage = async (event: MessageEvent) => {
  const { originalUrl, borderUrl, protectedUrl, deed, baseName } = event.data;

  try {
    const zip = new JSZip();

    zip.file(`${baseName}_original.png`, originalUrl.split(',')[1], { base64: true });
    if (borderUrl) {
      zip.file(`${baseName}_1-pixel_border_proof.png`, borderUrl.split(',')[1], { base64: true });
    }
    zip.file(`${baseName}_protected_interior.png`, protectedUrl.split(',')[1], { base64: true });
    zip.file(`${baseName}_deed.json`, JSON.stringify(deed, null, 2));

    const zipBlob = await zip.generateAsync({
      type: 'blob', // Generate a Blob directly for efficient transfer
      compression: 'DEFLATE',
      compressionOptions: { level: 9 }
    }, function updateCallback(metadata) {
      // Post progress updates back to the main thread
      self.postMessage({ type: 'progress', percent: metadata.percent });
    });

    // Once generation is complete, post the Blob back to the main thread
    self.postMessage({ type: 'complete', zipBlob: zipBlob });
  } catch (error: any) {
    self.postMessage({ type: 'error', message: error.message || 'Unknown error during ZIP generation' });
  }
};
