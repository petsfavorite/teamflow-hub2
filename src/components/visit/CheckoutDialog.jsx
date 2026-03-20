import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import moment from "moment";
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import VisitReportPDF from './VisitReportPDF';
import { base44 } from '@/api/base44Client';

export default function CheckoutDialog({ pet, visit, open, onClose, onConfirm }) {
    const [isGenerating, setIsGenerating] = useState(false);

    const handleCheckout = async () => {
        setIsGenerating(true);
        try {
            // Create a temporary container to render the PDF
            const container = document.createElement('div');
            container.style.position = 'absolute';
            container.style.left = '-9999px';
            document.body.appendChild(container);

            // Render the PDF component
            const root = document.createElement('div');
            container.appendChild(root);
            
            const reportElement = document.createElement('div');
            reportElement.innerHTML = generateReportHTML(pet, visit);
            root.appendChild(reportElement);

            // Wait for images to load
            await new Promise(resolve => setTimeout(resolve, 500));

            // Generate canvas from HTML
            const canvas = await html2canvas(reportElement, {
                scale: 2,
                useCORS: true,
                logging: false
            });

            // Create PDF with multi-page support
            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgHeightMm = (canvas.height * pdfWidth) / canvas.width;
            
            let yOffset = 0;
            let remainingHeight = imgHeightMm;
            let pageNum = 0;
            
            while (remainingHeight > 0) {
                if (pageNum > 0) pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, -yOffset, pdfWidth, imgHeightMm);
                yOffset += pdfHeight;
                remainingHeight -= pdfHeight;
                pageNum++;
            }
            
            const pdfBlob = pdf.output('blob');

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

            // Clean up
            document.body.removeChild(container);

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
            await onConfirm(file_url, expiryDate);
        } catch (error) {
            console.error('Error generating PDF:', error);
            alert('Error generating report. Please try again.');
        } finally {
            setIsGenerating(false);
        }
    };

    const generateReportHTML = (pet, visit) => {
        const duration = moment().diff(moment(visit.check_in_time), 'hours', true);
        
        return `
            <div style="font-family: Arial, sans-serif; background: white; padding: 32px; max-width: 800px;">
                <div style="text-align: center; border-bottom: 2px solid #f59e0b; padding-bottom: 24px; margin-bottom: 24px;">
                    <h1 style="font-size: 28px; font-weight: bold; color: #1c1917; margin: 0;">🐕 Pet's Favorite Vet Doggie Daycare</h1>
                    <p style="color: #78716c; margin-top: 8px;">Visit Report</p>
                </div>

                <div style="margin-bottom: 24px;">
                    <h2 style="font-size: 24px; font-weight: bold; color: #1c1917;">${pet.name}</h2>
                    <p style="color: #57534e;">${pet.breed} • ${pet.gender}</p>
                    <p style="color: #78716c; margin-top: 8px;">Owner: ${pet.owner_name}</p>
                </div>

                <div style="background: #fafaf9; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
                    <h3 style="font-weight: bold; color: #44403c; margin-bottom: 12px;">Visit Details</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; font-size: 14px;">
                        <div><span style="color: #78716c;">Check In:</span> <strong>${moment(visit.check_in_time).format('MMM D, YYYY h:mm A')}</strong></div>
                        <div><span style="color: #78716c;">Check Out:</span> <strong>${moment().format('MMM D, YYYY h:mm A')}</strong></div>
                        <div><span style="color: #78716c;">Duration:</span> <strong>${duration.toFixed(1)} hours</strong></div>
                        <div><span style="color: #78716c;">Type:</span> <strong>${visit.visit_type === 'boarding' ? 'Boarding' : 'Play Camp'}</strong></div>
                    </div>
                </div>

                ${visit.scheduled_tasks?.length > 0 ? `
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-weight: bold; color: #44403c; margin-bottom: 12px;">Completed Tasks</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e7e5e4; border-radius: 8px;">
                            <thead style="background: #fafaf9;">
                                <tr>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Time</th>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Task</th>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${visit.scheduled_tasks.filter(t => t.completed).map(task => `
                                    <tr style="border-top: 1px solid #f5f5f4;">
                                        <td style="padding: 8px; color: #78716c;">${task.time}</td>
                                        <td style="padding: 8px; font-weight: 500;">${task.type === 'Medication' ? task.medication_name : task.type}</td>
                                        <td style="padding: 8px;">✅ ${task.completed_at} (${task.completed_by})</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

                ${visit.care_log?.length > 0 ? `
                    <div style="margin-bottom: 24px;">
                        <h3 style="font-weight: bold; color: #44403c; margin-bottom: 12px;">Activity Log</h3>
                        <table style="width: 100%; border-collapse: collapse; font-size: 14px; border: 1px solid #e7e5e4; border-radius: 8px;">
                            <thead style="background: #fafaf9;">
                                <tr>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Time</th>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Activity</th>
                                    <th style="padding: 8px; text-align: left; color: #78716c;">Notes</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${visit.care_log.map(log => `
                                    <tr style="border-top: 1px solid #f5f5f4;">
                                        <td style="padding: 8px; color: #78716c;">${log.time}</td>
                                        <td style="padding: 8px; font-weight: 500;">${log.activity}</td>
                                        <td style="padding: 8px; color: #57534e;">${log.notes || '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                ` : ''}

            </div>
        `;
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