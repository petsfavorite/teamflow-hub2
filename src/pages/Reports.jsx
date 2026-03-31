import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FileText, Download, Trash2, RefreshCw } from "lucide-react";
import { format, parseISO } from 'date-fns';

export default function Reports() {
    const [isDeleting, setIsDeleting] = useState(false);
    const queryClient = useQueryClient();

    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['reports'],
        queryFn: () => base44.entities.Report.list('-created_date', 100)
    });

    const deleteReportMutation = useMutation({
        mutationFn: (reportId) => base44.entities.Report.delete(reportId),
        onSuccess: () => queryClient.invalidateQueries(['reports'])
    });

    const deleteAllMutation = useMutation({
        mutationFn: async () => {
            const allReports = await base44.entities.Report.list();
            for (const report of allReports) {
                await base44.entities.Report.delete(report.id);
            }
        },
        onSuccess: () => queryClient.invalidateQueries(['reports'])
    });

    const handleDeleteReport = (reportId) => {
        deleteReportMutation.mutate(reportId);
    };

    const handleDeleteAll = () => {
        if (window.confirm('Are you sure you want to delete all reports? This cannot be undone.')) {
            setIsDeleting(true);
            deleteAllMutation.mutate(undefined, {
                onSettled: () => setIsDeleting(false)
            });
        }
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Kennel Reports</h1>
                    <p className="text-slate-500 mt-1">{reports.length} reports available</p>
                </div>
                {reports.length > 0 && (
                    <Button
                        onClick={handleDeleteAll}
                        disabled={isDeleting || deleteAllMutation.isPending}
                        className="rounded-xl bg-red-500 hover:bg-red-600"
                    >
                        {isDeleting || deleteAllMutation.isPending ? (
                            <>
                                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                                Clearing...
                            </>
                        ) : (
                            <>
                                <Trash2 className="w-4 h-4 mr-2" />
                                Clear All
                            </>
                        )}
                    </Button>
                )}
            </div>

            {/* Reports List */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-8 h-8 text-[#82bb32] animate-spin" />
                </div>
            ) : reports.length === 0 ? (
                <Card className="border-0 shadow-sm">
                    <CardContent className="p-12 text-center">
                        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-8 h-8 text-slate-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-700 mb-2">No Reports</h3>
                        <p className="text-slate-500">All reports have been synced to Google Drive</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-4">
                    {reports.map((report) => (
                        <Card key={report.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <h3 className="font-semibold text-slate-900 truncate">{report.pet_name}</h3>
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            <span className="inline-block px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">
                                                {report.visit_type}
                                            </span>
                                            <span className="inline-block px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                                                {report.check_in_date} to {report.check_out_date}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-500 mt-2">
                                            Owner: {report.owner_email}
                                        </p>
                                        {report.expiry_date && (
                                            <p className="text-xs text-amber-600 mt-1">
                                                Expires: {format(parseISO(report.expiry_date), 'MMM d, yyyy')}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 flex-shrink-0">
                                        <a href={report.report_url} target="_blank" rel="noopener noreferrer">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                className="rounded-lg"
                                            >
                                                <Download className="w-4 h-4" />
                                            </Button>
                                        </a>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleDeleteReport(report.id)}
                                            disabled={deleteReportMutation.isPending}
                                            className="text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    );
}