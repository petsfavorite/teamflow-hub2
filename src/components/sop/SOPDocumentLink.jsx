import React, { useState, useEffect } from 'react';
import { Card, CardContent } from "@/components/ui/card";
import { FileText, ExternalLink, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { isSafeUrl } from '@/lib/sanitize';

const isHttpUrl = (v) => /^https?:\/\//i.test(v || '');

export default function SOPDocumentLink({ url }) {
  const [signedUrl, setSignedUrl] = useState(null);
  const [signing, setSigning] = useState(false);

  useEffect(() => {
    setSignedUrl(null);
    if (url && !isHttpUrl(url)) {
      setSigning(true);
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: url })
        .then(res => setSignedUrl(res?.signed_url || null))
        .catch(() => setSignedUrl(null))
        .finally(() => setSigning(false));
    }
  }, [url]);

  if (!url) return null;
  const displayUrl = isHttpUrl(url) ? url : signedUrl;

  return (
    <Card className="border-0 shadow-sm mb-4">
      <CardContent className="p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-3 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Document / Reference Material</h2>
        {signing ? (
          <span className="inline-flex items-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin" /> Preparing link…</span>
        ) : displayUrl ? (
          <a href={isSafeUrl(displayUrl) ? displayUrl : '#'} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-100 transition-colors text-sm font-medium">
            <ExternalLink className="w-4 h-4" /> View Document
          </a>
        ) : (
          <p className="text-sm text-slate-400">Document link unavailable</p>
        )}
      </CardContent>
    </Card>
  );
}