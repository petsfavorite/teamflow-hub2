import React, { useState } from 'react';
import PageHeader from '../components/shared/PageHeader';
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Rocket, ChevronDown, ChevronRight } from 'lucide-react';

const FEATURES = [
  {
    category: "SOP Enhancements",
    items: [
      { id: 1, label: "SOP Version Control", desc: "Version history, change log, 'last updated by', and ability to roll back to prior versions" },
      { id: 2, label: "Draft vs Published Workflow", desc: "Manager edits → saved as Draft → Admin approves → Published" },
      { id: 3, label: "Required SOP Acknowledgement", desc: "'Mark as Read' requirement with read confirmation tracking and manager dashboard showing who has/hasn't read" },
      { id: 4, label: "SOP Structure Templates", desc: "Required fields: Title, Purpose, When it applies, Required tools, Step-by-step instructions, Warnings, Who is responsible" },
      { id: 5, label: "SOP Tagging System", desc: "Tags like Cleaning, Medical, Boarding, Emergency, Customer Service for better search" },
      { id: 6, label: "Emergency SOP Mode", desc: "One-button 'Emergency' view showing quick SOPs: dog fight, animal collapse, fire evacuation, aggressive dog" },
      { id: 7, label: "AI Assisted SOP Creation", desc: "Manager pastes rough instructions → AI formats into a proper structured SOP" },
      { id: 8, label: "QR Code SOP Access", desc: "QR code on equipment/locations that opens the relevant SOP instantly when scanned" },
      { id: 9, label: "Location-Based SOPs", desc: "Tag SOPs by location (vet clinic, boarding, grooming, bar, dog park) — users see relevant SOPs only" },
    ]
  },
  {
    category: "Smart SOP Search (AI Layer)",
    items: [
      { id: 10, label: "Semantic AI Search", desc: "User types a situation in plain English and AI returns the most relevant SOPs (not just keyword matching)" },
      { id: 11, label: "Multi-SOP Results", desc: "AI returns multiple relevant SOPs ranked by relevance with links to exact sections" },
    ]
  },
  {
    category: "Checklists & Tasks",
    items: [
      { id: 12, label: "Recurring Checklists", desc: "Schedule checklists: Daily, Weekly, Monthly, Custom — assigned to user, role, or location" },
      { id: 13, label: "Checklist Accountability Tracking", desc: "Each item tracks: completed by, timestamp, notes, and optional photo upload" },
      { id: 14, label: "Task Assignments", desc: "Managers assign one-off tasks with: assigned to, due date, priority, notes" },
    ]
  },
  {
    category: "Maintenance & Assets",
    items: [
      { id: 15, label: "Photo Upload on Maintenance Requests", desc: "Staff can attach photos when submitting maintenance requests" },
      { id: 16, label: "Maintenance Status Workflow", desc: "Full status flow: Open → In Progress → Waiting → Completed with manager dashboard for open/overdue requests" },
      { id: 17, label: "Equipment & Asset Tracking", desc: "Track assets (kennel washer, dryers, exam tables, POS, etc.) with manuals, maintenance schedule, repair history" },
    ]
  },
  {
    category: "Incident Reports",
    items: [
      { id: 18, label: "Incident Report System", desc: "Staff can report: dog fights, injuries, client incidents, equipment failures — with location, time, staff/animals involved, photos" },
      { id: 19, label: "Incident Review & Close", desc: "Managers can review, add notes, and close incident reports" },
    ]
  },
  {
    category: "Notifications",
    items: [
      { id: 20, label: "In-App Notifications", desc: "Notify staff of: assigned checklists, new/updated SOPs, maintenance requests, overdue checklists" },
      { id: 21, label: "Email Notifications", desc: "Email alerts for key events like new SOP acknowledgement required, overdue items" },
      { id: 22, label: "Slack Integration (optional)", desc: "Push notifications to Slack channels for team alerts" },
    ]
  },
  {
    category: "Analytics Dashboard",
    items: [
      { id: 23, label: "Checklist Completion Rate", desc: "Visual dashboard showing completion rates, overdue tasks, and accountability metrics" },
      { id: 24, label: "SOP Acknowledgement Dashboard", desc: "Show which SOPs have unread acknowledgements and who hasn't read them" },
      { id: 25, label: "Maintenance Backlog View", desc: "Open and overdue maintenance requests at a glance" },
      { id: 26, label: "Incident Report Summary", desc: "Recent incidents, trends, and open/resolved counts" },
    ]
  },
  {
    category: "Mobile & Offline",
    items: [
      { id: 27, label: "Mobile-First Design Polish", desc: "Ensure checklist completion, SOP lookup, maintenance photos, and incident reports work great on phones" },
      { id: 28, label: "Offline Mode", desc: "Users can still view SOPs and complete checklists when WiFi is unavailable" },
    ]
  },
  {
    category: "Integrations",
    items: [
      { id: 29, label: "Google Drive Integration", desc: "Link and sync documents from Google Drive" },
      { id: 30, label: "Scheduling App Integration", desc: "Connect to scheduling tools (e.g. WhenIWork, Deputy)" },
      { id: 31, label: "VetRadar / EasyVet Links", desc: "Quick links or integrations with vet practice management software" },
    ]
  },
  {
    category: "Pet Health Monitoring",
    items: [
      { id: 32, label: "Overdue Tasks Alert", desc: "Alert on whiteboard/visit panel when scheduled tasks are overdue" },
      { id: 33, label: "Appetite Tracking", desc: "Alert when checked-in pet hasn't eaten or is showing lack of appetite" },
      { id: 34, label: "Urine Output Alert", desc: "Alert when checked-in pet hasn't urinated or is showing lack of urine output" },
      { id: 35, label: "Feces Output Alert", desc: "Alert when checked-in pet hasn't defecated or is showing lack of feces output" },
    ]
  },
];

