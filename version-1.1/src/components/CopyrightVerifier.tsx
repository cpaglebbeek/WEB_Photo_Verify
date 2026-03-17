import { useState, type ChangeEvent } from 'react';

export default function CopyrightVerifier() {
  const [original, setOriginal] = useState<HTMLImageElement | null>(null);
  const [cropped, setCropped] = useState<HTMLImageElement | null>(null);
  const [proof, setProof] = useState<HTMLImageElement | null>(null);
  const [verificationResult, setVerificationResult] = useState<{ success: boolean, message: string } | null>(null);

  const handleFileUpload = (setter: (img: HTMLImageElement) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => setter(img);
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    }
  };

  const verify = () => {
    if (!original || !cropped || !proof) {
      setVerificationResult({ success: false, message: "Please upload all 3 files." });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = original.width; canvas.height = original.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(original, 0, 0);
    const originalData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(cropped, 0, 0);
    ctx.drawImage(proof, 0, 0);
    const reconstructedData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let match = true;
    for (let i = 0; i < originalData.length; i++) {
      if (originalData[i] !== reconstructedData[i]) { match = false; break; }
    }
    if (match) {
      setVerificationResult({ success: true, message: "Verification Successful! The combination matches the original." });
    } else {
      setVerificationResult({ success: false, message: "Verification Failed!" });
    }
  };

  return (
    <div className="component-container">
      <h2>2. Verify Originality (Automatic 1-Pixel Border)</h2>
      <div className="upload-section">
        <label>1. Original File: <input type="file" accept="image/*" onChange={handleFileUpload(setOriginal)} /></label>
        <label>2. Cropped (Interior): <input type="file" accept="image/*" onChange={handleFileUpload(setCropped)} /></label>
        <label>3. Proof (Border): <input type="file" accept="image/*" onChange={handleFileUpload(setProof)} /></label>
      </div>
      <button onClick={verify}>Verify Combination</button>
      {verificationResult && (
        <div className={`verification-result ${verificationResult.success ? 'success' : 'error'}`}>
          <p>{verificationResult.message}</p>
        </div>
      )}
    </div>
  );
}
