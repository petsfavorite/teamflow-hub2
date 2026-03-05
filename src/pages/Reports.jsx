import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Download, Mail, Search, Calendar, RefreshCw, LayoutGrid, Users } from "lucide-react";
import moment from "moment";

export default function Reports() {
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState('date_desc');

    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['reports'],
        queryFn: () => base44.entities.Report.list('-created_date')
    });

    const { data: pets = [] } = useQuery({
        queryKey: ['pets'],
        queryFn: () => base44.entities.Pet.list()
    });

    // Filter reports
    const filteredReports = reports.filter(report => {
        const matchesSearch = report.pet_name.toLowerCase().includes(searchQuery.toLowerCase());
        const isNotExpired = moment(report.expiry_date).isAfter(moment());
        return matchesSearch && isNotExpired;
    });

    // Sort reports
    const sortedReports = [...filteredReports].sort((a, b) => {
        switch (sortBy) {
            case 'date_desc':
                return moment(b.check_out_date).diff(moment(a.check_out_date));
            case 'date_asc':
                return moment(a.check_out_date).diff(moment(b.check_out_date));
            case 'pet_name':
                return a.pet_name.localeCompare(b.pet_name);
            default:
                return 0;
        }
    });

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
            {/* Header */}
            <div className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-teal-600">FLOOF</h1>
                            <p className="text-xs text-gray-500 mt-0.5">Facility Log Of Occupancy & Fun</p>
                            <p className="text-lg font-semibold text-gray-800 mt-2">Visit Reports</p>
                            <p className="text-sm text-gray-500">
                                {sortedReports.length} reports available
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Link to={createPageUrl('Whiteboard')}>
                                <Button variant="outline" className="rounded-xl border-gray-200">
                                    <LayoutGrid className="w-4 h-4 mr-2" />
                                    Whiteboard
                                </Button>
                            </Link>
                            <Link to={createPageUrl('Pets')}>
                                <Button variant="outline" className="rounded-xl border-gray-200">
                                    <Users className="w-4 h-4 mr-2" />
                                    All Pets
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
                {/* Filters */}
                <Card className="mb-6">
                    <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row gap-4">
                            <div className="flex-1 relative">
                                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <Input
                                    placeholder="Search by pet name..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="pl-10 rounded-xl"
                                />
                            </div>
                            <Select value={sortBy} onValueChange={setSortBy}>
                                <SelectTrigger className="w-full md:w-48 rounded-xl">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="date_desc">Newest First</SelectItem>
                                    <SelectItem value="date_asc">Oldest First</SelectItem>
                                    <SelectItem value="pet_name">Pet Name (A-Z)</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Reports Grid */}
                {isLoading ? (
                    <div className="flex items-center justify-center py-20">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
                    </div>
                ) : sortedReports.length === 0 ? (
                    <Card>
                        <CardContent className="py-12 text-center">
                            <FileText className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                            <p className="text-gray-500">No reports found</p>
                        </CardContent>
                    </Card>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                        {sortedReports.map((report) => {
                            const pet = pets.find(p => p.id === report.pet_id);
                            const daysUntilExpiry = moment(report.expiry_date).diff(moment(), 'days');
                            
                            return (
                                <Card key={report.id} className="hover:shadow-lg transition-shadow">
                                    <CardHeader>
                                        <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                                {pet?.photo_url ? (
                                                    <img 
                                                        src={pet.photo_url} 
                                                        alt={report.pet_name}
                                                        className="w-12 h-12 rounded-lg object-cover"
                                                    />
                                                ) : (
                                                    <div className="w-12 h-12 rounded-lg bg-blue-100 flex items-center justify-center">
                                                        <FileText className="w-6 h-6 text-blue-600" />
                                                    </div>
                                                )}
                                                <div>
                                                    <CardTitle className="text-lg">{report.pet_name}</CardTitle>
                                                    <p className="text-xs text-gray-500 capitalize">
                                                        {report.visit_type === 'boarding' ? 'Boarding' : 'Play Camp'}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        <div className="text-sm space-y-1">
                                            <div className="flex items-center gap-2 text-gray-600">
                                                <Calendar className="w-4 h-4" />
                                                <span>
                                                    {moment(report.check_in_date).format('MMM D')} - {moment(report.check_out_date).format('MMM D, YYYY')}
                                                </span>
                                            </div>
                                            {report.email_sent && (
                                                <div className="flex items-center gap-2 text-emerald-600">
                                                    <Mail className="w-4 h-4" />
                                                    <span className="text-xs">Email sent</span>
                                                </div>
                                            )}
                                        </div>

                                        <div className="text-xs text-gray-500">
                                            Expires in {daysUntilExpiry} days
                                        </div>

                                        <Button
                                            className="w-full rounded-xl bg-blue-500 hover:bg-blue-600"
                                            onClick={() => window.open(report.report_url, '_blank')}
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Download Report
                                        </Button>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}