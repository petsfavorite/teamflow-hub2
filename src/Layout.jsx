import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Dog, LayoutGrid, Users, LogIn, Settings, Menu, X } from 'lucide-react';

export default function Layout({ children }) {
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(true);
    
    const navItems = [
        { name: 'Whiteboard', icon: LayoutGrid, label: 'Whiteboard' },
        { name: 'Pets', icon: Users, label: 'Pets' },
        { name: 'CheckIn', icon: LogIn, label: 'Check In' },
        { name: 'Reports', icon: Dog, label: 'Reports' },
        { name: 'Settings', icon: Settings, label: 'Settings' }
    ];

    const isActive = (pageName) => {
        return location.pathname.includes(pageName);
    };

    return (
        <div className="min-h-screen bg-stone-50 flex" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
            {/* Desktop Sidebar */}
            <nav className={`hidden md:flex flex-col bg-white border-r border-stone-200 p-4 gap-2 fixed h-screen transition-all duration-300 z-40 ${
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
                        <h1 className="text-2xl font-bold text-stone-800">FLOOF</h1>
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
            </nav>

            {/* Main Content */}
            <div className={`flex-1 transition-all duration-300 ${sidebarOpen ? 'md:ml-64' : 'md:ml-20'}`}>
                {children}
            </div>
            
            {/* Mobile Bottom Nav */}
            <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-stone-200 px-4 py-2 z-50" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="flex justify-around items-center">
                    {navItems.map((item) => (
                        <Link
                            key={item.name}
                            to={createPageUrl(item.name)}
                            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-colors ${
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
        </div>
    );
}