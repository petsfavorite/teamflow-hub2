import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2, Zap, Phone, FileSpreadsheet, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function FetchCallData() {
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetError, setResetError] = useState(null);

  const { data: recentCalls, isLoading, refetch } = useQuery({
    queryKey: ["recent-call-records"],
    queryFn: () => base44.entities.CallRecord.list("-created_date", 10),
    initialData: [],
  });

  const handleClearSheet = async () => {
    setResetting(true);
    setResetResult(null);
    setResetError(null);
    try {
      const res = await base44.functions.invoke("clearWrittenSheetData", {});
      setResetResult(res.data);
    } catch (err) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-8 max-w-3xl space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Zap className="w-6 h-6 text-emerald-600" />
        <h1 className="text-2xl font-bold text-slate-900">Call Data Pipeline</h1>
      </div>

      {/* How it works */}
      <Card className="p-6 space-y-4">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Phone className="w-4 h-4 text-emerald-600" /> How It Works
        </h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-slate-600 ml-1">
          <li>Zoom finishes recording a call and sends a <code className="bg-slate-100 px-1 rounded">recording.completed</code> webhook</li>
          <li>The webhook handler downloads the audio file from Zoom</li>
          <li>Audio is transcribed via OpenAI Whisper</li>
          <li>The transcript is analyzed by GPT-4o-mini to extract caller info, team member, booking outcome, and a summary</li>
          <li>A new row is appended to the Google Sheet with all extracted data</li>
          <li>A <code className="bg-slate-100 px-1 rounded">CallRecord</code> is saved to the database for the Call Dashboard</li>
        </ol>
        <p className="text-xs text-slate-500 mt-2">
          <strong>Sheet columns:</strong> Date · Duration · Direction · Caller Name · Caller Phone · Team Member · Caller Type · Booking Outcome · Summary · AI Notes
        </p>
      </Card>

      {/* Recent calls */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Recent Processed Calls
          </h2>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
        {isLoading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : recentCalls.length === 0 ? (
          <p className="text-sm text-slate-500">No calls processed yet. Calls will appear here after Zoom webhooks are received.</p>
        ) : (
          <div className="space-y-2">
            {recentCalls.map(call => (
              <div key={call.id} className="flex items-center justify-between text-sm py-2 border-b border-slate-100 last:border-0">
                <div>
                  <span className="font-medium text-slate-700">{call.caller_name || call.caller_phone || "Unknown"}</span>
                  {call.team_member && <span className="text-slate-400 ml-2">→ {call.team_member}</span>}
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className={`px-1.5 py-0.5 rounded ${call.booking_outcome === "appt_booked" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100"}`}>
                    {call.booking_outcome?.replace(/_/g, " ") || "—"}
                  </span>
                  <span>{call.call_date ? new Date(call.call_date).toLocaleDateString() : "—"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Utility: clear written sheet columns */}
      <Card className="p-6 space-y-3 border-amber-200 bg-amber-50">
        <h2 className="font-semibold text-amber-800">Utility: Clear Sheet Columns G–I</h2>
        <p className="text-sm text-amber-700">If columns were accidentally overwritten, use this to clear the written data columns (G, H, I) for all sheet rows.</p>
        <Button variant="outline" size="sm" onClick={handleClearSheet} disabled={resetting} className="border-amber-300 text-amber-700 hover:bg-amber-100">
          {resetting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Clearing...</> : "Clear Written Columns"}
        </Button>
        {resetResult && (
          <div className="flex items-center gap-2 text-sm text-emerald-700">
            <CheckCircle className="w-4 h-4" /> Cleared {resetResult.cleared} rows
          </div>
        )}
        {resetError && (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" /> {resetError}
          </div>
        )}
      </Card>
    </div>
  );
}