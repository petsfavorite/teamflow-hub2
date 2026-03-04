import React from 'react';
import { Badge } from "@/components/ui/badge";
import { Shield, ShieldCheck, User } from "lucide-react";

const roleConfig = {
  super_admin: { label: "Super Admin", icon: ShieldCheck, className: "bg-purple-100 text-purple-700 border-purple-200" },
  admin: { label: "Admin", icon: ShieldCheck, className: "bg-indigo-100 text-indigo-700 border-indigo-200" },
  manager: { label: "Manager", icon: Shield, className: "bg-amber-100 text-amber-700 border-amber-200" },
  user: { label: "User", icon: User, className: "bg-slate-100 text-slate-600 border-slate-200" },
};

export default function RoleBadge({ role }) {
  const config = roleConfig[role] || roleConfig.user;
  const Icon = config.icon;
  return (
    <Badge variant="outline" className={`${config.className} gap-1 font-medium`}>
      <Icon className="w-3 h-3" />
      {config.label}
    </Badge>
  );
}