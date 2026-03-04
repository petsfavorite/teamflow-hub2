import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useCurrentUser } from './components/hooks/useCurrentUser';
import {
  BookOpen, CheckSquare, Wrench, ExternalLink, MessageSquare,
  LayoutDashboard, Users, ChevronLeft, ChevronRight, Menu, X, LogOut,
  ClipboardList, AlertTriangle, Boxes, Zap, BarChart2, Rocket
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { base44 } from '@/api/base44Client';
import RoleBadge from './components/shared/RoleBadge';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: '🚨 Emergency SOPs', icon: Zap, page: 'EmergencySOPs', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'SOPs', icon: BookOpen, page: 'SOPs', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Checklists', icon: CheckSquare, page: 'Checklists', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Checklist History', icon: CheckSquare, page: 'ChecklistHistory', roles: ['admin', 'manager', 'super_admin'] },
  { label: 'Tasks', icon: ClipboardList, page: 'Tasks', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Maintenance', icon: Wrench, page: 'Maintenance', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Incidents', icon: AlertTriangle, page: 'IncidentReports', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Assets', icon: Boxes, page: 'Assets', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Analytics', icon: BarChart2, page: 'Analytics', roles: ['admin', 'manager', 'super_admin'] },
  { label: 'App Links', icon: ExternalLink, page: 'ExternalLinks', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'SOP Assistant', icon: MessageSquare, page: 'SOPAssistant', roles: ['admin', 'manager', 'user', 'super_admin'] },
  { label: 'Users', icon: Users, page: 'UserManagement', roles: ['admin', 'manager', 'super_admin'] },
  { label: 'Dev Checklist', icon: Rocket, page: 'DevChecklist', roles: ['super_admin'] },
];

export default function Layout({ children, currentPageName }) {
  const { user, loading } = useCurrentUser();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const role = user?.role || 'user';
  const filteredNav = navItems.filter(item => item.roles.includes(role));

  const Sidebar = ({ mobile = false }) => (
    <div className={`flex flex-col h-full bg-slate-900 text-white ${mobile ? 'w-72' : collapsed ? 'w-[72px]' : 'w-64'} transition-all duration-300`}>
      <div className={`flex items-center ${collapsed && !mobile ? 'justify-center' : 'justify-between'} p-4 border-b border-slate-800`}>
        {(!collapsed || mobile) && (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">Pet's Fav Team</span>
          </div>
        )}
        {!mobile && (
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 rounded-lg hover:bg-slate-800 transition-colors">
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {mobile && (
          <button onClick={() => setMobileOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {filteredNav.map((item) => {
          const isActive = currentPageName === item.page;
          return (
            <Link
              key={item.page}
              to={createPageUrl(item.page)}
              onClick={() => mobile && setMobileOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              } ${collapsed && !mobile ? 'justify-center' : ''}`}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {(!collapsed || mobile) && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className={`p-4 border-t border-slate-800 ${collapsed && !mobile ? 'flex justify-center' : ''}`}>
        {(!collapsed || mobile) ? (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-indigo-600/30 flex items-center justify-center text-sm font-bold text-indigo-300">
                {user?.full_name?.charAt(0) || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user?.full_name || 'User'}</p>
                <RoleBadge role={role} />
              </div>
            </div>
            <button
              onClick={() => base44.auth.logout()}
              className="flex items-center gap-2 text-slate-400 hover:text-white text-sm w-full px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        ) : (
          <button onClick={() => base44.auth.logout()} className="p-2 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white">
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Desktop Sidebar */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 h-full">
            <Sidebar mobile />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
          <button onClick={() => setMobileOpen(true)} className="p-2 rounded-lg hover:bg-slate-100">
            <Menu className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600 flex items-center justify-center">
              <BookOpen className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-slate-900">Pet's Fav Team</span>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}