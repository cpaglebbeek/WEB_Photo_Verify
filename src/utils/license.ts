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
export const checkLicense = async (hash: string, serverUrl: string, forceSync = false): Promise<LicenseStatus> => {
  const sanitizedServerUrl = serverUrl.replace(/\/$/, '');
  const localState: LicenseStatus = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const now = Date.now();
  const GRACE_PERIOD = 24 * 60 * 60 * 1000; // 1 Day

  // 1. Fast Path: Use local if active, not expired (or infinite), and not forcing a sync
  const isExpired = localState && localState.expiry <= now && localState.expiry < 4000000000000;
  if (!forceSync && localState && localState.deviceHash === hash && localState.active && !isExpired) {
    const timeSinceLastCheck = now - localState.lastCheck;
    if (timeSinceLastCheck < GRACE_PERIOD) {
      return { ...localState, message: localState.message || "License Active (Offline)" };
    }
  }

  // 2. Sync Path: Try to retrieve from server
  const fetchUrl = `${sanitizedServerUrl}/licenses/${hash}.json`;
  console.log(`[License] Fetching via standard fetch: ${fetchUrl}`);
  
  try {
    const res = await fetch(fetchUrl, {
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      console.warn(`[License] Server returned ${res.status}`);
      if (res.status === 404) throw new Error(`ID ${hash} not registered on server`);
      throw new Error(`Server error: ${res.status}`);
    }
    
    const serverData = await res.json();
    console.log(`[License] Success:`, serverData);
    
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
        ? "Network error: Server unreachable or SSL error." 
        : `Activation error: ${error.message}` 
    };
  }
};
