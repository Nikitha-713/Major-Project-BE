// Notes are stored as TipTap/ProseMirror JSON. Whatever the browser sends is rebuilt here from an
// allow-list, so unknown node types, attributes and marks can never be saved. Because the portal
// renders this JSON with React (never as raw HTML), a note can not carry a script to the client.
const BLOCKS = new Set([
  'doc', 'paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem',
  'codeBlock', 'horizontalRule', 'hardBreak',
]);
const MARKS = new Set(['bold', 'italic', 'strike', 'code']);

const MAX_DEPTH = 12;
const MAX_NODES = 5000;
const MAX_CHARS = 20000; // per section

const bad = (message) => Object.assign(new Error(message), { status: 400 });

function cleanMarks(marks) {
  if (marks === undefined) return [];
  if (!Array.isArray(marks)) throw bad('Invalid note content');
  const out = [];
  for (const m of marks) {
    if (!m || typeof m !== 'object' || !MARKS.has(m.type)) throw bad('Invalid note content');
    if (!out.some((x) => x.type === m.type)) out.push({ type: m.type });
  }
  return out;
}

function cleanNode(node, state, depth) {
  if (!node || typeof node !== 'object' || Array.isArray(node)) throw bad('Invalid note content');
  if (depth > MAX_DEPTH) throw bad('Note content is nested too deeply');
  if (++state.nodes > MAX_NODES) throw bad('This note is too large');

  if (node.type === 'text') {
    if (typeof node.text !== 'string') throw bad('Invalid note content');
    state.plain += node.text;
    if (state.plain.length > MAX_CHARS) throw bad(`A note section can hold up to ${MAX_CHARS} characters`);
    const out = { type: 'text', text: node.text };
    const marks = cleanMarks(node.marks);
    if (marks.length) out.marks = marks;
    return out;
  }

  if (!BLOCKS.has(node.type)) throw bad('Invalid note content');
  const out = { type: node.type };
  if (node.type === 'heading') {
    const level = node.attrs && node.attrs.level;
    out.attrs = { level: [1, 2, 3].includes(level) ? level : 2 };
  }
  if (node.content !== undefined) {
    if (!Array.isArray(node.content)) throw bad('Invalid note content');
    out.content = node.content.map((child) => cleanNode(child, state, depth + 1));
  }
  return out;
}

// Returns { doc, isEmpty }. Throws an error with status 400 for anything not on the allow-list.
function sanitizeDoc(input) {
  if (!input || typeof input !== 'object' || input.type !== 'doc') throw bad('Invalid note content');
  const state = { nodes: 0, plain: '' };
  const doc = cleanNode(input, state, 0);
  if (!doc.content) doc.content = [{ type: 'paragraph' }];
  return { doc, isEmpty: state.plain.trim().length === 0 };
}

const emptyDoc = () => ({ type: 'doc', content: [{ type: 'paragraph' }] });

module.exports = { sanitizeDoc, emptyDoc };
