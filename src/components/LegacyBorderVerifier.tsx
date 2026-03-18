import { useState, useRef, type ChangeEvent } from 'react';
import { generateForensicPDF, type ReportData } from '../utils/pdfGenerator';
import versionData from '../version.json';

interface Props {
  deviceId: string;
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

interface LoadedFileInfo {
  name: string;
  url: string;
}

export default function LegacyBorderVerifier({ deviceId, onStart, onProgress, onEnd }: Props) {
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [cropped, setCropped] = useState<HTMLImageElement | null>(null);
  const [proof, setProof] = useState<HTMLImageElement | null>(null);
  const [cornerZoom, setCornerZoom] = useState<string | null>(null);
  
  const [fileInfos, setFileInfos] = useState<{
    original?: LoadedFileInfo;
    cropped?: LoadedFileInfo;
    proof?: LoadedFileInfo;
  }>({});

  const [verificationResult, setVerificationResult] = useState<{ success: boolean, message: string } | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileUpload = (type: 'original' | 'cropped' | 'proof', setter: (img: HTMLImageElement) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setter(img);
          setFileInfos(prev => ({
            ...prev,
            [type]: { name: file.name, url }
          }));
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMacroCorner = (interior: HTMLImageElement, border: HTMLImageElement): string => {
    const zoomSize = 20; // 20x20 pixels
    const displaySize = 200; // Display as 200x200
    const canvas = document.createElement('canvas');
    canvas.width = displaySize;
    canvas.height = displaySize;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false; // Essential for pixel-perfect zoom

    // Draw background
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, displaySize, displaySize);

    // Create a temporary small canvas to reconstruct the corner at 1:1
    const temp = document.createElement('canvas');
    temp.width = zoomSize;
    temp.height = zoomSize;
    const tCtx = temp.getContext('2d')!;
    tCtx.drawImage(interior, 1, 1);
    tCtx.drawImage(border, 0, 0);

    // Scale up the corner to the display canvas
    ctx.drawImage(temp, 0, 0, zoomSize, zoomSize, 0, 0, displaySize, displaySize);

    // Draw grid lines to emphasize pixels
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= displaySize; i += (displaySize / zoomSize)) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, displaySize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(displaySize, i); ctx.stroke();
    }

