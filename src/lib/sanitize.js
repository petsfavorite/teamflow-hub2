import DOMPurify from 'dompurify';

// Sanitize rich-text HTML (from react-quill) for safe display via dangerouslySetInnerHTML
export function sanitizeHtml(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'sub', 'sup',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'a', 'img', 'video', 'source',
      'blockquote', 'pre', 'code',
      'hr', 'div', 'span',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ],
    ALLOWED_ATTR: [
      'href', 'src', 'alt', 'title', 'width', 'height', 'style', 'class',
      'target', 'rel', 'controls', 'colspan', 'rowspan', 'data-*',
    ],
    ALLOW_DATA_ATTR: true,
  });
}

// Escape HTML entities for safe interpolation into HTML strings (print windows, etc.)
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Validate a URL is http(s) scheme — prevents javascript: URLs
export function isSafeUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// Sanitize free-form text for use in email subjects/bodies (strip markup, cap length)
export function sanitizeForEmail(str, maxLen = 200) {
  if (!str) return '';
  return String(str).replace(/[\r\n\t<>]/g, ' ').substring(0, maxLen).trim();
}