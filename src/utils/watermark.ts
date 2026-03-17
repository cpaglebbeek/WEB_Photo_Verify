/**
 * Watermarking Utility v2.3 - 4-bit Differential Encoding
 * Uses 16x16 pixel blocks in pairs (A and B).
 * For each bit:
 *   Bit 1: Block A = lightened (+4%), Block B = darkened (-4%)
 *   Bit 0: Block A = darkened (-4%), Block B = lightened (+4%)
 */

const BLOCK_SIZE = 16;
const DELTA = 0.04; // 4% modulation for low visibility
const UID_BITS = 4; // Only 4 bits now

export interface WatermarkResult {
  uid: string;
  confidence: number;
}

/**
 * Generate a random 4-bit hex UID (0-F).
 */
export const generateUID = (): string => {
  return Math.floor(Math.random() * 0xF).toString(16).toUpperCase();
};

const getLuminance = (r: number, g: number, b: number): number => {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

const modulateBlock = (data: Uint8ClampedArray, x: number, y: number, width: number, height: number, mod: number) => {
  for (let by = 0; by < BLOCK_SIZE && (y + by) < height; by++) {
    for (let bx = 0; bx < BLOCK_SIZE && (x + bx) < width; bx++) {
      const idx = ((y + by) * width + (x + bx)) * 4;
      data[idx] = Math.min(255, Math.max(0, data[idx] * mod));
      data[idx + 1] = Math.min(255, Math.max(0, data[idx + 1] * mod));
      data[idx + 2] = Math.min(255, Math.max(0, data[idx + 2] * mod));
    }
  }
};

export const embedWatermark = (imageData: ImageData, uidHex: string): ImageData => {
  const uid = parseInt(uidHex, 16);
  const data = imageData.data;
  const { width, height } = imageData;

  // 4 bits = 8 blocks per tile.
  // We can use a 2x4 grid of blocks per tile (64x128 pixels).
  for (let y = 0; y < height; y += BLOCK_SIZE * 2) {
    for (let x = 0; x < width; x += BLOCK_SIZE * 4) {
      for (let bit = 0; bit < UID_BITS; bit++) {
        // Find positions for Block A and Block B for this bit
        const bitCol = bit;
        const ax = x + bitCol * BLOCK_SIZE;
        const ay = y;
        const bx = x + bitCol * BLOCK_SIZE;
        const by = y + BLOCK_SIZE;

        if (ax + BLOCK_SIZE > width || by + BLOCK_SIZE > height) continue;

        const val = (uid >> bit) & 1;
        if (val === 1) {
          modulateBlock(data, ax, ay, width, height, 1 + DELTA); // A+
          modulateBlock(data, bx, by, width, height, 1 - DELTA); // B-
        } else {
          modulateBlock(data, ax, ay, width, height, 1 - DELTA); // A-
          modulateBlock(data, bx, by, width, height, 1 + DELTA); // B+
        }
      }
    }
  }
  return imageData;
};

export const extractWatermark = (imageData: ImageData): WatermarkResult => {
  const data = imageData.data;
  const { width, height } = imageData;
  
  const bitVotes = new Array(UID_BITS).fill(0).map(() => ({ 0: 0, 1: 0 }));

  const getBlockAvg = (x: number, y: number): number => {
    let sum = 0, count = 0;
    for (let by = 0; by < BLOCK_SIZE && (y + by) < height; by++) {
      for (let bx = 0; bx < BLOCK_SIZE && (x + bx) < width; bx++) {
        const idx = ((y + by) * width + (x + bx)) * 4;
        sum += getLuminance(data[idx], data[idx + 1], data[idx + 2]);
        count++;
      }
    }
    return count > 0 ? sum / count : 0.5;
  };

  for (let y = 0; y < height; y += BLOCK_SIZE * 2) {
    for (let x = 0; x < width; x += BLOCK_SIZE * 4) {
      for (let bit = 0; bit < UID_BITS; bit++) {
        const bitCol = bit;
        const ax = x + bitCol * BLOCK_SIZE;
        const ay = y;
        const bx = x + bitCol * BLOCK_SIZE;
        const by = y + BLOCK_SIZE;

        if (ax + BLOCK_SIZE > width || by + BLOCK_SIZE > height) continue;

        const avgA = getBlockAvg(ax, ay);
        const avgB = getBlockAvg(bx, by);

        const diff = avgA - avgB;
        if (Math.abs(diff) > 0.0001) {
          if (diff > 0) {
            bitVotes[bit][1]++;
          } else {
            bitVotes[bit][0]++;
          }
        }
      }
    }
  }

  let reconstructedUid = 0;
  let totalAgreement = 0;
  let activeBits = 0;

  for (let i = 0; i < UID_BITS; i++) {
    const v0 = bitVotes[i][0];
    const v1 = bitVotes[i][1];
    const total = v0 + v1;
    
    if (total === 0) continue;
    activeBits++;

    if (v1 > v0) {
      reconstructedUid |= (1 << i);
      totalAgreement += (v1 / total - 0.5) * 2;
    } else {
      totalAgreement += (v0 / total - 0.5) * 2;
    }
  }

  return {
    uid: (reconstructedUid >>> 0).toString(16).toUpperCase(),
    confidence: activeBits > 0 ? (totalAgreement / activeBits) : 0
  };
};
