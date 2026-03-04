import React from 'react';
import { Badge } from "@/components/ui/badge";

const statusStyles = {
  draft: "bg-slate-100 text-slate-600",
  published: "bg-emerald-100 text-emerald-700",
  archived: "bg-gray-100 text-gray-500",
  active: "bg-emerald-100 text-emerald-700",
  inactive: "bg-gray-100 text-gray-500",
  submitted: "bg-blue-100 text-blue-700",
  in_progress: "bg-amber-100 text-amber-700",
  completed: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-600",
  edited: "bg-purple-100 text-purple-700",
  low: "bg-slate-100 text-slate-600",
  medium: "bg-yellow-100 text-yellow-700",
  high: "bg-orange-100 text-orange-700",
  urgent: "bg-red-100 text-red-700",
};

export default function StatusBadge({ status, className = "" }) {
  const style = statusStyles[status] || "bg-slate-100 text-slate-600";
  return (
    <Badge className={`${style} font-medium capitalize ${className}`}>
      {status?.replace(/_/g, ' ')}
    </Badge>
  );
}