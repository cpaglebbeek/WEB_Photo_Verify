import { useState, useEffect } from 'react';
import { injectVirtualDataAsync, extractVirtualDataAsync } from '../utils/virtualStorage';
import { generateFingerprint, generatePerceptualHashDetailed } from '../utils/perceptualHash';
import { saveFile } from '../utils/fileSaver';
import { sha256, generateCombinedProof } from '../utils/timeAnchor';
import { bundleEvidence } from '../utils/zipper';

interface Props {
  image: HTMLImageElement | null;
  filename: string;
  uid: string;
  setUid: (u: string) => void;
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

export default function CopyrightCreator({ image, filename, uid, setUid, onStart, onProgress, onEnd }: Props) {
  const [injectedDataUrl, setInjectedDataUrl] = useState<string | null>(null);
  const [fingerprint, setFingerprint] = useState<string | null>(null);

  useEffect(() => {
    if (image) {
      const canvas = document.createElement('canvas');
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      generateFingerprint(ctx.getImageData(0, 0, canvas.width, canvas.height)).then(setFingerprint);
    }
  }, [image]);

  const injectData = async () => {
    if (!image) return;
    onStart();
    
    const targetWidth = image.width;
    const targetHeight = image.height;

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth; canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    
    // Visual Stamp: Draw a visible 1-pixel rectangle around the entire image
    // DO THIS FIRST so both the border proof and the final original contain the stamp
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)'; // pv-accent with transparency
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, targetWidth - 1, targetHeight - 1);

    // Border logic for bundle
    const borderCanvas = document.createElement('canvas');
    borderCanvas.width = targetWidth; borderCanvas.height = targetHeight;
    const bCtx = borderCanvas.getContext('2d')!;
    bCtx.drawImage(canvas, 0, 0, targetWidth, 1, 0, 0, targetWidth, 1);
    bCtx.drawImage(canvas, 0, targetHeight - 1, targetWidth, 1, 0, targetHeight - 1, targetWidth, 1);
    bCtx.drawImage(canvas, 0, 1, 1, targetHeight - 2, 0, 1, 1, targetHeight - 2);
    bCtx.drawImage(canvas, targetWidth - 1, 1, 1, targetHeight - 2, targetWidth - 1, 1, 1, targetHeight - 2);

    const interiorCanvas = document.createElement('canvas');
    interiorCanvas.width = targetWidth - 2; interiorCanvas.height = targetHeight - 2;
    const iCtx = interiorCanvas.getContext('2d')!;
    iCtx.drawImage(canvas, 1, 1, targetWidth - 2, targetHeight - 2, 0, 0, targetWidth - 2, targetHeight - 2);

    const dna = generatePerceptualHashDetailed(iCtx.getImageData(0, 0, interiorCanvas.width, interiorCanvas.height));
    const stamped = await injectVirtualDataAsync(iCtx.getImageData(0, 0, interiorCanvas.width, interiorCanvas.height), uid, (p) => onProgress(60 + p * 0.3));
    iCtx.putImageData(stamped, 0, 0);

    // CRITICAL: Re-integrate the stamped interior so verification succeeds
    ctx.drawImage(interiorCanvas, 1, 1);

    const hash = await sha256(stamped.data);
    const now = Date.now();
    const deed = { 
      imageHash: hash, 
      perceptualHash: dna.hash, 
      anchorHash: "AUTO",
      anchorSource: "AUTO-Generated",
      timestamp: now, 
      combinedProof: await generateCombinedProof(hash, "AUTO") 
    };

    const testData = iCtx.getImageData(0, 0, interiorCanvas.width, interiorCanvas.height);
    const testResult = await extractVirtualDataAsync(testData, () => {});
    
    if (testResult && testResult.uid === uid.toUpperCase()) {
      await bundleEvidence(canvas.toDataURL('image/png'), borderCanvas.toDataURL('image/png'), interiorCanvas.toDataURL('image/png'), deed, `${uid}_${filename}`);
      setInjectedDataUrl(canvas.toDataURL('image/png'));
    } else {
      alert("Self-test failed. Try a higher quality image.");
    }
    onEnd();
  };

  return (
    <div className="component-container">
      <div className="input-group">
        {!image && <p style={{ color: '#e74c3c' }}>Please upload a photo in the first step.</p>}
        
        {image && fingerprint && (
          <div className="memory-info" style={{ background: '#111', padding: '15px', borderLeft: '4px solid #646cff' }}>
            <p><strong>Original Fingerprint:</strong></p>
            <code style={{ fontSize: '0.8em', color: '#61dafb' }}>{fingerprint}</code>
            <label style={{ marginTop: '10px' }}>Stamp Code (6 Hex Chars): 
              <input 
                type="text" 
                value={uid} 
                onChange={e => {
                  const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                  if (val.length <= 6) setUid(val);
                }} 
                maxLength={6}
                style={{ width: '100%', background: '#333', color: 'white', fontFamily: 'monospace' }}
              />
            </label>
          </div>
        )}
      </div>
      
      {image && uid.length === 6 ? (
        <button onClick={injectData} className="primary-button">Embed Invisible Stamp</button>
      ) : (
        <button className="primary-button" style={{ opacity: 0.5, cursor: 'not-allowed' }} disabled>Enter 6-char code</button>
      )}

      {injectedDataUrl && (
        <div className="results success">
          <h3>Stamp Embedded!</h3>
          <p>This version now contains your secret code.</p>
          <div className="download-links">
            <button onClick={() => saveFile(injectedDataUrl, `${uid}_${filename}`)} className="download-btn">
              Download Protected Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
