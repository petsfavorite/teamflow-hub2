import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Upload, Dog, User, Stethoscope, Utensils, Footprints, Pill, Cat } from "lucide-react";
import { base44 } from '@/api/base44Client';
import PhotoCropSelector from './PhotoCropSelector';

export default function PetForm({ pet, onSave, onCancel, onDelete, isLoading }) {
    const [formData, setFormData] = useState(pet || {
        name: '',
        species: 'Dog',
        breed: '',
        color: '',
        gender: 'Male',
        group_play: 'Not Tested',
        social_media: 'No Record of Social Media Consent',
        photo_url: '',
        owner_name: '',
        email: '',
        feeding_instructions: '',
        medication_notes: '',
        medications: [],
        special_needs: '',
        daily_picture: false,
        notes: ''
    });


    const [uploading, setUploading] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [errors, setErrors] = useState({});
    const [showCropSelector, setShowCropSelector] = useState(false);

    const handleChange = (field, value) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handlePhotoUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        setUploading(true);
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        handleChange('photo_url', file_url);
        setShowCropSelector(true);
        setUploading(false);
    };

    const handleCropConfirm = (cropData) => {
        handleChange('photo_url', cropData.photo_url);
        handleChange('crop_offset_y', cropData.crop_offset_y);
        handleChange('crop_zoom', cropData.crop_zoom || 1);
        setShowCropSelector(false);
    };



    const addMedication = () => {
        handleChange('medications', [
            ...formData.medications,
            { name: '', dosage: '', frequency: '', time: '', instructions: '' }
        ]);
    };

    const updateMedication = (index, field, value) => {
        const updated = [...formData.medications];
        updated[index] = { ...updated[index], [field]: value };
        handleChange('medications', updated);
    };

    const removeMedication = (index) => {
        handleChange('medications', formData.medications.filter((_, i) => i !== index));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const newErrors = {};
        if (!formData.name?.trim()) newErrors.name = true;
        if (!formData.color?.trim()) newErrors.color = true;
        if (!formData.gender) newErrors.gender = true;
        if (!formData.owner_name?.trim()) newErrors.owner_name = true;
        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }
        setErrors({});
        onSave(formData);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <Tabs defaultValue="basic" className="w-full">
                <TabsList className="grid grid-cols-4 bg-stone-100 rounded-xl p-1">
                    <TabsTrigger value="basic" className="rounded-lg data-[state=active]:bg-white">
                        <Dog className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Pet Info</span>
                    </TabsTrigger>
                    <TabsTrigger value="owner" className="rounded-lg data-[state=active]:bg-white">
                        <User className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Contacts</span>
                    </TabsTrigger>
                    <TabsTrigger value="care" className="rounded-lg data-[state=active]:bg-white">
                        <Utensils className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Care</span>
                    </TabsTrigger>
                    <TabsTrigger value="medical" className="rounded-lg data-[state=active]:bg-white">
                        <Pill className="w-4 h-4 mr-2" />
                        <span className="hidden sm:inline">Medical</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="mt-6">
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg">Pet Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {/* Photo Upload */}
                             {showCropSelector ? (
                                 <div className="space-y-4">
                                     <Label>Position Photo</Label>
                                     <PhotoCropSelector 
                                         photoUrl={formData.photo_url}
                                         onConfirm={handleCropConfirm}
                                         onCancel={() => {
                                             setShowCropSelector(false);
                                             handleChange('photo_url', '');
                                         }}
                                     />
                                 </div>
                             ) : (
                                 <div className="flex items-center gap-4">
                                     <div className="relative">
                                         {formData.photo_url ? (
                                             <img 
                                                 src={formData.photo_url} 
                                                 alt="Pet photo"
                                                 className="w-24 h-24 rounded-xl object-cover"
                                                 style={{
                                                     objectPosition: formData.crop_offset_y !== undefined 
                                                         ? `center ${-formData.crop_offset_y}px`
                                                         : 'center',
                                                     transform: formData.crop_zoom ? `scale(${formData.crop_zoom})` : 'scale(1)',
                                                     transformOrigin: 'center center'
                                                 }}
                                             />
                                         ) : (
                                             <div className="w-24 h-24 rounded-xl bg-stone-100 flex items-center justify-center">
                                                 {formData.species === 'Cat' ? (
                                                     <Cat className="w-10 h-10 text-stone-300" />
                                                 ) : (
                                                     <Dog className="w-10 h-10 text-stone-300" />
                                                 )}
                                             </div>
                                         )}
                                     </div>
                                     <div>
                                         <Label htmlFor="photo" className="cursor-pointer">
                                             <div className="flex items-center gap-2 px-4 py-2 bg-stone-100 rounded-xl hover:bg-stone-200 transition-colors">
                                                 <Upload className="w-4 h-4" />
                                                 <span>{uploading ? 'Uploading...' : 'Upload Photo'}</span>
                                             </div>
                                         </Label>
                                         <Input
                                             id="photo"
                                             type="file"
                                             accept="image/*"
                                             className="hidden"
                                             onChange={handlePhotoUpload}
                                         />
                                     </div>
                                 </div>
                             )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Pet Name *</Label>
                                    <Input
                                       value={formData.name}
                                       onChange={(e) => { handleChange('name', e.target.value); setErrors(p => ({ ...p, name: false })); }}
                                       placeholder="e.g., Max"
                                       className={`rounded-xl ${errors.name ? 'border-red-500' : ''}`}
                                    />
                                    {errors.name && <p className="text-xs text-red-500">Required</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Species *</Label>
                                    <Select value={formData.species} onValueChange={(v) => handleChange('species', v)}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Dog">Dog</SelectItem>
                                            <SelectItem value="Cat">Cat</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Breed</Label>
                                    <Input
                                        value={formData.breed}
                                        onChange={(e) => handleChange('breed', e.target.value)}
                                        placeholder="e.g., Golden Retriever"
                                        className="rounded-xl"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>Color *</Label>
                                    <Input
                                        value={formData.color}
                                        onChange={(e) => { handleChange('color', e.target.value); setErrors(p => ({ ...p, color: false })); }}
                                        placeholder="e.g., Golden"
                                        className={`rounded-xl ${errors.color ? 'border-red-500' : ''}`}
                                    />
                                    {errors.color && <p className="text-xs text-red-500">Required</p>}
                                </div>
                                <div className="space-y-2">
                                    <Label>Gender *</Label>
                                    <Select value={formData.gender} onValueChange={(v) => { handleChange('gender', v); setErrors(p => ({ ...p, gender: false })); }}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Male">Male</SelectItem>
                                            <SelectItem value="Neutered Male">Neutered Male</SelectItem>
                                            <SelectItem value="Female">Female</SelectItem>
                                            <SelectItem value="Spayed Female">Spayed Female</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Group Play</Label>
                                    <Select value={formData.group_play} onValueChange={(v) => handleChange('group_play', v)}>
                                        <SelectTrigger className="rounded-xl">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Approved">Approved</SelectItem>
                                            <SelectItem value="Not Approved">Not Approved</SelectItem>
                                            <SelectItem value="Not Tested">Not Tested</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label>Social Media</Label>
                                <Select value={formData.social_media} onValueChange={(v) => handleChange('social_media', v)}>
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Approved for Social Media">Approved for Social Media</SelectItem>
                                        <SelectItem value="Not Approved for Social Media">Not Approved for Social Media</SelectItem>
                                        <SelectItem value="No Record of Social Media Consent">No Record of Social Media Consent</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="owner" className="mt-6">
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg">Contact Information</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Owner Name *</Label>
                                <Input
                                    value={formData.owner_name}
                                    onChange={(e) => { handleChange('owner_name', e.target.value); setErrors(p => ({ ...p, owner_name: false })); }}
                                    placeholder="Full name"
                                    className={`rounded-xl ${errors.owner_name ? 'border-red-500' : ''}`}
                                />
                                {errors.owner_name && <p className="text-xs text-red-500">Required</p>}
                            </div>
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => handleChange('email', e.target.value)}
                                    placeholder="owner@example.com"
                                    className="rounded-xl"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Daily Picture</Label>
                                <Select 
                                    value={formData.daily_picture ? 'yes' : 'no'} 
                                    onValueChange={(v) => handleChange('daily_picture', v === 'yes')}
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="yes">Send daily picture</SelectItem>
                                        <SelectItem value="no">Don't send pictures</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="care" className="mt-6">
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg">Daily Care</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label>Feeding Frequency (for boarding)</Label>
                                <Select 
                                    value={formData.feeding_frequency || 'Two Meals'} 
                                    onValueChange={(v) => handleChange('feeding_frequency', v)}
                                >
                                    <SelectTrigger className="rounded-xl">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="Just Breakfast">Just Breakfast (9 AM)</SelectItem>
                                        <SelectItem value="Just Dinner">Just Dinner (6 PM)</SelectItem>
                                        <SelectItem value="Two Meals">Two Meals (9 AM & 6 PM)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="space-y-2">
                                <Label>Feeding Instructions</Label>
                                <Textarea
                                    value={formData.feeding_instructions}
                                    onChange={(e) => handleChange('feeding_instructions', e.target.value)}
                                    placeholder="Include food type, amount, and any special dietary requirements..."
                                    className="rounded-xl"
                                    rows={4}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="medical" className="mt-6">
                    <Card className="border-0 shadow-sm rounded-2xl mb-4">
                        <CardHeader>
                            <CardTitle className="text-lg">Medication Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <Textarea
                                value={formData.medication_notes}
                                onChange={(e) => handleChange('medication_notes', e.target.value)}
                                placeholder="General medication notes for this pet (e.g., must be given with food, watch for reactions)..."
                                className="rounded-xl"
                                rows={3}
                            />
                        </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm rounded-2xl">
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center justify-between">
                                <div>
                                    <span>Medications</span>
                                    <p className="text-xs font-normal text-stone-400 mt-0.5">Set up per visit during check-in</p>
                                </div>
                                <Button 
                                    type="button" 
                                    size="sm" 
                                    onClick={addMedication}
                                    className="rounded-xl bg-purple-500 hover:bg-purple-600"
                                >
                                    <Plus className="w-4 h-4 mr-1" />
                                    Add Medication
                                </Button>
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {formData.medications.length === 0 && (
                                <p className="text-center text-stone-400 py-8">
                                    No medications added. Click "Add Medication" if this pet requires any.
                                </p>
                            )}
                            
                            {formData.medications.map((med, index) => (
                                <div key={index} className="p-4 bg-purple-50 rounded-xl space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="font-medium text-purple-700">Medication {index + 1}</span>
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => removeMedication(index)}
                                            className="text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <Input
                                            placeholder="Medication name"
                                            value={med.name}
                                            onChange={(e) => updateMedication(index, 'name', e.target.value)}
                                            className="rounded-xl bg-white"
                                        />
                                        <Input
                                           placeholder="Dosage (e.g., 10mg)"
                                           value={med.dosage}
                                           onChange={(e) => updateMedication(index, 'dosage', e.target.value)}
                                           className="rounded-xl bg-white"
                                        />
                                        <Select
                                           value={med.frequency}
                                           onValueChange={(v) => updateMedication(index, 'frequency', v)}
                                        >
                                           <SelectTrigger className="rounded-xl bg-white">
                                               <SelectValue placeholder="Select frequency" />
                                           </SelectTrigger>
                                           <SelectContent>
                                               <SelectItem value="Once Daily in AM">Once Daily in AM (9 AM)</SelectItem>
                                               <SelectItem value="Once Daily in PM">Once Daily in PM (6 PM)</SelectItem>
                                               <SelectItem value="Twice Daily">Twice Daily (9 AM & 6 PM)</SelectItem>
                                               <SelectItem value="Custom">Custom (add to special instructions)</SelectItem>
                                           </SelectContent>
                                        </Select>
                                    </div>
                                    <Textarea
                                        placeholder="Special instructions for this medication..."
                                        value={med.instructions}
                                        onChange={(e) => updateMedication(index, 'instructions', e.target.value)}
                                        className="rounded-xl bg-white"
                                        rows={2}
                                    />
                                </div>
                            ))}

                            <div className="pt-4 border-t border-stone-100 space-y-2">
                                <Label>Special Needs & Conditions</Label>
                                <Textarea
                                    value={formData.special_needs}
                                    onChange={(e) => handleChange('special_needs', e.target.value)}
                                    placeholder="Any health conditions, allergies, anxiety issues, or special care requirements..."
                                    className="rounded-xl"
                                    rows={3}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label>Additional Notes</Label>
                                <Textarea
                                    value={formData.notes}
                                    onChange={(e) => handleChange('notes', e.target.value)}
                                    placeholder="Any other important information..."
                                    className="rounded-xl"
                                    rows={3}
                                />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            <div className="flex gap-3 pt-4">
                {pet?.id && onDelete && (
                    <Button 
                        type="button" 
                        variant="outline" 
                        onClick={() => setShowDeleteDialog(true)}
                        className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                    >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                    </Button>
                )}
                <Button 
                    type="button" 
                    variant="outline" 
                    onClick={onCancel}
                    className="flex-1 rounded-xl"
                >
                    Cancel
                </Button>
                <Button 
                    type="submit" 
                    disabled={isLoading}
                    className="flex-1 rounded-xl bg-emerald-500 hover:bg-emerald-600"
                >
                    {isLoading ? 'Saving...' : (pet?.id ? 'Update Pet' : 'Add Pet')}
                </Button>
            </div>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {pet?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This action cannot be undone. This will permanently delete the pet record and all associated visit history.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={() => {
                                setShowDeleteDialog(false);
                                onDelete(pet.id);
                            }}
                            className="rounded-xl bg-red-600 hover:bg-red-700"
                        >
                            Delete Pet
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </form>
    );
}