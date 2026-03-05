import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
    Dog, LayoutGrid, Users, LogIn, Settings, Menu, X,
    LayoutDashboard, BookOpen, CheckSquare, ClipboardList, Wrench,
    AlertTriangle, BarChart2, MessageSquare, Link as LinkIcon, Package, PawPrint
} from 'lucide-react';

const FLOOF_PAGES = ['Whiteboard', 'Pets', 'CheckIn', 'Reports', 'MonitorView', 'Settings'];

const floofNavItems = [
    { name: 'Whiteboard', icon: LayoutGrid, label: 'Whiteboard' },
    { name: 'Pets', icon: Users, label: 'Pets' },
    { name: 'CheckIn', icon: LogIn, label: 'Check In' },
    { name: 'Reports', icon: Dog, label: 'Reports' },
    { name: 'Settings', icon: Settings, label: 'Settings' }
];

const mainNavItems = [
    { name: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { name: 'SOPs', icon: BookOpen, label: 'SOP Library' },
    { name: 'Checklists', icon: CheckSquare, label: 'Checklists' },
    { name: 'Tasks', icon: ClipboardList, label: 'Tasks' },
    { name: 'Maintenance', icon: Wrench, label: 'Maintenance' },
    { name: 'IncidentReports', icon: AlertTriangle, label: 'Incidents' },
    { name: 'Assets', icon: Package, label: 'Assets' },
    { name: 'Analytics', icon: BarChart2, label: 'Analytics' },
    { name: 'SOPAssistant', icon: MessageSquare, label: 'SOP AI' },
    { name: 'ExternalLinks', icon: LinkIcon, label: 'Links' },
    { name: 'UserManagement', icon: Users, label: 'Settings' },
];

export default function Layout({ children }) {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);

    const isFloofPage = FLOOF_PAGES.some(p => location.pathname.toLowerCase().includes(p.toLowerCase()));
    const navItems = isFloofPage ? floofNavItems : mainNavItems;

    const isActive = (pageName) => location.pathname.toLowerCase().includes(pageName.toLowerCase());

    return (
        <div className="min-h-screen bg-stone-50 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Desktop Sidebar */}
            <nav className={`hidden md:flex flex-col bg-white border-r border-stone-200 p-4 gap-2 fixed h-screen transition-all duration-300 z-40 overflow-y-auto ${
                sidebarOpen ? 'w-64' : 'w-20'
            }`}>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="mb-6 p-2 hover:bg-stone-100 rounded-xl transition-colors"
                >
                    {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                {sidebarOpen && (
                    <div className="mb-6">
                        {isFloofPage ? (
                            <h1 className="text-2xl font-bold text-stone-800">FLOOF</h1>
                        ) : (
                            <h1 className="text-2xl font-bold text-stone-800">Pets Fav Team</h1>
                        )}
                    </div>
                )}
                {navItems.map((item) => (
                    <Link
                        key={item.name}
                        to={createPageUrl(item.name)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                            isActive(item.name)
                                ? 'text-[#82bb32] bg-[#82bb32]/10'
                                : 'text-stone-600 hover:text-stone-800 hover:bg-stone-50'
                        }`}
                        title={!sidebarOpen ? item.label : ''}
                    >
                        <item.icon className="w-5 h-5 flex-shrink-0" />
                        {sidebarOpen && <span className="font-medium">{item.label}</span>}
                    </Link>
                ))}

                {/* Floof entry point in main nav */}
                {!isFloofPage && sidebarOpen && (
                    <div className="mt-auto pt-4 border-t border-stone-100">
                        <Link
                            to={createPageUrl('Whiteboard')}
                            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-stone-600 hover:text-stone-800 hover:bg-stone-50"
                        >
                            <PawPrint className="w-5 h-5 flex-shrink-0" />
                            <span className="font-medium">Kennel Monitor</span>
                        </Link>
                    </div>
                )}
                {!isFloofPage && !sidebarOpen && (
                    <div className="mt-auto pt-4 border-t border-stone-100">
                        <Link
                            to={createPageUrl('Whiteboard')}
                            title="Kennel Monitor"
                            className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-stone-600 hover:text-stone-800 hover:bg-stone-50"
                        >
                            <PawPrint className="w-5 h-5 flex-shrink-0" />
                        </Link>
                    </div>
                )}
            </nav>

            {/* Main Content */}
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'} ${!isFloofPage ? 'p-6' : ''}`}>
                {children}
            </div>

            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-2 py-2 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="flex justify-around items-center overflow-x-auto">
                    {navItems.slice(0, 5).map((item) => (
                        <Link
                            key={item.name}
                            to={createPageUrl(item.name)}
                            className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl transition-colors flex-shrink-0 ${
                                isActive(item.name)
                                    ? 'text-[#82bb32] bg-[#82bb32]/10'
                                    : 'text-stone-500 hover:text-stone-700'
                            }`}
                        >
                            <item.icon className="w-5 h-5" />
                            <span className="text-xs font-medium">{item.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>

            {/* Add padding at bottom for mobile nav */}
            <div className="md:hidden h-20" />

            {/* Back to Main App Button — only shown on Floof pages */}
            {isFloofPage && (
                <Link
                    to={createPageUrl('Dashboard')}
                    className="fixed bottom-24 left-4 md:bottom-6 md:left-6 bg-stone-700 hover:bg-stone-800 text-white rounded-full px-4 py-3 shadow-lg transition-all flex items-center gap-2 z-50 text-sm font-medium"
                >
                    <X className="w-4 h-4" />
                    <span>Exit Kennel</span>
                </Link>
            )}
        </div>
    );
}