    // Highlight the 1-pixel border area
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, displaySize / zoomSize, displaySize); // Left edge
    ctx.strokeRect(0, 0, displaySize, displaySize / zoomSize); // Top edge

    return canvas.toDataURL();
  };

  const handleExportPDF = () => {
    if (!verificationResult || !original) return;
    const report: ReportData = {
      title: fileInfos.original?.name || 'Border Audit',
      version: versionData.current,
      timestamp: new Date().toLocaleString(),
      deviceId: deviceId,
      results: [{ label: 'Physical Border', status: verificationResult.success ? 'SUCCESS' : 'ERROR', detail: verificationResult.message }],
      images: [
        { label: 'Original', url: fileInfos.original?.url || '' },
        { label: 'Interior', url: fileInfos.cropped?.url || '' },
        { label: 'Border', url: fileInfos.proof?.url || '' },
        { label: 'Macro Corner Zoom (1px Detail)', url: cornerZoom || '' }
      ].filter(img => img.url !== ''),
      forensics: [
        { label: 'Geometric Integrity', value: verificationResult.success ? 'Confirmed' : 'Failed' },
        { label: 'Resolution', value: `${original.width}x${original.height}` }
      ]
    };
    generateForensicPDF(report);
  };

  const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

  const verify = async () => {
    if (!original || !cropped || !proof) {
      setVerificationResult({ success: false, message: "Please upload all 3 files." });
      return;
    }

    onStart();
    onProgress(10);
    
    // Generate Macro Zoom
    const zoom = generateMacroCorner(original, cropped);
    setCornerZoom(zoom);

    const width = original.width;
    const height = original.height;

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.imageSmoothingEnabled = false;

    // 1. Get Clean Original Data
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, width, height).data;
    onProgress(30);
    await yieldToMain();

    // 2. Reconstruct from parts using SOLID overwrite (No alpha blending)
    ctx.clearRect(0, 0, width, height);
    
    // First, draw the Border pixels (they are now on a solid background)
    ctx.drawImage(proof, 0, 0);
    
    // Then, OVERWRITE the interior (this ensures the seam is 100% sharp)
    ctx.drawImage(cropped, 1, 1);
    
    const reconstructedData = ctx.getImageData(0, 0, width, height).data;
    onProgress(60);
    await yieldToMain();

    // 3. Compare with High Tolerance
    const diffCanvas = diffCanvasRef.current;
    let diffCtx = null;
    let diffImgData = null;
    if (diffCanvas) {
      diffCanvas.width = width; diffCanvas.height = height;
      diffCtx = diffCanvas.getContext('2d')!;
      diffImgData = diffCtx.createImageData(width, height);
    }

    let match = true;
    let errorCount = 0;
    const TOLERANCE = 8;

    for (let i = 0; i < originalData.length; i += 4) {
      const rD = Math.abs(originalData[i] - reconstructedData[i]);
      const gD = Math.abs(originalData[i+1] - reconstructedData[i+1]);
      const bD = Math.abs(originalData[i+2] - reconstructedData[i+2]);

      const isPixelMatch = rD <= TOLERANCE && gD <= TOLERANCE && bD <= TOLERANCE;

      if (!isPixelMatch) {
        match = false;
        errorCount++;
        if (diffImgData) {
          diffImgData.data[i] = 255; diffImgData.data[i+1] = 0; diffImgData.data[i+2] = 0; diffImgData.data[i+3] = 255;
        }
      } else if (diffImgData) {
        diffImgData.data[i] = 0; diffImgData.data[i+1] = 255; diffImgData.data[i+2] = 0; diffImgData.data[i+3] = 100;
      }

      if (i % 40000 === 0) {
        onProgress(60 + Math.floor((i / originalData.length) * 30));
        await yieldToMain();
      }
    }

    if (diffCtx && diffImgData) diffCtx.putImageData(diffImgData, 0, 0);

    if (match || errorCount < (width * height * 0.001)) { 
      setVerificationResult({ success: true, message: `Verification Successful! Geometric match confirmed (${errorCount} tiny noise pixels ignored).` });
    } else {
      setVerificationResult({ success: false, message: `Verification Failed! ${errorCount} pixels do not match. See the red error map below.` });
    }
    
    onProgress(100);
    onEnd();
  };

  return (
    <div className="component-container">
      <h2 style={{ color: '#10b981', marginBottom: '15px' }}>📐 Physical Border Audit</h2>
      
      <div className="upload-section" style={{ display: 'grid', gap: '10px', marginBottom: '15px' }}>
        <label className="file-dropzone" style={{ padding: '0.8rem', border: '2px dashed #10b981', background: 'rgba(16, 185, 129, 0.05)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('original', setOriginal)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981' }}>{original ? '✅ ORIGINAL LOADED' : '1. ORIGINAL FILE'}</span>
        </label>
        <label className="file-dropzone" style={{ padding: '0.8rem', border: '2px dashed #10b981', background: 'rgba(16, 185, 129, 0.05)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('cropped', setCropped)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981' }}>{cropped ? '✅ INTERIOR LOADED' : '2. CROPPED INTERIOR'}</span>
        </label>
        <label className="file-dropzone" style={{ padding: '0.8rem', border: '2px dashed #10b981', background: 'rgba(16, 185, 129, 0.05)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('proof', setProof)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#10b981' }}>{proof ? '✅ BORDER LOADED' : '3. 1-PIXEL BORDER'}</span>
        </label>
      </div>

      {(original || cropped || proof) && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
          <div style={{ textAlign: 'center', fontSize: '0.6rem' }}>
            {fileInfos.original && <img src={fileInfos.original.url} style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />}
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px' }}>{fileInfos.original?.name || '...'}</div>
            <strong>Original</strong>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.6rem' }}>
            {fileInfos.cropped && <img src={fileInfos.cropped.url} style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />}
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px' }}>{fileInfos.cropped?.name || '...'}</div>
            <strong>Interior</strong>
          </div>
          <div style={{ textAlign: 'center', fontSize: '0.6rem' }}>
            {fileInfos.proof && <img src={fileInfos.proof.url} style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />}
            <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px' }}>{fileInfos.proof?.name || '...'}</div>
            <strong>Border</strong>
          </div>
        </div>
      )}
      
      <button onClick={verify} className="btn btn-primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', background: '#10b981', borderColor: '#10b981' }}>
        VERIFY PHYSICAL COMBINATION
      </button>
      
      {verificationResult && (
        <div className={`results ${verificationResult.success ? 'success' : 'error'}`} style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>{verificationResult.success ? 'Confirmed' : 'Error'}</h3>
            <button className="btn btn-primary" onClick={handleExportPDF} style={{ padding: '5px 15px', fontSize: '0.8rem', background: '#ef4444', border: 'none' }}>📄 PDF REPORT</button>
          </div>
          <p>{verificationResult.message}</p>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '15px' }}>
            <div>
              <span style={{ fontSize: '0.7em', color: '#888', display: 'block', marginBottom: '5px' }}>Macro Corner Zoom (Top-Left)</span>
              {cornerZoom && <img src={cornerZoom} style={{ width: '100%', border: '2px solid #10b981', borderRadius: '4px' }} />}
            </div>
            <div>
              <span style={{ fontSize: '0.7em', color: '#888', display: 'block', marginBottom: '5px' }}>Geometric Error Map</span>
              <canvas ref={diffCanvasRef} style={{ width: '100%', display: 'block', border: '1px solid #333', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
