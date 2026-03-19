import { useState, useRef, type ChangeEvent } from 'react';
import JSZip from 'jszip';
import { generateForensicPDF, type ReportData } from '../utils/pdfGenerator';
import { extractBorderRingRGB } from '../utils/forensics';
import { sha256 } from '../utils/timeAnchor';
import versionData from '../version.json';

interface Deed {
  borderHash?: string;
  imageDimensions?: { width: number; height: number };
  imageHash?: string;
  timestamp?: number;
}

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

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });

export default function LegacyBorderVerifier({ deviceId, onStart, onProgress, onEnd }: Props) {
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [cropped, setCropped] = useState<HTMLImageElement | null>(null);
  const [proof, setProof] = useState<HTMLImageElement | null>(null);
  const [cornerZoom, setCornerZoom] = useState<string | null>(null);
  const [zipStatus, setZipStatus] = useState<string | null>(null);
  const [deed, setDeed] = useState<Deed | null>(null);

  const [fileInfos, setFileInfos] = useState<{
    original?: LoadedFileInfo;
    cropped?: LoadedFileInfo;
    proof?: LoadedFileInfo;
  }>({});

  const [verificationResult, setVerificationResult] = useState<{ success: boolean, message: string } | null>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);

  // --- ZIP import: auto-extract all 3 files by filename suffix ---
  const handleZipImport = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setZipStatus('Reading ZIP...');
    setVerificationResult(null);
    try {
      const zip = await JSZip.loadAsync(file);
      let foundOriginal: string | null = null;
      let foundBorder: string | null = null;
      let foundInterior: string | null = null;
      let nameOriginal = '';
      let nameBorder = '';
      let nameInterior = '';
      let foundDeed: Deed | null = null;

      for (const [filename, zipEntry] of Object.entries(zip.files)) {
        if (zipEntry.dir) continue;
        if (filename.endsWith('_original.png')) {
          foundOriginal = 'data:image/png;base64,' + await zipEntry.async('base64');
          nameOriginal = filename;
        } else if (filename.endsWith('_1-pixel_border_proof.png')) {
          foundBorder = 'data:image/png;base64,' + await zipEntry.async('base64');
          nameBorder = filename;
        } else if (filename.endsWith('_protected_interior.png')) {
          foundInterior = 'data:image/png;base64,' + await zipEntry.async('base64');
          nameInterior = filename;
        } else if (filename.endsWith('_deed.json')) {
          try { foundDeed = JSON.parse(await zipEntry.async('text')); } catch { /* skip */ }
        }
      }

      const missing: string[] = [];
      if (!foundOriginal) missing.push('original');
      if (!foundBorder) missing.push('border proof');
      if (!foundInterior) missing.push('protected interior');

      if (missing.length > 0) {
        setZipStatus(`ZIP incomplete — missing: ${missing.join(', ')}`);
        return;
      }

      const [imgOriginal, imgBorder, imgInterior] = await Promise.all([
        loadImage(foundOriginal!),
        loadImage(foundBorder!),
        loadImage(foundInterior!),
      ]);

      setOriginal(imgOriginal);
      setProof(imgBorder);
      setCropped(imgInterior);
      setDeed(foundDeed);
      setFileInfos({
        original: { name: nameOriginal, url: foundOriginal! },
        proof: { name: nameBorder, url: foundBorder! },
        cropped: { name: nameInterior, url: foundInterior! },
      });
      const deedInfo = foundDeed?.borderHash ? ' · deed hash ✓' : ' · geen deed (oud ZIP)';
      setZipStatus(`ZIP loaded — ${nameOriginal.split('_original')[0]}${deedInfo}`);
    } catch (err: any) {
      setZipStatus(`ZIP error: ${err.message}`);
    }
    e.target.value = '';
  };

  const handleFileUpload = (type: 'original' | 'cropped' | 'proof', setter: (img: HTMLImageElement) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const url = event.target?.result as string;
        const img = new Image();
        img.onload = () => {
          setter(img);
          setFileInfos(prev => ({ ...prev, [type]: { name: file.name, url } }));
        };
        img.src = url;
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMacroCorner = (interior: HTMLImageElement, border: HTMLImageElement): string => {
    const zoomSize = 20;
    const displaySize = 200;
    const canvas = document.createElement('canvas');
    canvas.width = displaySize; canvas.height = displaySize;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, displaySize, displaySize);

    const temp = document.createElement('canvas');
    temp.width = zoomSize; temp.height = zoomSize;
    const tCtx = temp.getContext('2d')!;
    tCtx.drawImage(interior, 1, 1);
    tCtx.drawImage(border, 0, 0);

    ctx.drawImage(temp, 0, 0, zoomSize, zoomSize, 0, 0, displaySize, displaySize);

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1;
    for (let i = 0; i <= displaySize; i += (displaySize / zoomSize)) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, displaySize); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(displaySize, i); ctx.stroke();
    }

    ctx.strokeStyle = '#10b981'; ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, displaySize / zoomSize, displaySize);
    ctx.strokeRect(0, 0, displaySize, displaySize / zoomSize);
    return canvas.toDataURL();
  };

  const handleExportPDF = () => {
    if (!verificationResult || !original) return;
    const report: ReportData = {
      title: fileInfos.original?.name || 'Border Audit',
      version: versionData.current,
      timestamp: new Date().toLocaleString(),
      deviceId,
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
      setVerificationResult({ success: false, message: "Upload all 3 files or import a PhotoVerify ZIP." });
      return;
    }

    onStart();
    onProgress(10);

    const zoom = generateMacroCorner(cropped, proof);
    setCornerZoom(zoom);

    const width = original.width;
    const height = original.height;

    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.imageSmoothingEnabled = false;

    // 1. Draw original — read full image data once
    ctx.drawImage(original, 0, 0);
    const originalImageData = ctx.getImageData(0, 0, width, height);
    const originalData = originalImageData.data;
    onProgress(30);
    await yieldToMain();

    // 2. Primary verdict: SHA-256 hash of border ring (no PNG round-trip)
    let hashVerdict: { success: boolean; message: string } | null = null;
    if (deed?.borderHash) {
      const computedHash = await sha256(extractBorderRingRGB(originalImageData));
      const match = computedHash === deed.borderHash;
      hashVerdict = match
        ? { success: true, message: `Border Hash Verified ✓ SHA-256 van de 1px ring komt exact overeen met deed.` }
        : { success: false, message: `Border Hash MISMATCH ✗ SHA-256 verschilt van deed — border is gewijzigd of foto is vervangen.` };
      onProgress(50);
    }
    await yieldToMain();

    // 3. Visual diff map (context only — not used for verdict when deed is available)
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(proof, 0, 0, width, height);
    ctx.drawImage(cropped, 1, 1, width - 2, height - 2);
    const reconstructedData = ctx.getImageData(0, 0, width, height).data;
    onProgress(60);
    await yieldToMain();

    const diffCanvas = diffCanvasRef.current;
    let diffCtx = null;
    let diffImgData = null;
    if (diffCanvas) {
      diffCanvas.width = width; diffCanvas.height = height;
      diffCtx = diffCanvas.getContext('2d')!;
      diffImgData = diffCtx.createImageData(width, height);
    }

    let errorCount = 0;
    const TOLERANCE = 4;
    const borderPixelCount = 2 * width + 2 * (height - 2);

    for (let i = 0; i < originalData.length; i += 4) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      const isBorderPixel = x === 0 || x === width - 1 || y === 0 || y === height - 1;

      if (!isBorderPixel) {
        if (diffImgData) {
          diffImgData.data[i] = 0; diffImgData.data[i+1] = 80; diffImgData.data[i+2] = 80; diffImgData.data[i+3] = 40;
        }
        continue;
      }

      const rD = Math.abs(originalData[i] - reconstructedData[i]);
      const gD = Math.abs(originalData[i+1] - reconstructedData[i+1]);
      const bD = Math.abs(originalData[i+2] - reconstructedData[i+2]);

      if (rD > TOLERANCE || gD > TOLERANCE || bD > TOLERANCE) {
        errorCount++;
        if (diffImgData) {
          diffImgData.data[i] = 255; diffImgData.data[i+1] = 0; diffImgData.data[i+2] = 0; diffImgData.data[i+3] = 255;
        }
      } else if (diffImgData) {
        diffImgData.data[i] = 0; diffImgData.data[i+1] = 255; diffImgData.data[i+2] = 0; diffImgData.data[i+3] = 200;
      }

      if (i % 40000 === 0) {
        onProgress(60 + Math.floor((i / originalData.length) * 30));
        await yieldToMain();
      }
    }

    if (diffCtx && diffImgData) diffCtx.putImageData(diffImgData, 0, 0);

    // 4. Verdict: hash-based (primary) or pixel-based fallback for old ZIPs
    if (hashVerdict) {
      const visualNote = errorCount > 0 ? ` (visuele diff: ${errorCount}/${borderPixelCount} px)` : '';
      setVerificationResult({ ...hashVerdict, message: hashVerdict.message + visualNote });
    } else {
      // Fallback: no deed — use pixel comparison only
      if (errorCount < (borderPixelCount * 0.01)) {
        setVerificationResult({ success: true, message: `Border OK (geen deed — visuele check: ${errorCount} afwijkende pixels van ${borderPixelCount}).` });
      } else {
        setVerificationResult({ success: false, message: `Border Mismatch (geen deed — ${errorCount} van ${borderPixelCount} pixels wijken af). Gebruik een nieuw ZIP voor hash-verificatie.` });
      }
    }

    onProgress(100);
    onEnd();
  };

  const allLoaded = original && cropped && proof;

  return (
    <div className="component-container">
      <h2 style={{ color: '#10b981', marginBottom: '15px' }}>📐 Physical Border Audit</h2>

      {/* ZIP Import — primary method */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{ display: 'block', padding: '1rem', border: '2px dashed #10b981', background: 'rgba(16,185,129,0.08)', borderRadius: '8px', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept=".zip" onChange={handleZipImport} style={{ display: 'none' }} />
          <div style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#10b981' }}>📦 IMPORT PHOTOVERIFY ZIP</div>
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '4px' }}>Auto-detects original, border and interior</div>
        </label>
        {zipStatus && (
          <div style={{ marginTop: '8px', padding: '8px 12px', borderRadius: '6px', fontSize: '0.8rem', background: allLoaded ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', color: allLoaded ? '#10b981' : '#ef4444', border: `1px solid ${allLoaded ? '#10b981' : '#ef4444'}` }}>
            {allLoaded ? '✅ ' : '⚠️ '}{zipStatus}
          </div>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px', color: '#4b5563', fontSize: '0.75rem' }}>
        <div style={{ flex: 1, height: '1px', background: '#374151' }} />
        <span>or upload manually</span>
        <div style={{ flex: 1, height: '1px', background: '#374151' }} />
      </div>

      {/* Manual upload — fallback */}
      <div className="upload-section" style={{ display: 'grid', gap: '8px', marginBottom: '15px' }}>
        <label className="file-dropzone" style={{ padding: '0.7rem', border: '1px dashed #374151', background: 'rgba(16,185,129,0.03)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('original', setOriginal)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: original ? '#10b981' : '#6b7280' }}>{original ? '✅ ORIGINAL LOADED' : '1. *_original.png'}</span>
        </label>
        <label className="file-dropzone" style={{ padding: '0.7rem', border: '1px dashed #374151', background: 'rgba(16,185,129,0.03)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('proof', setProof)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: proof ? '#10b981' : '#6b7280' }}>{proof ? '✅ BORDER LOADED' : '2. *_1-pixel_border_proof.png'}</span>
        </label>
        <label className="file-dropzone" style={{ padding: '0.7rem', border: '1px dashed #374151', background: 'rgba(16,185,129,0.03)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleFileUpload('cropped', setCropped)} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: cropped ? '#10b981' : '#6b7280' }}>{cropped ? '✅ INTERIOR LOADED' : '3. *_protected_interior.png'}</span>
        </label>
      </div>

      {/* Preview thumbnails */}
      {allLoaded && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
          {(['original', 'proof', 'cropped'] as const).map((key) => (
            <div key={key} style={{ textAlign: 'center', fontSize: '0.6rem' }}>
              {fileInfos[key] && <img src={fileInfos[key]!.url} style={{ width: '100%', height: '60px', objectFit: 'cover', borderRadius: '4px' }} />}
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '4px', color: '#9ca3af' }}>{fileInfos[key]?.name || '...'}</div>
              <strong style={{ color: '#10b981' }}>{key === 'proof' ? 'Border' : key === 'cropped' ? 'Interior' : 'Original'}</strong>
            </div>
          ))}
        </div>
      )}

      <button onClick={verify} className="btn btn-primary" disabled={!allLoaded} style={{ width: '100%', padding: '15px', fontSize: '1.1rem', background: allLoaded ? '#10b981' : '#374151', borderColor: allLoaded ? '#10b981' : '#374151', cursor: allLoaded ? 'pointer' : 'not-allowed' }}>
        VERIFY PHYSICAL BORDER
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
              <span style={{ fontSize: '0.7em', color: '#888', display: 'block', marginBottom: '5px' }}>Border Ring Error Map</span>
              <canvas ref={diffCanvasRef} style={{ width: '100%', display: 'block', border: '1px solid #333', borderRadius: '4px' }} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
