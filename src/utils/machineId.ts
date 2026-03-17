// src/utils/machineId.ts
import { getDetailedSystemInfo } from './runtime';

/**
 * Generates a cryptographically secure UUID v4.
 */
function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function getPersistentAnchor(): string {
  const key = 'PV_ANCHOR_UUID';
  let uuid = localStorage.getItem(key);
  if (!uuid) {
    uuid = generateUUID();
    localStorage.setItem(key, uuid);
  }
  return uuid;
}

function getHardwareFingerprint(): string {
  let fingerprint = '';
  if (navigator.hardwareConcurrency) fingerprint += `CPU:${navigator.hardwareConcurrency}|`;
  if ((navigator as any).deviceMemory) fingerprint += `RAM:${(navigator as any).deviceMemory}|`;
  if (window.screen) {
    const maxDim = Math.max(window.screen.width, window.screen.height);
    const minDim = Math.min(window.screen.width, window.screen.height);
    fingerprint += `SCR:${maxDim}x${minDim}|`;
  }
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
  } catch (e) {}
  return fingerprint;
}

async function hashString(str: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const msgUint8 = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  let hval = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hval ^= str.charCodeAt(i);
    hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
  }
  return (hval >>> 0).toString(16).toUpperCase().padStart(8, '0');
}

export async function generateMachineHash(): Promise<string> {
  const anchor = getPersistentAnchor();
  const hwFingerprint = getHardwareFingerprint();
  const info = getDetailedSystemInfo();
  const combined = `${anchor}_${hwFingerprint}_${info.os}_${info.browser}_PV_WEB_2026`;
  const fullHash = await hashString(combined);
  return fullHash.substring(0, 16);
}

export function getExtendedDeviceInfo(hash: string): string {
  const info = getDetailedSystemInfo();
  const lines = [
    `ID: ${hash}`,
    `OS: ${info.os} (${info.deviceType})`,
    `Browser: ${info.browser}`,
    `Runtime: ${info.platformDetail}`,
    `Agent: ${navigator.userAgent.substring(0, 100)}...`
  ];
  return lines.join('\n');
}

export function getMachineDetails() {
    const info = getDetailedSystemInfo();
    return {
        os: info.os,
        browser: info.browser,
        hardware: getHardwareFingerprint()
    }
}
