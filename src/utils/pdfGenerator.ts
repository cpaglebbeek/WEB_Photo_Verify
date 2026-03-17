/**
 * Utility to generate Forensic Audit Reports as PDF (via Print)
 */

export interface ReportData {
  title: string;
  version: string;
  timestamp: string;
  deviceId: string;
  results: {
    label: string;
    status: string;
    detail: string;
  }[];
  images: {
    label: string;
    url: string;
  }[];
  forensics: {
    label: string;
    value: string;
  }[];
}

export function generateForensicPDF(data: ReportData) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
    <html>
      <head>
        <title>Forensic Audit Report - ${data.title}</title>
        <style>
          body { font-family: 'Courier New', Courier, monospace; color: #000; padding: 40px; line-height: 1.4; }
          .header { border-bottom: 3px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .title { font-size: 24px; font-weight: bold; text-transform: uppercase; }
          .metadata { font-size: 12px; margin-bottom: 20px; display: grid; grid-template-columns: 1fr 1fr; }
          .section { margin-bottom: 30px; }
          .section-title { font-size: 18px; font-weight: bold; border-left: 10px solid #000; padding-left: 10px; margin-bottom: 15px; text-transform: uppercase; }
          .status-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          .status-table td, .status-table th { border: 1px solid #000; padding: 8px; text-align: left; }
          .image-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
          .image-box { border: 1px solid #ccc; padding: 10px; text-align: center; }
          .image-box img { max-width: 100%; height: auto; max-height: 250px; }
          .legal-disclaimer { font-size: 10px; color: #666; margin-top: 50px; border-top: 1px solid #ccc; paddingTop: 10px; }
          @media print { .no-print { display: none; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">Forensic Audit Report</div>
          <div style="font-size: 14px;">Project PhotoVerify Ecosystem</div>
        </div>

        <div class="metadata">
          <div><strong>Report ID:</strong> ${Math.random().toString(36).substring(2, 15).toUpperCase()}</div>
          <div><strong>Date:</strong> ${data.timestamp}</div>
          <div><strong>App Version:</strong> ${data.version}</div>
          <div><strong>Machine ID:</strong> ${data.deviceId}</div>
        </div>

        <div class="section">
          <div class="section-title">1. Audit Status Summary</div>
          <table class="status-table">
            <thead>
              <tr><th>Layer</th><th>Result</th><th>Technical Detail</th></tr>
            </thead>
            <tbody>
              ${data.results.map(r => `<tr><td>${r.label}</td><td>${r.status}</td><td>${r.detail}</td></tr>`).join('')}
            </tbody>
          </table>
        </div>

        <div class="section">
          <div class="section-title">2. Visual Evidence Gallery</div>
          <div class="image-grid">
            ${data.images.map(img => `
              <div class="image-box">
                <img src="${img.url}" />
                <div style="font-size: 10px; margin-top: 5px;"><strong>${img.label}</strong></div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="section">
          <div class="section-title">3. Forensic Deep-Dive</div>
          <table class="status-table" style="font-size: 11px;">
            ${data.forensics.map(f => `<tr><td style="width: 30%;"><strong>${f.label}</strong></td><td><code>${f.value}</code></td></tr>`).join('')}
          </table>
        </div>

        <div class="legal-disclaimer">
          <strong>JURIDISCHE VERKLARING / LEGAL DISCLAIMER:</strong><br/>
          Dit rapport is computer-gegenereerd door de PhotoVerify Forensic Suite. De berekeningen (pHash, LSB+ Encoding en Geometric Border Extraction) zijn lokaal uitgevoerd zonder tussenkomst van cloud-services. Dit rapport dient als technisch bewijsmiddel voor eigenaarschap en integriteit van het visuele werk conform de standaarden vastgelegd in het PhotoVerify protocol.
        </div>

        <script>
          window.onload = () => {
            setTimeout(() => {
              window.print();
              // window.close(); // Optional: close window after print
            }, 500);
          };
        </script>
      </body>
    </html>
  `;

  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
}
