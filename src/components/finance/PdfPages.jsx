import React, { useEffect, useRef, useState } from 'react';

// Renders every page of a PDF Blob onto canvases with pdf.js, so the invoice
// displays the same in every browser (including iPhone Safari, which can't show PDFs in an iframe).
let pdfjsPromise;
function loadPdfjs() {
  pdfjsPromise ||= Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]).then(([lib, worker]) => {
    lib.GlobalWorkerOptions.workerSrc = worker.default;
    return lib;
  });
  return pdfjsPromise;
}

export default function PdfPages({ blob, title }) {
  const wrap = useRef(null);
  const [state, setState] = useState('loading');

  useEffect(() => {
    if (!blob) return undefined;
    let cancelled = false;
    let doc;
    (async () => {
      try {
        const pdfjs = await loadPdfjs();
        doc = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        if (cancelled) return;
        const host = wrap.current;
        host.innerHTML = '';
        const cssWidth = Math.min(host.clientWidth - 2, 900);
        const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
        for (let n = 1; n <= doc.numPages; n++) {
          const page = await doc.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (cssWidth / base.width) * dpr });
          const canvas = document.createElement('canvas');
          canvas.width = vp.width; canvas.height = vp.height;
          canvas.style.width = `${cssWidth}px`;
          canvas.setAttribute('role', 'img');
          canvas.setAttribute('aria-label', `${title || 'Invoice'} – page ${n} of ${doc.numPages}`);
          canvas.className = 'pdf-page';
          host.appendChild(canvas);
          await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
        }
        if (!cancelled) setState('ready');
      } catch (e) {
        console.error(e);
        if (!cancelled) setState('error');
      }
    })();
    return () => { cancelled = true; doc?.destroy?.(); };
  }, [blob, title]);

  return (
    <div className="pdf-pages">
      {state === 'loading' && <div className="pad"><div className="spinner" role="status" aria-label="Loading invoice" /></div>}
      {state === 'error' && <p className="muted small pad">Couldn't display the preview. Use “Open in new tab” or “Download PDF”.</p>}
      <div ref={wrap} className="pdf-pages-inner" />
    </div>
  );
}
