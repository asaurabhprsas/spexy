import React, { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Clock, ShieldCheck, Tag } from 'lucide-react';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export interface FrontmatterData {
  status?: string;
  updated_at?: string;
  approved_by?: string | null;
  extra: Record<string, string>;
}

export function extractFrontmatter(rawContent: string): { frontmatter: FrontmatterData | null; body: string } {
  const match = rawContent.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return { frontmatter: null, body: rawContent };
  }

  const rawYaml = match[1];
  const body = rawContent.slice(match[0].length);

  const lines = rawYaml.split(/\r?\n/);
  const data: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex !== -1) {
      const key = trimmed.slice(0, colonIndex).trim();
      let val = trimmed.slice(colonIndex + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      data[key] = val;
    }
  }

  const status = data.status || undefined;
  const updated_at = data.updated_at || data.updatedAt || undefined;
  const approved_by = data.approved_by !== undefined ? data.approved_by : data.approvedBy !== undefined ? data.approvedBy : undefined;

  const extra: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) {
    if (!['status', 'updated_at', 'updatedAt', 'approved_by', 'approvedBy'].includes(k)) {
      extra[k] = v;
    }
  }

  return {
    frontmatter: {
      status,
      updated_at,
      approved_by,
      extra,
    },
    body,
  };
}

// Inline token parser for bold, italic, code, and links
function renderInlineContent(text: string): React.ReactNode[] {
  // Regex pattern matching:
  // 1. `code`
  // 2. **bold**
  // 3. *italic*
  // 4. [text](url)
  const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;
  const parts = text.split(regex);

  return parts.map((part, index) => {
    if (!part) return null;

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={index}
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-[12px] text-primary border border-border/50"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={index} className="font-semibold text-foreground">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={index} className="italic text-foreground/90">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Link
    const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      const [, linkText, rawHref] = linkMatch;
      const cleanHref = (rawHref || '').trim();
      const isSafe = /^(https?:\/\/|\/|#|mailto:)/i.test(cleanHref);
      const safeHref = isSafe ? cleanHref : '#';
      const isExternal = safeHref.startsWith('http');
      return (
        <a
          key={index}
          href={safeHref}
          target={isExternal ? "_blank" : undefined}
          rel={isExternal ? "noopener noreferrer" : undefined}
          className="text-primary underline hover:text-primary/80 transition-colors"
        >
          {linkText}
        </a>
      );
    }

    return <span key={index}>{part}</span>;
  });
}

type Block =
  | { type: 'heading'; level: number; text: string }
  | { type: 'code'; lang: string; code: string }
  | { type: 'blockquote'; lines: string[] }
  | { type: 'hr' }
  | { type: 'list'; ordered: boolean; items: string[] }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'paragraph'; text: string };

function parseMarkdownBlocks(raw: string): Block[] {
  const lines = raw.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Empty lines
    if (!trimmed) {
      i++;
      continue;
    }

    // Horizontal Rule
    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      blocks.push({ type: 'hr' });
      i++;
      continue;
    }

    // Code Block
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      blocks.push({ type: 'heading', level, text });
      i++;
      continue;
    }

    // Blockquote
    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i++;
      }
      blocks.push({ type: 'blockquote', lines: quoteLines });
      continue;
    }

    // Table detection: line contains '|'
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && i + 1 < lines.length && lines[i + 1].includes('---')) {
      const headerLine = trimmed;
      const headers = headerLine
        .slice(1, -1)
        .split('|')
        .map((h) => h.trim());
      i += 2; // skip header and separator line
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const rowLine = lines[i].trim();
        const cells = rowLine
          .slice(1, -1)
          .split('|')
          .map((c) => c.trim());
        rows.push(cells);
        i++;
      }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    // Unordered List (- or *)
    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: false, items });
      continue;
    }

    // Ordered List (1. )
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i++;
      }
      blocks.push({ type: 'list', ordered: true, items });
      continue;
    }

    // Regular Paragraph - merge consecutive text lines
    const pLines: string[] = [trimmed];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('```') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('|') &&
      !/^[-*+]\s+/.test(lines[i].trim()) &&
      !/^\d+\.\s+/.test(lines[i].trim()) &&
      !/^(---|___|\*\*\*)$/.test(lines[i].trim())
    ) {
      pLines.push(lines[i].trim());
      i++;
    }
    blocks.push({ type: 'paragraph', text: pLines.join(' ') });
  }

  return blocks;
}

