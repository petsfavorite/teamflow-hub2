import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import {
    Dog, LayoutGrid, Users, LogIn, Settings, Menu, X,
    LayoutDashboard, BookOpen, CheckSquare, ClipboardList, Wrench,
    AlertTriangle, BarChart2, MessageSquare, Link as LinkIcon, Package, PawPrint,
    ChevronDown, ChevronRight, ShieldCheck, History, Upload, Phone, FileSpreadsheet, FileText
} from 'lucide-react';
import { useCurrentUser } from './components/hooks/useCurrentUser';

const FLOOF_PAGES = ['Whiteboard', 'Pets', 'CheckIn', 'MonitorView', 'Reports'];

const floofNavItems = [
    { name: 'Whiteboard', icon: LayoutGrid, label: 'Whiteboard' },
    { name: 'Pets', icon: PawPrint, label: 'Pets' },
    { name: 'CheckIn', icon: LogIn, label: 'Check In' },
    { name: 'Reports', icon: FileText, label: 'Reports' },
];

const mainNavItems = [
    { name: 'Dashboard', icon: LayoutDashboard, label: 'Dashboard' },
    { name: 'Whiteboard', icon: PawPrint, label: 'Floof' },
    { name: 'CallDashboard', icon: Phone, label: 'Call Dashboard', requiredRole: 'admin' },
    { name: 'SOPs', icon: BookOpen, label: 'SOP Library' },
    { name: 'Checklists', icon: CheckSquare, label: 'Checklists' },
    { name: 'Tasks', icon: ClipboardList, label: 'Tasks' },
    { name: 'Maintenance', icon: Wrench, label: 'Maintenance', hiddenRole: 'general_account' },
    { name: 'IncidentReports', icon: AlertTriangle, label: 'Incidents' },
    { name: 'Assets', icon: Package, label: 'Assets' },
    { name: 'SOPAssistant', icon: MessageSquare, label: 'SOP AI' },
    { name: 'ExternalLinks', icon: LinkIcon, label: 'Links' },
    { name: 'Settings', icon: Settings, label: 'Settings' },
];

const adminNavItems = [
    { name: 'UserManagement', icon: Users, label: 'Users' },
    { name: 'SOPsUnderConstruction', icon: BookOpen, label: 'SOPs Under Construction' },
    { name: 'ChecklistHistory', icon: History, label: 'Checklist History' },
    { name: 'Analytics', icon: BarChart2, label: 'Analytics' },
    { name: 'FetchCallData', icon: FileSpreadsheet, label: 'Fetch Call Data' },
    { name: 'DevChecklist', icon: ClipboardList, label: 'Dev Checklist', superAdminOnly: true },
];

const ADMIN_ROLES = ['admin', 'manager', 'super_admin'];

