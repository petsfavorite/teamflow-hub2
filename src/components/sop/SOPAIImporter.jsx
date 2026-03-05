import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Loader2, ChevronDown, ChevronUp, Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';

export default function SOPAIImporter({ onFill, sopTags = [] }) {
  const [rawText, setRawText] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SpeechRecognition) {
        recognitionRef.current = new SpeechRecognition();
        recognitionRef.current.continuous = true;
        recognitionRef.current.onresult = (event) => {
          let transcript = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            transcript += event.results[i][0].transcript + ' ';
          }
          setRawText(prev => prev + transcript);
        };
        recognitionRef.current.onerror = (event) => {
          toast.error('Voice input error: ' + event.error);
          setIsListening(false);
        };
      }
    }
  }, []);

  const toggleDictation = () => {
    if (!recognitionRef.current) {
      toast.error('Voice input not supported in this browser');
      return;
    }
    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  };

  const handleGenerate = async () => {
    if (!rawText.trim()) return;
    setLoading(true);
    try {
      const availableTagNames = sopTags.map(t => t.name);
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `You are an expert SOP writer for a pet daycare/boarding facility. 
Given the following raw SOP text or description, extract and structure it into the fields below.
Be thorough, clear and professional. Use the step-by-step instructions field for detailed procedures.

Raw input:
"""
${rawText}
"""

Available tags (only use tags from this list, pick the most relevant): ${availableTagNames.join(', ')}

Return a JSON object with these exact keys:
- title (string): concise SOP title
- category (string): e.g. Safety, Operations, Cleaning, Medical, Client Services
- purpose (string): 1-3 sentences on why this SOP exists
- when_it_applies (string): conditions/situations when this SOP applies
- required_tools (string): tools, materials or equipment needed (one per line)
- instructions (string): full step-by-step HTML instructions using <ol><li> for numbered steps and <strong> for section headers. Be detailed.
- warnings (string): safety warnings or cautions (plain text)
- responsible_role (string): who is responsible e.g. "All Staff", "Kennel Staff", "Shift Lead"
- summary (string): one sentence summary for search
- tags (array of strings): relevant tags from the available list only`,
        response_json_schema: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            category: { type: 'string' },
            purpose: { type: 'string' },
            when_it_applies: { type: 'string' },
            required_tools: { type: 'string' },
            instructions: { type: 'string' },
            warnings: { type: 'string' },
            responsible_role: { type: 'string' },
            summary: { type: 'string' },
            tags: { type: 'array', items: { type: 'string' } },
          }
        }
      });

      onFill(result);
      toast.success('SOP fields filled from AI — review and adjust as needed');
      setExpanded(false);
    } catch (e) {
      toast.error('AI generation failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="border-2 border-dashed border-indigo-300 rounded-xl bg-indigo-50/50 mb-6 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-indigo-50 transition-colors"
        onClick={() => setExpanded(e => !e)}
        type="button"
      >
        <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-4 h-4 text-white" />
        </div>
        <div className="flex-1">
          <p className="font-semibold text-indigo-900 text-sm">AI SOP Builder</p>
          <p className="text-xs text-indigo-600">Paste, type, or dictate your SOP — AI will fill in all fields automatically</p>
        </div>
        {expanded ? <ChevronUp className="w-4 h-4 text-indigo-500" /> : <ChevronDown className="w-4 h-4 text-indigo-500" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 space-y-3">
          <div className="relative">
            <Textarea
              value={rawText}
              onChange={e => setRawText(e.target.value)}
              placeholder="Paste your SOP content here, describe the procedure in plain language, or use voice dictation...

      Example: 'When a dog arrives showing signs of illness such as vomiting, lethargy, or loss of appetite, staff should immediately isolate the dog in the medical kennel, notify the shift lead, contact the owner, and document the symptoms in the system...'"
              rows={8}
              className="bg-white border-indigo-200 focus-visible:ring-indigo-400 text-sm resize-y pr-12"
              autoFocus
            />
            <Button
              onClick={toggleDictation}
              size="icon"
              variant="ghost"
              className={`absolute bottom-2 right-2 ${isListening ? 'bg-red-100 text-red-600 hover:bg-red-200' : 'text-slate-400 hover:text-slate-600'}`}
              type="button"
              title={isListening ? 'Stop listening' : 'Start voice dictation'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-indigo-500">{isListening ? '🎤 Listening...' : 'AI will structure this into all SOP fields. You can edit after.'}</p>
            <Button
              onClick={handleGenerate}
              disabled={loading || !rawText.trim()}
              className="bg-indigo-600 hover:bg-indigo-700 gap-2"
              type="button"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              {loading ? 'Generating...' : 'Fill SOP with AI'}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}