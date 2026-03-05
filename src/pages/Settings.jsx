import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Settings as SettingsIcon, Trash2, ChevronLeft, Download, Upload, CheckCircle2, AlertCircle, AlertTriangle, User } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

export default function Settings() {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [parsedRows, setParsedRows] = useState([]);
  const [checkingDuplicates, setCheckingDuplicates] = useState(false);
  const [showDuplicateDialog, setShowDuplicateDialog] = useState(false);
  const [user, setUser] = useState(null);

  React.useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  const isSuperAdmin = user?.role === 'super_admin';

  const handleDownloadTemplate = () => {
    const headers = [
      'name', 'species', 'breed', 'color', 'gender', 'group_play',
      'social_media', 'photo_url', 'owner_name', 'email',
      'feeding_instructions', 'medication_notes',
      'special_needs', 'daily_picture', 'notes'
    ];
    const notes = [
      'Pet name (required)', 'Dog or Cat (required)', 'Breed', 'Color/markings',
      'Male / Neutered Male / Female / Spayed Female',
      'Approved / Not Approved / Not Tested',
      'Approved for Social Media / Not Approved for Social Media / No Record of Social Media Consent',
      'URL to pet photo (optional)',
      'Owner full name (required)', 'Owner email',
      'Feeding instructions',
      'General medication notes (e.g. must give with food)',
      'Special needs / health notes', 'true or false', 'Additional notes'
    ];

    const csvContent = [
      headers.join(','),
      notes.map(n => `"${n}"`).join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'pet_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseCSVFile = async (file) => {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    if (lines.length < 3) return null;

    const parseCSVLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        if (line[i] === '"') { inQuotes = !inQuotes; }
        else if (line[i] === ',' && !inQuotes) { result.push(current.trim()); current = ''; }
        else { current += line[i]; }
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseCSVLine(lines[0]);
    const dataLines = lines.slice(2);
    const rows = [];
    for (const line of dataLines) {
      if (!line.trim()) continue;
      const values = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] || ''; });
      if (row.name && row.owner_name) rows.push(row);
    }
    return rows;
  };

  const handleFileChange = async (file) => {
    setImportFile(file);
    setImportResult(null);
    setDuplicates([]);
    setParsedRows([]);
    if (!file) return;

    setCheckingDuplicates(true);
    const rows = await parseCSVFile(file);
    if (!rows) { setCheckingDuplicates(false); return; }

    const existingPets = await base44.entities.Pet.list();
    const found = [];
    for (const row of rows) {
      const nameLower = row.name.trim().toLowerCase();
      const ownerLower = row.owner_name.trim().toLowerCase();
      const matches = existingPets.filter(p =>
        p.name.toLowerCase() === nameLower &&
        p.owner_name.toLowerCase() === ownerLower
      );
      if (matches.length > 0) found.push({ row, matches });
    }
    setParsedRows(rows);
    setDuplicates(found);
    setCheckingDuplicates(false);
    if (found.length > 0) {
      setShowDuplicateDialog(true);
    }
  };

  const importRows = async (rows) => {
    let success = 0, failed = 0;
    for (const row of rows) {
      // Skip rows missing required fields
      if (!row.name?.trim() || !row.owner_name?.trim()) { failed++; continue; }

      const val = (v) => v?.trim() || undefined;

      const petData = {
        // Required fields
        name: row.name.trim(),
        owner_name: row.owner_name.trim(),
        species: ['Dog', 'Cat'].includes(row.species?.trim()) ? row.species.trim() : 'Dog',
        // Optional fields — undefined if blank, so entity default applies
        breed: val(row.breed),
        color: val(row.color),
        gender: ['Male', 'Neutered Male', 'Female', 'Spayed Female'].includes(row.gender?.trim()) ? row.gender.trim() : undefined,
        group_play: ['Approved', 'Not Approved', 'Not Tested'].includes(row.group_play?.trim()) ? row.group_play.trim() : 'Not Tested',
        social_media: ['Approved for Social Media', 'Not Approved for Social Media', 'No Record of Social Media Consent'].includes(row.social_media?.trim()) ? row.social_media.trim() : 'No Record of Social Media Consent',
        photo_url: val(row.photo_url),
        email: val(row.email),
        feeding_instructions: val(row.feeding_instructions),
        medication_notes: val(row.medication_notes),
        special_needs: val(row.special_needs),
        daily_picture: row.daily_picture?.trim() === 'true',
        notes: val(row.notes),
        is_checked_in: false
      };

      try {
        await base44.entities.Pet.create(petData);
        success++;
      } catch { failed++; }
    }
    return { success, failed };
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    setImportResult(null);

    const rows = parsedRows.length > 0 ? parsedRows : await parseCSVFile(importFile);
    if (!rows) {
      setImportResult({ error: 'File must have a header row, notes row, and at least one data row.' });
      setImporting(false);
      return;
    }

    const duplicateKeys = new Set(duplicates.map(d => `${d.row.name.toLowerCase()}|${d.row.owner_name.toLowerCase()}`));
    const nonDuplicates = rows.filter(r => !duplicateKeys.has(`${r.name.toLowerCase()}|${r.owner_name.toLowerCase()}`));

    const result = await importRows(nonDuplicates);

    if (duplicates.length > 0) {
      setImporting(false);
      setShowDuplicateDialog(true);
      setImportResult({ success: result.success, failed: result.failed, pending: duplicates.length });
    } else {
      setImportResult({ success: result.success, failed: result.failed });
      setImporting(false);
      setImportFile(null);
    }
  };

  const handleDeleteAccount = async () => {
    setIsDeleting(true);
    try {
      // Delete user account via auth API
      await base44.auth.deleteAccount?.();
      // Logout and redirect
      await base44.auth.logout(createPageUrl('Dashboard'));
    } catch (error) {
      console.error('Error deleting account:', error);
      setIsDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-stone-100 sticky top-0 z-40">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link to={createPageUrl('Dashboard')}>
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ChevronLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-800 flex items-center gap-2">
              <SettingsIcon className="w-6 h-6 text-[#82bb32]" />
              Settings
            </h1>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4">

        {/* Pet Import - Admin only */}
        {isSuperAdmin && (<Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-stone-800">
              <Upload className="w-4 h-4 text-[#82bb32]" />
              Import Pets from Spreadsheet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-stone-600">
              Download the CSV template, fill it in with pet data, then upload it to bulk-import pets.
            </p>
            <Button
              variant="outline"
              className="w-full rounded-xl border-[#82bb32]/40 text-[#82bb32] hover:bg-[#82bb32]/10"
              onClick={handleDownloadTemplate}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template CSV
            </Button>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".csv"
                id="csvUpload"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
              <label htmlFor="csvUpload" className="flex-1">
                <div className="border-2 border-dashed border-stone-200 rounded-xl p-3 text-center cursor-pointer hover:border-[#82bb32]/40 transition-colors">
                  <p className="text-sm text-stone-500">
                    {importFile ? importFile.name : 'Click to select filled CSV'}
                  </p>
                </div>
              </label>
              <Button
                onClick={handleImport}
                disabled={!importFile || importing}
                className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90 shrink-0"
              >
                {importing ? 'Importing...' : 'Import'}
              </Button>
            </div>
            {checkingDuplicates && (
              <p className="text-xs text-stone-500 animate-pulse">Checking for duplicates...</p>
            )}
            {duplicates.length > 0 && !checkingDuplicates && (
              <button
                onClick={() => setShowDuplicateDialog(true)}
                className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-amber-800 text-sm hover:bg-amber-100 transition-colors text-left"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span className="font-medium">{duplicates.length} potential duplicate{duplicates.length > 1 ? 's' : ''} detected — click to review</span>
              </button>
            )}
            {importResult && (
              <div className={`rounded-xl p-3 flex items-start gap-2 text-sm ${importResult.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {importResult.error
                  ? <><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{importResult.error}</>
                  : <><CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />{importResult.success} pet(s) imported successfully{importResult.failed > 0 ? `, ${importResult.failed} skipped (missing name or owner)` : ''}.</>
                }
              </div>
            )}
          </CardContent>
        </Card>)}

        <Card className="border-0 shadow-sm rounded-2xl border-red-200 bg-red-50">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-red-900">
              <Trash2 className="w-4 h-4" />
              Danger Zone
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-red-800">
              Delete your account and all associated data permanently.
            </p>
            <Button
              variant="destructive"
              className="w-full rounded-xl"
              onClick={() => setDeleteDialogOpen(true)}
            >
              Delete Account
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Duplicate Review Dialog */}
      <Dialog open={showDuplicateDialog} onOpenChange={setShowDuplicateDialog}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="w-5 h-5" />
              Potential Duplicates Found
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-stone-600">
            The following pets in your CSV already exist in the system. They will still be imported — review them here first if needed.
          </p>
          <ScrollArea className="max-h-64">
            <div className="space-y-2 pr-2">
              {duplicates.map((d, i) => (
                <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-semibold text-stone-800">{d.row.name}</p>
                  <p className="text-xs text-stone-500">Owner: {d.row.owner_name}</p>
                  {d.row.breed && <p className="text-xs text-stone-400">Breed: {d.row.breed}</p>}
                  <p className="text-xs text-amber-700 mt-1">⚠ A pet with this name and owner already exists</p>
                </div>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setShowDuplicateDialog(false)}>
              Skip Duplicates
            </Button>
            <Button className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90" onClick={async () => {
              setShowDuplicateDialog(false);
              setImporting(true);
              const dupRows = duplicates.map(d => d.row);
              const result = await importRows(dupRows);
              setImportResult(prev => ({
                success: (prev?.success || 0) + result.success,
                failed: (prev?.failed || 0) + result.failed
              }));
              setImporting(false);
              setImportFile(null);
              setDuplicates([]);
            }}>
              Import Duplicates Too
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Account?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. All your data will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex gap-3">
            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={isDeleting}
              className="bg-red-600 hover:bg-red-700 rounded-xl"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}