import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2, Zap, Download } from "lucide-react";

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
    let consecutiveFailures = 0;

    try {
      let done = false;
      while (!done) {
        try {
          const res = await base44.functions.invoke("backfillZoomCalls", { from: "2026-04-01", batch_size: 5 });
          const data = res.data;
          if (data?.error) throw new Error(data.error);
          consecutiveFailures = 0;
          totalProcessed += data.processed || 0;
          totalSkipped = data.skipped || 0;
          allErrors = allErrors.concat(data.errors || []);
          done = data.done;
          setBackfillProgress({ processed: totalProcessed, skipped: totalSkipped, remaining: data.remaining, total: data.total });
          if (!done) await new Promise(r => setTimeout(r, 1500));
        } catch (batchErr) {
          consecutiveFailures++;
          console.warn(`Batch error (attempt ${consecutiveFailures}):`, batchErr.message);
          if (consecutiveFailures >= 3) throw new Error(`Failed 3 times in a row: ${batchErr.message}`);
          // Wait longer before retrying after a timeout
          await new Promise(r => setTimeout(r, 3000));
        }
      }
      setBackfillResult({ processed: totalProcessed, skipped: totalSkipped, errors: allErrors });
    } catch (err) {
      setBackfillError(err.message);
    } finally {
      setBackfilling(false);
      setBackfillProgress(null);
    }
  };

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