export function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const { frontmatter, body } = useMemo(() => extractFrontmatter(content), [content]);
  const blocks = useMemo(() => parseMarkdownBlocks(body), [body]);

  const formattedDate = useMemo(() => {
    if (!frontmatter?.updated_at) return null;
    try {
      const d = new Date(frontmatter.updated_at);
      if (isNaN(d.getTime())) return frontmatter.updated_at;
      return d.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return frontmatter.updated_at;
    }
  }, [frontmatter?.updated_at]);

  const isApproved = Boolean(
    frontmatter?.approved_by &&
      frontmatter.approved_by !== 'null' &&
      frontmatter.approved_by !== 'None' &&
      frontmatter.approved_by !== ''
  );

  return (
    <div className={`prose dark:prose-invert max-w-none text-sm leading-relaxed ${className}`}>
      {/* Frontmatter Metadata Card */}
      {frontmatter && (
        <div className="not-prose mb-6 rounded-xl border border-border/80 bg-card/80 p-4 shadow-xs backdrop-blur-sm space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Document Metadata
              </span>

              {frontmatter.status && (
                <Badge
                  variant="outline"
                  className={`font-mono text-[10px] uppercase tracking-wider ${
                    frontmatter.status === 'approved'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
                      : frontmatter.status === 'in-review'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                      : 'bg-primary/10 text-primary border-primary/20'
                  }`}
                >
                  {frontmatter.status}
                </Badge>
              )}

              {isApproved ? (
                <Badge
                  variant="outline"
                  className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 gap-1 font-mono text-[10px]"
                >
                  <ShieldCheck size={11} />
                  Approved by {frontmatter.approved_by}
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="bg-muted text-muted-foreground gap-1 font-mono text-[10px]"
                >
                  <Clock size={11} />
                  Pending Approval
                </Badge>
              )}
            </div>

            {formattedDate && (
              <div className="flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground">
                <Clock size={12} />
                <span>Updated: {formattedDate}</span>
              </div>
            )}
          </div>

          {/* Additional frontmatter keys as neat pills */}
          {Object.entries(frontmatter.extra).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/40">
              {Object.entries(frontmatter.extra).map(([k, v]) => (
                <span
                  key={k}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-muted/70 text-muted-foreground border border-border/50"
                >
                  <Tag size={10} className="text-primary opacity-70" />
                  <span className="font-semibold text-foreground/85">{k}:</span>
                  <span>{v}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="space-y-4">
      {blocks.map((block, idx) => {
        switch (block.type) {
          case 'heading': {
            const headingContent = renderInlineContent(block.text);
            switch (block.level) {
              case 1:
                return (
                  <h1
                    key={idx}
                    className="font-serif text-2xl font-bold tracking-tight border-b border-border/70 pb-2 mt-6 mb-3 text-foreground"
                  >
                    {headingContent}
                  </h1>
                );
              case 2:
                return (
                  <h2
                    key={idx}
                    className="font-serif text-xl font-semibold tracking-tight border-b border-border/50 pb-1.5 mt-5 mb-2.5 text-foreground"
                  >
                    {headingContent}
                  </h2>
                );
              case 3:
                return (
                  <h3 key={idx} className="font-serif text-base font-semibold tracking-tight mt-4 mb-2 text-foreground">
                    {headingContent}
                  </h3>
                );
              case 4:
              default:
                return (
                  <h4 key={idx} className="text-sm font-semibold tracking-tight mt-3 mb-1 text-foreground">
                    {headingContent}
                  </h4>
                );
            }
          }

          case 'hr':
            return <hr key={idx} className="my-5 border-border/60" />;

          case 'code':
            return (
              <div
                key={idx}
                className="my-3.5 rounded-lg border border-border/80 bg-zinc-950 text-zinc-100 overflow-hidden shadow-xs"
              >
                {block.lang && (
                  <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/90 px-3.5 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                    <span>{block.lang}</span>
                  </div>
                )}
                <pre className="p-3.5 font-mono text-xs overflow-x-auto leading-relaxed selection:bg-primary/30">
                  <code>{block.code}</code>
                </pre>
              </div>
            );

          case 'blockquote':
            return (
              <blockquote
                key={idx}
                className="my-3 border-l-4 border-primary/60 bg-muted/20 pl-4 py-2 italic text-muted-foreground rounded-r text-xs leading-relaxed"
              >
                {block.lines.map((l, lIdx) => (
                  <p key={lIdx} className="mb-1 last:mb-0">
                    {renderInlineContent(l)}
                  </p>
                ))}
              </blockquote>
            );

          case 'list': {
            const ListTag = block.ordered ? 'ol' : 'ul';
            const listClasses = block.ordered
              ? 'list-decimal list-inside space-y-1 my-2 pl-2 text-foreground/90'
              : 'list-disc list-inside space-y-1 my-2 pl-2 text-foreground/90';
            return (
              <ListTag key={idx} className={listClasses}>
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx} className="text-xs leading-relaxed">
                    {renderInlineContent(item)}
                  </li>
                ))}
              </ListTag>
            );
          }

          case 'table':
            return (
              <div key={idx} className="my-4 overflow-x-auto rounded-lg border border-border/70">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-muted/50 border-b border-border/70">
                    <tr>
                      {block.headers.map((h, hIdx) => (
                        <th key={hIdx} className="px-3.5 py-2 text-left font-semibold font-mono text-[11px] text-foreground">
                          {renderInlineContent(h)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {block.rows.map((row, rIdx) => (
                      <tr key={rIdx} className="hover:bg-muted/20 transition-colors">
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="px-3.5 py-2 text-foreground/90">
                            {renderInlineContent(cell)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );

          case 'paragraph':
          default:
            return (
              <p key={idx} className="text-xs leading-relaxed text-foreground/90 mb-2.5">
                {renderInlineContent(block.text)}
              </p>
            );
        }
      })}
      </div>
    </div>
  );
}
