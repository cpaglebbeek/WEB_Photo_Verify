/**
 * Time-Anchor Utility v6.0
 * 
 * Cryptographically links an image hash to a public "Anchor" hash.
 */

/**
 * Generate a SHA-256 hash of a string or buffer.
 */
export const sha256 = async (data: string | Uint8ClampedArray): Promise<string> => {
  const encoder = new TextEncoder();
  
  let buffer: ArrayBuffer;
  if (typeof data === 'string') {
    buffer = encoder.encode(data).buffer;
  } else {
    // Force copy to a plain ArrayBuffer to avoid SharedArrayBuffer issues in SubtleCrypto
    const bytes = new Uint8Array(data.length);
    bytes.set(data);
    buffer = bytes.buffer;
  }

  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

/**
 * Create a combined proof: H(ImageHash + AnchorHash)
 */
export const generateCombinedProof = async (imageHash: string, anchorHash: string): Promise<string> => {
  return await sha256(imageHash + anchorHash);
};

export interface AnchorDeed {
  imageHash: string;
  perceptualHash?: string;
  metadata?: {
    width: number;
    height: number;
    isColor: boolean;
    aspectRatio: string;
  };
  anchorHash: string;
  anchorSource: string;
  combinedProof: string;
  timestamp: number;
  features?: {
    border?: boolean;
    stamp?: boolean;
  };
}
