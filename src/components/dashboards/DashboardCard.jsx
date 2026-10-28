import React from "react";
import { ExternalLink, KeyRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const ROLE_LABELS = {
  user: "all staff",
  manager: "managers",
  admin: "admins",
  super_admin: "super admins",
};

export default function DashboardCard({ dashboard, canManage, onGrant }) {
  const access = dashboard.access || [];
  const visibleRoles = dashboard.visible_roles || [];
  const accessLabel = visibleRoles.length
    ? `Open to ${visibleRoles.map((r) => ROLE_LABELS[r] || r).join(", ")}`
    : access.length
    ? `${access.length} granted access`
    : "No one granted yet";

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-5 space-y-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-slate-900 truncate">{dashboard.name}</h3>
          {dashboard.description && <p className="text-sm text-slate-500 mt-1">{dashboard.description}</p>}
        </div>

        <a
          href={dashboard.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm font-medium text-[#82bb32] hover:underline"
        >
          Open dashboard <ExternalLink className="w-4 h-4" />
        </a>

        <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 min-w-0">
            <Users className="w-3.5 h-3.5 flex-shrink-0" />
            <span className="truncate">{accessLabel}</span>
          </div>
          {canManage && (
            <Button size="sm" variant="outline" onClick={() => onGrant(dashboard)}>
              <KeyRound className="w-4 h-4 mr-1.5" />
              Grant Access
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}