export default function Layout({ children }) {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [adminOpen, setAdminOpen] = useState(false);
    const { user } = useCurrentUser();

    const getActivePageName = () => {
      const pathname = location.pathname.toLowerCase();
      return FLOOF_PAGES.find(p => {
        const pagePattern = new RegExp(`/(${p.toLowerCase()})(/|$)`);
        return pagePattern.test(pathname);
      }) || null;
    };
    
    const isFloofPage = getActivePageName() !== null;
    const navItems = isFloofPage ? floofNavItems : mainNavItems;

    const isActive = (pageName) => location.pathname.toLowerCase().includes(pageName.toLowerCase());
    const canSeeAdmin = user && ADMIN_ROLES.includes(user.role);

    // Auto-open admin dropdown if we're on an admin page
    const isOnAdminPage = adminNavItems.some(i => isActive(i.name));

    return (
        <div className="min-h-screen bg-stone-50 flex flex-col md:flex-row" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Sidebar - Desktop fixed, Mobile floating overlay */}
            <nav className={`hidden sm:flex flex-col bg-white border-r border-stone-200 p-3 md:p-4 gap-1 fixed h-screen transition-all duration-300 z-40 overflow-y-auto ${
                sidebarOpen ? 'w-64' : 'w-20'
            }`}>
                <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="mb-6 p-2 hover:bg-stone-100 rounded-xl transition-colors flex-shrink-0"
                >
                    {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
                </button>
                {sidebarOpen && (
                    <div className="mb-4">
                        {isFloofPage ? (
                            <h1 className="text-2xl font-bold text-stone-800">FLOOF</h1>
                        ) : (
                            <h1 className="text-2xl font-bold text-stone-800">Pets Fav Team</h1>
                        )}
                    </div>
                )}

                {navItems.map((item) => {
                    if (item.hiddenRole && user?.role === item.hiddenRole) return null;
                    return (
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
                    );
                })}

                {/* Pet Import — Floof nav, super_admin only */}
                {isFloofPage && user?.role === 'super_admin' && (
                    <Link
                        to={createPageUrl('Settings')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                            isActive('Settings')
                                ? 'text-[#82bb32] bg-[#82bb32]/10'
                                : 'text-stone-600 hover:text-stone-800 hover:bg-stone-50'
                        }`}
                        title={!sidebarOpen ? 'Pet Import' : ''}
                    >
                        <Upload className="w-5 h-5 flex-shrink-0" />
                        {sidebarOpen && <span className="font-medium">Pet Import</span>}
                    </Link>
                )}

                {/* Administration dropdown — main nav only, privileged roles */}
                {!isFloofPage && canSeeAdmin && (
                    <div className="mt-2">
                        {sidebarOpen ? (
                            <>
                                <button
                                    onClick={() => setAdminOpen(!adminOpen)}
                                    className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors ${
                                        isOnAdminPage ? 'text-[#82bb32] bg-[#82bb32]/10' : 'text-stone-600 hover:text-stone-800 hover:bg-stone-50'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="w-5 h-5 flex-shrink-0" />
                                        <span className="font-medium">Administration</span>
                                    </div>
                                    {(adminOpen || isOnAdminPage) ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                {(adminOpen || isOnAdminPage) && (
                                    <div className="ml-4 mt-1 flex flex-col gap-1 border-l-2 border-stone-100 pl-3">
                                        {adminNavItems.filter(item => !item.superAdminOnly || user?.role === 'super_admin').map((item) => (
                                            <Link
                                                key={item.name}
                                                to={createPageUrl(item.name)}
                                                className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
                                                    isActive(item.name)
                                                        ? 'text-[#82bb32] bg-[#82bb32]/10'
                                                        : 'text-stone-600 hover:text-stone-800 hover:bg-stone-50'
                                                }`}
                                            >
                                                <item.icon className="w-4 h-4 flex-shrink-0" />
                                                <span className="text-sm font-medium">{item.label}</span>
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            // Collapsed: show icon only for admin items
                            adminNavItems.filter(item => !item.superAdminOnly || user?.role === 'super_admin').map((item) => (
                                <Link
                                    key={item.name}
                                    to={createPageUrl(item.name)}
                                    title={item.label}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${
                                        isActive(item.name)
                                            ? 'text-[#82bb32] bg-[#82bb32]/10'
                                            : 'text-stone-600 hover:text-stone-800 hover:bg-stone-50'
                                    }`}
                                >
                                    <item.icon className="w-5 h-5 flex-shrink-0" />
                                </Link>
                            ))
                        )}
                    </div>
                )}
            </nav>

            {/* Main Content */}
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'sm:ml-64 md:ml-64' : 'sm:ml-20 md:ml-20'} ${!isFloofPage ? 'p-4 md:p-6' : ''} pb-8`}>
                {children}
            </div>

            {/* Mobile Floating Hamburger - only on phone, hidden on tablet+ */}
            <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="sm:hidden fixed top-4 left-4 z-[60] bg-white border border-stone-200 rounded-lg p-2 shadow-md hover:shadow-lg transition-all"
                aria-label="Toggle menu"
            >
                {sidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>

            {/* Mobile Sidebar Overlay - appears above content */}
            {sidebarOpen && (
                <div
                    className="sm:hidden fixed inset-0 bg-black/50 z-[35]"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

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

            {/* Privacy Banner */}
            <div className="fixed bottom-0 left-0 right-0 z-[100] bg-stone-800 text-stone-200 text-center text-xs py-1.5 px-4" style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}>
              All information in this app is private and proprietary. Viewing and sharing with unauthorized persons or groups is prohibited.
            </div>

            {/* Back to Main App Button — only shown on Floof pages */}
            {isFloofPage && (
                <Link
                    to={createPageUrl('Dashboard')}
                    className="fixed bottom-20 sm:bottom-24 left-2 sm:left-4 md:bottom-6 md:left-6 bg-stone-700 hover:bg-stone-800 text-white rounded-full px-3 sm:px-4 py-2 sm:py-3 shadow-lg transition-all flex items-center gap-1 sm:gap-2 z-50 text-xs sm:text-sm font-medium"
                >
                    <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    <span className="hidden sm:inline">Exit Kennel</span>
                </Link>
            )}
        </div>
    );
}