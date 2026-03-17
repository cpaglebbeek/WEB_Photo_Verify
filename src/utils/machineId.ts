// src/utils/machineId.ts

/**
 * Generates a cryptographically secure UUID v4.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Retrieves or generates the Persistent Anchor UUID.
 * Uses localStorage as the primary fast storage.
 */
function getPersistentAnchor(): string {
  const key = 'PV_ANCHOR_UUID';
  let uuid = localStorage.getItem(key);
  if (!uuid) {
    uuid = generateUUID();
    localStorage.setItem(key, uuid);
  }
  return uuid;
}

/**
 * Extracts a stable Hardware Fingerprint.
 */
function getHardwareFingerprint(): string {
  let fingerprint = '';

  // 1. Hardware Concurrency (Logical CPU cores)
  if (navigator.hardwareConcurrency) {
    fingerprint += `CPU:${navigator.hardwareConcurrency}|`;
  }

  // 2. Device Memory (RAM in GB, mostly Chromium)
  if ((navigator as any).deviceMemory) {
    fingerprint += `RAM:${(navigator as any).deviceMemory}|`;
  }

  // 3. Screen Resolution (Stable across normal usage, though can change if moving monitors. We use a rounded aspect to be safer, or just max dimension)
  if (window.screen) {
    const maxDim = Math.max(window.screen.width, window.screen.height);
    const minDim = Math.min(window.screen.width, window.screen.height);
    fingerprint += `SCR:${maxDim}x${minDim}|`;
  }

  // 4. WebGL Renderer (GPU identification)
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        const vendor = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
        const renderer = (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        fingerprint += `GLV:${vendor}|GLR:${renderer}|`;
      }
    }
  } catch (e) {
    // Ignore WebGL errors
  }

  // 5. OS Identification from User Agent
  // We extract just the OS part to survive browser version updates.
  const ua = navigator.userAgent;
  let os = 'UNKNOWN';
  if (ua.indexOf('Win') !== -1) os = 'Windows';
  if (ua.indexOf('Mac') !== -1) os = 'MacOS';
  if (ua.indexOf('X11') !== -1) os = 'UNIX';
  if (ua.indexOf('Linux') !== -1) os = 'Linux';
  if (ua.indexOf('Android') !== -1) os = 'Android';
  if (ua.indexOf('like Mac') !== -1) os = 'iOS';
  
  fingerprint += `OS:${os}`;

  return fingerprint;
}

/**
 * Hashes a string using SHA-256 (Web Crypto API) and returns a hex string.
 * Fallback to a fast JS hash if crypto is unavailable.
 */
async function hashString(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex.toUpperCase();
  }
  
  // Fallback: simple 32-bit FNV-1a hash (not secure, but works as an ID)
  let hval = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return (hval >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

/**
 * Generates the final 16-character Machine Hash for licensing.
 */
export async function generateMachineHash(): Promise<string> {
  const anchor = getPersistentAnchor();
  const hwFingerprint = getHardwareFingerprint();
  
  console.log('[MachineHash] Anchor UUID:', anchor);
  console.log('[MachineHash] HW Fingerprint:', hwFingerprint);
  
  const combined = `${anchor}_${hwFingerprint}_PV_WEB_2026`;
  const fullHash = await hashString(combined);
  
  // Return a 16-character upper-case string
  return fullHash.substring(0, 16);
}

export function getMachineDetails() {
    return {
        os: getHardwareFingerprint().split('|').find(p => p.startsWith('OS:'))?.replace('OS:', '') || 'Unknown',
        browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : navigator.userAgent.includes('Firefox') ? 'Firefox' : navigator.userAgent.includes('Safari') ? 'Safari' : 'Unknown',
        hardware: getHardwareFingerprint()
    }
}