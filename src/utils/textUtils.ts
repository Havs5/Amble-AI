// Remove markdown symbols to get plain text
export function stripMarkdown(text: string): string {
  // Remove bold/italic (** or __ or * or _)
  let clean = text.replace(/(\*\*|__)(.*?)\1/g, '$2');
  clean = clean.replace(/(\*|_)(.*?)\1/g, '$2');
  
  // Remove code blocks
  clean = clean.replace(/```[\s\S]*?```/g, '');
  clean = clean.replace(/`([^`]+)`/g, '$1');
  
  // Remove headers
  clean = clean.replace(/^#+\s+/gm, '');
  
  // Remove lists symbols
  clean = clean.replace(/^\s*[-*+]\s+/gm, '');
  
  // Remove links [text](url) -> text
  clean = clean.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  
  return clean;
}

// Convert Markdown to basic HTML for clipboard (Rich Text)
export function markdownToHtml(text: string): string {
    let html = text
        // Escape HTML characters first
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        // Bold
        .replace(/(\*\*|__)(.*?)\1/g, '<strong>$2</strong>')
        // Italic
        .replace(/(\*|_)(.*?)\1/g, '<em>$2</em>')
        // Headers
        .replace(/^### (.*$)/gm, '<h3>$1</h3>')
        .replace(/^## (.*$)/gm, '<h2>$1</h2>')
        .replace(/^# (.*$)/gm, '<h1>$1</h1>')
        // Lists (Simple conversion)
        .replace(/^\s*-\s+(.*$)/gm, '<li>$1</li>')
        // Line breaks
        .replace(/\n/g, '<br>');

    // Wrap lists in ul if necessary (simplified)
    if (html.includes('<li>')) {
       html = html.replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>');
    }

    return html;
}
