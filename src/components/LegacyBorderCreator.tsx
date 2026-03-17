import { useState, useRef, useEffect } from 'react';
import { saveFile } from '../utils/fileSaver';

interface Props {
  image: HTMLImageElement | null;
  filename: string;
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

export default function LegacyBorderCreator({ image, filename, onStart, onProgress, onEnd }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<{ original: string, cropped: string, border: string } | null>(null);

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        canvas.width = image.width;
        canvas.height = image.height;
        ctx.drawImage(image, 0, 0);
        ctx.strokeStyle = 'red';
        ctx.lineWidth = 1;
        ctx.strokeRect(0.5, 0.5, canvas.width - 1, canvas.height - 1);
      }
    }
  }, [image]);

  const generateProof = async () => {
    if (!image) return;
    onStart();
    onProgress(20);
    const { width, height } = image;
    
    // Original
    onProgress(40);
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width; originalCanvas.height = height;
    originalCanvas.getContext('2d')!.drawImage(image, 0, 0);
    const originalData = originalCanvas.toDataURL('image/png');

    // Border
    onProgress(60);
    const proofCanvas = document.createElement('canvas');
    proofCanvas.width = width; proofCanvas.height = height;
    const bCtx = proofCanvas.getContext('2d')!;
    bCtx.drawImage(image, 0, 0, width, 1, 0, 0, width, 1);
    bCtx.drawImage(image, 0, height - 1, width, 1, 0, height - 1, width, 1);
    bCtx.drawImage(image, 0, 1, 1, height - 2, 0, 1, 1, height - 2);
    bCtx.drawImage(image, width - 1, 1, 1, height - 2, width - 1, 1, 1, height - 2);
    const borderData = proofCanvas.toDataURL('image/png');

    // Cropped
    onProgress(80);
    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = width; croppedCanvas.height = height;
    const cCtx = croppedCanvas.getContext('2d')!;
    cCtx.drawImage(image, 0, 0);
    cCtx.clearRect(0, 0, width, 1);
    cCtx.clearRect(0, height - 1, width, 1);
    cCtx.clearRect(0, 1, 1, height - 2);
    cCtx.clearRect(width - 1, 1, 1, height - 2);
    const croppedData = croppedCanvas.toDataURL('image/png');

    setResults({ original: originalData, cropped: croppedData, border: borderData });
    onProgress(100);
    onEnd();
  };

  return (
    <div className="component-container">
      {!image && <p style={{ color: '#e74c3c' }}>Please upload a photo in the first step.</p>}
      
      {image && (
        <div className="canvas-wrapper">
          <p style={{ fontSize: '0.9em', color: '#888' }}>Extract physical border frame proof:</p>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', border: '1px solid #334155', borderRadius: '4px' }} />
          <button onClick={generateProof} className="primary-button" style={{ marginTop: '10px' }}>Extract Physical Border Stamp</button>
        </div>
      )}
      {results && (
        <div className="results success">
          <h3>Physical Proof Files Ready:</h3>
          <div className="download-links" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <button onClick={() => saveFile(results.original, `${filename}_original.png`)} className="download-btn" style={{ backgroundColor: '#475569' }}>1. Download Original</button>
            <button onClick={() => saveFile(results.cropped, `${filename}_cropped_interior.png`)} className="download-btn" style={{ backgroundColor: '#475569' }}>2. Download Cropped Interior</button>
            <button onClick={() => saveFile(results.border, `${filename}_1-pixel_border_proof.png`)} className="download-btn">3. Download 1-Pixel Border</button>
          </div>
        </div>
      )}
    </div>
  );
}
