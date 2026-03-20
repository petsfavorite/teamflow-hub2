import React, { useState, useEffect } from 'react';
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
import { Settings as SettingsIcon, Trash2, ChevronLeft, Download, Upload, CheckCircle2, AlertCircle, AlertTriangle, User, Timer } from "lucide-react";
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as XLSX from 'xlsx';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

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
  const [editProfileOpen, setEditProfileOpen] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profileTimezone, setProfileTimezone] = useState('America/New_York');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [globalTimezone, setGlobalTimezone] = useState('America/New_York');
  const [allUsers, setAllUsers] = useState([]);
  const [isSavingGlobalTimezone, setIsSavingGlobalTimezone] = useState(false);
  const [inactivityMinutes, setInactivityMinutes] = useState(5);
  const [isSavingTimeout, setIsSavingTimeout] = useState(false);
  const [appSettingsId, setAppSettingsId] = useState(null);

  const isSuperAdmin = user?.role === 'super_admin';

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setProfileName(u?.full_name || '');
      setProfileEmail(u?.email || '');
      setProfileTimezone(u?.timezone || 'America/New_York');
    }).catch(() => {});

    // Load all users if super_admin
    if (isSuperAdmin) {
      base44.entities.User.list().then(users => {
        setAllUsers(users);
      }).catch(() => {});
    }

    // Load inactivity timeout setting
    base44.entities.AppSettings.filter({ key: 'global' }).then(results => {
      if (results.length > 0) {
        setAppSettingsId(results[0].id);
        setInactivityMinutes(results[0].inactivity_timeout_minutes || 5);
      }
    }).catch(() => {});
  }, [isSuperAdmin]);

  const handleDownloadTemplate = () => {
    // Row 1: column headers
    const headers = [
      'name', 'species', 'breed', 'color', 'gender', 'group_play',
      'social_media', 'owner_name', 'email',
      'feeding_frequency', 'feeding_instructions', 'medication_notes',
      'special_needs', 'daily_picture', 'notes'
    ];
    // Row 2: human-readable guidance
    const guidance = [
      'Pet name (REQUIRED)',
      'Dog or Cat (REQUIRED, default: Dog)',
      'Breed (optional)',
      'Color/markings (REQUIRED)',
      'Male / Neutered Male / Female / Spayed Female (REQUIRED)',
      'Approved / Not Approved / Not Tested (default: Not Tested)',
      'Approved for Social Media / Not Approved for Social Media / No Record of Social Media Consent',
      'Owner full name (REQUIRED)',
      'Owner email (optional)',
      'Just Breakfast / Just Dinner / Two Meals (default: Two Meals)',
      'Feeding instructions (optional)',
      'General medication notes (optional)',
      'Special needs / health / behavioral notes (optional)',
      'true or false (default: false)',
      'Additional notes (optional)'
    ];
    // Row 3: example data
    const example = [
      'Buddy', 'Dog', 'Golden Retriever', 'Golden', 'Neutered Male',
      'Approved', 'Approved for Social Media', 'Jane Smith', 'jane@example.com',
      'Two Meals', 'Measure 1 cup kibble per meal', 'Give with food',
      'Anxious during thunderstorms', 'true', 'Loves belly rubs'
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([headers, guidance, example]);

    // Set column widths
    ws['!cols'] = headers.map(() => ({ wch: 28 }));

    // Style header row (bold) — basic cell metadata
    headers.forEach((_, ci) => {
      const cellRef = XLSX.utils.encode_cell({ r: 0, c: ci });
      if (!ws[cellRef]) return;
      ws[cellRef].s = { font: { bold: true } };
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Pets');
    XLSX.writeFile(wb, 'pet_import_template.xlsx');
  };

  const parseXLSXFile = async (file) => {
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(buffer, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

    // Row 0 = headers, Row 1 = guidance (skip), Row 2+ = data
    if (allRows.length < 3) return null;
    const headers = allRows[0].map(h => String(h).trim());
    const dataRows = allRows.slice(2);

    const rows = [];
    for (const values of dataRows) {
      const row = {};
      headers.forEach((h, i) => { row[h] = values[i] !== undefined ? String(values[i]).trim() : ''; });
      if (row.name && row.owner_name) rows.push(row);
    }
    return rows.length > 0 ? rows : null;
  };

  const handleFileChange = async (file) => {
    setImportFile(file);
    setImportResult(null);
    setDuplicates([]);
    setParsedRows([]);
    if (!file) return;

    setCheckingDuplicates(true);
    const rows = await parseXLSXFile(file);
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
        email: val(row.email),
        feeding_frequency: ['Just Breakfast', 'Just Dinner', 'Two Meals', 'Three Meals'].includes(row.feeding_frequency?.trim()) ? row.feeding_frequency.trim() : 'Two Meals',
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

    const rows = parsedRows.length > 0 ? parsedRows : await parseXLSXFile(importFile);
    if (!rows) {
      setImportResult({ error: 'File must have a header row, guidance row, and at least one data row.' });
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

  const handleSaveProfile = async () => {
    setIsSavingProfile(true);
    try {
      // Non-super_admin users can only edit their own timezone
      if (!isSuperAdmin) {
        await base44.auth.updateMe({
          full_name: profileName,
          email: profileEmail,
          timezone: profileTimezone
        });
        setUser(prev => ({ ...prev, full_name: profileName, email: profileEmail, timezone: profileTimezone }));
      }
      setEditProfileOpen(false);
    } catch (error) {
      console.error('Error saving profile:', error);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleSaveInactivityTimeout = async () => {
    setIsSavingTimeout(true);
    try {
      const mins = Math.max(1, Math.min(120, Number(inactivityMinutes)));
      if (appSettingsId) {
        await base44.entities.AppSettings.update(appSettingsId, { inactivity_timeout_minutes: mins });
      } else {
        const created = await base44.entities.AppSettings.create({ key: 'global', inactivity_timeout_minutes: mins });
        setAppSettingsId(created.id);
      }
      setInactivityMinutes(mins);
      alert(`Inactivity timeout set to ${mins} minute${mins !== 1 ? 's' : ''}`);
    } catch {
      alert('Failed to save timeout setting');
    } finally {
      setIsSavingTimeout(false);
    }
  };

  const handleSaveGlobalTimezone = async () => {
    setIsSavingGlobalTimezone(true);
    try {
      // Super_admin updates timezone for all users
      for (const u of allUsers) {
        await base44.asServiceRole.entities.User.update(u.id, {
          timezone: globalTimezone
        });
      }
      alert('Timezone updated for all users');
    } catch (error) {
      console.error('Error updating global timezone:', error);
    } finally {
      setIsSavingGlobalTimezone(false);
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

        {/* Profile Settings */}
        <Card className="border-0 shadow-sm rounded-2xl">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2 text-stone-800">
              <User className="w-4 h-4 text-[#82bb32]" />
              Profile Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {user && (
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-medium text-stone-700">Name</p>
                  <p className="text-sm text-stone-600">{user.full_name}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-700">Email</p>
                  <p className="text-sm text-stone-600">{user.email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-700">Timezone</p>
                  <p className="text-sm text-stone-600">{user.timezone || 'Not set'}</p>
                </div>
                <Button
                  variant="outline"
                  className="w-full rounded-xl border-[#82bb32]/40 text-[#82bb32] hover:bg-[#82bb32]/10"
                  onClick={() => setEditProfileOpen(true)}
                >
                  Edit Profile
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Inactivity Timeout - SuperAdmin only */}
        {isSuperAdmin && (
          <Card className="border-0 shadow-sm rounded-2xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2 text-stone-800">
                <Timer className="w-4 h-4 text-[#82bb32]" />
                PIN Lock — Inactivity Timeout
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-stone-600">
                After this many minutes of inactivity, users will be prompted to re-enter their 6-digit PIN. 
                If they don't unlock within 60 minutes, they must sign in with email & password again.
              </p>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={1}
                  max={120}
                  value={inactivityMinutes}
                  onChange={e => setInactivityMinutes(e.target.value)}
                  className="rounded-xl w-28 text-center font-mono text-lg"
                />
                <span className="text-sm text-stone-500">minutes</span>
                <Button
                  onClick={handleSaveInactivityTimeout}
                  disabled={isSavingTimeout}
                  className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90 ml-auto"
                >
                  {isSavingTimeout ? 'Saving…' : 'Save'}
                </Button>
              </div>
              <p className="text-xs text-stone-400">Min: 1 min · Max: 120 min · Current: {inactivityMinutes} min</p>
            </CardContent>
          </Card>
        )}

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
              Download the Excel template, fill it in with pet data, then upload it to bulk-import pets.
            </p>
            <Button
              variant="outline"
              className="w-full rounded-xl border-[#82bb32]/40 text-[#82bb32] hover:bg-[#82bb32]/10"
              onClick={handleDownloadTemplate}
            >
              <Download className="w-4 h-4 mr-2" />
              Download Template (.xlsx)
            </Button>
            <div className="flex items-center gap-3">
              <input
                type="file"
                accept=".xlsx,.xls"
                id="xlsxUpload"
                className="hidden"
                onChange={(e) => handleFileChange(e.target.files[0])}
              />
              <label htmlFor="xlsxUpload" className="flex-1">
                <div className="border-2 border-dashed border-stone-200 rounded-xl p-3 text-center cursor-pointer hover:border-[#82bb32]/40 transition-colors">
                  <p className="text-sm text-stone-500">
                    {importFile ? importFile.name : 'Click to select filled .xlsx file'}
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

      {/* Edit Profile Dialog */}
      <Dialog open={editProfileOpen} onOpenChange={setEditProfileOpen}>
        <DialogContent className="rounded-2xl max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                className="rounded-xl"
              />
            </div>
            {!isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="timezone">Timezone</Label>
                <Select value={profileTimezone} onValueChange={setProfileTimezone}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                    <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska (Anchorage)</SelectItem>
                    <SelectItem value="Pacific/Honolulu">Hawaii (Honolulu)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Paris</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {isSuperAdmin && (
              <div className="space-y-2">
                <Label htmlFor="global-timezone">Global Timezone (All Users)</Label>
                <Select value={globalTimezone} onValueChange={setGlobalTimezone}>
                  <SelectTrigger className="rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="America/New_York">Eastern (New York)</SelectItem>
                    <SelectItem value="America/Chicago">Central (Chicago)</SelectItem>
                    <SelectItem value="America/Denver">Mountain (Denver)</SelectItem>
                    <SelectItem value="America/Los_Angeles">Pacific (Los Angeles)</SelectItem>
                    <SelectItem value="America/Anchorage">Alaska (Anchorage)</SelectItem>
                    <SelectItem value="Pacific/Honolulu">Hawaii (Honolulu)</SelectItem>
                    <SelectItem value="UTC">UTC</SelectItem>
                    <SelectItem value="Europe/London">London</SelectItem>
                    <SelectItem value="Europe/Paris">Paris</SelectItem>
                    <SelectItem value="Asia/Tokyo">Tokyo</SelectItem>
                    <SelectItem value="Asia/Shanghai">Shanghai</SelectItem>
                    <SelectItem value="Australia/Sydney">Sydney</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="rounded-xl" onClick={() => setEditProfileOpen(false)}>
              Cancel
            </Button>
            {!isSuperAdmin && (
              <Button className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90" onClick={handleSaveProfile} disabled={isSavingProfile}>
                {isSavingProfile ? 'Saving...' : 'Save'}
              </Button>
            )}
            {isSuperAdmin && (
              <Button className="rounded-xl bg-[#82bb32] hover:bg-[#82bb32]/90" onClick={handleSaveGlobalTimezone} disabled={isSavingGlobalTimezone}>
                {isSavingGlobalTimezone ? 'Saving...' : 'Update All Users'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}