import { useState, type ChangeEvent } from 'react';
import { extractVirtualDataAsync } from '../utils/virtualStorage';
import { getHistory, type HistoryEntry } from '../utils/history';
import { generateForensicPDF, type ReportData, openEmbeddedReport } from '../utils/pdfGenerator';
import { extractEmbeddedReport } from '../utils/metadata';
import versionData from '../version.json';

interface Props {
  deviceId: string;
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

export default function CopyrightVerifier({ deviceId, onStart, onProgress, onEnd }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [filename, setFilename] = useState<string>('');
  const [result, setResult] = useState<{ uid: string, confidence: number, diagnostics?: string, embeddedReport?: string | null } | null>(null);
  const [scanAttempted, setScanAttempted] = useState(false);
  const [showRecent, setShowRecent] = useState(false);

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const loadFile = (file: File | Blob, name?: string) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => { 
        setImage(img); 
        setFilename(name || (file as File).name || 'recent_photo.png');
        setScanAttempted(false); 
        setResult(null); 
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleExportPDF = () => {
    if (!result || !image) return;
    const report: ReportData = {
      title: filename,
      version: versionData.current,
      timestamp: new Date().toLocaleString(),
      deviceId: deviceId,
      results: [{ label: 'Invisible Stamp', status: 'SUCCESS', detail: `Code: ${result.uid} (${(result.confidence * 100).toFixed(1)}% confidence)` }],
      images: [{ label: 'Scanned Photo', url: image.src }],
      forensics: [
        { label: 'Found UID', value: result.uid },
        { label: 'Extraction Confidence', value: `${(result.confidence * 100).toFixed(1)}%` },
        { label: 'Diagnostics', value: result.diagnostics || 'None' }
      ]
    };
    generateForensicPDF(report);
  };

  const scan = async () => {
    if (!image) return;
    onStart();
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    const embeddedReport = extractEmbeddedReport(image.src);
    const data = await extractVirtualDataAsync(imageData, onProgress);
    
    if (data) {
      setResult({ uid: data.uid, confidence: data.confidence, diagnostics: data.diagnostics, embeddedReport });
    } else {
      setResult(embeddedReport ? { uid: 'REPORT ONLY', confidence: 0, embeddedReport } : null);
    }
    setScanAttempted(true);
    onEnd();
  };

  return (
    <div className="component-container">
      <h2 style={{ color: '#fbbf24', marginBottom: '15px' }}>🔍 Scan Invisible Stamp</h2>
      <div className="upload-section">
        <div style={{ display: 'flex', gap: '10px' }}>
          <label className="file-dropzone" style={{ flex: 1, padding: '1.5rem', border: '2px dashed #fbbf24', background: 'rgba(251, 191, 36, 0.05)', cursor: 'pointer' }}>
            <input type="file" accept="image/*" onChange={handleFileUpload} />
            <span style={{ fontWeight: 'bold', color: '#fbbf24' }}>📁 BROWSE FOLDERS</span>
          </label>
          <button className="btn btn-secondary" style={{ padding: '0 20px', border: '1px solid #475569' }} onClick={() => setShowRecent(!showRecent)} title="Recent Files">
            🕒 RECENT
          </button>
        </div>
      </div>

      {showRecent && (
        <div className="card-glass mt-1" style={{ maxHeight: '200px', overflowY: 'auto', background: 'rgba(0,0,0,0.5)', border: '1px solid #334155' }}>
          <h4 style={{ fontSize: '0.8rem', margin: '0 0 10px 0', color: '#94a3b8' }}>RECENTLY PROTECTED</h4>
          {getHistory('image').length === 0 && <p style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>No recent files found.</p>}
          {getHistory('image').map((entry: HistoryEntry) => (
            <div key={entry.id} className="info-sub" style={{ padding: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #1e293b' }} onClick={() => { setShowRecent(false); }}>
              <span style={{ fontSize: '0.8rem' }}>🖼️ {entry.filename}</span>
              <small style={{ color: 'var(--text-dim)' }}>{new Date(entry.timestamp).toLocaleDateString()}</small>
            </div>
          ))}
        </div>
      )}
      
      {image && (
        <div className="mt-1 text-center" style={{ background: 'rgba(0,0,0,0.2)', padding: '15px', borderRadius: '10px' }}>
          <p style={{ color: '#10b981', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '10px' }}>✅ LOADED: {filename}</p>
          <button onClick={scan} className="btn btn-primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', boxShadow: '0 0 15px rgba(96, 165, 250, 0.3)' }}>
            SCAN FOR INVISIBLE STAMP & REPORT
          </button>
        </div>
      )}

      {scanAttempted && result && (
        <div className="results success">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h3 style={{ margin: 0 }}>Scan Result</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              {result.uid !== 'REPORT ONLY' && <button className="btn btn-primary" onClick={handleExportPDF} style={{ padding: '5px 15px', fontSize: '0.8rem', background: '#ef4444', border: 'none' }}>📄 NEW PDF</button>}
              {result.embeddedReport && <button className="btn btn-primary" onClick={() => openEmbeddedReport(result.embeddedReport!)} style={{ padding: '5px 15px', fontSize: '0.8rem', background: '#10b981', border: 'none' }}>📜 VIEW EMBEDDED PDF</button>}
            </div>
          </div>
          {result.uid !== 'REPORT ONLY' && (
            <>
              <p>Found Code: <strong style={{ fontSize: '1.5em', color: '#0f0', letterSpacing: '2px' }}>{result.uid}</strong></p>
              <p>Confidence: <strong>{(result.confidence * 100).toFixed(1)}%</strong></p>
            </>
          )}
          {result.embeddedReport && <p style={{ fontSize: '0.8rem', color: '#10b981' }}>✅ High-Integrity Forensic Report found inside image pixels.</p>}
        </div>
      )}
    </div>
  );
}
