import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { getUserDisplayName } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import { useCurrentUser } from '../components/hooks/useCurrentUser';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MessageSquare, Send, Loader2, BookOpen, Sparkles, AlertTriangle, RotateCcw, HelpCircle, CheckCircle2 } from 'lucide-react';
import { formatDate } from '@/lib/timezone';
import {
  fetchLiveSops, searchSops, rankRecords, excerpt, htmlToText, sopBody, verificationStatus,
} from '@/lib/sop';

const MAX_TOP_SOPS = 8;
const MAX_INDEX_SOPS = 300;
const MAX_TOP_MANUALS = 3;
const HISTORY_MESSAGES = 6;
const REQUEST_TIMEOUT_MS = 60000;

const ANSWER_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string', description: 'Markdown answer for the user. Do not include links.' },
    covered: { type: 'boolean', description: 'True only if the provided SOPs or manuals actually cover the question' },
    source_ids: { type: 'array', items: { type: 'string' }, description: 'IDs of the SOPs the answer relies on, most relevant first' },
    manual_titles: { type: 'array', items: { type: 'string' }, description: 'Titles of training manuals the answer relies on' },
  },
  required: ['answer', 'covered', 'source_ids'],
};

const withTimeout = (promise, ms) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(new Error('The assistant took too long to respond.')), ms)),
]);

function sopBlock(sop, question) {
  const v = verificationStatus(sop);
  const lines = [
    `SOP ID: ${sop.id}`,
    `Title: ${sop.title}`,
    `Category: ${sop.category || 'N/A'} | Version: ${sop.version || 1} | Last verified: ${sop.last_verified_at ? formatDate(sop.last_verified_at) : 'never'}${v.overdue ? ' | VERIFICATION OVERDUE' : ''}`,
    sop.summary ? `Summary: ${sop.summary}` : null,
    sop.purpose ? `Purpose: ${sop.purpose}` : null,
    sop.when_it_applies ? `When it applies: ${sop.when_it_applies}` : null,
    sop.required_tools ? `Required tools: ${sop.required_tools}` : null,
    sop.warnings ? `Warnings: ${sop.warnings}` : null,
    sop.responsible_role ? `Responsible: ${sop.responsible_role}` : null,
    `Steps:\n${excerpt(htmlToText(sopBody(sop)), question, 3500) || 'N/A'}`,
  ];
  return lines.filter(Boolean).join('\n');
}

