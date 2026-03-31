import React, { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import ReactMarkdown from 'react-markdown';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Loader2, BookOpen, Sparkles } from 'lucide-react';

export default function SOPAssistant() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: sops = [] } = useQuery({
    queryKey: ['sops-for-ai'],
    queryFn: () => base44.entities.SOP.filter({ status: 'published' }, '-updated_date', 500),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;

    const userMsg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    const sopContext = sops.map(s =>
      `SOP: "${s.title}" (ID: ${s.id}, Category: ${s.category})\nSummary: ${s.summary || 'N/A'}\nTags: ${s.tags?.join(', ') || 'N/A'}\nContent preview: ${s.content?.replace(/<[^>]*>/g, '').substring(0, 300)}`
    ).join('\n\n---\n\n');

    const response = await base44.integrations.Core.InvokeLLM({
      prompt: `You are an SOP assistant for a business. You help users find the right Standard Operating Procedure for their situation.

Here are all available SOPs:

${sopContext}

The user is asking: "${input}"

Based on the SOPs available:
1. Identify which SOP(s) are most relevant to the user's question
2. Provide a clear, helpful response explaining which SOP to follow
3. When referencing an SOP title, format it as a markdown link using the SOP's ID like this: [SOP Title](/SOPDetail?id=SOP_ID)
4. If multiple SOPs are relevant, list them in order of relevance
5. If no SOP matches, say so and suggest what they might look for

Be conversational, helpful, and concise. Format your response in markdown.`,
    });

    setMessages(prev => [...prev, { role: 'assistant', content: response }]);
    setLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">SOP Assistant</h1>
          <p className="text-sm text-slate-500">Ask me about any procedure or situation</p>
        </div>
      </div>

      {/* Messages */}
      <Card className="flex-1 border-0 shadow-sm overflow-hidden flex flex-col">
        <CardContent className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center mb-4">
                <MessageSquare className="w-8 h-8 text-indigo-400" />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">How can I help?</h3>
              <p className="text-sm text-slate-500 max-w-md mb-6">
                Describe a situation or ask about a procedure, and I'll find the right SOP for you.
              </p>
              <div className="flex flex-wrap gap-2 justify-center">
                {['What do I do if there\'s a spill?', 'How do I open the store?', 'What\'s the procedure for returns?'].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); }}
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-full text-slate-600 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] ${msg.role === 'user' ? 'order-1' : ''}`}>
                {msg.role === 'assistant' && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-6 h-6 rounded-lg bg-indigo-100 flex items-center justify-center">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                    </div>
                    <span className="text-xs font-medium text-slate-500">SOP Assistant</span>
                  </div>
                )}
                <div className={`rounded-2xl px-4 py-3 ${
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white border border-slate-200'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        components={{
                          a: ({ href, children }) => (
                            <Link
                              to={href}
                              className="text-indigo-600 font-medium underline hover:text-indigo-800"
                            >
                              {children}
                            </Link>
                          ),
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 px-4 py-3 bg-white border border-slate-200 rounded-2xl">
                <Loader2 className="w-4 h-4 text-indigo-600 animate-spin" />
                <span className="text-sm text-slate-500">Searching SOPs...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </CardContent>

        {/* Input */}
        <div className="p-4 border-t border-slate-100">
          <form onSubmit={(e) => { e.preventDefault(); sendMessage(); }} className="flex gap-2">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Describe a situation or ask about a procedure..."
              className="flex-1"
              disabled={loading}
            />
            <Button type="submit" disabled={loading || !input.trim()} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
    </div>
  );
}