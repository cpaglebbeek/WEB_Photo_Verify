import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Filesystem } from '@capacitor/filesystem';
import { extractVirtualDataAsync } from '../utils/virtualStorage';
import { generatePerceptualHashDetailed, hashToBits, compareHashesElastic } from '../utils/perceptualHash';
import { type AnchorDeed } from '../utils/timeAnchor';

interface Props {
  initialFile?: File | Blob;
  onNativePick?: (mime: string, cb: (uri: string) => void) => void;
  onStart: (msg: string) => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

interface ZipAuditResult {
  stamp: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', value?: string };
  dna: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', score?: number };
  border: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT' };
  deed: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', data?: AnchorDeed };
  error?: string;
}

export default function ZipVerifier({ initialFile, onNativePick, onStart, onProgress, onEnd }: Props) {
  const [result, setResult] = useState<ZipAuditResult | null>(null);
  const [isAuditRunning, setIsAuditRunning] = useState(false);

  const loadImage = (blob: Blob): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(blob);
    });
  };

  const runAudit = async (file: File | Blob) => {
    if (isAuditRunning) return;
    setIsAuditRunning(true);
    setResult(null);

    try {
      onStart("Unpacking Evidence Bundle...");
      onProgress(10);
      
      const zip = await JSZip.loadAsync(file);
      
      const findFile = (suffix: string) => {
        return Object.keys(zip.files).find(name => name.endsWith(suffix));
      };

      const originalName = findFile("_original.png");
      const interiorName = findFile("_protected_interior.png");
      const borderName = findFile("_1-pixel_border_proof.png");
      const deedName = findFile("_deed.json");

      if (!originalName || !interiorName) {
        throw new Error("Core files (_original.png, _protected_interior.png) missing from ZIP.");
      }

      const originalFile = zip.file(originalName)!;
      const interiorFile = zip.file(interiorName)!;
      const borderFile = borderName ? zip.file(borderName) : null;
      const deedFile = deedName ? zip.file(deedName) : null;

      onProgress(30);
      const [origImg, intImg] = await Promise.all([
        loadImage(await originalFile.async("blob")),
        loadImage(await interiorFile.async("blob"))
      ]);

      const borderImg = borderFile ? await loadImage(await borderFile.async("blob")) : null;
      const deedText = deedFile ? await deedFile.async("text") : null;
      const deed: AnchorDeed | null = deedText ? JSON.parse(deedText) : null;
      
      const auditRes: ZipAuditResult = {
        stamp: { status: 'NOT_PRESENT' },
        dna: { status: 'NOT_PRESENT' },
        border: { status: 'NOT_PRESENT' },
        deed: deed ? { status: 'SUCCESS', data: deed } : { status: 'NOT_PRESENT' }
      };

      // Prepare interior data for both Stamp and DNA
      const canvas = document.createElement('canvas');
      canvas.width = intImg.width; canvas.height = intImg.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(intImg, 0, 0);
      const intData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      onStart("Scanning Invisible Stamp...");
      if (deed?.features?.stamp !== false) {
        const stampRes = await extractVirtualDataAsync(intData, p => onProgress(40 + p * 0.2));
        if (stampRes) {
          auditRes.stamp = { status: 'SUCCESS', value: stampRes.uid };
        } else {
          auditRes.stamp = { status: 'ERROR' };
        }
      } else {
        auditRes.stamp = { status: 'NOT_PRESENT' };
      }

      onStart("Auditing Visual DNA...");
      if (deed?.perceptualHash) {
        const currentPHash = generatePerceptualHashDetailed(intData);
        const sourceBits = hashToBits(deed.perceptualHash);
        const { score: dnaScore } = compareHashesElastic(sourceBits, currentPHash.bits);
        auditRes.dna = { status: dnaScore > 0.85 ? 'SUCCESS' : 'ERROR', score: dnaScore };
      }
      onProgress(80);

      onStart("Verifying Physical Border...");
      if (borderImg) {
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = origImg.width; fullCanvas.height = origImg.height;
        const fCtx = fullCanvas.getContext('2d', { willReadFrequently: true })!;
        
        // Reconstruct
        fCtx.clearRect(0, 0, fullCanvas.width, fullCanvas.height);
        fCtx.drawImage(intImg, 1, 1);
        fCtx.drawImage(borderImg, 0, 0);
        
        const reconData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data;
        fCtx.drawImage(origImg, 0, 0);
        const origData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data;
        
        let errorCount = 0;
        const TOLERANCE = 15;
        for (let i = 0; i < origData.length; i += 4) {
          if (Math.abs(origData[i] - reconData[i]) > TOLERANCE || 
              Math.abs(origData[i+1] - reconData[i+1]) > TOLERANCE || 
              Math.abs(origData[i+2] - reconData[i+2]) > TOLERANCE) {
            errorCount++;
          }
        }

        const totalPixels = fullCanvas.width * fullCanvas.height;
        auditRes.border = { status: errorCount < (totalPixels * 0.02) ? 'SUCCESS' : 'ERROR' };
      }

      setResult(auditRes);

    } catch (err) {
      setResult({ 
        stamp: { status: 'NOT_PRESENT' }, dna: { status: 'NOT_PRESENT' }, 
        border: { status: 'NOT_PRESENT' }, deed: { status: 'NOT_PRESENT' },
        error: (err as Error).message 
      });
    } finally {
      onProgress(100);
      setIsAuditRunning(false);
      onEnd();
    }
  };

  useEffect(() => {
    if (initialFile) {
      runAudit(initialFile);
    }
  }, [initialFile]);

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) runAudit(file);
  };

  const handleNativeTrigger = () => {
    if (onNativePick) {
      onNativePick('application/zip', async (uri) => {
        try {
          const file = await Filesystem.readFile({ path: uri });
          const byteCharacters = atob(file.data as string);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
          const blob = new Blob([new Uint8Array(byteNumbers)], { type: 'application/zip' });
          runAudit(blob);
        } catch (e) {
          alert("Failed to read file: " + (e as Error).message);
        }
      });
    }
  };

  return (
    <div className="component-container">
      <h2 style={{ color: '#60a5fa' }}>⚡ One-Click Bundle Audit</h2>
      <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>
        Select a PhotoVerify evidence package (.zip) to verify all security layers.
      </p>
      
      <div className="input-group" style={{ marginTop: '15px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {onNativePick ? (
          <button className="btn btn-primary" onClick={handleNativeTrigger} style={{ padding: '15px', border: '2px dashed #60a5fa', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', display: 'block', width: '100%', cursor: 'pointer' }}>
            📂 BROWSE PHOTOVERIFY FOLDER
          </button>
        ) : (
          <label htmlFor="zip-upload" className="btn btn-primary" style={{ display: 'block', cursor: 'pointer', padding: '15px', border: '2px dashed #60a5fa', background: 'rgba(96, 165, 250, 0.1)' }}>
            📂 BROWSE EVIDENCE ZIP
          </label>
        )}
        <input 
          id="zip-upload"
          type="file" 
          accept=".zip" 
          onChange={handleZipUpload} 
          style={{ display: 'none' }} 
        />
      </div>

      {result && !result.error && (
        <div className="results" style={{ marginTop: '20px', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px' }}>
          <h3 style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>🔍 Bundle Report</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
            <div className={`status-item ${result.stamp.status.toLowerCase()}`}>
              <strong>Invisible Stamp:</strong><br/>
              {result.stamp.status === 'SUCCESS' ? `✅ FOUND (${result.stamp.value})` : 
               result.stamp.status === 'ERROR' ? '❌ MISMATCH' : '⚪ NOT PRESENT'}
            </div>
            
            <div className={`status-item ${result.dna.status.toLowerCase()}`}>
              <strong>Visual DNA:</strong><br/>
              {result.dna.status === 'SUCCESS' ? `✅ MATCH (${(result.dna.score! * 100).toFixed(1)}%)` : 
               result.dna.status === 'ERROR' ? `❌ WEAK (${(result.dna.score! * 100).toFixed(1)}%)` : '⚪ NOT PRESENT'}
            </div>

            <div className={`status-item ${result.border.status.toLowerCase()}`}>
              <strong>Physical Border:</strong><br/>
              {result.border.status === 'SUCCESS' ? '✅ PERFECT FIT' : 
               result.border.status === 'ERROR' ? '❌ MISMATCH' : '⚪ NOT PRESENT'}
            </div>

            <div className={`status-item ${result.deed.status.toLowerCase()}`}>
              <strong>Cryptographic Deed:</strong><br/>
              {result.deed.status === 'SUCCESS' ? `✅ VERIFIED` : '⚪ NOT PRESENT'}
            </div>
          </div>

          {result.deed.data && (
            <div style={{ marginTop: '15px', fontSize: '0.8rem', color: '#94a3b8', borderTop: '1px solid #333', paddingTop: '10px' }}>
              Timestamp: {new Date(result.deed.data.timestamp).toLocaleString()}<br/>
              Image Hash: {result.deed.data.imageHash.substring(0, 16)}...
            </div>
          )}
        </div>
      )}

      {result?.error && (
        <div className="results error" style={{ marginTop: '20px' }}>
          <h3>Audit Failed</h3>
          <p>{result.error}</p>
        </div>
      )}
    </div>
  );
}
