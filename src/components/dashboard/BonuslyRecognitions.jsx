import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Award, ArrowRight } from 'lucide-react';

export default function BonuslyRecognitions() {
  const [recognitions, setRecognitions] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchRecognitions = async () => {
    try {
      setLoading(true);
      const response = await base44.functions.invoke('getBonuslyAwards', {});
      if (response.data.recognitions && response.data.recognitions.length > 0) {
        const sorted = response.data.recognitions
          .sort((a, b) => new Date(b.time) - new Date(a.time))
          .slice(0, 4);
        setRecognitions(sorted);
      } else {
        setRecognitions([]);
      }
    } catch {
      setRecognitions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecognitions();
    const interval = setInterval(fetchRecognitions, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading && recognitions.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-slate-400 py-4">
            <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mr-2"></div>
            Loading recognitions...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (recognitions.length === 0) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent className="p-6">
          <div className="flex items-center justify-center text-slate-400 py-4">
            <Award className="w-4 h-4 mr-2 opacity-50" />
            No recent recognitions
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardContent className="p-6">
        <h2 className="font-semibold text-slate-900 mb-4 flex items-center gap-2">
          <Award className="w-5 h-5 text-amber-600" />
          Recent Recognitions
        </h2>
        <div className="space-y-3">
          {recognitions.map((recognition, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors"
            >
              <Award className="w-4 h-4 text-amber-600 mt-1 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900">
                  <span className="font-bold">{recognition.giver}</span>
                  <span className="text-slate-400 font-normal"> → </span>
                  <span className="font-bold">{recognition.receiver}</span>
                </p>
                <p className="text-xs text-slate-600 mt-1">{recognition.message}</p>
                {recognition.tags && recognition.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {recognition.tags.map((tag, tagIdx) => (
                      <span
                        key={tagIdx}
                        className="text-xs text-amber-700 bg-white px-2 py-0.5 rounded border border-amber-200"
                      >
                        #{tag}
                      </span>
                    ))}
                  </div>
                )}
                {recognition.time && (
                  <p className="text-xs text-slate-500 mt-2">
                    {new Date(recognition.time).toLocaleDateString()}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}