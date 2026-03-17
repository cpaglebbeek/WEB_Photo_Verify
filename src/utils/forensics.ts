/**
 * Forensic Analysis Utility v8.7
 */

export interface HistogramData {
  luminance: number[];
  max: number;
}

/**
 * Generates luminance histogram data (256 bins).
 */
export const generateHistogram = (imageData: ImageData): HistogramData => {
  const data = imageData.data;
  const bins = new Array(256).fill(0);
  let max = 0;

  for (let i = 0; i < data.length; i += 4) {
    // Standard relative luminance
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    bins[lum]++;
    if (bins[lum] > max) max = bins[lum];
  }

  return { luminance: bins, max };
};

/**
 * Compares two histograms and returns a similarity score (0 to 1).
 * Uses normalized cross-correlation of bins.
 */
export const compareHistograms = (hist1: number[], hist2: number[]): number => {
  if (hist1.length !== hist2.length) return 0;
  
  const sum1 = hist1.reduce((a, b) => a + b, 0);
  const sum2 = hist2.reduce((a, b) => a + b, 0);
  
  let dotProduct = 0;
  let mag1 = 0;
  let mag2 = 0;
  
  for (let i = 0; i < hist1.length; i++) {
    const n1 = hist1[i] / (sum1 || 1);
    const n2 = hist2[i] / (sum2 || 1);
    dotProduct += n1 * n2;
    mag1 += n1 * n1;
    mag2 += n2 * n2;
  }
  
  const similarity = dotProduct / (Math.sqrt(mag1) * Math.sqrt(mag2) || 1);
  return Math.min(1, similarity);
};

/**
 * Detects "Comb-artifacts" (empty bins between full bins) 
 * which indicate quantization/editing.
 */
export const detectQuantization = (hist: number[]): number => {
  let gaps = 0;
  // Ignore absolute black and white ends
  for (let i = 5; i < 250; i++) {
    if (hist[i] === 0 && hist[i-1] > 0 && hist[i+1] > 0) {
      gaps++;
    }
  }
  return gaps;
};
