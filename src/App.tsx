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
import { extractMetadata, type ImageMetadata, formatExifSummary } from './utils/metadata';
import versionData from './version.json';
import './App.css';

interface NativeBridgePlugin {
  openFolderPicker(): Promise<void>;
  openFilePicker(options: { mimeType: string }): Promise<void>;
  saveFileFromPath(options: { filename: string; tempPath: string; mimeType: string }): Promise<void>;
  saveToSelectedFolder(options: { filename: string; base64Data: string; mimeType: string }): Promise<void>;
}

const NativeBridge = registerPlugin<NativeBridgePlugin>('NativeBridge');

type Mode = 'START' | 'VERIFY' | 'SHIELD_AUTO' | 'SETTINGS' | 'LICENSE_CHECK' | 'ABOUT' | 'INFO';

interface UITheme {
  [key: string]: string;
}

interface UIConfig {
  themes: {
    dark: UITheme;
    light: UITheme;
  };
  branding: {
    logoUrl?: string;
  };
  platforms: {
    Mobile: { Android: { borderRadius: string; buttonPadding: string; fontSizeBase: string } };
    Desktop: { Windows: { borderRadius: string; buttonPadding: string; fontSizeBase: string } };
  };
}

interface ContentConfig {
  ui: {
    title: string;
  };
}

