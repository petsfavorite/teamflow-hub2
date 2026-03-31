import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Download, Search, Trash2, RefreshCw, FileText } from "lucide-react";
import { format } from 'date-fns';

export default function Reports() {
    const [searchQuery, setSearchQuery] = useState('');
    const queryClient = useQueryClient();

    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['reports'],
        queryFn: () => base44.entities.Report.list(),
    });

    const deleteReportMutation = useMutation({
        mutationFn: (reportId) => base44.entities.Report.delete(reportId),
        onSuccess: () => queryClient.invalidateQueries(['reports'])
    });

    const filteredReports = reports.filter(report =>
        report.pet_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        report.owner_email?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    const handleDownload = (report) => {
        if (report.report_url) {
            window.open(report.report_url, '_blank');
        }
    };

    const handleDelete = (reportId) => {
        if (confirm('Delete this report?')) {
            deleteReportMutation.mutate(reportId);
        }
    };

    return (
        <div className="space-y-6 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Reports</h1>
                    <p className="text-slate-500 mt-1">{filteredReports.length} report(s) available</p>
                </div>
            </div>

            {/* Search */}
            <div className="relative max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <Input
                    placeholder="Search by pet name or email..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10 rounded-xl border-stone-200 bg-white"
                    autoFocus
                />
            </div>

            {/* Reports List */}
            <div>
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                    </div>
                ) : filteredReports.length === 0 ? (
                    <div className="text-center py-20">
                        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mx-auto mb-4">
                            <FileText className="w-10 h-10 text-stone-300" />
                        </div>
                        <h3 className="text-lg font-semibold text-stone-700 mb-2">
                            {searchQuery ? 'No reports found' : 'No reports yet'}
                        </h3>
                        <p className="text-stone-500">
                            {searchQuery ? 'Try a different search term' : 'Reports will appear here after pets are checked out'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredReports.map((report) => (
                            <Card key={report.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex-1 min-w-0">
                                            <h3 className="font-semibold text-slate-900 truncate">{report.pet_name}</h3>
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-sm text-stone-500 mt-1">
                                                <span>{report.owner_email}</span>
                                                {report.visit_type && (
                                                    <>
                                                        <span className="hidden sm:inline">•</span>
                                                        <span className="capitalize">{report.visit_type}</span>
                                                    </>
                                                )}
                                                {report.check_in_date && (
                                                    <>
                                                        <span className="hidden sm:inline">•</span>
                                                        <span>{format(new Date(report.check_in_date), 'MMM d, yyyy')}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex gap-2 flex-shrink-0">
                                            <Button
                                                size="sm"
                                                onClick={() => handleDownload(report)}
                                                className="rounded-xl bg-emerald-500 hover:bg-emerald-600"
                                            >
                                                <Download className="w-4 h-4 mr-1" />
                                                <span className="hidden sm:inline">Download</span>
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleDelete(report.id)}
                                                className="rounded-xl text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
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
        </div>
    );
}