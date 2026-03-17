import { useState, useRef, useEffect, type ChangeEvent } from 'react';
import { sha256, generateCombinedProof, type AnchorDeed } from '../utils/timeAnchor';
import { generatePerceptualHashDetailed, hashToBits, compareHashesElastic } from '../utils/perceptualHash';
import { generateHistogram, detectQuantization, type HistogramData } from '../utils/forensics';

const ClassificationTable = ({ currentVal }: { currentVal: number }) => {
  const getStyle = (min: number, max: number) => {
    const isActive = currentVal >= min && currentVal < max;
    return {
      color: isActive ? (min >= 0.85 ? '#2ecc71' : (min >= 0.75 ? '#f39c12' : '#e74c3c')) : '#555',
      fontWeight: isActive ? 'bold' : 'normal',
      background: isActive ? 'rgba(255,255,255,0.05)' : 'transparent',
      transition: 'all 0.3s ease'
    };
  };
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85em', marginTop: '10px' }}>
      <tbody>
        <tr style={getStyle(0.98, 1.01)}><td style={{ padding: '4px' }}>98-100%</td><td style={{ padding: '4px' }}>Identical (Original)</td></tr>
        <tr style={getStyle(0.85, 0.98)}><td style={{ padding: '4px' }}>85-98%</td><td style={{ padding: '4px' }}>High Confidence (Edited)</td></tr>
        <tr style={getStyle(0.75, 0.85)}><td style={{ padding: '4px' }}>75-85%</td><td style={{ padding: '4px' }}>Probable Match (Cropped)</td></tr>
        <tr style={getStyle(0.00, 0.75)}><td style={{ padding: '4px' }}>&lt; 75%</td><td style={{ padding: '4px' }}>Unreliable / No Match</td></tr>
      </tbody>
    </table>
  );
};

