import React, { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useCurrentUser } from "@/components/hooks/useCurrentUser";
import PageHeader from "@/components/shared/PageHeader";
import EmptyState from "@/components/shared/EmptyState";
import DashboardCard from "@/components/dashboards/DashboardCard";
import GrantAccessDialog from "@/components/dashboards/GrantAccessDialog";
import { LineChart } from "lucide-react";

export default function Dashboards() {
  const { user, loading } = useCurrentUser();
  const queryClient = useQueryClient();
  const [grantTarget, setGrantTarget] = useState(null);

  const { data: dashboards = [], isLoading } = useQuery({
    queryKey: ["dashboards"],
    queryFn: async () => {
      const page = await base44.entities.Dashboard.list({ sort: "order", limit: 100 });
      return page.items;
    },
  });

  // Admin / Super Admin see every dashboard; everyone else sees what they were granted
  // or whatever is opened up to their role.
  const canManage = user?.role === "admin" || user?.role === "super_admin";
  const visible = canManage
    ? dashboards
    : dashboards.filter(
        (d) =>
          (d.access || []).some((a) => a.email === user?.email) ||
          (d.visible_roles || []).includes(user?.role)
      );

  if (loading || isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <PageHeader
        title="Dashboards"
        description="Practice dashboards and reporting spreadsheets. Access is granted by an admin."
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No dashboards available"
          description={
            canManage
              ? "Dashboards added here will be listed for admins and for any user granted access."
              : "You don't have access to any dashboards yet. Ask an admin to grant you access."
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {visible.map((dashboard) => (
            <DashboardCard
              key={dashboard.id}
              dashboard={dashboard}
              canManage={canManage}
              onGrant={setGrantTarget}
            />
          ))}
        </div>
      )}

      {grantTarget && (
        <GrantAccessDialog
          dashboard={grantTarget}
          open={!!grantTarget}
          onClose={() => setGrantTarget(null)}
          onGranted={() => {
            queryClient.invalidateQueries({ queryKey: ["dashboards"] });
            setGrantTarget(null);
          }}
        />
      )}
    </div>
  );
}