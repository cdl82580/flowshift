import { useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  rows?: number;
}

type Action =
  | { kind: 'wrap';   before: string; after: string; placeholder: string }
  | { kind: 'prefix'; prefix: string; placeholder: string }
  | { kind: 'block';  before: string; after: string;  placeholder: string };

type ToolBtn = { label: string; title: string } & Action;
type ToolItem = ToolBtn | 'sep';

const TOOLS: ToolItem[] = [
  { label: 'B',    title: 'Bold',          kind: 'wrap',   before: '**',    after: '**',       placeholder: 'bold text'  },
  { label: 'I',    title: 'Italic',        kind: 'wrap',   before: '*',     after: '*',        placeholder: 'italic text'},
  'sep',
  { label: 'H2',   title: 'Heading 2',     kind: 'prefix', prefix: '## ',                      placeholder: 'Heading'    },
  { label: 'H3',   title: 'Heading 3',     kind: 'prefix', prefix: '### ',                     placeholder: 'Heading'    },
  'sep',
  { label: '`',    title: 'Inline code',   kind: 'wrap',   before: '`',     after: '`',        placeholder: 'code'       },
  { label: '```',  title: 'Code block',    kind: 'block',  before: '```\n', after: '\n```',    placeholder: 'code'       },
  'sep',
  { label: '❝',    title: 'Blockquote',    kind: 'prefix', prefix: '> ',                       placeholder: 'quote'      },
  { label: '•',    title: 'Bullet list',   kind: 'prefix', prefix: '- ',                       placeholder: 'list item'  },
  { label: '1.',   title: 'Numbered list', kind: 'prefix', prefix: '1. ',                      placeholder: 'list item'  },
  'sep',
  { label: '🔗',   title: 'Link',          kind: 'wrap',   before: '[',     after: '](url)',   placeholder: 'link text'  },
];

const REFERENCE = [
  { syntax: '---',             desc: 'Horizontal divider' },
  { syntax: '~~text~~',        desc: 'Strikethrough' },
  { syntax: '| Col | Col |',   desc: 'Table (add | --- | --- | row under header)' },
  { syntax: '![alt](url)',     desc: 'Image' },
  { syntax: '\\',              desc: 'Line break (two trailing spaces, or \\)' },
];

export function MarkdownEditor({ value, onChange, placeholder, rows = 6 }: Props) {
  const ref      = useRef<HTMLTextAreaElement>(null);
  const [showRef, setShowRef] = useState(false);

  function apply(tool: ToolBtn) {
    const ta = ref.current;
    if (!ta) return;

    const start = ta.selectionStart;
    const end   = ta.selectionEnd;
    const sel   = value.slice(start, end);

    let inserted: string;
    let cursorStart: number;
    let cursorEnd: number;

    if (tool.kind === 'wrap' || tool.kind === 'block') {
      const text  = sel || tool.placeholder;
      inserted    = tool.before + text + tool.after;
      cursorStart = start + tool.before.length;
      cursorEnd   = cursorStart + text.length;
    } else {
      // prefix — apply to each selected line
      const lines = (sel || tool.placeholder).split('\n');
      inserted    = lines.map(l => tool.prefix + l).join('\n');
      cursorStart = start + tool.prefix.length;
      cursorEnd   = start + inserted.length;
    }

    onChange(value.slice(0, start) + inserted + value.slice(end));

    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(cursorStart, cursorEnd);
    });
  }

  const btnBase =
    'px-2 py-1 rounded text-xs font-mono leading-none transition-all text-slate-400 hover:text-white hover:bg-white/10';

  return (
    <div className="rounded-xl border border-white/8 bg-slate-900 overflow-hidden focus-within:border-indigo-500/60 transition-colors">

      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-white/5 flex-wrap">
        {TOOLS.map((tool, i) =>
          tool === 'sep'
            ? <span key={i} className="w-px h-4 bg-white/10 mx-0.5 shrink-0" />
            : (
              <button
                key={tool.label}
                type="button"
                title={tool.title}
                onClick={() => apply(tool)}
                className={
                  btnBase +
                  (tool.label === 'B'  ? ' font-bold'   : '') +
                  (tool.label === 'I'  ? ' italic'       : '') +
                  (tool.label === '`' || tool.label === '```' ? ' text-indigo-300 hover:text-indigo-200' : '')
                }
              >
                {tool.label}
              </button>
            )
        )}
      </div>

      {/* Textarea */}
      <textarea
        ref={ref}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full bg-transparent px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none resize-none"
      />

      {/* Collapsible reference */}
      <div className="border-t border-white/5">
        <button
          type="button"
          onClick={() => setShowRef(v => !v)}
          className="w-full flex items-center justify-between px-4 py-2 text-xs text-slate-600 hover:text-slate-400 transition-colors select-none"
        >
          <span>Markdown reference</span>
          <svg
            className={`w-3 h-3 transition-transform ${showRef ? 'rotate-180' : ''}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showRef && (
          <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {REFERENCE.map(({ syntax, desc }) => (
              <div key={syntax} className="flex items-start gap-2.5">
                <code className="text-indigo-300 text-xs font-mono shrink-0 bg-indigo-500/10 px-1.5 py-0.5 rounded whitespace-nowrap">
                  {syntax}
                </code>
                <span className="text-slate-500 text-xs leading-relaxed">{desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
