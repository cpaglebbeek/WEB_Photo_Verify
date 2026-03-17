/**
 * Virtual Storage Utility v5.3 - Async Progress Architecture
 */

const CELL_SIZE = 32;
const DELTA = 30; 
const MAGIC_NUMBER = 0x564D; 
const SYNC_PATTERN = 0xAA55AA55; 
const HEADER_SIZE = 8; 
const PAYLOAD_BYTES = 3; 
const TOTAL_STORE_BYTES = HEADER_SIZE + PAYLOAD_BYTES;

export interface VirtualMemory {
  uid: string;
  timestamp: number;
  confidence: number;
  scale: number;
  diagnostics?: string;
}

const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

const getBlockCoreAvg = (data: Uint8ClampedArray, x: number, y: number, width: number, height: number, cellSize: number): number => {
  let sum = 0, count = 0;
  const core = cellSize * 0.5, off = cellSize * 0.25;
  for (let by = 0; by < core; by++) {
    for (let bx = 0; bx < core; bx++) {
      const px = Math.floor(x + off + bx), py = Math.floor(y + off + by);
      if (px >= 0 && px < width && py >= 0 && py < height) {
        sum += data[(py * width + px) * 4 + 2];
        count++;
      }
    }
  }
  return count > 0 ? sum / count : 128;
};

const modulateBlock = (data: Uint8ClampedArray, x: number, y: number, width: number, height: number, shift: number) => {
  const core = 16, off = 8;
  for (let by = 0; by < core && (y + off + by) < height; by++) {
    for (let bx = 0; bx < core && (x + off + bx) < width; bx++) {
      const idx = ((y + off + by) * width + (x + off + bx)) * 4;
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] + shift));
      data[idx + 3] = 255;
    }
  }
};

export const injectVirtualDataAsync = async (imageData: ImageData, uidHex: string, onProgress: (p: number) => void): Promise<ImageData> => {
  const { data, width, height } = imageData;
  const hex = uidHex.padStart(6, '0').slice(0, 6);
  const bytes = new Uint8Array(PAYLOAD_BYTES);
  for(let i = 0; i < 3; i++) bytes[i] = parseInt(hex.substr(i*2, 2), 16);

  const fullPayload = new Uint8Array(TOTAL_STORE_BYTES);
  fullPayload[0] = 0xAA; fullPayload[1] = 0x55; fullPayload[2] = 0xAA; fullPayload[3] = 0x55;
  fullPayload[4] = (MAGIC_NUMBER >> 8) & 0xFF; fullPayload[5] = MAGIC_NUMBER & 0xFF;
  fullPayload.set(bytes, 8);

  const streamBits = fullPayload.length * 8;
  const totalSlots = Math.floor(width / (CELL_SIZE * 2)) * Math.floor(height / CELL_SIZE);

  for (let s = 0; s < totalSlots; s++) {
    const bit = (fullPayload[Math.floor((s % streamBits) / 8)] >> (7 - (s % 8))) & 1;
    const bitStep = CELL_SIZE * 2;
    const perRow = Math.floor(width / bitStep);
    const x = (s % perRow) * bitStep, y = Math.floor(s / perRow) * CELL_SIZE;
    
    if (x + bitStep > width || y + CELL_SIZE > height) break;
    modulateBlock(data, x, y, width, height, bit === 1 ? DELTA : -DELTA);
    modulateBlock(data, x + CELL_SIZE, y, width, height, bit === 1 ? -DELTA : DELTA);

    if (s % 50 === 0) {
      onProgress(Math.floor((s / totalSlots) * 100));
      await yieldToMain();
    }
  }
  onProgress(100);
  return imageData;
};

export const extractVirtualDataAsync = async (imageData: ImageData, onProgress: (p: number) => void): Promise<VirtualMemory | null> => {
  const { data, width, height } = imageData;
  const streamBits = TOTAL_STORE_BYTES * 8;
  let bestScale = 1.0, bestX = 0, bestY = 0, syncFound = false, maxSyncMatches = 0;

  const scales = [1.0, 0.8, 0.85, 0.9, 0.95, 0.98, 0.99, 1.01, 1.02, 1.05, 1.1, 1.15, 1.2];
  for (let i = 0; i < scales.length; i++) {
    const scale = scales[i];
    const currentCellSize = CELL_SIZE * scale;
    onProgress(Math.floor((i / scales.length) * 50));
    await yieldToMain();

    for (let sy = 0; sy < Math.min(currentCellSize, 16); sy += 2) {
      for (let sx = 0; sx < Math.min(currentCellSize, 16); sx += 2) {
        let matches = 0;
        const bitStep = currentCellSize * 2;
        const perRow = Math.floor((width - sx) / bitStep);
        for (let j = 0; j < 32; j++) {
          const cx = sx + (j % perRow) * bitStep, cy = sy + Math.floor(j / perRow) * currentCellSize;
          if (cy + currentCellSize > height) break;
          if ((getBlockCoreAvg(data, cx, cy, width, height, currentCellSize) > getBlockCoreAvg(data, cx + currentCellSize, cy, width, height, currentCellSize) ? 1 : 0) === ((SYNC_PATTERN >>> (31 - j)) & 1)) matches++;
        }
        if (matches > maxSyncMatches) { maxSyncMatches = matches; bestScale = scale; bestX = sx; bestY = sy; }
        if (matches >= 30) { syncFound = true; break; }
      }
      if (syncFound) break;
    }
    if (syncFound) break;
  }

  if (maxSyncMatches < 24) return null;

  const finalCellSize = CELL_SIZE * bestScale;
  const bitStep = finalCellSize * 2;
  const perRow = Math.floor((width - bestX) / bitStep);
  const totalSlots = perRow * Math.floor((height - bestY) / finalCellSize);
  const bitVotes: { [key: number]: number }[] = new Array(streamBits).fill(0).map(() => ({ 0: 0, 1: 0 }));

  for (let s = 0; s < totalSlots; s++) {
    const cx = bestX + (s % perRow) * bitStep, cy = bestY + Math.floor(s / perRow) * finalCellSize;
    if (cy + finalCellSize > height) break;
    const bit = getBlockCoreAvg(data, cx, cy, width, height, finalCellSize) > getBlockCoreAvg(data, cx + finalCellSize, cy, width, height, finalCellSize) ? 1 : 0;
    const votes = bitVotes[s % streamBits];
    if (bit === 1) votes[1]++; else votes[0]++;
    if (s % 100 === 0) {
      onProgress(50 + Math.floor((s / totalSlots) * 50));
      await yieldToMain();
    }
  }

  const buffer = new Uint8Array(TOTAL_STORE_BYTES);
  let totalAgreement = 0;
  for (let i = 0; i < TOTAL_STORE_BYTES; i++) {
    let byte = 0;
    for (let b = 0; b < 8; b++) {
      const votes = bitVotes[i * 8 + b];
      const bit = votes[1] > votes[0] ? 1 : 0;
      byte = (byte << 1) | bit;
      totalAgreement += (Math.max(votes[0], votes[1]) / (votes[0] + votes[1] || 1));
    }
    buffer[i] = byte;
  }

  if (((buffer[4] << 8) | buffer[5]) !== MAGIC_NUMBER) return null;
  onProgress(100);
  return {
    uid: Array.from(buffer.slice(8)).map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase(),
    timestamp: Date.now(), confidence: (totalAgreement / streamBits), scale: bestScale,
    diagnostics: `Locked at ${(bestScale*100).toFixed(1)}%.`
  };
};
