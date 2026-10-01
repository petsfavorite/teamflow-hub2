import React, { useState } from 'react';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FileText, Upload, Loader2, X, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from "sonner";
import { isSafeUrl } from '@/lib/sanitize';

// A stored value is either a pasted http(s) URL or a private file_uri from UploadPrivateFile.
const isHttpUrl = (v) => /^https?:\/\//i.test(v || '');

export default function SOPDocumentUpload({ value, onChange }) {
  const [uploading, setUploading] = useState(false);
  const [signedUrl, setSignedUrl] = useState(null);
  const [signing, setSigning] = useState(false);

  // When the value is a private file_uri, fetch a signed URL so staff can open it.
  React.useEffect(() => {
    setSignedUrl(null);
    if (value && !isHttpUrl(value)) {
      setSigning(true);
      base44.integrations.Core.CreateFileSignedUrl({ file_uri: value })
        .then(res => setSignedUrl(res?.signed_url || null))
        .catch(() => setSignedUrl(null))
        .finally(() => setSigning(false));
    }
  }, [value]);

  const displayUrl = isHttpUrl(value) ? value : signedUrl;

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) {
      toast.error('File must be under 25 MB');
      return;
    }
    setUploading(true);
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file });
      onChange(file_uri);
      toast.success('Document uploaded');
    } catch {
      toast.error('Could not upload the file');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Document / Reference Material <span className="text-slate-400 text-xs font-normal">(optional)</span></Label>
      <p className="text-xs text-slate-500">Link a PDF, Google Doc, or upload a file that staff can reference alongside this SOP.</p>
      <div className="flex gap-2">
        <Input
          value={isHttpUrl(value) ? value : (value ? '(uploaded file)' : '')}
          onChange={e => onChange(e.target.value)}
          placeholder="Paste a link to a PDF, Google Doc, etc."
          readOnly={!!value && !isHttpUrl(value)}
        />
        <label className="cursor-pointer flex-shrink-0">
          <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv" onChange={handleUpload} className="hidden" />
          <span className="inline-flex items-center gap-2 h-9 px-3 rounded-md bg-slate-100 text-slate-700 hover:bg-slate-200 text-sm font-medium whitespace-nowrap">
            {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Upload
          </span>
        </label>
      </div>
      {value && (
        <div className="flex items-center gap-2 text-sm">
          {signing ? (
            <span className="inline-flex items-center gap-1.5 text-slate-400"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Preparing link…</span>
          ) : displayUrl ? (
            <a href={isSafeUrl(displayUrl) ? displayUrl : '#'} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 font-medium break-all">
              <ExternalLink className="w-3.5 h-3.5 flex-shrink-0" /> View document
            </a>
          ) : (
            <span className="text-slate-400 text-xs">Document link unavailable</span>
          )}
          <button onClick={() => onChange('')} className="text-slate-400 hover:text-red-500 flex-shrink-0" title="Remove document">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}