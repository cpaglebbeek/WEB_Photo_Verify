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

    // Compute hashes on main thread (canvas API not available in workers)
    setProcessingMsg("Calculating Forensic Hashes: perceptual hash...");
    setProgress(20);
    const pHash = generatePerceptualHashDetailed(iData);

    setProcessingMsg("Calculating Forensic Hashes: sha256...");
    setProgress(40);
    const iHash = await sha256(iData.data);

    setProgress(60);
    
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

  const manualSync = () => { setDebugLogs([]); startup(true); };

  const handleManualLicenseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !license?.deviceHash) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const newLic = applyManualLicense(data, license.deviceHash);
      setLicense(newLic);
      addLog(`[App] Manual License Applied: ${newLic.active ? 'ACTIVE' : 'INACTIVE'}`);
      if (newLic.active) { setMode('START'); alert("License successfully activated from file!"); }
      else { alert("License file loaded but is not active or expired."); }
    } catch { alert("Error reading license file. Ensure it is a valid .json from the License Manager."); }
  };

  const handleManualActivate = () => {
    try {
      const data = JSON.parse(manualJson);
      const newLic = applyManualLicense(data, license?.deviceHash || '');
      setLicense(newLic);
      if (newLic.active) { setMode('START'); alert("Activated!"); }
      else { alert("License is not active or expired."); }
    } catch { alert("Invalid JSON."); }
  };

  if (mode === 'LICENSE_CHECK') {
    return (
      <div className="App" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0f172a', padding: '20px' }}>
        <div className="card-glass text-center" style={{ maxWidth: '450px', width: '100%' }}>
          <span style={{ fontSize: '4rem' }}>🛡️</span>
          <h2>Activation Required</h2>
          <div style={{ marginBottom: '15px' }}>
            <span style={{ background: '#1e293b', padding: '4px 12px', borderRadius: '20px', fontSize: '0.8rem', color: '#10b981', border: '1px solid #334155' }}>
              PhotoVerify v{versionData.current}
            </span>
          </div>
          <div style={{ background: '#000', padding: '15px', borderRadius: '10px', margin: '20px 0', border: '1px solid #334155', textAlign: 'left' }}>
            <small style={{ color: '#94a3b8', display: 'block', marginBottom: '5px' }}>FORENSIC DEVICE IDENTITY</small>
            <code style={{ fontSize: '1.1rem', color: '#60a5fa', letterSpacing: '1px', display: 'block', marginBottom: '10px' }}>{license?.deviceHash || '...'}</code>
            <div style={{ fontSize: '0.7rem', color: '#94a3b8', borderTop: '1px solid #1e293b', paddingTop: '10px', lineHeight: '1.4' }}>
              <strong>OS:</strong> {features.os}<br/>
              <strong>Browser:</strong> {features.browser}<br/>
              <strong>Mode:</strong> {features.platformDetail}
            </div>
          </div>
          <div style={{ background: '#020617', padding: '10px', borderRadius: '8px', marginBottom: '20px', textAlign: 'left', border: '1px solid #1e293b' }}>
            <small style={{ color: '#94a3b8', fontSize: '0.7rem', fontWeight: 'bold', display: 'block', marginBottom: '5px', borderBottom: '1px solid #1e293b', paddingBottom: '3px' }}>VERBOSE NETWORK LOG</small>
            <div style={{ maxHeight: '150px', overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.75rem', color: '#38bdf8' }}>
              {debugLogs.length === 0 ? <span style={{ color: '#475569' }}>Waiting for sync...</span> : debugLogs.map((log, i) => (
                <div key={i} style={{ marginBottom: '2px', borderLeft: '2px solid #0ea5e9', paddingLeft: '5px' }}>{log}</div>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexDirection: 'column' }}>
            <button className="btn btn-primary" onClick={() => {
              if (license?.deviceHash) {
                const extended = getExtendedDeviceInfo(license.deviceHash);
                navigator.clipboard.writeText(extended);
                alert("Extended Device ID & Platform Info copied to clipboard!");
              }
            }} style={{ width: '100%' }}>📋 Copy Extended ID</button>
            <button className="btn btn-nav btn-success" onClick={manualSync} disabled={isSyncing} style={{ width: '100%', padding: '12px' }}>
              {isSyncing ? '⌛ Syncing...' : '🔄 Sync with Server'}
            </button>
            <div style={{ marginTop: '10px', borderTop: '1px solid #334155', paddingTop: '10px' }}>
              <label className="btn btn-secondary" style={{ width: '100%', display: 'block', padding: '10px', fontSize: '0.85rem', cursor: 'pointer', background: '#475569' }}>
                📂 RESCUE: UPLOAD LICENSE FILE
                <input type="file" accept=".json" onChange={handleManualLicenseFile} style={{ display: 'none' }} />
              </label>
              <button className="btn btn-secondary" onClick={() => setShowManual(!showManual)} style={{ width: '100%', fontSize: '0.75rem', marginTop: '10px', border: '1px dashed #64748b' }}>
                {showManual ? 'Hide Manual Input' : 'Alternative: Paste JSON Text'}
              </button>
              {showManual && (
                <div style={{ marginTop: '10px', textAlign: 'left' }}>
                  <textarea value={manualJson} onChange={(e) => setManualJson(e.target.value)} placeholder='Paste browser content here...' style={{ width: '100%', height: '60px', background: '#000', color: '#10b981', border: '1px solid #334155', borderRadius: '5px', fontSize: '0.65rem', padding: '8px', fontFamily: 'monospace' }} />
                  <button className="btn btn-primary" onClick={handleManualActivate} style={{ width: '100%', marginTop: '5px', fontSize: '0.8rem' }}>✅ Activate from Text</button>
                </div>
              )}
              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '5px' }}>If server is unreachable, use a .json from the License Manager or paste the text.</p>
            </div>
          </div>
          {license?.message && <p style={{ marginTop: '15px', color: license.active ? '#2ecc71' : '#ef4444', fontSize: '0.9rem' }}>{license.message}</p>}
          <p style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '20px' }}>HTTPS is required. If using a local server, ensure CORS is enabled.</p>
        </div>
      </div>
    );
  }

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
            <button className="btn btn-nav" onClick={() => setMode('INFO')} title="Help">ℹ️</button>
            <button className="btn btn-nav" onClick={() => setMode('ABOUT')} title="About">❓</button>
            <button className="btn btn-nav" onClick={() => setMode('SETTINGS')}>⚙️</button>
            <button className="btn btn-nav" onClick={() => setMode('START')}>🏠 Home</button>
            <button className="btn btn-nav" onClick={() => setMode('VERIFY')} style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid #60a5fa' }}>🔍 Audit</button>
            <button className="btn btn-nav btn-success" onClick={() => setMode('SHIELD_AUTO')}>🛡️ Shield</button>
          </div>
        </div>
      </header>

      <main className="wizard-container">
        {mode === 'ABOUT' && (
          <div className="card-glass text-left">
            <h2 style={{ color: '#60a5fa' }}>❓ About PhotoVerify</h2>
            <div style={{ background: 'rgba(0,0,0,0.4)', padding: '15px', borderRadius: '12px', marginBottom: '15px', border: '1px solid #334155' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>VERSION</label><strong style={{ color: '#10b981' }}>v{versionData.current}</strong></div>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>PLATFORM</label><strong style={{ color: '#60a5fa' }}>{features.platformDetail}</strong></div>
              </div>
              <hr style={{ border: '0', borderTop: '1px solid #1e293b', margin: '10px 0' }} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.65rem' }}>OS / DEVICE</label>{features.os} ({features.deviceType})</div>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.65rem' }}>BROWSER ENGINE</label>{features.browser}</div>
              </div>
              <hr style={{ border: '0', borderTop: '1px solid #1e293b', margin: '10px 0' }} />
              <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>DEVICE OWNER / NAME</label>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{deviceInfo.name || 'Unknown Device'}</strong>
              <small style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem' }}>Model: {deviceInfo.model}</small>
              <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem', marginTop: '10px' }}>FORENSIC DEVICE ID</label>
              <code style={{ fontSize: '0.85rem', color: '#60a5fa' }}>{license?.deviceHash || 'Detecting...'}</code>
              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>STATUS</label><strong style={{ color: license?.active ? '#10b981' : '#ef4444' }}>{license?.active ? 'ACTIVATED' : 'EXPIRED / INACTIVE'}</strong></div>
                <div><label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>EXPIRATION</label><strong style={{ color: '#fff' }}>{license?.expiry && license.expiry > 4000000000000 ? 'NONE (INFINITE)' : license?.expiry ? new Date(license.expiry).toLocaleDateString() : 'N/A'}</strong></div>
              </div>
              {(license?.name || license?.company || license?.customerId) && (
                <div style={{ marginTop: '12px', padding: '10px', background: 'rgba(96, 165, 250, 0.1)', borderRadius: '8px', border: '1px solid #334155' }}>
                  <label style={{ color: '#60a5fa', display: 'block', fontSize: '0.65rem', fontWeight: 'bold', marginBottom: '5px' }}>REGISTRATION DETAILS</label>
                  {license.name && <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem' }}><strong>User:</strong> {license.name}</p>}
                  {license.company && <p style={{ margin: '0 0 4px 0', fontSize: '0.85rem' }}><strong>Org:</strong> {license.company}</p>}
                  {license.customerId && <p style={{ margin: 0, fontSize: '0.75rem', color: '#94a3b8' }}><strong>ID:</strong> {license.customerId}</p>}
                </div>
              )}
              <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>GRACE PERIOD:</span>
                <strong style={{ fontSize: '0.75rem', color: license?.isGracePeriod ? '#fbbf24' : '#10b981' }}>{license?.isGracePeriod ? '⚠️ ACTIVE (OFFLINE)' : '✅ INACTIVE (SYNCED)'}</strong>
              </div>
            </div>
            <p>PhotoVerify is a "Democratic Forensic Suite" for the individual creator, providing tools that were previously only available to large corporations.</p>
            <h3 className="mt-1" style={{ fontSize: '1rem', color: '#fbbf24' }}>1. Comparative Analysis</h3>
            <ul style={{ fontSize: '0.9rem', color: '#cbd5e1', paddingLeft: '20px' }}>
              <li><strong>vs Adobe (CAI):</strong> Our stamp is embedded in the <em>pixels</em>, not just metadata. It survives when headers are stripped by social media.</li>
              <li><strong>vs Microsoft (PhotoDNA):</strong> We are proactive for owners to prove origin, not just reactive for platforms to find illegal content.</li>
              <li><strong>vs Google (Lens):</strong> We provide mathematical, court-ready proof (Hamming Distance), not just "visual similarity" matches.</li>
            </ul>
            <h3 className="mt-1" style={{ fontSize: '1rem', color: '#fbbf24' }}>2. Sovereignty First</h3>
            <p style={{ fontSize: '0.9rem' }}>Unlike cloud-based competitors, PhotoVerify runs <strong>100% locally</strong> in your browser or on your device. Your sensitive original photos never leave your machine.</p>
            <button className="btn btn-primary mt-1" onClick={() => setMode('START')}>Got it!</button>
          </div>
        )}

        {mode === 'INFO' && (
          <div className="card-glass text-left">
            <h2 style={{ color: '#fbbf24' }}>ℹ️ Scientific Foundation</h2>
            <p>PhotoVerify protects your vision through three distinct cryptographic layers:</p>
            <div style={{ marginTop: '15px' }}>
              <h4 style={{ color: '#60a5fa', margin: '0' }}>🛡️ Layer 1: Invisible Stamp</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '5px' }}>A 4-bit differential encoding hides a secret 6-character code (UID) directly in the pixel luminance. Stable against most re-saves.</p>
            </div>
            <div style={{ marginTop: '15px' }}>
              <h4 style={{ color: '#60a5fa', margin: '0' }}>🔍 Layer 2: Visual DNA (pHash)</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '5px' }}>Uses a 16x16 grid (256 bits) to identify the "concept" of the photo. This recognizes your work even if it is cropped, scaled, or filtered.</p>
            </div>
            <div style={{ marginTop: '15px' }}>
              <h4 style={{ color: '#60a5fa', margin: '0' }}>📐 Layer 3: Physical Border</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '5px' }}>A 1-pixel frame is extracted as a unique "puzzle piece". Verification requires the owner to have the exact original dimensions.</p>
            </div>
            <div style={{ marginTop: '15px', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
              <h4 style={{ color: '#10b981', margin: '0' }}>📜 Layer 4: Time-Anchor</h4>
              <p style={{ fontSize: '0.85rem', marginTop: '5px' }}>Links your image hash to a public "Anchor" hash from today, proving the photo existed at this point in time.</p>
            </div>
            <button className="btn btn-primary mt-1" onClick={() => setMode('START')}>Close Help</button>
          </div>
        )}

        {mode === 'SETTINGS' && (
          <div className="card-glass">
            <h2>⚙️ Configuration & Sync</h2>
            <div style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px', marginBottom: '15px' }}>
              <p style={{ margin: '0 0 5px 0' }}><strong>Runtime:</strong> <span style={{ color: '#60a5fa' }}>{features.mode}</span></p>
              <p style={{ margin: 0 }}><strong>Active Folder:</strong> <code style={{ color: '#60a5fa' }}>{safFolderUri || 'Internal Documents (Default)'}</code></p>
            </div>
            <div style={{ display: 'grid', gap: '15px' }}>
              <label>License Server:
                <input type="text" value={licenseServer} onChange={e => setLicenseServer(e.target.value)} style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #334155', padding: '8px' }} />
              </label>
              <label>UI Config URL:
                <input type="text" value={uiUrl} onChange={e => setUiUrl(e.target.value)} style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #334155', padding: '8px' }} />
              </label>
              <label>Content Config URL:
                <input type="text" value={contentUrl} onChange={e => setContentUrl(e.target.value)} style={{ width: '100%', background: '#000', color: '#fff', border: '1px solid #334155', padding: '8px' }} />
              </label>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '20px' }}>
              <button className="btn btn-secondary" onClick={() => startup(true)} style={{ border: '1px solid #60a5fa', color: '#60a5fa' }}>🔄 FETCH / UPDATE</button>
              <button className="btn btn-primary" onClick={() => {
                localStorage.setItem('license_server_url', licenseServer);
                localStorage.setItem('ui_config_url', uiUrl);
                localStorage.setItem('content_config_url', contentUrl);
                alert("Settings Committed. App will reload.");
                window.location.reload();
              }}>💾 SAVE / COMMIT</button>
            </div>
            <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '15px' }}>
              <button className="btn btn-secondary" onClick={() => {
                localStorage.removeItem('saf_folder_uri');
                alert("Storage folder reset to Internal Documents.");
                window.location.reload();
              }} style={{ width: '100%', fontSize: '0.8rem' }}>Reset to Default Storage</button>
            </div>
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
