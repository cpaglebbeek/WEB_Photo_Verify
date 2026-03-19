import { useState, useEffect, useCallback, useRef } from 'react';
import { App as CapApp } from '@capacitor/app';
import { Filesystem } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { getMachineDetails, getExtendedDeviceInfo } from './utils/machineId';
import CopyrightVerifier from './components/CopyrightVerifier';
import TimeAnchorVerifier from './components/TimeAnchorVerifier';
import LegacyBorderVerifier from './components/LegacyBorderVerifier';
import ZipVerifier from './components/ZipVerifier';
import ProcessingOverlay from './components/ProcessingOverlay';
import { injectVirtualDataAsync } from './utils/virtualStorage';
import { sha256, generateCombinedProof } from './utils/timeAnchor';
import { generatePerceptualHashDetailed } from './utils/perceptualHash';
import { bundleEvidence } from './utils/zipper';
import { getDeviceHash, checkLicense, applyManualLicense, testConnection, type LicenseStatus } from './utils/license';
import { getRuntimeFeatures } from './utils/runtime';
import { extractMetadata, type ImageMetadata, formatExifSummary, injectForensicMetadata } from './utils/metadata';
import { generateForensicHTML, getReportBase64, type ReportData } from './utils/pdfGenerator';
import versionData from './version.json';
import engineData from './engine_version.json';
import './App.css';

interface NativeBridgePlugin {
  openFolderPicker(): Promise<void>;
  openFilePicker(options: { mimeType: string }): Promise<void>;
  saveFileFromPath(options: { filename: string; tempPath: string; mimeType: string }): Promise<void>;
  saveToSelectedFolder(options: { filename: string; base64Data: string; mimeType: string }): Promise<void>;
}

const NativeBridge = registerPlugin<NativeBridgePlugin>('NativeBridge');

type Mode = 'START' | 'VERIFY' | 'SHIELD_AUTO' | 'SETTINGS' | 'LICENSE_CHECK' | 'ABOUT' | 'INFO';

interface UITheme { [key: string]: string; }
interface UIConfig {
  themes: { dark: UITheme; light: UITheme; };
  branding: { logoUrl?: string; };
  platforms: {
    Mobile: { Android: { borderRadius: string; buttonPadding: string; fontSizeBase: string } };
    Desktop: { Windows: { borderRadius: string; buttonPadding: string; fontSizeBase: string } };
  };
}
interface ContentConfig { ui: { title: string; }; }

