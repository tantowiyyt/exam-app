export interface PDFOptions {
  filename: string;
}

/**
 * Export an HTML element to PDF via browser print dialog
 */
export async function exportToPDF(
  element: HTMLElement,
  options: PDFOptions
): Promise<void> {
  const { filename } = options;

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Popup blocked. Allow popups for this site.');
  }

  const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
    .map(el => el.outerHTML)
    .join('\n');

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>${filename}</title>
      ${styles}
      <style>
        @media print {
          body { margin: 0; padding: 0; }
          @page { margin: 10mm; size: landscape; }
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: #fff;
          color: #000;
          padding: 20px;
        }
      </style>
    </head>
    <body>
      ${element.innerHTML}
      <script>
        window.onload = function() {
          setTimeout(function() { window.print(); window.close(); }, 300);
        };
      </script>
    </body>
    </html>
  `);
  printWindow.document.close();
}

/**
 * Export stats dashboard to PDF
 */
export async function exportStatsToPDF(): Promise<void> {
  const element = document.getElementById('stats-dashboard');
  if (!element) {
    throw new Error('Stats dashboard element not found');
  }

  await exportToPDF(element, {
    filename: `dashboard-stats-${new Date().toISOString().slice(0, 10)}`,
  });
}
