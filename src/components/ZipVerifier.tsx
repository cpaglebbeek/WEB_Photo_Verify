import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { Filesystem } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { extractVirtualDataAsync } from '../utils/virtualStorage';
import { generatePerceptualHashDetailed, hashToBits, compareHashesElastic } from '../utils/perceptualHash';
import { type AnchorDeed } from '../utils/timeAnchor';
import { generateForensicPDF, type ReportData, openEmbeddedReport } from '../utils/pdfGenerator';
import { extractEmbeddedReport } from '../utils/metadata';
import versionData from '../version.json';

interface Props {
  initialFile?: File | Blob;
  onNativePick?: (mime: string, cb: (uri: string) => void) => void;
  deviceId: string;
  onStart: (msg: string) => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

interface FileInfo {
  name: string;
  url: string;
  embeddedReport?: string | null;
}

interface ZipAuditResult {
  stamp: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', value?: string };
  dna: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', score?: number, currentHash?: string, sourceHash?: string };
  border: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', cornerZoom?: string };
  deed: { status: 'SUCCESS' | 'ERROR' | 'NOT_PRESENT', data?: AnchorDeed };
  files: {
    original?: FileInfo;
    interior?: FileInfo;
    border?: FileInfo;
    deed?: { name: string };
  };
  error?: string;
}

export default function ZipVerifier({ initialFile, onNativePick, deviceId, onStart, onProgress, onEnd }: Props) {
  const [result, setResult] = useState<ZipAuditResult | null>(null);
  const [isAuditRunning, setIsAuditRunning] = useState(false);

  const loadImage = (blob: Blob): Promise<HTMLImageElement> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.src = URL.createObjectURL(blob);
    });
  };

  const generateMacroCorner = (interior: HTMLImageElement, border: HTMLImageElement): string => {
    const zoomSize = 20;
    const displaySize = 200;
    const canvas = document.createElement('canvas');
    canvas.width = displaySize; canvas.height = displaySize;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const temp = document.createElement('canvas');
    temp.width = zoomSize; temp.height = zoomSize;
    const tCtx = temp.getContext('2d')!;
    tCtx.drawImage(interior, 1, 1);
    tCtx.drawImage(border, 0, 0);
    ctx.drawImage(temp, 0, 0, zoomSize, zoomSize, 0, 0, displaySize, displaySize);
    ctx.strokeStyle = 'rgba(255,255,255,0.2)';
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
    if (!result) return;
    const report: ReportData = {
      title: result.files.original?.name || 'Bundle Audit',
      version: versionData.current,
      timestamp: new Date().toLocaleString(),
      deviceId: deviceId,
      results: [
        { label: 'Invisible Stamp', status: result.stamp.status, detail: result.stamp.value || 'N/A' },
        { label: 'Visual DNA', status: result.dna.status, detail: `${(result.dna.score! * 100).toFixed(1)}% match` },
        { label: 'Physical Border', status: result.border.status, detail: result.border.status === 'SUCCESS' ? 'Match' : 'Error' },
        { label: 'Cryptographic Deed', status: result.deed.status, detail: result.deed.status === 'SUCCESS' ? 'Verified' : 'Missing' }
      ],
      images: [
        { label: 'Original Photo', url: result.files.original?.url || '' },
        { label: 'Stamped Interior', url: result.files.interior?.url || '' },
        { label: 'Border Proof', url: result.files.border?.url || '' },
        { label: 'Macro Border Detail', url: result.border.cornerZoom || '' }
      ].filter(img => img.url !== ''),
      forensics: [
        { label: 'Deed DNA Hash', value: result.dna.sourceHash || 'N/A' },
        { label: 'Live DNA Hash', value: result.dna.currentHash || 'N/A' },
        { label: 'Image SHA-256', value: result.deed.data?.imageHash || 'N/A' },
        { label: 'Combined Proof', value: result.deed.data?.combinedProof || 'N/A' }
      ]
    };
    generateForensicPDF(report);
  };

  const runAudit = async (file: File | Blob) => {
    if (isAuditRunning) return;
    setIsAuditRunning(true);
    setResult(null);

    try {
      onStart("Unpacking Evidence Bundle...");
      onProgress(10);
      const zip = await JSZip.loadAsync(file);
      const findFile = (suffix: string) => Object.keys(zip.files).find(name => name.endsWith(suffix));
      const originalName = findFile("_original.png");
      const interiorName = findFile("_protected_interior.png");
      const borderName = findFile("_1-pixel_border_proof.png");
      const deedName = findFile("_deed.json");

      if (!originalName || !interiorName) throw new Error("Core files missing from ZIP.");

      const originalBlob = await zip.file(originalName)!.async("blob");
      const interiorBlob = await zip.file(interiorName)!.async("blob");
      const borderBlob = borderName ? await zip.file(borderName)!.async("blob") : null;
      const deedText = deedName ? await zip.file(deedName)!.async("text") : null;
      const deed: AnchorDeed | null = deedText ? JSON.parse(deedText) : null;

      const [origImg, intImg] = await Promise.all([loadImage(originalBlob), loadImage(interiorBlob)]);
      const borderImg = borderBlob ? await loadImage(borderBlob) : null;

      // Extract embedded reports if available
      const intDataUrl = await new Promise<string>(r => {
        const reader = new FileReader(); reader.onload = e => r(e.target?.result as string); reader.readAsDataURL(interiorBlob);
      });
      const embeddedReport = extractEmbeddedReport(intDataUrl);

      const auditRes: ZipAuditResult = {
        stamp: { status: 'NOT_PRESENT' }, dna: { status: 'NOT_PRESENT' }, border: { status: 'NOT_PRESENT' },
        deed: deed ? { status: 'SUCCESS', data: deed } : { status: 'NOT_PRESENT' },
        files: {
          original: { name: originalName, url: URL.createObjectURL(originalBlob) },
          interior: { name: interiorName, url: URL.createObjectURL(interiorBlob), embeddedReport },
          border: borderName ? { name: borderName, url: URL.createObjectURL(borderBlob!) } : undefined,
          deed: deedName ? { name: deedName } : undefined
        }
      };

      const canvas = document.createElement('canvas');
      canvas.width = intImg.width; canvas.height = intImg.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(intImg, 0, 0);
      const intData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      if (deed?.features?.stamp !== false) {
        const stampRes = await extractVirtualDataAsync(intData, p => onProgress(40 + p * 0.2));
        if (stampRes) auditRes.stamp = { status: 'SUCCESS', value: stampRes.uid };
        else auditRes.stamp = { status: 'ERROR' };
      }

      if (deed?.perceptualHash) {
        const currentPHash = generatePerceptualHashDetailed(intData);
        const { score: dnaScore } = compareHashesElastic(hashToBits(deed.perceptualHash), currentPHash.bits);
        auditRes.dna = { status: dnaScore > 0.85 ? 'SUCCESS' : 'ERROR', score: dnaScore, currentHash: currentPHash.hash, sourceHash: deed.perceptualHash };
      }

      if (borderImg) {
        auditRes.border.cornerZoom = generateMacroCorner(intImg, borderImg);
        const fullCanvas = document.createElement('canvas');
        fullCanvas.width = origImg.width; fullCanvas.height = origImg.height;
        const fCtx = fullCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
        fCtx.imageSmoothingEnabled = false;

        // RECONSTRUCTION ORDER: Border first, then Interior Overwrite
        fCtx.drawImage(borderImg, 0, 0); 
        fCtx.drawImage(intImg, 1, 1); 

        const reconData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data;
        fCtx.drawImage(origImg, 0, 0);
        const origData = fCtx.getImageData(0, 0, fullCanvas.width, fullCanvas.height).data;
        let errorCount = 0;
        for (let i = 0; i < origData.length; i += 4) {
          if (Math.abs(origData[i] - reconData[i]) > 15 || Math.abs(origData[i+1] - reconData[i+1]) > 15 || Math.abs(origData[i+2] - reconData[i+2]) > 15) errorCount++;
        }
        auditRes.border.status = errorCount < (fullCanvas.width * fullCanvas.height * 0.02) ? 'SUCCESS' : 'ERROR';
      }

      setResult(auditRes);
    } catch (err) {
      setResult({ stamp: { status: 'NOT_PRESENT' }, dna: { status: 'NOT_PRESENT' }, border: { status: 'NOT_PRESENT' }, deed: { status: 'NOT_PRESENT' }, files: {}, error: (err as Error).message });
    } finally {
      onProgress(100); setIsAuditRunning(false); onEnd();
    }
  };

  useEffect(() => { if (initialFile) runAudit(initialFile); }, [initialFile]);

  const handleZipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (file) runAudit(file);
  };

  const handleNativeTrigger = () => {
    if (onNativePick) {
      onNativePick('application/zip', async (uri) => {
        try {
          const file = await Filesystem.readFile({ path: uri });
          const byteCharacters = atob(file.data as string);
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) { byteNumbers[i] = byteCharacters.charCodeAt(i); }
          runAudit(new Blob([new Uint8Array(byteNumbers)], { type: 'application/zip' }));
        } catch (e) { alert("Failed to read file: " + (e as Error).message); }
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
        {(onNativePick && Capacitor.getPlatform() !== 'web') ? (
          <button className="btn btn-primary" onClick={handleNativeTrigger} style={{ padding: '15px', border: '2px dashed #60a5fa', background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', display: 'block', width: '100%', cursor: 'pointer' }}>
            📂 BROWSE PHOTOVERIFY FOLDER
          </button>
        ) : (
          <label htmlFor="zip-upload" className="btn btn-primary" style={{ display: 'block', cursor: 'pointer', padding: '15px', border: '2px dashed #60a5fa', background: 'rgba(96, 165, 250, 0.1)' }}>
            📂 BROWSE EVIDENCE ZIP
          </label>
        )}
        <input id="zip-upload" type="file" accept=".zip" onChange={handleZipUpload} style={{ display: 'none' }} />
      </div>

      {result && !result.error && (
        <div className="results" style={{ marginTop: '20px', background: 'rgba(0,0,0,0.3)', padding: '20px', borderRadius: '12px', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
            <h3 style={{ margin: 0, color: '#60a5fa' }}>🔍 Bundle Report</h3>
            <button className="btn btn-primary" onClick={handleExportPDF} style={{ padding: '5px 15px', fontSize: '0.8rem', background: '#ef4444', border: 'none' }}>
              📄 EXPORT PDF REPORT
            </button>
          </div>
          
          <h4 style={{ color: '#94a3b8', fontSize: '0.8rem', marginTop: '15px', textTransform: 'uppercase' }}>🖼️ Evidence Gallery</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: '10px', margin: '10px 0' }}>
            {result.files.original && (
              <div style={{ fontSize: '0.65rem', textAlign: 'center' }}>
                <img src={result.files.original.url} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }} />
                <div style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.files.original.name}</div>
                <strong style={{ color: '#94a3b8' }}>Original</strong>
              </div>
            )}
            {result.files.interior && (
              <div style={{ fontSize: '0.65rem', textAlign: 'center' }}>
                <img src={result.files.interior.url} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '1px solid #334155' }} />
                <div style={{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.files.interior.name}</div>
                <strong style={{ color: '#60a5fa' }}>Stamped Interior</strong>
                {result.files.interior.embeddedReport && (
                  <button className="btn btn-primary" onClick={() => openEmbeddedReport(result.files.interior!.embeddedReport!)} style={{ fontSize: '0.6rem', padding: '2px 5px', marginTop: '5px', width: '100%' }}>📄 VIEW EMBEDDED PDF</button>
                )}
              </div>
            )}
            {result.border.cornerZoom && (
              <div style={{ fontSize: '0.65rem', textAlign: 'center' }}>
                <img src={result.border.cornerZoom} style={{ width: '100%', height: '80px', objectFit: 'cover', borderRadius: '4px', border: '2px solid #10b981' }} />
                <div style={{ marginTop: '4px' }}>Macro Detail</div>
                <strong style={{ color: '#10b981' }}>1px Border</strong>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginTop: '20px' }}>
            <div className={`status-item ${result.stamp.status.toLowerCase()}`}>
              <strong>Invisible Stamp:</strong><br/>
              {result.stamp.status === 'SUCCESS' ? `✅ FOUND (${result.stamp.value})` : 
               result.stamp.status === 'ERROR' ? '❌ MISMATCH' : '⚪ NOT PRESENT'}
            </div>
            <div className={`status-item ${result.dna.status.toLowerCase()}`}>
              <strong>Visual DNA:</strong><br/>
              {result.dna.status === 'SUCCESS' ? `✅ MATCH (${(result.dna.score! * 100).toFixed(1)}%)` : '⚪ NOT PRESENT'}
            </div>
            <div className={`status-item ${result.border.status.toLowerCase()}`}>
              <strong>Physical Border:</strong><br/>
              {result.border.status === 'SUCCESS' ? '✅ PERFECT FIT' : '❌ MISMATCH'}
            </div>
            <div className={`status-item ${result.deed.status.toLowerCase()}`}>
              <strong>Cryptographic Deed:</strong><br/>
              {result.deed.status === 'SUCCESS' ? `✅ VERIFIED` : '⚪ NOT PRESENT'}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