export default function DevChecklist() {
  const [checked, setChecked] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('dev-checklist') || '{}');
    } catch { return {}; }
  });
  const [collapsed, setCollapsed] = useState({});

  const toggle = (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    localStorage.setItem('dev-checklist', JSON.stringify(next));
  };

  const toggleCategory = (cat) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }));
  };

  const totalItems = FEATURES.reduce((sum, f) => sum + f.items.length, 0);
  const doneItems = Object.values(checked).filter(Boolean).length;
  const pct = Math.round((doneItems / totalItems) * 100);

  return (
    <div>
      <PageHeader
        title="Development Checklist"
        description="Super Admin only — track feature build progress"
      />

      {/* Progress */}
      <Card className="border-0 shadow-sm mb-8 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5" />
              <span className="font-semibold">Build Progress</span>
            </div>
            <span className="text-2xl font-bold">{pct}%</span>
          </div>
          <div className="w-full bg-white/20 rounded-full h-3">
            <div
              className="bg-white rounded-full h-3 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-sm text-white/80 mt-2">{doneItems} of {totalItems} features completed</p>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {FEATURES.map(group => {
          const groupDone = group.items.filter(i => checked[i.id]).length;
          const isCollapsed = collapsed[group.category];
          return (
            <Card key={group.category} className="border-0 shadow-sm overflow-hidden">
              <button
                className="w-full flex items-center justify-between p-5 text-left hover:bg-slate-50 transition-colors"
                onClick={() => toggleCategory(group.category)}
              >
                <div className="flex items-center gap-3">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  <span className="font-semibold text-slate-900">{group.category}</span>
                </div>
                <Badge variant="outline" className={groupDone === group.items.length ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500'}>
                  {groupDone}/{group.items.length}
                </Badge>
              </button>

              {!isCollapsed && (
                <div className="border-t border-slate-100">
                  {group.items.map((item, idx) => (
                    <div
                      key={item.id}
                      className={`flex items-start gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50 transition-colors ${idx !== group.items.length - 1 ? 'border-b border-slate-50' : ''} ${checked[item.id] ? 'bg-emerald-50/50' : ''}`}
                      onClick={() => toggle(item.id)}
                    >
                      <Checkbox
                        checked={!!checked[item.id]}
                        onCheckedChange={() => toggle(item.id)}
                        className="mt-0.5 flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`font-medium text-sm ${checked[item.id] ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {item.label}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}