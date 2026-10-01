import React, { useMemo, useState } from 'react';
import { htmlToText, sanitizeHtml, sopBody, fieldsDiffer } from '@/lib/sop';

const TEXT_FIELDS = [
  ['title', 'Title'], ['category', 'Category'], ['summary', 'Summary'], ['purpose', 'Purpose'],
  ['when_it_applies', 'When it applies'], ['required_tools', 'Required tools'],
  ['warnings', 'Warnings'], ['responsible_role', 'Responsible'], ['video_url', 'Video URL'],
];
const OTHER_LABELS = {
  applicable_teams: 'Applicable teams', related_sop_ids: 'Related SOPs',
  requires_acknowledgement: 'Acknowledgement settings', acknowledgement_due_days: 'Acknowledgement settings',
  acknowledgement_assigned_emails: 'Acknowledgement settings', acknowledgement_assigned_teams: 'Acknowledgement settings',
};

// Line-level diff (LCS). Returns [{type: 'same'|'add'|'del', text}].
function diffLines(a, b) {
  const x = a.split('\n').filter(Boolean);
  const y = b.split('\n').filter(Boolean);
  const dp = Array.from({ length: x.length + 1 }, () => new Array(y.length + 1).fill(0));
  for (let i = x.length - 1; i >= 0; i--) {
    for (let j = y.length - 1; j >= 0; j--) {
      dp[i][j] = x[i] === y[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const out = [];
  let i = 0, j = 0;
  while (i < x.length && j < y.length) {
    if (x[i] === y[j]) { out.push({ type: 'same', text: x[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ type: 'del', text: x[i++] }); }
    else { out.push({ type: 'add', text: y[j++] }); }
  }
  while (i < x.length) out.push({ type: 'del', text: x[i++] });
  while (j < y.length) out.push({ type: 'add', text: y[j++] });
  return out;
}

const rowClass = {
  add: 'bg-emerald-50 text-emerald-900 border-l-2 border-emerald-500',
  del: 'bg-red-50 text-red-800 line-through border-l-2 border-red-400',
  same: 'text-slate-500',
};
const rowMark = { add: '+ ', del: '− ', same: '  ' };

function LineDiff({ lines, collapseSame = true }) {
  // Hide long runs of unchanged lines, keeping 1 line of context either side of a change.
  const visible = lines.map((l, idx) => {
    if (!collapseSame || l.type !== 'same') return true;
    return [lines[idx - 1], lines[idx + 1]].some((n) => n && n.type !== 'same');
  });
  const rows = [];
  let hidden = 0;
  lines.forEach((l, idx) => {
    if (visible[idx]) {
      if (hidden) { rows.push(<div key={`h${idx}`} className="text-xs text-slate-400 italic px-2 py-0.5">… {hidden} unchanged line{hidden !== 1 ? 's' : ''}</div>); hidden = 0; }
      rows.push(<div key={idx} className={`text-sm px-2 py-0.5 whitespace-pre-wrap ${rowClass[l.type]}`}>{rowMark[l.type]}{l.text}</div>);
    } else hidden += 1;
  });
  if (hidden) rows.push(<div key="hend" className="text-xs text-slate-400 italic px-2 py-0.5">… {hidden} unchanged line{hidden !== 1 ? 's' : ''}</div>);
  return <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">{rows}</div>;
}

export default function SOPChangeDiff({ current, proposed }) {
  const [showFormatted, setShowFormatted] = useState(false);

  const changes = useMemo(() => {
    const merged = { ...current, ...proposed };
    const items = [];
    TEXT_FIELDS.forEach(([key, label]) => {
      if (proposed[key] === undefined) return;
      if (fieldsDiffer(current, merged, [key])) {
        items.push({ key, label, lines: diffLines(htmlToText(current[key] || ''), htmlToText(merged[key] || '')) });
      }
    });
    const oldBody = sopBody(current);
    const newBody = proposed.instructions !== undefined ? proposed.instructions : oldBody;
    const bodyChanged = htmlToText(oldBody) !== htmlToText(newBody);
    const tagsOld = current.tags || [];
    const tagsNew = proposed.tags !== undefined ? proposed.tags : tagsOld;
    const tagChange = {
      added: tagsNew.filter((t) => !tagsOld.includes(t)),
      removed: tagsOld.filter((t) => !tagsNew.includes(t)),
    };
    const other = [...new Set(Object.keys(OTHER_LABELS)
      .filter((k) => proposed[k] !== undefined && fieldsDiffer(current, merged, [k]))
      .map((k) => OTHER_LABELS[k]))];
    return { items, bodyChanged, oldBody, newBody, tagChange, other };
  }, [current, proposed]);

  const nothing = changes.items.length === 0 && !changes.bodyChanged &&
    changes.tagChange.added.length === 0 && changes.tagChange.removed.length === 0 && changes.other.length === 0;

  if (nothing) return <p className="text-sm text-slate-500">No differences from the live version.</p>;

  return (
    <div className="space-y-4">
      {changes.items.map((c) => (
        <div key={c.key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">{c.label}</p>
          <LineDiff lines={c.lines} collapseSame={false} />
        </div>
      ))}

      {changes.bodyChanged && (
        <div>
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Step-by-step instructions</p>
            <button type="button" className="text-xs text-indigo-600 hover:underline" onClick={() => setShowFormatted((v) => !v)}>
              {showFormatted ? 'Show changes' : 'Show proposed version as formatted'}
            </button>
          </div>
          {showFormatted ? (
            <div className="prose prose-sm prose-slate max-w-none bg-white border border-slate-200 rounded-lg p-4 max-h-96 overflow-y-auto"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(changes.newBody) }} />
          ) : (
            <div className="max-h-96 overflow-y-auto">
              <LineDiff lines={diffLines(htmlToText(changes.oldBody), htmlToText(changes.newBody))} />
            </div>
          )}
        </div>
      )}

      {(changes.tagChange.added.length > 0 || changes.tagChange.removed.length > 0) && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {changes.tagChange.added.map((t) => <span key={`a${t}`} className="px-2 py-0.5 rounded-full text-xs bg-emerald-100 text-emerald-800">+ {t}</span>)}
            {changes.tagChange.removed.map((t) => <span key={`r${t}`} className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 line-through">{t}</span>)}
          </div>
        </div>
      )}

      {changes.other.length > 0 && (
        <p className="text-xs text-slate-500">Also changed: {changes.other.join(', ')}</p>
      )}
    </div>
  );
}
