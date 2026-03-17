import { useState, useRef } from 'react';
import { extractVirtualDataAsync, injectVirtualDataAsync } from '../utils/virtualStorage';
import { generatePerceptualHashDetailed, hashToBits, compareHashesElastic } from '../utils/perceptualHash';
import { sha256, generateCombinedProof, type AnchorDeed } from '../utils/timeAnchor';
import { saveFile } from '../utils/fileSaver';

const SAMPLES = [
  { id: 'hi', name: 'High Res (2000px)', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?q=80&w=2000&auto=format&fit=crop' },
  { id: 'mid', name: 'Medium Res (1000px)', url: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=1000&auto=format&fit=crop' },
  { id: 'low', name: 'Low Res (400px)', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=400&auto=format&fit=crop' }
];

interface Props {
  onStart: (m: string) => void;
  onProgress: (p: number) => void;
  onEnd: () => void;
}

interface TestResult {
  msg?: string;
  stamp?: string;
  dna?: string;
  status?: string;
}

export default function ImageLab({ onStart, onProgress, onEnd }: Props) {
  const [activeImage, setActiveImage] = useState<HTMLImageElement | null>(null);
  const [currentDeed, setCurrentDeed] = useState<AnchorDeed | null>(null);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [labMode, setLabMode] = useState<'MANIPULATE' | 'STAMP' | 'BORDER' | 'VERIFY'>('MANIPULATE');
  const [stampCode, setStampCode] = useState('A1B2C3');
  const workbenchRef = useRef<HTMLCanvasElement>(null);

  const updateWorkbench = (img: HTMLImageElement | HTMLCanvasElement) => {
    const canvas = workbenchRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    canvas.width = img.width; canvas.height = img.height;
    ctx.drawImage(img, 0, 0);
  };

  const createBaseDeed = async (img: HTMLImageElement, timestamp: number) => {
    onStart('Calibrating Lab...');
    const canvas = document.createElement('canvas');
    canvas.width = img.width; canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const h1 = await sha256(imageData.data);
    const ph = generatePerceptualHashDetailed(imageData);
    setCurrentDeed({
      imageHash: h1, perceptualHash: ph.hash,
      anchorHash: "LAB_ANCHOR", anchorSource: "Lab",
      combinedProof: await generateCombinedProof(h1, "LAB_ANCHOR"),
      timestamp: timestamp,
      metadata: { width: img.width, height: img.height, isColor: true, aspectRatio: "N/A" }
    });
    updateWorkbench(img);
    onEnd();
  };

  const loadSample = (url: string) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const now = Date.now();
      setActiveImage(img);
      setTestResult(null);
      createBaseDeed(img, now);
    };
    img.src = url;
  };

  const applyDigitalStamp = async () => {
    const canvas = workbenchRef.current;
    if (!canvas) return;
    onStart('Injecting Test Stamp...');
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stamped = await injectVirtualDataAsync(imageData, stampCode, onProgress);
    ctx.putImageData(stamped, 0, 0);
    setTestResult({ msg: "Stamp Injected" });
    onEnd();
  };

  const runIntegrityTest = async () => {
    const canvas = workbenchRef.current;
    if (!canvas || !currentDeed) return;
    onStart('Running Forensic Scan...');
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const stampData = await extractVirtualDataAsync(imageData, onProgress);
    const currentPHash = generatePerceptualHashDetailed(imageData);
    const { score } = compareHashesElastic(hashToBits(currentDeed.perceptualHash || ""), currentPHash.bits);
    
    setTestResult({
      stamp: stampData ? `FOUND: ${stampData.uid}` : 'NOT FOUND',
      dna: (score * 100).toFixed(1) + '%',
      status: score > 0.85 ? 'PROVEN' : 'WEAK'
    });
    onEnd();
  };

  return (
    <div className="lab-container" style={{ textAlign: 'left' }}>
      <h2 style={{ color: '#fbbf24' }}>🧪 Stress Test Laboratory v11.1</h2>
      
      <div className="lab-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '20px', marginTop: '20px' }}>
        <aside className="lab-sidebar">
          <div className="step-box">
            <h4>1. Select Base Sample</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
              {SAMPLES.map(s => (
                <button key={s.id} className="lang-btn" onClick={() => loadSample(s.url)} style={{ padding: '5px', fontSize: '0.7em' }}>{s.id.toUpperCase()}</button>
              ))}
            </div>
          </div>

          {activeImage && (
            <>
              <div style={{ display: 'flex', gap: '5px', marginTop: '15px' }}>
                <button className={`lang-btn ${labMode==='MANIPULATE'?'active':''}`} onClick={()=>setLabMode('MANIPULATE')} style={{fontSize: '0.7em'}}>Edit</button>
                <button className={`lang-btn ${labMode==='STAMP'?'active':''}`} onClick={()=>setLabMode('STAMP')} style={{fontSize: '0.7em'}}>Stamp</button>
                <button className={`lang-btn ${labMode==='VERIFY'?'active':''}`} onClick={()=>setLabMode('VERIFY')} style={{fontSize: '0.7em'}}>Verify</button>
              </div>

              <div className="step-box" style={{ marginTop: '10px', minHeight: '200px' }}>
                {labMode === 'STAMP' && (
                  <div>
                    <label style={{fontSize: '0.8em'}}>Test Code:</label>
                    <input 
                      type="text" 
                      value={stampCode} 
                      onChange={e => {
                        const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                        if (val.length <= 6) setStampCode(val);
                      }} 
                      maxLength={6} 
                      style={{marginBottom: '10px', width:'100%', background: '#333', color: 'white', fontFamily: 'monospace'}} 
                    />
                    <button 
                      className="lang-btn" 
                      onClick={applyDigitalStamp} 
                      style={{width:'100%', background: stampCode.length === 6 ? '#059669' : '#333', opacity: stampCode.length === 6 ? 1 : 0.5}}
                      disabled={stampCode.length !== 6}
                    >
                      Inject Stamp
                    </button>
                    <button className="lang-btn" onClick={() => saveFile(workbenchRef.current!.toDataURL(), 'stamped_test.png')} style={{width:'100%', marginTop:'5px'}}>Download Result</button>
                  </div>
                )}

                {labMode === 'VERIFY' && (
                  <div style={{fontSize: '0.85em'}}>
                    <button className="primary-button" onClick={runIntegrityTest} style={{width:'100%'}}>Full Scan</button>
                  </div>
                )}
              </div>
            </>
          )}
        </aside>

        <main className="lab-workbench">
          <div className="step-box" style={{ minHeight: '500px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative', background: '#000' }}>
            <canvas ref={workbenchRef} style={{ maxWidth: '100%', maxHeight: '70vh', border: '1px solid #334155', borderRadius: '8px' }} />
            {testResult && (
              <div className="test-overlay" style={{ position: 'absolute', top: '20px', right: '20px', background: 'rgba(15, 23, 42, 0.95)', padding: '20px', borderRadius: '16px', border: '1px solid #334155' }}>
                <h4>Lab Report</h4>
                {testResult.stamp && <p>Stamp: {testResult.stamp}</p>}
                {testResult.dna && <p>DNA Match: {testResult.dna}</p>}
                <button onClick={()=>setTestResult(null)} className="lang-btn">Dismiss</button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
