import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2, Zap, Phone, FileSpreadsheet, RefreshCw, Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export default function FetchCallData() {
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState(null);
  const [resetError, setResetError] = useState(null);

  const [backfilling, setBackfilling] = useState(false);
  const [backfillResult, setBackfillResult] = useState(null);
  const [backfillError, setBackfillError] = useState(null);
  const [backfillProgress, setBackfillProgress] = useState(null);

  const handleBackfill = async () => {
    setBackfilling(true);
    setBackfillResult(null);
    setBackfillError(null);
    setBackfillProgress(null);
    let totalProcessed = 0;
    let totalSkipped = 0;
    let allErrors = [];

    try {
      let done = false;
      while (!done) {
        const res = await base44.functions.invoke("backfillZoomCalls", { from: "2026-04-01", batch_size: 5 });
        const data = res.data;
        totalProcessed += data.processed || 0;
        totalSkipped = data.skipped || 0;
        allErrors = allErrors.concat(data.errors || []);
        done = data.done;
        setBackfillProgress({ processed: totalProcessed, skipped: totalSkipped, remaining: data.remaining, total: data.total });
        if (!done) await new Promise(r => setTimeout(r, 1000));
      }
      setBackfillResult({ processed: totalProcessed, skipped: totalSkipped, errors: allErrors });
      refetch();
    } catch (err) {
      setBackfillError(err.message);
    } finally {
      setBackfilling(false);
      setBackfillProgress(null);
    }
  };

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

      {/* Backfill historical Zoom calls */}
      <Card className="p-6 space-y-3">
        <h2 className="font-semibold text-slate-800 flex items-center gap-2">
          <Download className="w-4 h-4 text-blue-600" /> Backfill Historical Calls
        </h2>
        <p className="text-sm text-slate-600">Fetch all Zoom cloud recordings from <strong>April 1, 2026</strong> to today, transcribe each one, and add them to the sheet and call dashboard. Skips any already imported.</p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">⚠️ This may take several minutes depending on the number of recordings. Do not close this page.</p>
        <Button onClick={handleBackfill} disabled={backfilling} className="bg-blue-600 hover:bg-blue-700 text-white">
          {backfilling ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processing...</> : "Run Backfill"}
        </Button>
        {backfilling && backfillProgress && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
            <Loader2 className="w-4 h-4 inline animate-spin mr-2" />
            <span className="font-medium">{backfillProgress.processed} processed</span> · {backfillProgress.remaining} remaining of {backfillProgress.total} total
          </div>
        )}
        {backfillResult && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-2 text-sm text-emerald-800">
            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <div>
              <span className="font-medium">Done!</span> {backfillResult.processed} processed · {backfillResult.skipped} already imported
              {backfillResult.errors?.length > 0 && <p className="text-xs text-amber-700 mt-1">Errors: {backfillResult.errors.join("; ")}</p>}
            </div>
          </div>
        )}
        {backfillError && (
          <div className="flex items-center gap-2 text-sm text-red-700">
            <AlertCircle className="w-4 h-4" /> {backfillError}
          </div>
        )}
      </Card>


    </div>
  );
}