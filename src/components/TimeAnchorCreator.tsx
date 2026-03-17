import { useState, useRef, useEffect } from 'react';
import { sha256, generateCombinedProof, type AnchorDeed } from '../utils/timeAnchor';
import { generatePerceptualHashDetailed } from '../utils/perceptualHash';
import { saveJsonFile } from '../utils/fileSaver';

interface Props {
  image: HTMLImageElement | null;
  filename: string;
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

export default function TimeAnchorCreator({ image, filename, onStart, onProgress, onEnd }: Props) {
  const [imageHash, setImageHash] = useState<string | null>(null);
  const [pHashData, setPHashData] = useState<{ hash: string, bits: number[] } | null>(null);
  const [metadata, setMetadata] = useState<{ width: number, height: number, isColor: boolean, aspectRatio: string } | null>(null);
  const [anchorSource, setAnchorSource] = useState<string>('Bitcoin Block #834567');
  const [anchorHash, setAnchorHash] = useState<string>('0000000000000000000123456789abcdef');
  const [deed, setDeed] = useState<AnchorDeed | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (image) {
      const runInit = async () => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        
        const hash = await sha256(imageData.data);
        const phResult = generatePerceptualHashDetailed(imageData);
        
        let hasColor = false;
        for(let i=0; i<Math.min(imageData.data.length, 4000); i+=4) {
          if(Math.abs(imageData.data[i]-imageData.data[i+1]) > 15) { hasColor = true; break; }
        }

        const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
        const common = gcd(image.width, image.height);
        const ratio = `${image.width/common}:${image.height/common}`;

        setImageHash(hash);
        setPHashData(phResult);
        setMetadata({ width: image.width, height: image.height, isColor: hasColor, aspectRatio: ratio });
      };
      runInit();
    }
  }, [image]);

  useEffect(() => {
    if (pHashData && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d')!;
      const size = 16;
      ctx.clearRect(0, 0, 160, 160);
      pHashData.bits.forEach((bit, i) => {
        const x = (i % size) * 10;
        const y = Math.floor(i / size) * 10;
        ctx.fillStyle = bit === 1 ? '#61dafb' : '#1e293b';
        ctx.fillRect(x, y, 9, 9);
      });
    }
  }, [pHashData]);

  const createDeed = async () => {
    if (!imageHash || !anchorHash) return;
    onStart();
    onProgress(50);
    const combined = await generateCombinedProof(imageHash, anchorHash);
    const newDeed: AnchorDeed = {
      imageHash,
      perceptualHash: pHashData?.hash || undefined,
      metadata: metadata || undefined,
      anchorHash,
      anchorSource,
      combinedProof: combined,
      timestamp: Date.now()
    };
    setDeed(newDeed);
    onProgress(100);
    onEnd();
  };

  return (
    <div className="dashboard-section" style={{ borderTop: '4px solid #f1c40f' }}>
      <div className="input-group">
        {!image && <p style={{ color: '#e74c3c' }}>Please upload a photo in the first step.</p>}
        
        {image && imageHash && (
          <div className="info-box">
            <div style={{ display: 'flex', gap: '20px', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <p><strong>Digital Fingerprint:</strong><br/><code>{imageHash.slice(0, 32)}...</code></p>
                <p style={{ marginTop: '10px' }}><strong>Visual DNA:</strong><br/><code>{pHashData?.hash}</code></p>
                {metadata && (
                  <p style={{ fontSize: '0.8em', color: '#888', marginTop: '5px' }}>
                    Info: {metadata.width}x{metadata.height} ({metadata.aspectRatio}) - {metadata.isColor ? 'Color' : 'B/W'}
                  </p>
                )}
              </div>
              <div style={{ textAlign: 'center' }}>
                <span style={{ fontSize: '0.7em', display: 'block', marginBottom: '5px' }}>DNA Preview (16x16)</span>
                <canvas ref={canvasRef} width={160} height={160} style={{ border: '1px solid #334155', borderRadius: '4px' }} />
              </div>
            </div>
            
            <label style={{ marginTop: '15px' }}>Public Anchor Source:
              <input type="text" value={anchorSource} onChange={e => setAnchorSource(e.target.value)} style={{ width: '100%' }} />
            </label>
            
            <label style={{ marginTop: '10px' }}>Public Anchor Hash:
              <input type="text" value={anchorHash} onChange={e => setAnchorHash(e.target.value)} style={{ width: '100%', fontFamily: 'monospace' }} />
            </label>
            
            <button onClick={createDeed} className="primary-button" style={{ marginTop: '15px', backgroundColor: '#f39c12' }}>
              Seal Ownership Deed
            </button>
          </div>
        )}
      </div>

      {deed && (
        <div className="results success">
          <h3>Ownership Deed Ready!</h3>
          <p>This file cryptographically proves your original possession.</p>
          <button onClick={() => saveJsonFile(deed, `${filename}_${deed.imageHash.slice(0, 8)}.json`)} className="download-btn">
            Download .JSON Deed
          </button>
        </div>
      )}
    </div>
  );
}
