import { useState, useRef, useEffect, type ChangeEvent } from 'react';

export default function CopyrightCreator() {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [results, setResults] = useState<{ original: string, cropped: string, proof: string } | null>(null);

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          setImage(img);
          setResults(null);
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

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

  const generateProof = () => {
    if (!image) return;
    const { width, height } = image;
    const originalCanvas = document.createElement('canvas');
    originalCanvas.width = width; originalCanvas.height = height;
    const originalCtx = originalCanvas.getContext('2d')!;
    originalCtx.drawImage(image, 0, 0);
    const originalData = originalCanvas.toDataURL('image/png');

    const proofCanvas = document.createElement('canvas');
    proofCanvas.width = width; proofCanvas.height = height;
    const proofCtx = proofCanvas.getContext('2d')!;
    proofCtx.drawImage(image, 0, 0, width, 1, 0, 0, width, 1);
    proofCtx.drawImage(image, 0, height - 1, width, 1, 0, height - 1, width, 1);
    proofCtx.drawImage(image, 0, 1, 1, height - 2, 0, 1, 1, height - 2);
    proofCtx.drawImage(image, width - 1, 1, 1, height - 2, width - 1, 1, 1, height - 2);
    const proofData = proofCanvas.toDataURL('image/png');

    const croppedCanvas = document.createElement('canvas');
    croppedCanvas.width = width; croppedCanvas.height = height;
    const croppedCtx = croppedCanvas.getContext('2d')!;
    croppedCtx.drawImage(image, 0, 0);
    croppedCtx.clearRect(0, 0, width, 1);
    croppedCtx.clearRect(0, height - 1, width, 1);
    croppedCtx.clearRect(0, 1, 1, height - 2);
    croppedCtx.clearRect(width - 1, 1, 1, height - 2);
    const croppedData = croppedCanvas.toDataURL('image/png');

    setResults({ original: originalData, cropped: croppedData, proof: proofData });
  };

  return (
    <div className="component-container">
      <h2>1. Create Copyright Proof (Automatic 1-Pixel Border)</h2>
      <input type="file" accept="image/*" onChange={handleImageUpload} />
      {image && (
        <div className="canvas-wrapper">
          <p>The 1-pixel border rectangle (highlighted in red) will be used as your proof:</p>
          <canvas ref={canvasRef} style={{ maxWidth: '100%', border: '1px solid #ccc' }} />
          <button onClick={generateProof}>Generate Proof & Cropped Image</button>
        </div>
      )}
      {results && (
        <div className="results">
          <h3>Generated Files:</h3>
          <div className="download-links">
            <a href={results.original} download="original.png">1. Download Original</a>
            <a href={results.cropped} download="cropped_interior.png">2. Download Cropped (Interior)</a>
            <a href={results.proof} download="proof_border.png">3. Download Proof (Border)</a>
          </div>
        </div>
      )}
    </div>
  );
}
