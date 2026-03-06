import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { base44 } from '@/api/base44Client';
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, RotateCcw } from 'lucide-react';
import { toast } from "sonner";

export default function ChecklistItemRow({ item, index, notes, onNotesChange, onItemUpdate, canUndo }) {
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(item.photo_url || '');

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setPhotoUrl(file_url);
      onItemUpdate(index, { photo_url: file_url });
      toast.success('Photo uploaded');
    } catch (err) {
      toast.error('Failed to upload photo');
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = () => {
    setPhotoUrl('');
    onItemUpdate(index, { photo_url: '' });
  };

  return (
    <div className={`p-4 rounded-xl border transition-all ${item.checked ? 'bg-emerald-50 border-emerald-200' : 'bg-white border-slate-200'}`}>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={item.checked}
          onCheckedChange={() => onItemUpdate(index, { checked: !item.checked })}
          className="mt-0.5"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2 mb-1">
            {item.sop_id ? (
              <Link to={createPageUrl('SOPDetail') + `?id=${item.sop_id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700 underline">
                {item.label}
              </Link>
            ) : (
              <span className={`text-sm font-medium ${item.checked ? 'text-emerald-700 line-through' : 'text-slate-800'}`}>
                {item.label}
              </span>
            )}
          </div>
          {item.assigned_to_name && (
            <p className="text-xs text-slate-500 mb-2">Assigned to: {item.assigned_to_name}</p>
          )}
          {item.checked && (
            <div className="text-xs text-emerald-600 mb-2 flex items-center justify-between">
              <span>✓ Checked by {item.checked_by_name} at {new Date(item.checked_at).toLocaleString()}</span>
              {canUndo && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onItemUpdate(index, { checked: false })}
                  className="h-6 px-2 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 gap-1"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </Button>
              )}
            </div>
          )}

          <div className="mt-3 space-y-2">
            <Textarea
              placeholder="Add notes (optional)"
              value={notes[index] || ''}
              onChange={e => onNotesChange(index, e.target.value)}
              className="text-xs h-16 resize-none"
            />

            <div className="space-y-2">
              {photoUrl && (
                <div className="relative inline-block">
                  <img src={photoUrl} alt="Item photo" className="h-24 w-24 object-cover rounded-lg border border-slate-200" />
                  <button
                    onClick={removePhoto}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              <div>
                <input
                  type="file"
                  id={`photo-${index}`}
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
                <label htmlFor={`photo-${index}`}>
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                    className="gap-2 cursor-pointer"
                    disabled={uploading}
                  >
                    <span>
                      {uploading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      {photoUrl ? 'Change photo' : 'Add photo'}
                    </span>
                  </Button>
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}