interface Props {
  onStart: () => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

interface AuditResult {
  success: boolean;
  message: string;
  detail: string;
  matchScore: number;
  analysis: {
    resize: string;
    ratio: string;
    color: string;
    crop: string;
    quantizationGaps: number;
  };
}

interface ComparisonData {
  sourceBits: number[];
  currentBits: number[];
}

export default function TimeAnchorVerifier({ onStart, onProgress, onEnd }: Props) {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [deed, setDeed] = useState<AnchorDeed | null>(null);
  const [threshold, setThreshold] = useState<number>(0.85);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [comparisonData, setComparisonData] = useState<ComparisonData | null>(null);
  const [histData, setHistData] = useState<HistogramData | null>(null);
  
  const canvasSourceRef = useRef<HTMLCanvasElement>(null);
  const canvasCurrentRef = useRef<HTMLCanvasElement>(null);
  const canvasDiffRef = useRef<HTMLCanvasElement>(null);
  const canvasHistRef = useRef<HTMLCanvasElement>(null);

  const drawGrid = (canvas: HTMLCanvasElement | null, bits: number[]) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 160, 160);
    bits.forEach((bit, i) => {
      ctx.fillStyle = bit === 1 ? '#61dafb' : '#1e293b';
      ctx.fillRect((i % 16) * 10, Math.floor(i / 16) * 10, 9, 9);
    });
  };

  const drawDiffGrid = (canvas: HTMLCanvasElement | null, bits1: number[], bits2: number[]) => {
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 160, 160);
    bits1.forEach((_, i) => {
      ctx.fillStyle = bits1[i] === bits2[i] ? '#2ecc71' : '#e74c3c';
      ctx.fillRect((i % 16) * 10, Math.floor(i / 16) * 10, 9, 9);
    });
  };

  const drawHistogram = (canvas: HTMLCanvasElement, data: HistogramData) => {
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#61dafb';
    const barWidth = canvas.width / 256;
    for (let i = 0; i < 256; i++) {
      const barHeight = (data.luminance[i] / (data.max || 1)) * canvas.height;
      ctx.fillRect(i * barWidth, canvas.height - barHeight, barWidth, barHeight);
    }
  };

  const handleImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => { setImage(img); setImageSrc(event.target?.result as string); setAuditResult(null); };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDeedUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try { setDeed(JSON.parse(event.target?.result as string)); setAuditResult(null); } catch { alert("Invalid deed."); }
      };
      reader.readAsText(file);
    }
  };

  useEffect(() => {
    if (comparisonData && auditResult) {
      drawGrid(canvasSourceRef.current, comparisonData.sourceBits);
      drawGrid(canvasCurrentRef.current, comparisonData.currentBits);
      drawDiffGrid(canvasDiffRef.current, comparisonData.sourceBits, comparisonData.currentBits);
    }
    if (histData && canvasHistRef.current) drawHistogram(canvasHistRef.current, histData);
  }, [comparisonData, auditResult, histData]);

  const auditOwnership = async () => {
    if (!image || !deed) return;
    onStart();
    onProgress(10);
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    onProgress(30);
    const currentHash = await sha256(imageData.data);
    const exactMatch = (currentHash === deed.imageHash);
    
    onProgress(50);
    const currentPHashResult = generatePerceptualHashDetailed(imageData);
    const sourceBits = hashToBits(deed.perceptualHash || "");
    const { score: visualMatch, offsetBits: alignedCurrentBits } = compareHashesElastic(sourceBits, currentPHashResult.bits);
    setComparisonData({ sourceBits, currentBits: alignedCurrentBits });

    onProgress(70);
    const currentHist = generateHistogram(imageData);
    setHistData(currentHist);
    const gaps = detectQuantization(currentHist.luminance);

    const analysis = { 
      resize: "Unknown", ratio: "Unknown", color: "Unknown", crop: "None", quantizationGaps: gaps
    };

    if (deed.metadata) {
      const sizeDiff = Math.abs(1 - (image.width * image.height) / (deed.metadata.width * deed.metadata.height));
      analysis.resize = sizeDiff < 0.01 ? "Original" : `Changed (${image.width}x${image.height})`;
      const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
      const common = gcd(image.width, image.height);
      analysis.ratio = `${image.width/common}:${image.height/common}` === deed.metadata.aspectRatio ? "Same" : "Changed";
      analysis.crop = visualMatch > threshold && !exactMatch ? "Likely cropped" : "Not detected";
    }

    onProgress(90);
    const recalculatedProof = await generateCombinedProof(deed.imageHash, deed.anchorHash);
    if (recalculatedProof !== deed.combinedProof) { alert("Deed corrupted!"); onEnd(); return; }

    setAuditResult({
      success: exactMatch || visualMatch >= threshold,
      message: exactMatch ? "Perfect Match!" : (visualMatch >= threshold ? "Visual Match Found!" : "No Match!"),
      detail: exactMatch ? "Exact original file." : (visualMatch >= threshold ? "Content matches above threshold." : "Below threshold."),
      matchScore: visualMatch, analysis
    });
    onProgress(100);
    onEnd();
  };

  return (
    <div className="component-container" style={{ borderTop: '4px solid #3498db', paddingTop: '20px' }}>
      <h2 style={{ color: '#3498db', marginBottom: '15px' }}>📜 Time-Anchor Audit</h2>
      <div className="input-group" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px' }}>
        <label className="file-dropzone" style={{ padding: '1rem', border: '2px dashed #3498db', background: 'rgba(52, 152, 219, 0.05)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept="image/*" onChange={handleImageUpload} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#3498db' }}>🖼️ PHOTO</span>
        </label>
        <label className="file-dropzone" style={{ padding: '1rem', border: '2px dashed #3498db', background: 'rgba(52, 152, 219, 0.05)', cursor: 'pointer', textAlign: 'center' }}>
          <input type="file" accept=".json" onChange={handleDeedUpload} style={{ display: 'none' }} />
          <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#3498db' }}>📄 DEED</span>
        </label>
      </div>

      <div style={{ background: '#111', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #334155' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
          <span>Threshold:</span>
          <strong style={{ color: '#3498db' }}>{(threshold * 100).toFixed(0)}%</strong>
        </div>
        <input type="range" min="0.5" max="1.0" step="0.01" value={threshold} onChange={e => setThreshold(parseFloat(e.target.value))} style={{ width: '100%' }} />
        <ClassificationTable currentVal={threshold} />
      </div>

      {image && deed && (
        <button onClick={auditOwnership} className="btn btn-primary" style={{ width: '100%', padding: '15px', fontSize: '1.1rem', background: '#3498db', borderColor: '#3498db' }}>
          START FORENSIC AUDIT
        </button>
      )}

      {auditResult && (
        <div className="audit-visualization" style={{ marginTop: '20px', background: '#000', padding: '20px', borderRadius: '12px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '15px', textAlign: 'center', fontSize: '0.7em', color: '#888', marginBottom: '20px' }}>
            <div><span>Deed DNA</span><canvas ref={canvasSourceRef} width={160} height={160} style={{ display: 'block', margin: '5px auto', border: '1px solid #333' }} /></div>
            <div><span>Photo DNA</span><canvas ref={canvasCurrentRef} width={160} height={160} style={{ display: 'block', margin: '5px auto', border: '1px solid #333' }} /></div>
            <div><span>Diff Map</span><canvas ref={canvasDiffRef} width={160} height={160} style={{ display: 'block', margin: '5px auto', border: '1px solid #333' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            {imageSrc && <div style={{ flex: 1 }}><img src={imageSrc} alt="Preview" style={{ maxWidth: '100%', borderRadius: '8px', border: '1px solid #333' }} /><canvas ref={canvasHistRef} width={300} height={60} style={{ display: 'block', width: '100%', height: '60px', background: '#111', borderRadius: '4px', marginTop: '5px' }} /></div>}
            {auditResult.analysis && (
              <div style={{ flex: 1, background: '#111', padding: '15px', borderRadius: '8px', fontSize: '0.85em' }}>
                <h4 style={{ margin: '0 0 10px 0', color: '#61dafb' }}>Forensic Report</h4>
                <ul style={{ listStyle: 'none', padding: 0 }}>
                  <li>📏 Size: {auditResult.analysis.resize}</li>
                  <li>✂️ Crop: {auditResult.analysis.crop}</li>
                  <li>📉 Histogram Gaps: {auditResult.analysis.quantizationGaps}</li>
                </ul>
              </div>
            )}
          </div>
          <div className={`results ${auditResult.success ? 'success' : 'error'}`}>
            <h3>{auditResult.message}</h3>
            <p>Visual Similarity: <strong style={{ color: auditResult.matchScore! >= 0.85 ? '#2ecc71' : '#e74c3c' }}>{(auditResult.matchScore! * 100).toFixed(1)}%</strong></p>
            <ClassificationTable currentVal={auditResult.matchScore!} />
          </div>
        </div>
      )}
    </div>
  );
}
