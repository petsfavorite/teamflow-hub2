import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, CheckCircle2 } from "lucide-react";

export default function DataExport() {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState(null);

  const handleExport = async () => {
    setLoading(true);
    setDone(false);
    setError(null);
    setSummary(null);

    const response = await base44.functions.invoke("exportAllData", {});
    const data = response.data;

    if (data.error) {
      setError(data.error);
      setLoading(false);
      return;
    }

    // Build summary counts
    const counts = Object.entries(data.entities).map(([name, records]) => ({
      name,
      count: records.length,
    }));
    setSummary(counts);

    // Trigger download
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `full-export-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);

    setDone(true);
    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-2xl font-bold text-stone-800 mb-2">Export All Data</h1>
      <p className="text-stone-500 mb-8">
        Downloads a complete JSON export of all records in this app. Use this to migrate data to a new location's app.
      </p>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Full Data Export</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-stone-600">
            Exports: Pets, Visits, Tasks, SOPs, Checklists, Teams, Assets, Maintenance Requests,
            Incident Reports, Call Records, External Links, App Settings, and more.
          </p>

          <Button
            onClick={handleExport}
            disabled={loading}
            className="bg-[#82bb32] hover:bg-[#6fa028] text-white w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting — this may take a minute...
              </>
            ) : done ? (
              <>
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Export Downloaded!
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" />
                Export All Data
              </>
            )}
          </Button>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">{error}</p>
          )}

          {summary && (
            <div className="mt-4">
              <p className="text-sm font-medium text-stone-700 mb-2">Export Summary:</p>
              <div className="grid grid-cols-2 gap-1">
                {summary.filter(s => s.count > 0).map(({ name, count }) => (
                  <div key={name} className="flex justify-between text-sm bg-stone-50 rounded px-3 py-1">
                    <span className="text-stone-600">{name}</span>
                    <span className="font-medium text-stone-800">{count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}