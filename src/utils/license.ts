import { generateMachineHash } from './machineId';

export interface LicenseStatus {
  active: boolean;
  expiry: number;
  deviceHash: string;
  lastCheck: number;
  message?: string;
  name?: string;
  company?: string;
  customerId?: string;
  isGracePeriod?: boolean;
}

const STORAGE_KEY = 'photoverify_license_state';

/**
 * Generates a unique hash tied to hardware (Native) or browser fingerprint (Web).
 */
export const getDeviceHash = async (): Promise<string> => {
  try {
    const shortHash = await generateMachineHash();
    return shortHash;
  } catch (err) {
    console.error(`[License] Device Identification failed:`, err);
    return 'DEVICE_ID_ERROR';
  }
};

/**
 * Checks server for license validity. 
 * Local-First: Checks localStorage first for valid, non-expired license.
 */
export const checkLicense = async (
  hash: string, 
  serverUrl: string, 
  forceSync = false,
  onLog?: (msg: string) => void
): Promise<LicenseStatus> => {
  const sanitizedServerUrl = serverUrl.replace(/\/$/, '');
  const localState: LicenseStatus = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const now = Date.now();
  const GRACE_PERIOD = 24 * 60 * 60 * 1000; // 1 Day

  // 1. Fast Path
  const isExpired = localState && localState.expiry <= now && localState.expiry < 4000000000000;
  if (!forceSync && localState && localState.deviceHash === hash && localState.active && !isExpired) {
    const timeSinceLastCheck = now - localState.lastCheck;
    if (timeSinceLastCheck < GRACE_PERIOD) {
      return { ...localState, message: localState.message || "License Active (Offline)" };
    }
  }

  // 2. Sync Path
  const fetchUrl = `${sanitizedServerUrl}/licenses/${hash}.json`;
  onLog?.(`[License] Requesting: GET ${fetchUrl}`);
  
  try {
    const res = await fetch(fetchUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    onLog?.(`[License] HTTP Status: ${res.status} ${res.statusText}`);
    
    if (!res.ok) {
      const errorText = await res.text().catch(() => 'No body');
      onLog?.(`[License] Error Body: ${errorText.substring(0, 200)}`);
      if (res.status === 404) throw new Error(`ID ${hash} not registered on server`);
      throw new Error(`Server error: ${res.status}`);
    }
    
    const serverData = await res.json();
    onLog?.(`[License] Response Data: ${JSON.stringify(serverData)}`);
    
    const newState: LicenseStatus = {
      active: serverData.active && (serverData.expiry > now || serverData.expiry > 4000000000000),
      expiry: serverData.expiry,
      deviceHash: hash,
      lastCheck: now,
      message: serverData.message || "License Verified",
      name: serverData.name,
      company: serverData.company,
      customerId: serverData.customerId,
      isGracePeriod: false
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    return newState;
  } catch (err: unknown) {
    const error = err as Error;
    console.error(`[License] Fetch failed:`, error);
    
    // 3. Fallback Path: If server fails, check if we can stay in offline grace period
    if (localState && localState.deviceHash === hash) {
      const timeSinceLastCheck = now - localState.lastCheck;
      if (timeSinceLastCheck < GRACE_PERIOD) {
        return { ...localState, isGracePeriod: true, message: "Offline Mode (Grace Period Active)" };
      }
      return { ...localState, active: false, isGracePeriod: false, message: `Sync failed: ${error.message}` };
    }
    
    return { 
      active: false, 
      expiry: 0, 
      deviceHash: hash, 
      lastCheck: 0, 
      isGracePeriod: false,
      message: error.message.toLowerCase().includes('failed') 
        ? `Network Error: Could not reach ${sanitizedServerUrl}. Check if the server is up and supports ${sanitizedServerUrl.startsWith('https') ? 'SSL/HTTPS' : 'HTTP'}. If testing locally, ensure CORS is enabled.` 
        : `Activation error: ${error.message}` 
    };
  }
};

/**
 * Manually applies a license JSON content (e.g. from a file upload).
 * Yellow Fix: Bypasses network requirements for activation.
 */
export const applyManualLicense = (serverData: any, hash: string): LicenseStatus => {
  const now = Date.now();
  
  // Validation
  const isValid = serverData && 
                  serverData.active !== undefined && 
                  serverData.expiry !== undefined;

  if (!isValid) {
    throw new Error("Invalid license file format.");
  }

  const newState: LicenseStatus = {
    active: serverData.active && (serverData.expiry > now || serverData.expiry > 4000000000000),
    expiry: serverData.expiry,
    deviceHash: hash,
    lastCheck: now,
    message: (serverData.message || "License Applied Manually") + " (OFFLINE)",
    name: serverData.name,
    company: serverData.company,
    customerId: serverData.customerId,
    isGracePeriod: false
  };
  
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  return newState;
};

/**
 * Diagnostic tool to check if the license directory is reachable.
 * Should return 403 if directory listing is disabled (expected), 
 * or 200/404 if accessible, or throw for network/SSL errors.
 */
export const testConnection = async (serverUrl: string): Promise<{ status: number; message: string }> => {
  const sanitizedServerUrl = serverUrl.replace(/\/$/, '');
  const testUrl = `${sanitizedServerUrl}/licenses/`;
  
  try {
    const res = await fetch(testUrl, { method: 'HEAD', cache: 'no-store' });
    return { 
      status: res.status, 
      message: res.status === 403 ? "Forbidden (Correct: Directory listing disabled)" : `Status ${res.status}` 
    };
  } catch (err: any) {
    return { status: 0, message: err.message || "Unknown Network Error" };
  }
};
