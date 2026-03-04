import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import PageHeader from '../components/shared/PageHeader';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from 'lucide-react';
import { toast } from "sonner";

const TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern Time (ET)' },
  { value: 'America/Chicago', label: 'Central Time (CT)' },
  { value: 'America/Denver', label: 'Mountain Time (MT)' },
  { value: 'America/Los_Angeles', label: 'Pacific Time (PT)' },
  { value: 'America/Anchorage', label: 'Alaska Time (AKT)' },
  { value: 'Pacific/Honolulu', label: 'Hawaii-Aleutian Time (HST)' },
  { value: 'Europe/London', label: 'Greenwich Mean Time (GMT)' },
  { value: 'Europe/Paris', label: 'Central European Time (CET)' },
  { value: 'Europe/Moscow', label: 'Moscow Standard Time (MSK)' },
  { value: 'Asia/Dubai', label: 'Gulf Standard Time (GST)' },
  { value: 'Asia/Kolkata', label: 'Indian Standard Time (IST)' },
  { value: 'Asia/Bangkok', label: 'Indochina Time (ICT)' },
  { value: 'Asia/Tokyo', label: 'Japan Standard Time (JST)' },
  { value: 'Australia/Sydney', label: 'Australian Eastern Time (AEST)' },
];

export default function Settings() {
  const { user } = useCurrentUser();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [timezone, setTimezone] = useState(user?.timezone || 'America/New_York');

  const updateNameMutation = useMutation({
    mutationFn: (full_name) => base44.auth.updateMe({ full_name }),
    onSuccess: () => {
      toast.success('Name updated successfully');
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  const updateTimezoneMutation = useMutation({
    mutationFn: (timezone) => base44.auth.updateMe({ timezone }),
    onSuccess: () => {
      toast.success('Timezone updated successfully');
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });

  const handleSave = () => {
    if (fullName !== user?.full_name) {
      updateNameMutation.mutate(fullName);
    }
  };

  const handleTimezoneChange = (newTimezone) => {
    setTimezone(newTimezone);
    updateTimezoneMutation.mutate(newTimezone);
  };

  return (
    <div>
      <PageHeader
        title="Settings"
        description="Manage your account"
      />

      <div className="max-w-2xl">
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">Profile Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={user?.email || ''} 
                disabled
                className="bg-slate-50"
              />
              <p className="text-xs text-slate-500">Your email cannot be changed</p>
            </div>

            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input 
                value={fullName} 
                onChange={e => setFullName(e.target.value)}
                placeholder="Your full name"
              />
            </div>

            <div className="space-y-2">
              <Label>Timezone</Label>
              <Select value={timezone} onValueChange={handleTimezoneChange}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIMEZONES.map(tz => (
                    <SelectItem key={tz.value} value={tz.value}>
                      {tz.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500">All times in the app will be adjusted to your selected timezone</p>
            </div>

            <div className="flex justify-end gap-3">
              <Button 
                variant="outline"
                onClick={() => setFullName(user?.full_name || '')}
                disabled={fullName === user?.full_name || updateNameMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSave}
                disabled={fullName === user?.full_name || !fullName || updateNameMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              >
                {updateNameMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Changes
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}