interface AppRestoredResult {
  pluginId: string;
  action: string;
  data: {
    url?: string;
    uri?: string;
  };
}

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
  const [sharedUid, setSharedUid] = useState<string>(generateUniqueStamp());

  // Refresh stamp code when entering Shield mode to ensure uniqueness
  useEffect(() => {
    if (mode === 'SHIELD_AUTO') {
      setSharedUid(generateUniqueStamp());
    }
  }, [mode]);
  const [useBorder, setUseBorder] = useState(true);
  const [useStamp, setUseStamp] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processingMsg, setProcessingMsg] = useState('Processing...');
  const [content, setContent] = useState<ContentConfig | null>(null);
  const [uiConfig, setUiConfig] = useState<UIConfig | null>(null);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const [licenseServer, setLicenseServer] = useState(localStorage.getItem('license_server_url') || 'https://fotolerant.nl');
  const [uiUrl, setUiUrl] = useState(localStorage.getItem('ui_config_url') || 'https://fotolerant.nl/config/ui-config.json');
  const [contentUrl, setContentUrl] = useState(localStorage.getItem('content_config_url') || 'https://fotolerant.nl/config/content-config.json');

  const [isSyncing, setIsSyncing] = useState(false);
  const [safFolderUri, setSafFolderUri] = useState(localStorage.getItem('saf_folder_uri') || null);
  const isInitialized = useRef(false);

  const [lastHandledUri, setLastHandledUri] = useState<string | null>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [...prev.slice(-9), `${new Date().toLocaleTimeString()}: ${msg}`]);
  };

  const applyUIConfig = useCallback((config: UIConfig, activeTheme: 'dark' | 'light') => {
    const root = document.documentElement;
    const colors = config.themes[activeTheme];
    Object.keys(colors).forEach(key => {
      const cssKey = key.replace(/[A-Z]/g, m => "-" + m.toLowerCase());
      root.style.setProperty(`--${cssKey}`, colors[key]);
    });
    const isMobile = window.innerWidth <= 768;
    const p = isMobile ? config.platforms.Mobile.Android : config.platforms.Desktop.Windows;
    root.style.setProperty('--radius', p.borderRadius);
    root.style.setProperty('--btn-padding', p.buttonPadding);
    root.style.setProperty('--font-size', p.fontSizeBase);
  }, []);

  const startup = useCallback(async (forceSync = false) => {
    addLog(`[App] Startup. forceSync=${forceSync}`);
    setIsSyncing(true);
    
    try {
      const info = getMachineDetails();
      setDeviceInfo({ name: info.os, model: info.browser });
      
      const hash = await getDeviceHash();
      addLog(`[App] Machine Hash: ${hash}`);

      const lic = await checkLicense(hash, licenseServer, forceSync, (msg) => addLog(msg));
      
      // AUTO-DEBUG (Green): If SSL/HTTPS fails and we are using https://fotolerant.nl, try a fallback or clearer error
      if (!lic.active && lic.message?.toLowerCase().includes('network error')) {
        addLog(`[App] Connection failed. Running diagnostics...`);
        const diag = await testConnection(licenseServer);
        addLog(`[App] DIAG: ${diag.status === 403 ? '403 Forbidden (OK: Server REACHED)' : 'Status ' + diag.status}`);
        addLog(`[App] DIAG_MSG: ${diag.message}`);
      }

      addLog(`[App] Result: ${lic.active ? 'ACTIVE' : 'INACTIVE'} - ${lic.message}`);
      setLicense(lic);
      setIsSyncing(false);

      if (lic.active) {
        addLog(`[App] Loading remote configs...`);
        try {
          const uRes = await fetch(uiUrl).catch(e => { addLog(`[App] UI fetch failed: ${e.message}`); throw e; });
          const cRes = await fetch(contentUrl).catch(e => { addLog(`[App] Content fetch failed: ${e.message}`); throw e; });
          
          const uData: UIConfig = await uRes.json();
          const cData: ContentConfig = await cRes.json();
          addLog(`[App] Configs loaded. Version validated as: ${versionData.current}`);
          
          setUiConfig(uData);
          setContent(cData);
          applyUIConfig(uData, 'dark');
          setMode('START');
        } catch (e) {
          addLog(`[App] Remote config failed, using local fallback assets.`);
          const [lUi, lContent] = await Promise.all([
            fetch('ui-config.json').catch(() => null), 
            fetch('content-config.json').catch(() => null)
          ]);
          
          if (lUi && lContent) {
            const uData: UIConfig = await lUi.json();
            setUiConfig(uData);
            setContent(await lContent.json());
            applyUIConfig(uData, 'dark');
          } else {
            addLog("[App] CRITICAL: Local fallbacks missing or failed.");
          }
          setMode('START');
        }
      } else {
        addLog(`[App] Activation required: ${lic.message}`);
      }
    } catch (err) {
      const error = err as Error;
      addLog(`[App] Fatal: ${error.message}`);
      setIsSyncing(false);
    }
  }, [licenseServer, uiUrl, contentUrl, applyUIConfig]);

  const manualSync = () => {
    setDebugLogs([]);
    startup(true);
  };

  const handleManualLicenseFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !license?.deviceHash) return;
    
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const newLic = applyManualLicense(data, license.deviceHash);
      setLicense(newLic);
      addLog(`[App] Manual License Applied: ${newLic.active ? 'ACTIVE' : 'INACTIVE'}`);
      if (newLic.active) {
        setMode('START');
        alert("License successfully activated from file!");
      } else {
        alert("License file loaded but is not active or expired.");
      }
    } catch (e) {
      alert("Error reading license file. Ensure it is a valid .json from the License Manager.");
    }
  };

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      addLog("[App] Native platform detected.");
    }
    if (!isInitialized.current) {
      setTimeout(() => startup(), 0);
      isInitialized.current = true;
    }
  }, [startup]);

  useEffect(() => {
    // Listen for custom native intents (sent from MainActivity.java)
    window.addEventListener('folderSelected', ((e: CustomEvent) => {
      if (e.detail && e.detail.uri) {
        addLog(`[App] SAF Folder Selected: ${e.detail.uri}`);
        localStorage.setItem('saf_folder_uri', e.detail.uri);
        setSafFolderUri(e.detail.uri);
        alert("PhotoVerify Storage Folder Activated!");
      }
    }) as any);

    window.addEventListener('safSaveSuccess', ((e: CustomEvent) => {
      addLog(`[App] SAF Save Success: ${e.detail.name}`);
      alert(`Successfully saved to your folder: ${e.detail.name}`);
    }) as any);

    window.addEventListener('safSaveError', ((e: CustomEvent) => {
      addLog(`[App] SAF Save Error: ${e.detail.error}`);
      alert(`Save error: ${e.detail.error}`);
    }) as any);

    (CapApp as any).addListener('appUrlOpen', async (data: any) => {
      addLog(`[App] appUrlOpen: ${JSON.stringify(data)}`);
    });

    (CapApp as any).addListener('sendIntent', async (data: { uri: string }) => {
      addLog(`[App] Custom SendIntent received: ${data.uri}`);
      handleIncomingUri(data.uri);
    });

    // Fallback for CustomEvent from native code
    window.addEventListener('sendIntent', ((e: CustomEvent) => {
      if (e.detail && e.detail.uri) {
        addLog(`[App] Window SendIntent received: ${e.detail.uri}`);
        handleIncomingUri(e.detail.uri);
      }
    }) as any);

    (CapApp as any).addListener('appRestoredResult', async (data: AppRestoredResult) => {
      addLog(`[App] Restored Result: ${JSON.stringify(data)}`);
      if (data.pluginId === 'Share' || data.action === 'send' || (data as any).pluginId === 'App') {
        const intentData = data.data;
        const uri = intentData?.url || intentData?.uri;
        if (uri) handleIncomingUri(uri);
      }
    });
  }, []);

  const [sharedZipBlob, setSharedZipBlob] = useState<Blob | undefined>(undefined);

  const [nativeFileCallback, setNativeFileCallback] = useState<((uri: string) => void) | null>(null);

  const openNativeFilePicker = (mimeType: string, callback: (uri: string) => void) => {
    setNativeFileCallback(() => callback);
    NativeBridge.openFilePicker({ mimeType }).catch(e => addLog(`[App] Native picker failed: ${e.message}`));
  };

  useEffect(() => {
    const handleNativeFile = (e: any) => {
      if (e.detail?.uri && nativeFileCallback) {
        nativeFileCallback(e.detail.uri);
        setNativeFileCallback(null);
      }
    };
    window.addEventListener('nativeFileSelected', handleNativeFile);
    return () => window.removeEventListener('nativeFileSelected', handleNativeFile);
  }, [nativeFileCallback]);

  const base64ToBlob = (base64: string, mime: string) => {
    const byteCharacters = atob(base64);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: mime });
  };

  const handleIncomingUri = async (uri: string) => {
    if (uri === lastHandledUri) return;
    setLastHandledUri(uri);
    addLog(`[App] Processing Incoming URI: ${uri}`);
    const isZip = uri.toLowerCase().endsWith('.zip');
    
    try {
      if (isZip) {
        if (confirm("Evidence Bundle (.zip) detected. Would you like to run a full Forensic Audit on this package?")) {
          const file = await Filesystem.readFile({ path: uri });
          const blob = base64ToBlob(file.data as string, 'application/zip');
          setSharedZipBlob(blob);
          setMode('VERIFY');
        }
      } else {
        if (confirm("Photo detected. Would you like to start an Automatic Shield (Invisible Stamp + DNA) on this image?")) {
          const file = await Filesystem.readFile({ path: uri });
          const img = new Image();
          img.onload = () => {
            addLog(`[App] Shared Image loaded successfully (${img.width}x${img.height})`);
            setSharedImage(img);
            setSharedFilename(uri.split('/').pop() || 'shared_photo.png');
            setMode('SHIELD_AUTO');
          };
          img.onerror = () => { addLog(`[App] Error loading shared image object.`); alert("Failed to process shared image data."); };
          img.src = `data:image/png;base64,${file.data}`;
        }
      }
    } catch (e) {
      const error = e as Error;
      addLog(`[App] File system read error: ${error.message}`);
      alert(`Error reading shared file: ${error.message}`);
    }
  };

  const startProc = (msg: string) => { setProcessingMsg(msg); setProgress(0); setIsProcessing(true); };
  const endProc = () => { setProgress(100); setTimeout(() => setIsProcessing(false), 500); };

  const runOneClickShield = async () => {
    if (!sharedImage) return;
    
    const finalCode = sharedUid.padStart(6, '0').toUpperCase();
    if (useStamp && finalCode.length !== 6) {
      alert("Error: Code must be exactly 6 characters.");
      return;
    }
    
    // Memory Safety Check: if image is huge, we need to handle carefully or downscale
    const MAX_DIM = 4096;
    let targetWidth = sharedImage.width;
    let targetHeight = sharedImage.height;
    
    if (targetWidth > MAX_DIM || targetHeight > MAX_DIM) {
      const ratio = Math.min(MAX_DIM / targetWidth, MAX_DIM / targetHeight);
      targetWidth = Math.floor(targetWidth * ratio);
      targetHeight = Math.floor(targetHeight * ratio);
      console.warn(`[App] Image too large (${sharedImage.width}x${sharedImage.height}), downscaling to ${targetWidth}x${targetHeight} for stability.`);
      alert("Note: Large image detected. Scaling down slightly for processing stability.");
    }

    startProc("Shielding Image...");
    await new Promise(r => setTimeout(r, 150)); 

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth; canvas.height = targetHeight;
    const ctx = canvas.getContext('2d', { willReadFrequently: true, colorSpace: 'srgb' })!;
    ctx.drawImage(sharedImage, 0, 0, targetWidth, targetHeight);

    let interiorCanvas: HTMLCanvasElement;
    let borderCanvas: HTMLCanvasElement | null = null;

    if (useBorder) {
      // 1. Physical Border Extraction
      // Draw visible stamp first for border consistency
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.5)'; // pv-accent with transparency
      ctx.lineWidth = 1;
      ctx.strokeRect(0.5, 0.5, targetWidth - 1, targetHeight - 1);

      borderCanvas = document.createElement('canvas');
      borderCanvas.width = targetWidth; borderCanvas.height = targetHeight;
      const bCtx = borderCanvas.getContext('2d')!;
      // Border logic: Extract exactly the outermost 1-pixel rectangle (now including the visual stamp)
      bCtx.drawImage(canvas, 0, 0, targetWidth, 1, 0, 0, targetWidth, 1); // Top
      bCtx.drawImage(canvas, 0, targetHeight - 1, targetWidth, 1, 0, targetHeight - 1, targetWidth, 1); // Bottom
      bCtx.drawImage(canvas, 0, 1, 1, targetHeight - 2, 0, 1, 1, targetHeight - 2); // Left
      bCtx.drawImage(canvas, targetWidth - 1, 1, 1, targetHeight - 2, targetWidth - 1, 1, 1, targetHeight - 2); // Right

      interiorCanvas = document.createElement('canvas');
      interiorCanvas.width = targetWidth - 2; interiorCanvas.height = targetHeight - 2;
      const iCtx = interiorCanvas.getContext('2d')!;
      // Interior logic: Physical crop, removing the 1-pixel border
      iCtx.drawImage(canvas, 1, 1, targetWidth - 2, targetHeight - 2, 0, 0, targetWidth - 2, targetHeight - 2);
    } else {
      interiorCanvas = document.createElement('canvas');
      interiorCanvas.width = targetWidth; interiorCanvas.height = targetHeight;
      const iCtx = interiorCanvas.getContext('2d')!;
      iCtx.drawImage(canvas, 0, 0);
    }

    const iCtx = interiorCanvas.getContext('2d', { willReadFrequently: true })!;
    let currentInteriorData = iCtx.getImageData(0, 0, interiorCanvas.width, interiorCanvas.height);

    // 2. Invisible Stamp Injection
    if (useStamp) {
      const stamped = await injectVirtualDataAsync(currentInteriorData, finalCode, (p) => setProgress(60 + p * 0.3));
      iCtx.putImageData(stamped, 0, 0);
      currentInteriorData = stamped;
      
      // CRITICAL: Draw the stamped interior back onto the main canvas
      if (useBorder) {
        ctx.drawImage(interiorCanvas, 1, 1);
      } else {
        ctx.drawImage(interiorCanvas, 0, 0);
      }
    }

    // 3. Calculate Visual DNA (pHash) and Image Hash from the Interior
    const dna = generatePerceptualHashDetailed(currentInteriorData);
    const hash = await sha256(currentInteriorData.data);
    
    const now = Date.now();
    const deed = { 
      imageHash: hash, 
      perceptualHash: dna.hash, 
      anchorHash: "AUTO",
      anchorSource: "AUTO-Generated",
      timestamp: now, 
      features: { border: useBorder, stamp: useStamp },
      combinedProof: await generateCombinedProof(hash, "AUTO") 
    };
    
    await bundleEvidence(
      canvas.toDataURL('image/png'), 
      borderCanvas ? borderCanvas.toDataURL('image/png') : null, 
      interiorCanvas.toDataURL('image/png'), 
      deed, 
      `${useStamp ? finalCode : 'NOSTAMP'}_${sharedFilename}`
    );
    
    endProc();
    alert("ZIP Bundle Saved!");
    setMode('START');
  };

  const [manualJson, setManualJson] = useState('');
  const [showManual, setShowManual] = useState(false);

  const handleManualActivate = () => {
    try {
      const data = JSON.parse(manualJson);
      const hash = license?.deviceHash || 'UNKNOWN';
      const newState = applyManualLicense(data, hash);
      setLicense(newState);
      if (newState.active) {
        addLog("[App] Manual Activation Success!");
        startup(); // Refresh configs
      } else {
        alert("License is not active or expired.");
      }
    } catch (e) {
      alert("Invalid JSON format. Please copy the entire content from the browser.");
    }
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
            <small style={{ color: 'var(--text-dim)', display: 'block', marginBottom: '5px' }}>FORENSIC DEVICE IDENTITY</small>
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
                  <textarea 
                    value={manualJson}
                    onChange={(e) => setManualJson(e.target.value)}
                    placeholder='Paste browser content here...'
                    style={{ width: '100%', height: '60px', background: '#000', color: '#10b981', border: '1px solid #334155', borderRadius: '5px', fontSize: '0.65rem', padding: '8px', fontFamily: 'monospace' }}
                  />
                  <button className="btn btn-primary" onClick={handleManualActivate} style={{ width: '100%', marginTop: '5px', fontSize: '0.8rem' }}>✅ Activate from Text</button>
                </div>
              )}

              <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '5px' }}>If server is unreachable, use a .json from the License Manager or paste the text.</p>
            </div>
          </div>

          {license?.message && <p style={{ marginTop: '15px', color: license.active ? '#2ecc71' : '#ef4444', fontSize: '0.9rem' }}>{license.message}</p>}
          <p style={{ fontSize: '0.8rem', color: 'var(--text-dim)', marginTop: '20px' }}>HTTPS is required. If using a local server, ensure CORS is enabled.</p>
        </div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="App" style={{ fontSize: 'var(--font-size)' }}>
      {isProcessing && <ProcessingOverlay progress={progress} message={processingMsg} />}
      <header className="App-header">
        <div className="header-top">
          <div className="app-branding" onClick={() => setMode('START')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '15px' }}>
            <img src="appicon.jpg" alt="Logo" style={{ height: '50px', borderRadius: '8px' }} />
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.8rem', lineHeight: '1' }}>{content.ui.title} <span style={{ color: '#10b981', fontSize: '0.8rem' }}>[STABLE_V1.2.7]</span></h1>
              <small style={{ color: '#10b981', fontWeight: 'bold' }}>v{versionData.current}</small>
            </div>
          </div>
          <div className="nav-cluster">
            <button className="btn btn-nav" onClick={() => setMode('INFO')} title="Help">ℹ️</button>
            <button className="btn btn-nav" onClick={() => setMode('ABOUT')} title="About">❓</button>
            <button className="btn btn-nav" onClick={() => setMode('SETTINGS')}>⚙️</button>
            <button className="btn btn-nav" onClick={() => setMode('START')}>🏠 Home</button>
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
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>VERSION</label>
                  <strong style={{ color: '#10b981' }}>v{versionData.current}</strong>
                </div>
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>PLATFORM</label>
                  <strong style={{ color: '#60a5fa' }}>{features.platformDetail}</strong>
                </div>
              </div>
              <hr style={{ border: '0', borderTop: '1px solid #1e293b', margin: '10px 0' }} />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.8rem', color: '#cbd5e1' }}>
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.65rem' }}>OS / DEVICE</label>
                  {features.os} ({features.deviceType})
                </div>
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.65rem' }}>BROWSER ENGINE</label>
                  {features.browser}
                </div>
              </div>

              <hr style={{ border: '0', borderTop: '1px solid #1e293b', margin: '10px 0' }} />
              <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>DEVICE OWNER / NAME</label>
              <strong style={{ color: '#fff', fontSize: '0.9rem' }}>{deviceInfo.name || 'Unknown Device'}</strong>
              <small style={{ display: 'block', color: '#94a3b8', fontSize: '0.7rem' }}>Model: {deviceInfo.model}</small>

              <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem', marginTop: '10px' }}>FORENSIC DEVICE ID</label>
              <code style={{ fontSize: '0.85rem', color: '#60a5fa' }}>{license?.deviceHash || 'Detecting...'}</code>

              <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '0.85rem' }}>
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>STATUS</label>
                  <strong style={{ color: license?.active ? '#10b981' : '#ef4444' }}>
                    {license?.active ? 'ACTIVATED' : 'EXPIRED / INACTIVE'}
                  </strong>
                </div>
                <div>
                  <label style={{ color: '#94a3b8', display: 'block', fontSize: '0.7rem' }}>EXPIRATION</label>
                  <strong style={{ color: '#fff' }}>
                    {license?.expiry && license.expiry > 4000000000000 ? 'NONE (INFINITE)' : 
                     license?.expiry ? new Date(license.expiry).toLocaleDateString() : 'N/A'}
                  </strong>
                </div>
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
                <strong style={{ fontSize: '0.75rem', color: license?.isGracePeriod ? '#fbbf24' : '#10b981' }}>
                  {license?.isGracePeriod ? '⚠️ ACTIVE (OFFLINE)' : '✅ INACTIVE (SYNCED)'}
                </strong>
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
            <div className="info-box mb-1" style={{ fontSize: '0.8rem', background: 'rgba(0,0,0,0.3)', padding: '10px', borderRadius: '8px' }}>
              <p style={{ margin: '0 0 5px 0' }}><strong>Runtime:</strong> <span style={{ color: '#60a5fa' }}>{features.mode}</span></p>
              <p style={{ margin: 0 }}><strong>Active Folder:</strong> <code style={{ color: '#60a5fa' }}>{safFolderUri || 'Internal Documents (Default)'}</code></p>
              {features.isSandboxed && <p style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: '5px' }}>ℹ️ {features.storageRecommendation}</p>}
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
              <button className="btn btn-secondary" onClick={() => startup(true)} style={{ border: '1px solid #60a5fa', color: '#60a5fa' }}>
                🔄 FETCH / UPDATE
              </button>
              <button className="btn btn-primary" onClick={() => {
                localStorage.setItem('license_server_url', licenseServer); 
                localStorage.setItem('ui_config_url', uiUrl); 
                localStorage.setItem('content_config_url', contentUrl); 
                alert("Settings Committed. App will reload.");
                window.location.reload();
              }}>
                💾 SAVE / COMMIT
              </button>
            </div>

            <div style={{ marginTop: '20px', borderTop: '1px solid #334155', paddingTop: '15px' }}>
              {features.canSelectFolder ? (
                <button className="btn btn-primary" onClick={() => NativeBridge.openFolderPicker()} style={{ width: '100%', marginBottom: '10px', background: '#2563eb' }}>
                  📁 CHANGE STORAGE FOLDER
                </button>
              ) : (
                <div style={{ padding: '10px', background: '#000', border: '1px solid #334155', borderRadius: '8px', fontSize: '0.8rem', color: '#94a3b8', textAlign: 'center' }}>
                  📂 Browser restriction: Folder selection managed by OS.
                </div>
              )}
              <button className="btn btn-secondary" onClick={() => {
                localStorage.removeItem('saf_folder_uri');
                alert("Storage folder reset to Internal Documents.");
                window.location.reload();
              }} style={{ width: '100%', fontSize: '0.8rem' }}>Reset to Default</button>
            </div>
          </div>
        )}
        {mode === 'SHIELD_AUTO' && (
          <div className="card-glass text-center">
            <h2>🛡️ One-Click Shield</h2>
            
            <div style={{ display: 'flex', justifyContent: 'center', gap: '20px', margin: '15px 0', background: 'rgba(0,0,0,0.2)', padding: '10px', borderRadius: '8px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={useBorder} onChange={e => setUseBorder(e.target.checked)} />
                <span style={{ fontSize: '0.9rem' }}>Physical Border</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                <input type="checkbox" checked={useStamp} onChange={e => setUseStamp(e.target.checked)} />
                <span style={{ fontSize: '0.9rem' }}>Invisible Stamp</span>
              </label>
            </div>

            {useStamp && (
              <div style={{ margin: '15px 0', background: 'rgba(96, 165, 250, 0.1)', padding: '15px', borderRadius: '8px', border: '1px solid #60a5fa' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: '#60a5fa', fontWeight: 'bold' }}>STAMP CODE (6 CHARS)</label>
                <input 
                  type="text" 
                  value={sharedUid} 
                  onChange={e => {
                    const val = e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '');
                    if (val.length <= 6) setSharedUid(val);
                  }} 
                  maxLength={6}
                  style={{ width: '100%', background: '#000', color: '#fff', textAlign: 'center', fontSize: '1.5rem', letterSpacing: '5px', fontFamily: 'monospace', border: '1px solid #334155' }}
                />
              </div>
            )}

            <label className="file-dropzone mt-1">
              <input type="file" accept="image/*" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) { 
                  setSharedFilename(file.name); 
                  const img = new Image(); 
                  img.onload = async () => {
                    setSharedImage(img);
                    const meta = await extractMetadata(file, img);
                    setImageMeta(meta);
                  };
                  img.src = URL.createObjectURL(file); 
                }
              }} />
              {sharedImage ? (
                <div style={{ position: 'relative', width: '100%' }}>
                  <img src={sharedImage.src} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px' }} />
                  {imageMeta && (
                    <div style={{ marginTop: '10px', background: 'rgba(0,0,0,0.6)', padding: '10px', borderRadius: '8px', fontSize: '0.7rem', textAlign: 'left', color: '#fff', border: '1px solid #334155' }}>
                      <strong>📄 FILE:</strong> {imageMeta.filename} ({Math.round(imageMeta.size/1024)} KB)<br/>
                      <strong>📏 IMAGE:</strong> {imageMeta.width}x{imageMeta.height} | {imageMeta.dpi} | {imageMeta.colorDepth}<br/>
                      <strong>📸 EXIF:</strong> {formatExifSummary(imageMeta.exif)}
                    </div>
                  )}
                </div>
              ) : <span>Click to load photo</span>}
            </label>

            <div style={{ margin: '15px 0', textAlign: 'left' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.8rem', color: '#94a3b8', fontWeight: 'bold' }}>AUTHOR / OWNER NAME</label>
              <input 
                type="text" 
                value={author} 
                onChange={e => { setAuthor(e.target.value); localStorage.setItem('default_author', e.target.value); }} 
                placeholder="Enter your name..."
                style={{ width: '100%', background: '#000', color: '#fff', padding: '12px', border: '1px solid #334155', borderRadius: '8px', fontSize: '1rem' }}
              />
            </div>

            {sharedImage && <button className="btn btn-primary mt-1" onClick={runOneClickShield} style={{ width: '100%', padding: '15px', fontSize: '1.1rem' }}>⚡ ACTIVATE SHIELD (ZIP)</button>}
          </div>
        )}

        {mode === 'START' && (
          <div className="action-cards">
            <button className="card-action protect" onClick={() => setMode('SHIELD_AUTO')}>
              <span className="icon">🛡️</span>
              <h2>Auto-Shield</h2>
              <p>ZIP Evidence Bundle</p>
            </button>
            <button className="card-action verify" onClick={() => setMode('VERIFY')}>
              <span className="icon">🔍</span>
              <h2>Manual Audit</h2>
              <p>Step-by-step verification</p>
            </button>
          </div>
        )}

        {mode === 'VERIFY' && (
          <div className="wizard-flow">
            <button className="btn btn-secondary mb-1" onClick={() => { setMode('START'); setSharedZipBlob(undefined); }}>← Back</button>
            <div className="card-glass" style={{ border: '2px solid #60a5fa' }}>
              <ZipVerifier 
                initialFile={sharedZipBlob} 
                onNativePick={openNativeFilePicker}
                deviceId={license?.deviceHash || 'UNKNOWN'}
                onStart={startProc} 
                onProgress={setProgress} 
                onEnd={endProc} 
              />
            </div>
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
