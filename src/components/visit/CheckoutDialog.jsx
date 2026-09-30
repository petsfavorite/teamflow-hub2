import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import moment from "moment";
import { buildVisitReportPdf } from '@/lib/visitReportPdf';
import { toast } from '@/components/ui/use-toast';
import { base44 } from '@/api/base44Client';

export default function CheckoutDialog({ pet, visit, open, onClose, onConfirm }) {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleCheckout = async () => {
        setIsGenerating(true);
        let stage = 'report';
        try {
            // Retry-safe: if a report for this visit was already saved (e.g. a previous
            // attempt failed while updating the pet/visit), reuse it instead of
            // generating, uploading and recording a duplicate.
            const existing = await base44.entities.Report.filter({ visit_id: visit.id });
            if (existing?.length > 0 && existing[0].report_url) {
                stage = 'update';
                await onConfirm(existing[0].report_url, existing[0].expiry_date);
                return;
            }

            const pdfBlob = buildVisitReportPdf(pet, visit);

            // Upload PDF - create a File object from the blob
            // Build filename: PetFirstName_OwnerLastName_Type_CheckoutDate
            const petFirstName = pet.name ? pet.name.trim().split(' ')[0] : 'Pet';
            const ownerLastName = pet.owner_name ? pet.owner_name.trim().split(' ').pop() : 'Owner';
            const serviceType = visit.visit_type === 'boarding' ? 'Boarding' : 'PlayCamp';
            const checkoutDate = moment().format('YYYY-MM-DD');
            
            const pdfFile = new File(
                [pdfBlob], 
                `${petFirstName}_${ownerLastName}_${serviceType}_${checkoutDate}.pdf`,
                { type: 'application/pdf' }
            );
            
            const { file_url } = await base44.integrations.Core.UploadFile({ file: pdfFile });

            // Set PDF expiry (90 days)
            const expiryDate = moment().add(90, 'days').toISOString();
            
            // Create report record
            await base44.entities.Report.create({
                pet_id: pet.id,
                pet_name: pet.name,
                visit_id: visit.id,
                visit_type: visit.visit_type,
                check_in_date: moment(visit.check_in_date).format('YYYY-MM-DD'),
                check_out_date: moment().format('YYYY-MM-DD'),
                report_url: file_url,
                expiry_date: expiryDate,
                owner_email: pet.email || '',
                email_sent: false
            });

            // Confirm checkout with PDF URL and expiry
            stage = 'update';
            await onConfirm(file_url, expiryDate);
        } catch (error) {
            console.error('Error during checkout:', error);
            toast({
                variant: 'destructive',
                title: stage === 'update' ? 'Checkout not finished' : 'Could not create the report',
                description: stage === 'update'
                    ? `${error?.message || 'Updating the pet or visit failed.'} The report is saved, so press Complete Checkout again to finish — no duplicate report will be created.`
                    : 'Please try again.'
            });
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <FileText className="w-5 h-5 text-amber-500" />
                        Check Out {pet.name}
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 py-4">
                    <div className="bg-blue-50 rounded-xl p-4 text-sm text-blue-700">
                        <p className="font-medium mb-1">📄 Visit Report</p>
                        <p className="text-xs">A detailed PDF report will be generated and saved for 90 days.</p>
                    </div>
                </div>

                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        onClick={onClose}
                        disabled={isGenerating}
                        className="flex-1 rounded-xl"
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleCheckout}
                        disabled={isGenerating}
                        className="flex-1 rounded-xl bg-amber-500 hover:bg-amber-600"
                    >
                        {isGenerating ? (
                            <>
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                Generating...
                            </>
                        ) : (
                            <>
                                <FileText className="w-4 h-4 mr-2" />
                                Complete Checkout
                            </>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}