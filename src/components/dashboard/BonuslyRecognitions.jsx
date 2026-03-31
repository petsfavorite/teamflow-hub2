import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Heart } from 'lucide-react';

export default function BonuslyRecognitions() {
  const [recognitions, setRecognitions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchRecognitions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await base44.functions.invoke('getBonuslyAwards', {});
      if (response.data.recognitions && response.data.recognitions.length > 0) {
        setRecognitions(response.data.recognitions);
      } else {
        setRecognitions([]);
      }
    } catch (err) {
      setError('Unable to load recognitions');
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
      <div className="flex items-center justify-center p-8 text-slate-400">
        <div className="w-4 h-4 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mr-2"></div>
        Loading recognitions...
      </div>
    );
  }

  if (error || recognitions.length === 0) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400">
        <Heart className="w-4 h-4 mr-2 opacity-50" />
        No recent recognitions
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recognitions.map((recognition, idx) => (
        <div
          key={idx}
          className="bg-white rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow border border-slate-100"
        >
          <div className="flex items-start gap-3">
            <Heart className="w-4 h-4 text-red-400 mt-1 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-slate-900 text-sm">
                <span className="font-bold">{recognition.giver}</span>
                <span className="text-slate-400 font-normal"> → </span>
                <span className="font-bold">{recognition.receiver}</span>
              </div>
              <p className="text-slate-700 mt-2 text-sm leading-relaxed">
                {recognition.message}
              </p>
              {recognition.tags && recognition.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {recognition.tags.map((tag, tagIdx) => (
                    <span
                      key={tagIdx}
                      className="text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded"
                    >
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              {recognition.time && (
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(recognition.time).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}