export default function SOPAssistant() {
  const { user, canManage } = useCurrentUser();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [showGaps, setShowGaps] = useState(false);
  const messagesEndRef = useRef(null);

  const { data: sops = [], isLoading: sopsLoading } = useQuery({
    queryKey: ['sops-live'],
    queryFn: () => fetchLiveSops(500),
  });

  const { data: manuals = [] } = useQuery({
    queryKey: ['training-manuals-for-ai'],
    queryFn: () => base44.entities.TrainingManual.filter({}, '-created_date', 100),
  });

  const { data: gapLog = [] } = useQuery({
    queryKey: ['sop-search-gaps'],
    queryFn: () => base44.entities.SOPSearchLog.filter({ answered: false }, '-created_date', 200),
    enabled: !!canManage,
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sopById = new Map(sops.map(s => [s.id, s]));

  const logQuestion = (question, answered, matchedIds) => {
    // Best-effort: never let logging break or delay the answer.
    base44.entities.SOPSearchLog.create({
      question,
      answered,
      matched_sop_ids: matchedIds,
      user_email: user?.email,
      user_name: getUserDisplayName(user),
    }).then(() => { if (!answered) queryClient.invalidateQueries({ queryKey: ['sop-search-gaps'] }); }).catch(() => {});
  };

  const ask = async (question, baseMessages) => {
    setLoading(true);
    try {
      // Follow-up questions ("what about puppies?") are short, so also search with the previous question.
      const previousUser = [...baseMessages].reverse().find(m => m.role === 'user');
      const retrievalQuery = question.split(/\s+/).length <= 5 && previousUser ? `${previousUser.content} ${question}` : question;

      const top = searchSops(sops, retrievalQuery, { mode: 'any', limit: MAX_TOP_SOPS }).map(r => r.sop);
      const topIds = new Set(top.map(s => s.id));
      const index = sops.filter(s => !topIds.has(s.id)).slice(0, MAX_INDEX_SOPS)
        .map(s => `- ${s.id} | ${s.title} | ${s.category || ''} | ${(s.tags || []).join(', ')}`).join('\n');

      const topManuals = rankRecords(
        manuals.filter(m => m.file_summary || m.file_content),
        m => [[m.title, 5], [m.category, 2], [m.file_summary, 3], [m.file_content, 1]],
        retrievalQuery, MAX_TOP_MANUALS
      );
      const manualContext = topManuals.map(m =>
        `Training Manual: "${m.title}"${m.category ? ` (Category: ${m.category})` : ''}\nSummary: ${m.file_summary || 'N/A'}\nRelevant content: ${excerpt(m.file_content, retrievalQuery, 1800)}`
      ).join('\n\n---\n\n');

      const history = baseMessages
        .filter(m => !m.error)
        .slice(-HISTORY_MESSAGES)
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 600)}`)
        .join('\n');

      const prompt = `You are the SOP assistant for a pet care facility. Staff ask you what to do in a situation and you point them to the right Standard Operating Procedure.

STRICT RULES
- Answer ONLY from the SOPs and training manuals provided below. Never invent steps, doses, contact numbers, policies or times.
- If the provided material only partly covers the question, say exactly what is and is not covered.
- If nothing covers it, set covered=false, say so plainly, and tell the user to ask a supervisor. Do not guess.
- For emergencies or safety situations, lead with the immediate safety steps from the SOP, then tell the user to alert a supervisor.
- If a SOP is marked VERIFICATION OVERDUE, mention that its details should be confirmed with a manager.
- Do NOT write links or URLs. List the SOP IDs you used in source_ids (most relevant first) and the manual titles in manual_titles. The app shows the links.
- Be concise and conversational. Use markdown (short lists for steps).

FULL TEXT OF THE MOST RELEVANT SOPs
${top.length ? top.map(s => sopBlock(s, retrievalQuery)).join('\n\n---\n\n') : 'None matched the question closely.'}

OTHER SOPs (titles only; you may cite them in source_ids if the title clearly fits, but you cannot describe their steps)
Format: ID | Title | Category | Tags
${index || 'None'}

TRAINING MANUALS
${manualContext || 'None relevant.'}

${history ? `CONVERSATION SO FAR\n${history}\n\n` : ''}The user now asks: """${question}"""`;

      const response = await withTimeout(
        base44.integrations.Core.InvokeLLM({ prompt, response_json_schema: ANSWER_SCHEMA }),
        REQUEST_TIMEOUT_MS
      );

      // Never trust model-written IDs: keep only SOPs / manuals that really exist.
      const sourceIds = [...new Set(response.source_ids || [])].filter(id => sopById.has(id)).slice(0, 5);
      const manualTitles = (response.manual_titles || []).filter(t => manuals.some(m => m.title === t)).slice(0, 3);
      const answered = !!response.covered && (sourceIds.length > 0 || manualTitles.length > 0);

      setMessages(prev => [...prev, {
        role: 'assistant', content: response.answer || 'I could not find an answer.',
        sourceIds, manualTitles, covered: answered,
      }]);
      logQuestion(question, answered, sourceIds);
    } catch (e) {
      setMessages(prev => [...prev, {
        role: 'assistant', error: true, retryQuestion: question,
        content: e?.message?.includes('too long')
          ? 'That took too long. Please try again.'
          : 'Sorry, something went wrong while searching the SOPs. Please try again.',
      }]);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = (text) => {
    const question = (text ?? input).trim();
    if (!question || loading || sopsLoading) return;
    const base = messages.filter(m => !m.error);
    setMessages([...base, { role: 'user', content: question }]);
    setInput('');
    ask(question, base);
  };

  // The failed question's bubble stays; only the error reply is replaced.
  const retry = (question) => {
    if (loading) return;
    const base = messages.filter(m => !m.error);
    setMessages(base);
    ask(question, base.slice(0, -1));
  };

  // Group unanswered questions so repeated gaps stand out.
  const gaps = Object.values(gapLog.reduce((acc, g) => {
    const key = g.question.trim().toLowerCase();
    acc[key] = acc[key] || { question: g.question, count: 0, last: g.created_date };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a, b) => b.count - a.count).slice(0, 15);

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-slate-900">SOP Assistant</h1>
          <p className="text-sm text-slate-500">Ask me about any procedure or situation</p>
        </div>
        {canManage && (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setShowGaps(v => !v)}>
            <HelpCircle className="w-4 h-4" />
            {showGaps ? 'Back to chat' : `Unanswered questions${gaps.length ? ` (${gaps.length})` : ''}`}
          </Button>
        )}
      </div>

      {showGaps ? (
        <Card className="flex-1 border-0 shadow-sm overflow-y-auto">
          <CardContent className="p-6">
            <p className="text-sm text-slate-500 mb-4">Questions staff asked that no SOP or manual covered. Repeated questions are good candidates for a new SOP.</p>
            {gaps.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-8">Nothing yet — every question so far found an answer.</p>
            ) : (
              <div className="space-y-2">
                {gaps.map(g => (
                  <div key={g.question} className="flex items-center gap-3 px-3 py-2 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-800 flex-1">{g.question}</span>
                    {g.count > 1 && <span className="text-xs font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">asked {g.count}×</span>}
                    <span className="text-xs text-slate-400">{formatDate(g.last)}</span>
                  </div>
                ))}
              </div>
            )}
            <Link to={createPageUrl('SOPEditor')}>
              <Button className="mt-5 bg-indigo-600 hover:bg-indigo-700">Create a new SOP</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
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
                    onClick={() => sendMessage(q)}
                    disabled={sopsLoading}
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 rounded-full text-slate-600 transition-colors disabled:opacity-50"
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
                    : msg.error ? 'bg-red-50 border border-red-200' : 'bg-white border border-slate-200'
                }`}>
                  {msg.role === 'user' ? (
                    <p className="text-sm">{msg.content}</p>
                  ) : msg.error ? (
                    <div className="flex items-center gap-3 text-sm text-red-800">
                      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                      <span className="flex-1">{msg.content}</span>
                      <Button size="sm" variant="outline" className="gap-1 border-red-200" onClick={() => retry(msg.retryQuestion)} disabled={loading}>
                        <RotateCcw className="w-3.5 h-3.5" /> Retry
                      </Button>
                    </div>
                  ) : (
                    <div className="prose prose-sm prose-slate max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                      <ReactMarkdown
                        components={{
                          // The model is told not to write links; if it does, only real https links are kept.
                          a: ({ href, children }) => (/^https:\/\//.test(href || '')
                            ? <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{children}</a>
                            : <span>{children}</span>),
                        }}
                      >{msg.content}</ReactMarkdown>
                    </div>
                  )}
                </div>

                {msg.role === 'assistant' && !msg.error && (msg.sourceIds?.length > 0 || msg.manualTitles?.length > 0) && (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">Sources</p>
                    {msg.sourceIds.map(id => {
                      const sop = sopById.get(id);
                      if (!sop) return null;
                      const v = verificationStatus(sop);
                      return (
                        <Link key={id} to={createPageUrl('SOPDetail') + `?id=${id}`}
                          className="flex items-center gap-2 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors">
                          <BookOpen className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-indigo-900 truncate">{sop.title}</p>
                            <p className="text-xs text-slate-500">
                              v{sop.version || 1} · {sop.last_verified_at ? `Verified ${formatDate(sop.last_verified_at)}` : 'Not yet verified'}
                            </p>
                          </div>
                          {v.overdue && (
                            <span className="flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full whitespace-nowrap">
                              <AlertTriangle className="w-3 h-3" /> Confirm with a manager
                            </span>
                          )}
                        </Link>
                      );
                    })}
                    {msg.manualTitles?.map(t => (
                      <Link key={t} to={createPageUrl('TrainingManuals')}
                        className="flex items-center gap-2 px-3 py-2 bg-slate-50 hover:bg-slate-100 rounded-lg text-sm text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-slate-400" /> Training manual: {t}
                      </Link>
                    ))}
                  </div>
                )}
                {msg.role === 'assistant' && !msg.error && msg.covered === false && (
                  <p className="mt-2 text-xs text-amber-700">No SOP covers this yet — please ask a supervisor. A manager has been shown this question.</p>
                )}
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
              placeholder={sopsLoading ? 'Loading SOPs...' : 'Describe a situation or ask about a procedure...'}
              className="flex-1"
              disabled={loading || sopsLoading}
            />
            <Button type="submit" disabled={loading || sopsLoading || !input.trim()} className="bg-indigo-600 hover:bg-indigo-700">
              <Send className="w-4 h-4" />
            </Button>
          </form>
        </div>
      </Card>
      )}
    </div>
  );
}