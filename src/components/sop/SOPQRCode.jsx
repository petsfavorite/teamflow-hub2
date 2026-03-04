import React, { useRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { QrCode, Printer } from 'lucide-react';

export default function SOPQRCode({ sop }) {
  const printRef = useRef();
  const sopUrl = `${window.location.origin}${window.location.pathname}#/SOPDetail?id=${sop.id}`;

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
      <html>
        <head>
          <title>QR Code — ${sop.title}</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 24px; box-sizing: border-box; }
            .container { text-align: center; border: 2px solid #e2e8f0; border-radius: 16px; padding: 32px; max-width: 340px; }
            h2 { font-size: 18px; font-weight: 700; color: #1e293b; margin: 16px 0 4px; }
            p { font-size: 13px; color: #64748b; margin: 4px 0 0; }
            .category { font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6366f1; font-weight: 600; margin-bottom: 8px; }
            .scan-note { font-size: 12px; color: #94a3b8; margin-top: 12px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="category">${sop.category || 'SOP'}</div>
            ${printRef.current?.innerHTML || ''}
            <h2>${sop.title}</h2>
            ${sop.summary ? `<p>${sop.summary}</p>` : ''}
            <p class="scan-note">Scan to view full procedure</p>
          </div>
          <script>window.onload = () => { window.print(); window.close(); }<\/script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <QrCode className="w-4 h-4" /> QR Code
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>QR Code — {sop.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col items-center gap-4 py-4">
          <div ref={printRef} className="p-4 bg-white border border-slate-200 rounded-xl">
            <QRCodeSVG value={sopUrl} size={200} level="H" includeMargin />
          </div>
          <p className="text-xs text-slate-500 text-center">Scan to go directly to this SOP.<br />Print and attach to the relevant equipment.</p>
          <Button onClick={handlePrint} className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700">
            <Printer className="w-4 h-4" /> Print QR Code
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}