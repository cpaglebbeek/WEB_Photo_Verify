import { Capacitor, CapacitorHttp, type HttpResponse } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { generateMachineHash } from './machineId';

export interface LicenseStatus {
  active: boolean;
  expiry: number;
  deviceHash: string;
  lastCheck: number;
  lastUsed?: number;
  graceStart?: number;
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
    if (Capacitor.isNativePlatform()) {
      const info = await Device.getId();
      const infoObj = await Device.getInfo();
      // Use original native hash logic for stability on mobile
      const identifier = info.identifier || 'UNKNOWN_ID';
      const model = infoObj.model || 'UNKNOWN_MODEL';
      const seed = `${identifier}_${model}_PV_SALT_2026`;
      // Use simple fallback hash since subtle crypto might be tricky in native background
      let hval = 0x811c9dc5;
      for (let i = 0; i < seed.length; i++) {
        hval ^= seed.charCodeAt(i);
        hval += (hval << 1) + (hval << 4) + (hval << 7) + (hval << 8) + (hval << 24);
      }
      return (hval >>> 0).toString(16).toUpperCase().padStart(16, '0');
    } else {
      return await generateMachineHash();
    }
  } catch (err) {
    console.error(`[License] Device Identification failed:`, err);
    return 'DEVICE_ID_ERROR';
  }
};

/**
 * Checks server for license validity.
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
  const GRACE_PERIOD = 24 * 60 * 60 * 1000;

  // If already in an active grace period, return it without hitting the server (unless forced)
  if (!forceSync && localState && localState.deviceHash === hash && localState.graceStart) {
    const graceRemaining = GRACE_PERIOD - (now - localState.graceStart);
    if (graceRemaining > 0) {
      const hours = Math.floor(graceRemaining / (60 * 60 * 1000));
      onLog?.(`[License] Grace period active — ${hours}h remaining`);
      return { ...localState, active: true, isGracePeriod: true, message: `Grace Period — ${hours}h remaining` };
    } else {
      // Grace period expired — clear it and fall through to server check
      const expired = { ...localState, graceStart: undefined, active: false };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));
      onLog?.(`[License] Grace period expired`);
    }
  }

  const fetchUrl = `${sanitizedServerUrl}/licenses/${hash}.json`;
  onLog?.(`[License] Syncing: GET ${fetchUrl}`);

  try {
    let serverData;
    if (Capacitor.isNativePlatform()) {
      const res: HttpResponse = await CapacitorHttp.get({ url: fetchUrl, headers: { 'Accept': 'application/json' } });
      if (res.status !== 200) throw new Error(`Status ${res.status}`);
      serverData = res.data;
    } else {
      const res = await fetch(fetchUrl, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      serverData = await res.json();
    }

    onLog?.(`[License] Success: ${JSON.stringify(serverData)}`);
    const newState: LicenseStatus = {
      active: serverData.active && (serverData.expiry > now || serverData.expiry > 4000000000000),
      expiry: serverData.expiry,
      deviceHash: hash,
      lastCheck: now,
      // graceStart intentionally omitted — clears any existing grace period on success
      message: serverData.message || "License Verified",
      name: serverData.name,
      company: serverData.company,
      customerId: serverData.customerId
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    return newState;
  } catch (err: any) {
    onLog?.(`[License] Sync failed: ${err.message}`);

    // File not found (404) or unreachable — start or continue grace period
    const existingGrace = localState?.graceStart;
    if (existingGrace) {
      // Grace already running — check if still valid
      const graceRemaining = GRACE_PERIOD - (now - existingGrace);
      if (graceRemaining > 0) {
        const hours = Math.floor(graceRemaining / (60 * 60 * 1000));
        return { ...(localState as LicenseStatus), active: true, isGracePeriod: true, message: `Grace Period — ${hours}h remaining` };
      }
      // Grace expired
      const expired = { ...(localState as LicenseStatus), graceStart: undefined, active: false, message: 'Grace Period Expired' };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(expired));
      return { ...expired, isGracePeriod: false };
    }

    // No grace period yet — start it now (file was just removed)
    const graceState: LicenseStatus = {
      ...(localState ?? { expiry: 0, name: undefined, company: undefined, customerId: undefined }),
      active: true,
      deviceHash: hash,
      lastCheck: localState?.lastCheck ?? now,
      graceStart: now,
      isGracePeriod: true,
      message: 'Grace Period Started — 24h remaining'
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(graceState));
    onLog?.(`[License] Grace period started`);
    return graceState;
  }
};

export const applyManualLicense = (data: any, hash: string): LicenseStatus => {
  const now = Date.now();
  const existingState: LicenseStatus | null = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const newState: LicenseStatus = {
    active: data.active && (data.expiry > now || data.expiry > 4000000000000),
    expiry: data.expiry,
    deviceHash: hash,
    lastCheck: now,
    graceStart: existingState?.graceStart, // preserve active grace period
    message: (data.message || "Manual Activation") + " (OFFLINE)",
    name: data.name,
    company: data.company,
    customerId: data.customerId
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
  return newState;
};

export const testConnection = async (serverUrl: string) => {
  const url = `${serverUrl.replace(/\/$/, '')}/licenses/`;
  try {
    if (Capacitor.isNativePlatform()) {
      const res = await CapacitorHttp.get({ url });
      return { status: res.status };
    } else {
      const res = await fetch(url, { method: 'HEAD' });
      return { status: res.status };
    }
  } catch (e: any) {
    return { status: 0, message: e.message };
  }
};