function App() {
  const features = getRuntimeFeatures();
  const generateUniqueStamp = () => {
    const timePart = Date.now() & 0xFFFFFF;
    const randomPart = Math.floor(Math.random() * 0xFFFFFF);
    return (timePart ^ randomPart).toString(16).padStart(6, '0').toUpperCase().substring(0, 6);
  };

  const [mode, setMode] = useState<Mode>('LICENSE_CHECK');
  const [license, setLicense] = useState<LicenseStatus | null>(null);
  const [deviceInfo, setDeviceInfo] = useState<{ name?: string; model?: string }>({});
  const [sharedImage, setSharedImage] = useState<HTMLImageElement | null>(null);
  const [sharedFilename, setSharedFilename] = useState<string>('photo.png');
  const [imageMeta, setImageMeta] = useState<ImageMetadata | null>(null);
  const [author, setAuthor] = useState<string>(localStorage.getItem('default_author') || '');
  const [company, setCompany] = useState<string>(localStorage.getItem('default_company') || '');
  const [sharedUid, setSharedUid] = useState<string>(generateUniqueStamp());

  useEffect(() => { if (mode === 'SHIELD_AUTO') setSharedUid(generateUniqueStamp()); }, [mode]);

  const [useBorder, setUseBorder] = useState(true);
  const [useStamp, setUseStamp] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingMsg, setProcessingMsg] = useState('Processing...');
  const [content, setContent] = useState<ContentConfig | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const [licenseServer, setLicenseServer] = useState(localStorage.getItem('license_server_url') || 'https://fotolerant.nl');
  const [uiUrl, setUiUrl] = useState(localStorage.getItem('ui_config_url') || 'https://fotolerant.nl/config/ui-config.json');
  const [contentUrl, setContentUrl] = useState(localStorage.getItem('content_config_url') || 'https://fotolerant.nl/config/content-config.json');

  const [isSyncing, setIsSyncing] = useState(false);
  const [safFolderUri, setSafFolderUri] = useState(localStorage.getItem('saf_folder_uri') || null);
  const isInitialized = useRef(false);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const applyUIConfig = useCallback((config: UIConfig, theme: 'dark' | 'light') => {
    const root = document.documentElement;
    const themeVars = config.themes[theme];
    Object.keys(themeVars).forEach(key => {
      const cssVar = `--${key.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}`;
      root.style.setProperty(cssVar, themeVars[key]);
    });
    const platform = window.innerWidth <= 768 ? config.platforms.Mobile.Android : config.platforms.Desktop.Windows;
    root.style.setProperty('--radius', platform.borderRadius);
    root.style.setProperty('--btn-padding', platform.buttonPadding);
    root.style.setProperty('--font-size', platform.fontSizeBase);
  }, []);

  const startup = useCallback(async (forceSync = false) => {
    setIsSyncing(true);
    try {
      const info = getMachineDetails();
      setDeviceInfo({ name: info.os, model: info.browser });
      const hash = await getDeviceHash();
      const lic = await checkLicense(hash, licenseServer, forceSync, (msg) => addLog(msg));
      setLicense(lic);
      setIsSyncing(false);

      if (lic.active) {
        try {
          const uRes = await fetch(uiUrl);
          const cRes = await fetch(contentUrl);
          const uData: UIConfig = await uRes.json();
          const cData: ContentConfig = await cRes.json();
          setContent(cData);
          applyUIConfig(uData, 'dark');
          setMode('START');
        } catch (e) {
          const [lUi, lContent] = await Promise.all([fetch('ui-config.json').catch(() => null), fetch('content-config.json').catch(() => null)]);
          if (lUi && lContent) {
            const uData: UIConfig = await lUi.json();
            setContent(await lContent.json());
            applyUIConfig(uData, 'dark');
          }
          setMode('START');
        }
      }
    } catch (e: any) { addLog(`[App] Fatal: ${e.message}`); setIsSyncing(false); }
  }, [licenseServer, uiUrl, contentUrl, applyUIConfig]);

  useEffect(() => { if (!isInitialized.current) { startup(); isInitialized.current = true; } }, [startup]);

  const [sharedZipBlob, setSharedZipBlob] = useState<Blob | undefined>(undefined);
  const openNativeFilePicker = (mimeType: string, callback: (uri: string) => void) => {
    NativeBridge.openFilePicker({ mimeType }).catch(e => addLog(`[App] Native picker failed: ${e.message}`));
  };

  const startProc = (msg: string) => { setProcessingMsg(msg); setProgress(0); setIsProcessing(true); };
  const endProc = () => { setProgress(100); setTimeout(() => setIsProcessing(false), 500); };

  const runOneClickShield = async () => {
    if (!sharedImage) return;
    const code = sharedUid.padStart(6, '0').toUpperCase();
    const w = sharedImage.width; const h = sharedImage.height;
    startProc("Shielding Image...");
    
    // 1. Create a Master Canvas with strict color settings
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sharedImage, 0, 0);

    let interiorCanvas = document.createElement('canvas');
    let borderCanvas = null;

    if (useBorder) {
      // 2. Extract CLEAN 1-pixel border into a SOLID canvas (No transparency to avoid pre-multiplication artifacts)
      borderCanvas = document.createElement('canvas'); borderCanvas.width = w; borderCanvas.height = h;
      const bCtx = borderCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
      bCtx.imageSmoothingEnabled = false;
      bCtx.fillStyle = '#000'; bCtx.fillRect(0, 0, w, h); // Start with solid background
      
      // Copy pixels one by one for absolute certainty
      bCtx.drawImage(canvas, 0, 0, w, 1, 0, 0, w, 1); // Top
      bCtx.drawImage(canvas, 0, h - 1, w, 1, 0, h - 1, w, 1); // Bottom
      bCtx.drawImage(canvas, 0, 1, 1, h - 2, 0, 1, 1, h - 2); // Left
      bCtx.drawImage(canvas, w - 1, 1, 1, h - 2, w - 1, 1, 1, h - 2); // Right

      // 3. Extract CLEAN interior
      interiorCanvas.width = w - 2; interiorCanvas.height = h - 2;
      const iCtx_temp = interiorCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
      iCtx_temp.imageSmoothingEnabled = false;
      iCtx_temp.drawImage(canvas, 1, 1, w - 2, h - 2, 0, 0, w - 2, h - 2);
    } else {
      interiorCanvas.width = w; interiorCanvas.height = h;
      interiorCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!.drawImage(canvas, 0, 0);
    }

    const iCtx = interiorCanvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    let iData = iCtx.getImageData(0, 0, interiorCanvas.width, interiorCanvas.height);
    
    if (useStamp) {
      const stamped = await injectVirtualDataAsync(iData, code, p => setProgress(60 + p * 0.3));
      iCtx.putImageData(stamped, 0, 0); iData = stamped;
    }

    // Offload heavy hashing to Web Worker
    setProcessingMsg("Calculating Forensic Hashes...");
    setProgress(20); // Start hashing phase from 20%
    // Create a Blob from the worker code and create an object URL
    const hashWorkerBlob = new Blob([`
      import { generatePerceptualHashDetailed } from '../utils/perceptualHash';
      import { sha256 } from '../utils/timeAnchor';

      self.onmessage = async (event) => {
        const { imageDataBuffer, width, height } = event.data;
        try {
          // Reconstruct ImageData object from buffer
          const uint8Array = new Uint8ClampedArray(imageDataBuffer);
          const imgData = new ImageData(uint8Array, width, height);

          // Perceptual Hash
          self.postMessage({ type: 'progress', percent: 10, task: 'perceptual_hash' });
          const pHash = generatePerceptualHashDetailed(imgData);

          // SHA-256 Hash
          self.postMessage({ type: 'progress', percent: 60, task: 'sha256_hash' });
          const iHash = await sha256(imgData.data);

          self.postMessage({ type: 'complete', pHash, iHash });
        } catch (error) {
          self.postMessage({ type: 'error', message: error.message || 'Unknown error during hashing' });
        }
      };
    `], { type: 'application/javascript' });
    const hashWorker = new Worker(URL.createObjectURL(hashWorkerBlob), { type: 'module' });
    
    // Transfer the ImageData buffer to the worker (efficiently)
    const { pHash, iHash } = await new Promise<{ pHash: any, iHash: string }>((resolve, reject) => {
      hashWorker.onmessage = (event: MessageEvent) => {
        const { type, percent, task, pHash, iHash, message } = event.data;
        if (type === 'progress') {
          // Scale hash worker progress (0-100) to overall progress (20-60)
          setProgress(Math.floor(20 + (percent * 0.4)));
          setProcessingMsg(`Calculating Hashes: ${task.replace('_', ' ')}...`);
        } else if (type === 'complete') {
          resolve({ pHash, iHash });
          hashWorker.terminate();
        } else if (type === 'error') {
          reject(new Error(`Hash Worker error: ${message}`));
          hashWorker.terminate();
        }
      };
      // Transfer the ImageData buffer to the worker (efficiently)
      // We send the buffer and reconstruct ImageData in the worker to avoid a DOM object in worker context
      hashWorker.postMessage({ imageDataBuffer: iData.data.buffer, width: iData.width, height: iData.height }, [iData.data.buffer]);
    });
    
    const ts = Date.now();

    
    // 4. Generate Forensic Data
    const reportData: ReportData = {
      title: sharedFilename, version: versionData.current, timestamp: new Date(ts).toLocaleString(),
      deviceId: license?.deviceHash || 'UNKNOWN',
      results: [
        { label: 'Invisible Stamp', status: useStamp ? 'ENABLED' : 'DISABLED', detail: code },
        { label: 'Visual DNA', status: 'GENERATED', detail: pHash.hash },
        { label: 'Physical Border', status: useBorder ? 'ENABLED' : 'DISABLED', detail: useBorder ? '1-pixel frame extracted' : 'N/A' }
      ],
      images: [{ label: 'Stamped Interior', url: interiorCanvas.toDataURL('image/png') }],
      forensics: [
        { label: 'DNA Hash', value: pHash.hash },
        { label: 'Image SHA-256', value: iHash },
        { label: 'Author', value: author || 'Not specified' },
        { label: 'Company', value: company || 'Not specified' }
      ]
    };
    const pdfB64 = await getReportBase64(reportData);
    
    // 5. Inject Metadata and PDF into Interior (PNG format for forensic integrity)
    const finalInteriorUrl = injectForensicMetadata(interiorCanvas.toDataURL('image/png'), imageMeta?.rawExif, author, company, pdfB64);

    // 6. Bundle all components
    try {
      await bundleEvidence(
        canvas.toDataURL('image/png'), 
        borderCanvas ? borderCanvas.toDataURL('image/png') : null, 
        finalInteriorUrl, 
        { 
          imageHash: iHash, 
          perceptualHash: pHash.hash, 
          timestamp: ts, 
          author, 
          company,
          combinedProof: await generateCombinedProof(iHash, 'AUTO') 
        }, 
        `${code}_${sharedFilename}`,
        p => setProgress(p) // Pass the setProgress function directly
      );
      endProc(); 
      alert("Forensic Bundle Saved!"); 
      setMode('START');
    } catch (bundleError: any) {
      console.error("Bundle creation or save failed:", bundleError);
      alert(`Error saving bundle: ${bundleError.message || bundleError}`);
      endProc(); // Ensure processing overlay is dismissed
      setMode('START'); // Return to start mode
    }
  };

  const [manualJson, setManualJson] = useState('');
  const [showManual, setShowManual] = useState(false);

  return (
    <div className="App" style={{ fontSize: 'var(--font-size)' }}>
      {isProcessing && <ProcessingOverlay progress={progress} message={processingMsg} />}
      <header className="App-header">
        <div className="header-top">
          <div className="app-branding" onClick={() => setMode('START')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src="appicon.jpg" alt="Logo" style={{ height: '50px', borderRadius: '8px' }} />
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.8rem', lineHeight: '1' }}>{content?.ui.title || 'PhotoVerify'} <span style={{ fontSize: '0.8rem', color: '#10b981' }}>v{engineData.engine_version}-v{versionData.current}</span></h1>
              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>Engine: {engineData.engine_codename}</div>
            </div>
          </div>
          <div className="nav-cluster">
            <button className="btn btn-nav" onClick={() => setMode('START')}>🏠 Home</button>
            <button className="btn btn-nav" onClick={() => setMode('VERIFY')} style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid #60a5fa' }}>🔍 Audit</button>
            <button className="btn btn-nav btn-success" onClick={() => setMode('SHIELD_AUTO')}>🛡️ Shield</button>
            <button className="btn btn-nav" onClick={() => setMode('SETTINGS')}>⚙️</button>
          </div>
        </div>
      </header>

      <main className="wizard-container">
        {mode === 'LICENSE_CHECK' && (
          <div className="card-glass text-center">
            <h2>Activation Required</h2>
            <div style={{ background: '#000', padding: '15px', borderRadius: '10px', margin: '20px 0', textAlign: 'left', border: '1px solid #334155' }}>
              <code>{license?.deviceHash || 'Detecting...'}</code>
              <div style={{ fontSize: '0.7rem', marginTop: '10px', color: '#94a3b8' }}>OS: {features.os} | Browser: {features.browser}</div>
            </div>
            <button className="btn btn-primary" onClick={() => startup(true)}>{isSyncing ? 'Syncing...' : '🔄 Sync License'}</button>
            <button className="btn btn-secondary mt-1" onClick={() => setShowManual(!showManual)}>Manual Fallback</button>
            {showManual && <textarea value={manualJson} onChange={e => setManualJson(e.target.value)} placeholder="Paste JSON here..." style={{ width: '100%', height: '100px', marginTop: '10px' }} />}
          </div>
        )}

        {mode === 'SHIELD_AUTO' && (
          <div className="card-glass text-center">
            <h2>🛡️ One-Click Shield</h2>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '15px 0' }}>
              <label><input type="checkbox" checked={useBorder} onChange={e => setUseBorder(e.target.checked)} /> Border</label>
              <label><input type="checkbox" checked={useStamp} onChange={e => setUseStamp(e.target.checked)} /> Stamp</label>
            </div>
            <label className="file-dropzone mt-1">
              <input type="file" accept="image/*" onChange={async e => {
                const file = e.target.files?.[0];
                if (file) {
                  setSharedFilename(file.name); const img = new Image();
                  img.onload = async () => { setSharedImage(img); setImageMeta(await extractMetadata(file, img)); };
                  img.src = URL.createObjectURL(file);
                }
              }} />
              {sharedImage ? (
                <div>
                  <img src={sharedImage.src} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
                  {imageMeta && (
                    <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '8px', fontSize: '0.7rem', textAlign: 'left', color: '#fff', border: '1px solid #334155' }}>
                      <strong>📄 FILE:</strong> {imageMeta.filename} ({Math.round(imageMeta.size/1024)} KB)<br/>
                      <strong>📏 IMAGE:</strong> {imageMeta.width}x{imageMeta.height} | {imageMeta.dpi} | {imageMeta.colorDepth}<br/>
                      <strong>📸 EXIF:</strong> {formatExifSummary(imageMeta.exif)}
                    </div>
                  )}
                </div>
              ) : "Click to load photo"}
            </label>
            <div style={{ margin: '15px 0', textAlign: 'left' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'bold' }}>AUTHOR NAME</label>
              <input type="text" value={author} onChange={e => { setAuthor(e.target.value); localStorage.setItem('default_author', e.target.value); }} style={{ width: '100%', background: '#000', color: '#fff', padding: '12px', border: '1px solid #334155', borderRadius: '8px', fontSize: '1rem', marginBottom: '10px' }} />
              <label style={{ display: 'block', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'bold' }}>COMPANY / ORGANIZATION</label>
              <input type="text" value={company} onChange={e => { setCompany(e.target.value); localStorage.setItem('default_company', e.target.value); }} style={{ width: '100%', background: '#000', color: '#fff', padding: '12px', border: '1px solid #334155', borderRadius: '8px', fontSize: '1rem' }} />
            </div>
            {sharedImage && <button className="btn btn-primary mt-1" onClick={runOneClickShield} style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}>⚡ ACTIVATE SHIELD (ZIP)</button>}
          </div>
        )}

        {mode === 'START' && (
          <div className="action-cards">
            <button className="card-action protect" onClick={() => setMode('SHIELD_AUTO')}><span className="icon">🛡️</span><h2>Auto-Shield</h2><p>ZIP Evidence Bundle</p></button>
            <button className="card-action verify" onClick={() => setMode('VERIFY')}><span className="icon">🔍</span><h2>Manual Audit</h2><p>Step-by-step verification</p></button>
          </div>
        )}

        {mode === 'VERIFY' && (
          <div className="wizard-flow">
            <button className="btn btn-secondary mb-1" onClick={() => { setMode('START'); setSharedZipBlob(undefined); }}>← Back</button>
            <div className="card-glass" style={{ border: '2px solid #60a5fa' }}><ZipVerifier initialFile={sharedZipBlob} onNativePick={openNativeFilePicker} deviceId={license?.deviceHash || 'UNKNOWN'} onStart={startProc} onProgress={setProgress} onEnd={endProc} /></div>
            <div className="card-glass"><CopyrightVerifier deviceId={license?.deviceHash || 'UNKNOWN'} onStart={() => startProc('Scanning...')} onProgress={setProgress} onEnd={endProc} /></div>
            <div className="card-glass"><TimeAnchorVerifier deviceId={license?.deviceHash || 'UNKNOWN'} onStart={() => startProc('Auditing...')} onProgress={setProgress} onEnd={endProc} /></div>
            <div className="card-glass"><LegacyBorderVerifier deviceId={license?.deviceHash || 'UNKNOWN'} onStart={() => startProc('Verifying...')} onProgress={setProgress} onEnd={endProc} /></div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
