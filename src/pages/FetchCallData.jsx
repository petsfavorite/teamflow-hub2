import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, CheckCircle, Loader2, FileSpreadsheet } from "lucide-react";

export default function FetchCallData() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleImport = async () => {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await base44.functions.invoke("scheduledSheetSync", {});
      setResult(res.data);
    } catch (err) {
      setError(err.message || "Failed to import from Google Sheet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          <h1 className="text-2xl font-bold text-slate-900">Fetch Call Data</h1>
        </div>
        <p className="text-slate-600 mb-6">Manually import the latest call records from the connected Google Sheet.</p>
        <Card className="p-6 space-y-4">
          <ul className="list-disc list-inside space-y-1 text-sm text-slate-600 ml-2">
            <li>Reads up to 15 new rows per run from the Google Sheet</li>
            <li>Analyzes each transcript with AI</li>
            <li>Skips already-imported records (no duplicates)</li>
            <li>Run repeatedly until "remaining" reaches 0</li>
          </ul>
          <Button onClick={handleImport} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing...</> : "Fetch Data Now"}
          </Button>
          {result && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-lg flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-emerald-900">Done</p>
                <p className="text-sm text-emerald-700 mt-1">
                  {result.imported} imported · {result.skipped} skipped
                  {result.remaining > 0 && ` · ${result.remaining} still remaining — run again`}
                </p>
                {result.errors?.length > 0 && <p className="text-xs text-amber-700 mt-1">Errors: {result.errors.join("; ")}</p>}
              </div>
            </div>
          )}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div><p className="font-medium text-red-900">Error</p><p className="text-sm text-red-700 mt-1">{error}</p></div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}