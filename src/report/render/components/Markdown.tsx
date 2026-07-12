// Markdown prose (§3.3: "markdown renders as markdown"). A small, safe block+inline renderer —
// headings, paragraphs, unordered/ordered lists, blockquotes, horizontal rules; inline bold /
// italic / code / links. It builds React elements (never `dangerouslySetInnerHTML`), so author
// prose can contribute no markup or script. A full CommonMark parser is a deferred enrichment;
// this covers report prose. Pure aside from producing elements.
import type { ReactNode } from 'react';

// --- inline: **bold**, *italic*, `code`, [text](url) ------------------------------
function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const key = `${keyBase}-${i++}`;
    if (m[2] !== undefined) out.push(<strong key={key}>{m[2]}</strong>);
    else if (m[4] !== undefined) out.push(<em key={key}>{m[4]}</em>);
    else if (m[6] !== undefined) out.push(<code key={key}>{m[6]}</code>);
    else if (m[8] !== undefined) {
      const href = m[9];
      const safe = /^(https?:|mailto:|#|\/)/i.test(href) ? href : '#';
      out.push(
        <a key={key} href={safe} rel="noreferrer noopener" target="_blank">
          {m[8]}
        </a>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// --- block: split on blank lines, classify each block ------------------------------
function blocks(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const Tag = `h${level}` as keyof React.JSX.IntrinsicElements;
      out.push(<Tag key={key++}>{inline(heading[2], `h${key}`)}</Tag>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(<hr key={key++} />);
      i++;
      continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(
        <ul key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `ul${key}-${j}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push(
        <ol key={key++}>
          {items.map((it, j) => (
            <li key={j}>{inline(it, `ol${key}-${j}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }
    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^\s*>\s?/, ''));
      out.push(
        <blockquote key={key++}>{inline(quote.join(' '), `bq${key}`)}</blockquote>,
      );
      continue;
    }
    // paragraph: gather until a blank line or a block starter
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,6}\s|>\s?|\s*[-*]\s|\s*\d+\.\s|-{3,}|\*{3,}|_{3,})/.test(lines[i])) {
      para.push(lines[i++]);
    }
    out.push(<p key={key++}>{inline(para.join(' '), `p${key}`)}</p>);
  }
  return out;
}

export default function Markdown({ text }: { text: string }) {
  return <div className="rk-prose">{blocks(text)}</div>;
}
