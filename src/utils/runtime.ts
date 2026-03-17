/**
 * PhotoVerify Runtime Detection Utility
 */

export type RuntimeMode = 'STANDALONE_PWA' | 'BROWSER' | 'ELECTRON' | 'CHROME_EXTENSION' | 'CAPACITOR_NATIVE';

export function getRuntimeMode(): RuntimeMode {
  if (!!(window as any).Capacitor && (window as any).Capacitor.isNativePlatform()) {
    return 'CAPACITOR_NATIVE';
  }
  if (navigator.userAgent.toLowerCase().indexOf(' electron/') > -1) {
    return 'ELECTRON';
  }
  if (!!(window as any).chrome && (window as any).chrome.runtime && (window as any).chrome.runtime.id) {
    return 'CHROME_EXTENSION';
  }
  if (window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone) {
    return 'STANDALONE_PWA';
  }
  return 'BROWSER';
}

export function getDetailedSystemInfo() {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';
  let deviceType = 'Desktop/Laptop';
  let browser = 'Unknown Browser';

  // 1. OS Detection
  if (ua.indexOf('Win') !== -1) os = 'Windows';
  if (ua.indexOf('Mac') !== -1) os = 'macOS';
  if (ua.indexOf('Linux') !== -1) os = 'Linux';
  if (ua.indexOf('Android') !== -1) os = 'Android';
  if (ua.indexOf('like Mac') !== -1) os = 'iOS';

  // 2. Device Type
  if (/tablet|ipad|playbook|silk/i.test(ua.toLowerCase())) {
    deviceType = 'Tablet';
  } else if (/Mobile|Android|iP(hone|od)|IEMobile|BlackBerry|Kindle|Opera Mini/i.test(ua)) {
    deviceType = 'Mobile';
  }

  // 3. Browser Detection
  if (ua.indexOf('Firefox') > -1) browser = 'Firefox';
  else if (ua.indexOf('SamsungBrowser') > -1) browser = 'Samsung Internet';
  else if (ua.indexOf('Opera') > -1 || ua.indexOf('OPR') > -1) browser = 'Opera';
  else if (ua.indexOf('Edge') > -1) browser = 'Edge';
  else if (ua.indexOf('Chrome') > -1) browser = 'Chrome';
  else if (ua.indexOf('Safari') > -1) browser = 'Safari';

  // 4. Platform Specific Detail
  let platformDetail = 'Web Standard';
  const mode = getRuntimeMode();
  if (mode === 'CAPACITOR_NATIVE') {
    platformDetail = os === 'Android' ? 'Native Android (WebView)' : 'Native iOS (Capacitor)';
  } else if (mode === 'STANDALONE_PWA') {
    platformDetail = 'Installed PWA';
  } else if (mode === 'ELECTRON') {
    platformDetail = 'Desktop App (Electron)';
  } else if (mode === 'CHROME_EXTENSION') {
    platformDetail = 'Chrome Extension';
  }

  return { os, deviceType, browser, platformDetail, mode };
}

export function getRuntimeFeatures() {
  const info = getDetailedSystemInfo();
  return {
    ...info,
    canSelectFolder: ['CAPACITOR_NATIVE', 'ELECTRON', 'CHROME_EXTENSION'].includes(info.mode),
    isSandboxed: ['BROWSER', 'STANDALONE_PWA'].includes(info.mode),
    storageRecommendation: info.mode === 'BROWSER' ? 'Please save bundles in a dedicated folder (e.g. ~/Documents/_PhotoVerify) for OS-level persistence.' : 'Managed by Application Storage'
  };
}
