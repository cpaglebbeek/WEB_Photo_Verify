/**
 * Perceptual Hashing Utility v8.3 - Elastic Edition
 * 
 * Implements Shift-Invariant Matching to handle light cropping.
 */

const HASH_SIZE = 16; 

export interface PHashResult {
  hash: string;
  bits: number[];
}

export const generatePerceptualHashDetailed = (imageData: ImageData): PHashResult => {
  const canvas = document.createElement('canvas');
  canvas.width = HASH_SIZE;
  canvas.height = HASH_SIZE;
  const ctx = canvas.getContext('2d')!;
  
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = imageData.width;
  tempCanvas.height = imageData.height;
  tempCanvas.getContext('2d')!.putImageData(imageData, 0, 0);
  
  ctx.drawImage(tempCanvas, 0, 0, HASH_SIZE, HASH_SIZE);
  const smallData = ctx.getImageData(0, 0, HASH_SIZE, HASH_SIZE).data;
  
  const pixels = new Float32Array(HASH_SIZE * HASH_SIZE);
  let totalLuminance = 0;
  
  for (let i = 0; i < pixels.length; i++) {
    const r = smallData[i * 4];
    const g = smallData[i * 4 + 1];
    const b = smallData[i * 4 + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    pixels[i] = lum;
    totalLuminance += lum;
  }
  
  const avgLuminance = totalLuminance / pixels.length;
  const bits: number[] = [];
  let hashHex = '';
  
  for (let i = 0; i < pixels.length; i += 4) {
    let nibble = 0;
    for (let j = 0; j < 4; j++) {
      const isAbove = pixels[i + j] > avgLuminance;
      bits.push(isAbove ? 1 : 0);
      if (isAbove) nibble |= (1 << (3 - j));
    }
    hashHex += nibble.toString(16);
  }
  
  return { hash: hashHex.toUpperCase(), bits };
};

export const generateFingerprint = async (imageData: ImageData): Promise<string> => {
  const hashBuffer = await crypto.subtle.digest('SHA-256', imageData.data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

export const hashToBits = (hash: string): number[] => {
  const bits: number[] = [];
  for (let i = 0; i < hash.length; i++) {
    const val = parseInt(hash[i], 16);
    if (isNaN(val)) {
      for(let j=0; j<4; j++) bits.push(0);
      continue;
    }
    for (let j = 3; j >= 0; j--) {
      bits.push((val >> j) & 1);
    }
  }
  return bits;
};

/**
 * Robust comparison that tests small X/Y shifts to find the best alignment.
 */
export const compareHashesElastic = (bits1: number[], bits2: number[]): { score: number, offsetBits: number[] } => {
  if (bits1.length !== 256 || bits2.length !== 256) return { score: 0, offsetBits: bits2 };

  let bestScore = 0;
  let bestOffsetBits = bits2;

  // Search range: shift bits2 by -2 to +2 in X and Y
  for (let offsetY = -2; offsetY <= 2; offsetY++) {
    for (let offsetX = -2; offsetX <= 2; offsetX++) {
      let matches = 0;
      const shiftedBits = new Array(256).fill(0);

      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          const targetX = x + offsetX;
          const targetY = y + offsetY;
          
          let bitValue = 0;
          if (targetX >= 0 && targetX < 16 && targetY >= 0 && targetY < 16) {
            bitValue = bits2[targetY * 16 + targetX];
          }
          
          shiftedBits[y * 16 + x] = bitValue;
          if (bits1[y * 16 + x] === bitValue) {
            matches++;
          }
        }
      }

      const score = matches / 256;
      if (score > bestScore) {
        bestScore = score;
        bestOffsetBits = shiftedBits;
      }
    }
  }

  return { score: bestScore, offsetBits: bestOffsetBits };
};
