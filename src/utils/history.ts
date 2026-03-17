export interface HistoryEntry {
  id: string;
  filename: string;
  timestamp: number;
  type: 'image' | 'deed';
  uid?: string;
  dataUrl?: string; // Optional: only for small deeds or thumbnails
}

const HISTORY_KEY = 'photoverify_history';

export const addToHistory = (entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
  const history: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  
  // NEVER store the dataUrl in history to prevent QuotaExceededError (5MB limit)
  // Base64 encoded ZIPs or high-res photos will crash the app storage.
  const { dataUrl, ...safeEntry } = entry;
  
  const newEntry: HistoryEntry = {
    ...safeEntry,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now()
  };
  
  // Keep only the last 20 entries to save space
  const updatedHistory = [newEntry, ...history].slice(0, 20);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
  } catch (e) {
    console.error("[History] Failed to save history to localStorage:", e);
    // If it still fails, clear history and try once more with just the new entry
    localStorage.removeItem(HISTORY_KEY);
    localStorage.setItem(HISTORY_KEY, JSON.stringify([newEntry]));
  }
};

export const getHistory = (type?: 'image' | 'deed'): HistoryEntry[] => {
  const history: HistoryEntry[] = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  if (type) return history.filter(e => e.type === type);
  return history;
};
