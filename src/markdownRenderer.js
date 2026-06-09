/**
 * Lightweight Markdown to HTML renderer.
 * Handles the subset of markdown used in SKILL.md files
 * without any external dependencies.
 */

/**
 * Convert markdown text to HTML.
 * @param {string} markdown
 * @returns {string}
 */
function renderMarkdown(markdown) {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const htmlParts = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Blank line
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Fenced code block (``` or ~~~)
    const codeMatch = line.match(/^(`{3,}|~{3,})\s*([\w-]*)/);
    if (codeMatch) {
      const fence = codeMatch[1];
      const lang = codeMatch[2] || '';
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith(fence)) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      const escaped = escapeHtml(codeLines.join('\n'));
      const langAttr = lang ? ` class="language-${lang}"` : '';
      htmlParts.push(`<pre><code${langAttr}>${escaped}</code></pre>`);
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = processInline(headingMatch[2]);
      htmlParts.push(`<h${level}>${text}</h${level}>`);
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      htmlParts.push('<hr>');
      i++;
      continue;
    }

    // Table
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-|:\s]+/.test(lines[i + 1])) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      htmlParts.push(renderTable(tableLines));
      continue;
    }

    // Blockquote
    if (line.startsWith('>')) {
      const quoteLines = [];
      while (i < lines.length && (lines[i].startsWith('>') || (lines[i].trim() !== '' && quoteLines.length > 0 && !lines[i].startsWith('#')))) {
        if (!lines[i].startsWith('>') && lines[i].trim() === '') break;
        quoteLines.push(lines[i].replace(/^>\s?/, ''));
        i++;
      }
      htmlParts.push(`<blockquote>${renderMarkdown(quoteLines.join('\n'))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s+/.test(line)) {
      const listResult = renderList(lines, i, 'ul');
      htmlParts.push(listResult.html);
      i = listResult.nextIndex;
      continue;
    }

    // Ordered list
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const listResult = renderList(lines, i, 'ol');
      htmlParts.push(listResult.html);
      i = listResult.nextIndex;
      continue;
    }

    // Paragraph — collect contiguous non-empty lines
    const paraLines = [];
    while (i < lines.length && lines[i].trim() !== '' && !isBlockStart(lines[i])) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      htmlParts.push(`<p>${processInline(paraLines.join('\n'))}</p>`);
    }
  }

  return htmlParts.join('\n');
}

/**
 * Check if a line starts a new block element.
 */
function isBlockStart(line) {
  if (/^#{1,6}\s/.test(line)) return true;
  if (/^(`{3,}|~{3,})/.test(line)) return true;
  if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return true;
  if (/^\s*[-*+]\s+/.test(line)) return true;
  if (/^\s*\d+[.)]\s+/.test(line)) return true;
  if (line.startsWith('>')) return true;
  if (line.includes('|') && line.trim().startsWith('|')) return true;
  return false;
}

/**
 * Render a markdown list (ul or ol).
 */
function renderList(lines, startIndex, tag) {
  const items = [];
  let i = startIndex;
  const pattern = tag === 'ul' ? /^(\s*)[-*+]\s+(.*)/ : /^(\s*)\d+[.)]\s+(.*)/;

  while (i < lines.length) {
    const match = lines[i].match(pattern);
    if (!match) {
      // Continuation line (indented text belonging to previous item)
      if (lines[i].trim() === '') {
        i++;
        continue;
      }
      if (/^\s{2,}/.test(lines[i]) && items.length > 0) {
        items[items.length - 1] += ' ' + lines[i].trim();
        i++;
        continue;
      }
      break;
    }
    items.push(match[2]);
    i++;
  }

  const listItems = items.map(item => `<li>${processInline(item)}</li>`).join('\n');
  return { html: `<${tag}>\n${listItems}\n</${tag}>`, nextIndex: i };
}

/**
 * Render a markdown table.
 */
function renderTable(tableLines) {
  if (tableLines.length < 2) return '';

  const parseRow = (line) => {
    return line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map(cell => cell.trim());
  };

  const headers = parseRow(tableLines[0]);
  // Skip separator line (index 1)
  const rows = tableLines.slice(2).map(parseRow);

  let html = '<table>\n<thead>\n<tr>\n';
  headers.forEach(h => { html += `<th>${processInline(h)}</th>\n`; });
  html += '</tr>\n</thead>\n<tbody>\n';
  rows.forEach(row => {
    html += '<tr>\n';
    row.forEach(cell => { html += `<td>${processInline(cell)}</td>\n`; });
    html += '</tr>\n';
  });
  html += '</tbody>\n</table>';

  return html;
}

/**
 * Process inline markdown formatting.
 */
function processInline(text) {
  if (!text) return '';

  // Escape HTML first
  text = escapeHtml(text);

  // Inline code (must be before other transforms)
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold + italic
  text = text.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');

  // Bold
  text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');

  // Italic
  text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
  text = text.replace(/_(.+?)_/g, '<em>$1</em>');

  // Strikethrough
  text = text.replace(/~~(.+?)~~/g, '<del>$1</del>');

  // Links [text](url)
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  // Auto-link bare URLs
  text = text.replace(/(?<!["=])(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>');

  // Line breaks
  text = text.replace(/\n/g, '<br>');

  return text;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

module.exports = { renderMarkdown, escapeHtml };
