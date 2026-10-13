// electron/browserSnapshot.js
// ─── What the agent sees of a page, and which actions need a yes ─────────────
// Pure functions (no Electron imports), tested in browserSnapshot.test.js.
//
// formatSnapshot turns Chrome's accessibility tree (Accessibility.getFullAXTree,
// one per frame) into a compact outline the model can read:
//
//   [e3] heading "Sign in" level=1
//   [e4] textbox "Email" value="ann@example.com" required
//   [e5] textbox "Password" password
//   [e6] button "Continue"
//   text "New here?"
//   [e7] link "Create an account" → /signup
//
// Elements get refs (e3…) that the agent passes back to click or type; each
// ref maps to the element's backend DOM node id in its frame.
//
// classifyTarget decides from the element itself (not page JavaScript)
// whether an action needs the user's approval: typing a password, card
// number or one-time code, choosing a file, and buy/delete/send-like buttons.

// Roles that can be acted on: they always get a ref.
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider',
  'spinbutton', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab', 'treeitem',
  'listbox', 'DisclosureTriangle', 'scrollbar', 'gridcell', 'columnheader', 'rowheader', 'textarea',
  'ToggleButton', 'PopUpButton', 'MenuListOption', 'colorwell', 'Date', 'DateTime', 'InputTime',
]);
// Roles worth a ref because the agent may want to scroll to or point at them.
const POINTABLE_ROLES = new Set(['heading', 'img', 'image', 'listitem', 'row', 'cell', 'figure', 'article']);
// Containers shown as a line when they carry meaning; children are indented.
const STRUCTURE_ROLES = new Set([
  'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'form', 'search', 'region',
  'dialog', 'alertdialog', 'alert', 'status', 'menu', 'menubar', 'tablist', 'tabpanel', 'toolbar',
  'list', 'listitem', 'table', 'grid', 'treegrid', 'tree', 'row', 'rowgroup', 'radiogroup', 'figure',
  'article', 'group', 'heading', 'Iframe', 'iframe', 'log', 'marquee', 'timer', 'feed', 'note', 'tooltip',
  'DescriptionList', 'term', 'definition', 'blockquote', 'code', 'Pre', 'math',
]);
// Never shown; their text is already in the parent.
const SKIP_ROLES = new Set(['InlineTextBox', 'LineBreak', 'ListMarker']);
// A <select>'s options: listed (up to a point) so the agent knows the choices,
// without refs: choose them with preview_select_option on the list itself.
const MAX_SELECT_OPTIONS = 25;
// Containers that only matter when they have a name.
const NAMED_ONLY = new Set(['group', 'region', 'form', 'list', 'rowgroup', 'figure', 'article', 'note']);
// Roles shown as plain text containers; a ref is useful when a page makes a
// plain <div> clickable.
const TRANSPARENT_ROLES = new Set(['generic', 'none', 'presentation', 'paragraph', 'Section', 'LabelText', 'Abbr', 'Ruby', 'time', 'emphasis', 'strong', 'subscript', 'superscript', 'mark', 'insertion', 'deletion', 'Legend', 'caption', 'Details', 'Canvas', 'Unknown']);
const TEXT_ROLES = new Set(['StaticText', 'text']);

const MAX_NAME = 160;
const MAX_TEXT = 300;
const MAX_VALUE = 120;

function clip(text, max) {
  const value = String(text ?? '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function quote(text) {
  return `"${String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function prop(node, name) {
  const found = (node.properties || []).find((entry) => entry.name === name);
  return found ? found.value?.value : undefined;
}

function roleOf(node) {
  return String(node.role?.value || '');
}

function shortUrl(href, pageUrl) {
  if (!href) return '';
  try {
    const target = new URL(href);
    const page = pageUrl ? new URL(pageUrl) : null;
    if (page && target.origin === page.origin) return `${target.pathname}${target.search}${target.hash}` || '/';
    return clip(target.href, 120);
  } catch {
    return clip(href, 120);
  }
}

function stateWords(node, role, extra = {}) {
  const words = [];
  const level = prop(node, 'level');
  if (role === 'heading' && level) words.push(`level=${level}`);
  const checked = prop(node, 'checked');
  if (checked === 'true' || checked === true) words.push('checked');
  else if (checked === 'mixed') words.push('mixed');
  else if (checked === 'false' || checked === false) {
    if (['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role)) words.push('unchecked');
  }
  const pressed = prop(node, 'pressed');
  if (pressed === 'true' || pressed === true) words.push('pressed');
  const selected = prop(node, 'selected');
  if (selected === true || selected === 'true') words.push('selected');
  const expanded = prop(node, 'expanded');
  if (expanded === true || expanded === 'true') words.push('expanded');
  else if (expanded === false || expanded === 'false') words.push('collapsed');
  if (prop(node, 'disabled') === true || prop(node, 'disabled') === 'true') words.push('disabled');
  if (prop(node, 'required') === true || prop(node, 'required') === 'true') words.push('required');
  if (prop(node, 'readonly') === true || prop(node, 'readonly') === 'true') {
    if (['textbox', 'searchbox', 'combobox', 'textarea', 'spinbutton'].includes(role)) words.push('readonly');
  }
  if (prop(node, 'focused') === true) words.push('focused');
  if (prop(node, 'invalid') && prop(node, 'invalid') !== 'false') words.push('invalid');
  const haspopup = prop(node, 'hasPopup');
  if (haspopup && haspopup !== 'false' && role !== 'combobox') words.push(`haspopup=${haspopup}`);
  if (['slider', 'spinbutton', 'progressbar', 'scrollbar'].includes(role)) {
    const min = prop(node, 'valuemin');
    const max = prop(node, 'valuemax');
    if (min !== undefined && max !== undefined) words.push(`range=${min}..${max}`);
  }
  if (extra.password) words.push('password');
  if (extra.file) words.push('file');
  return words;
}

/**
 * Turn per-frame accessibility trees into outline lines.
 *
 * root:  { key, sessionId, frameId, url, nodes, children: Map<axNodeId, frame> }
 *        where children maps an Iframe node in this frame to the frame inside it.
 * opts.refFor(frame, node) → 'e12' — gives (and remembers) a ref for a node.
 * opts.fieldInfo(frame, node) → { password, file } for text fields / inputs.
 *
 * Returns { lines: string[], refCount }.
 */
export function formatSnapshot(root, { refFor, fieldInfo = () => ({}) } = {}) {
  const lines = [];
  let refCount = 0;
  const giveRef = (frame, node) => {
    if (!refFor || !node.backendDOMNodeId) return '';
    const ref = refFor(frame, node);
    if (!ref) return '';
    refCount += 1;
    return `[${ref}] `;
  };

  const emit = (depth, text) => lines.push(`${'  '.repeat(Math.min(depth, 12))}${text}`);

  const walkFrame = (frame, depth) => {
    const byId = new Map();
    for (const node of frame.nodes || []) byId.set(String(node.nodeId), node);
    const rootNode = (frame.nodes || []).find((node) => !node.parentId) || frame.nodes?.[0];
    if (!rootNode) return;
    const seen = new Set();

    // Text pieces waiting to be written as one line, so "Read the" + "docs"
    // + "first" inside one paragraph does not become three lines.
    let pending = null;
    const flush = () => {
      if (!pending) return;
      const text = clip(pending.parts.join(' '), MAX_TEXT);
      if (text) emit(pending.depth, `${pending.ref}text ${quote(text)}`);
      pending = null;
    };
    const addText = (depth, text, ref = '') => {
      const value = String(text || '').replace(/\s+/g, ' ').trim();
      if (!value) return;
      if (pending && pending.depth === depth && !ref && !pending.ref) {
        pending.parts.push(value);
        return;
      }
      flush();
      pending = { depth, parts: [value], ref };
    };

    const walk = (id, depth, parentName, parentRole, noRef = false) => {
      const node = byId.get(String(id));
      if (!node || seen.has(node.nodeId)) return;
      seen.add(node.nodeId);
      const role = roleOf(node);
      const children = (node.childIds || []).map(String);

      if (SKIP_ROLES.has(role)) return;
      if (node.ignored || role === 'RootWebArea' || role === 'WebArea') {
        for (const child of children) walk(child, depth, parentName, parentRole, noRef);
        return;
      }

      if (role === 'MenuListPopup') {
        flush();
        for (const child of children.slice(0, MAX_SELECT_OPTIONS)) walk(child, depth, '', role, true);
        if (children.length > MAX_SELECT_OPTIONS) emit(depth, `… ${children.length - MAX_SELECT_OPTIONS} more options`);
        return;
      }

      const name = clip(node.name?.value, MAX_NAME);

      if (TEXT_ROLES.has(role)) {
        // A button's label is already in its name.
        if (name && parentName && parentName.includes(name)) return;
        const pointable = !noRef && (parentRole === 'generic' || parentRole === 'none');
        if (pointable && node.backendDOMNodeId) {
          flush();
          addText(depth, node.name?.value, giveRef(frame, node));
          flush();
        } else {
          addText(depth, node.name?.value);
        }
        return;
      }

      if (role === 'Iframe' || role === 'iframe') {
        flush();
        const child = frame.children?.get(String(node.nodeId));
        emit(depth, `${giveRef(frame, node)}iframe${name ? ` ${quote(name)}` : ''}${child?.url ? ` → ${shortUrl(child.url)}` : ''}`);
        if (child) walkFrame(child, depth + 1);
        return;
      }

      const interactive = INTERACTIVE_ROLES.has(role) || prop(node, 'focusable') === true && !TRANSPARENT_ROLES.has(role) && role !== 'RootWebArea';
      const structural = STRUCTURE_ROLES.has(role) && !(NAMED_ONLY.has(role) && !name);
      const pointable = POINTABLE_ROLES.has(role) && (name || role === 'listitem' || role === 'row' || role === 'cell');
      const shown = interactive || structural || pointable
        || (role === 'img' && name) || (role === 'image' && name)
        || (!TRANSPARENT_ROLES.has(role) && name && !TEXT_ROLES.has(role));

      if (!shown) {
        for (const child of children) walk(child, depth, parentName, role, noRef);
        return;
      }

      flush();
      const info = (['textbox', 'searchbox', 'textarea', 'combobox', 'spinbutton', 'button'].includes(role) ? fieldInfo(frame, node) : null) || {};
      const ref = !noRef && (interactive || pointable || role === 'img' || role === 'image') ? giveRef(frame, node) : '';
      const parts = [`${ref}${role}`];
      if (name) parts.push(quote(name));
      const rawValue = node.value?.value;
      if (rawValue !== undefined && rawValue !== null && rawValue !== '' && !info.password && !info.file
        && !['button', 'link', 'heading', 'img', 'image', 'listitem', 'row', 'cell'].includes(role)) {
        const value = clip(rawValue, MAX_VALUE);
        if (value && value !== name) parts.push(`value=${quote(value)}`);
      }
      parts.push(...stateWords(node, role, info));
      if (role === 'link') {
        const href = shortUrl(prop(node, 'url'), frame.url);
        if (href) parts.push(`→ ${href}`);
      }
      emit(depth, parts.join(' '));

      // Inside a named interactive element the children are its label.
      const childDepth = depth + 1;
      for (const child of children) walk(child, childDepth, name || parentName, role, noRef);
      flush();
    };

    walk(rootNode.nodeId, depth, '', '');
    flush();
  };

  walkFrame(root, 0);
  // Drop runs of identical lines (repeated icons, separators).
  const compact = [];
  for (const line of lines) {
    if (compact.length && compact[compact.length - 1] === line && !/\[e\d+\]/.test(line)) continue;
    compact.push(line);
  }
  return { lines: compact, refCount };
}

/**
 * One page of outline lines: at most `limit` lines and `maxChars` characters,
 * starting at line `offset`.
 */
export function pageLines(lines, { offset = 0, limit = 400, maxChars = 12000 } = {}) {
  const total = lines.length;
  const start = Math.max(0, Math.min(Number(offset) || 0, total));
  const max = Math.max(1, Math.min(Number(limit) || 400, 2000));
  const out = [];
  let chars = 0;
  let index = start;
  for (; index < total && out.length < max; index++) {
    const line = lines[index];
    if (out.length > 0 && chars + line.length + 1 > maxChars) break;
    out.push(line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line);
    chars += line.length + 1;
  }
  const truncated = index < total;
  return {
    text: out.join('\n'),
    offset: start,
    nextOffset: truncated ? index : null,
    totalLines: total,
    truncated,
  };
}

/** One page of plain text, cut at a line break where possible. */
export function pageText(text, { offset = 0, limit = 12000 } = {}) {
  const value = String(text || '');
  const total = value.length;
  const start = Math.max(0, Math.min(Number(offset) || 0, total));
  const max = Math.max(200, Math.min(Number(limit) || 12000, 40000));
  let end = Math.min(total, start + max);
  if (end < total) {
    const lineBreak = value.lastIndexOf('\n', end);
    if (lineBreak > start + max * 0.6) end = lineBreak + 1;
  }
  return {
    text: value.slice(start, end),
    offset: start,
    nextOffset: end < total ? end : null,
    totalChars: total,
    truncated: end < total,
  };
}

// ─── Safety ───────────────────────────────────────────────────────────────────

function attributeMap(attributes) {
  if (!attributes) return {};
  if (!Array.isArray(attributes)) return { ...attributes };
  const map = {};
  for (let i = 0; i + 1 < attributes.length; i += 2) map[String(attributes[i]).toLowerCase()] = String(attributes[i + 1]);
  return map;
}

const PURCHASE_RE = /\b(buy|purchase|pay|payment|place (?:your |my )?order|order now|submit order|check ?out|complete (?:your )?(?:order|purchase|payment|booking)|confirm (?:and pay|order|purchase|payment|booking)|subscribe|upgrade|donate|book now|reserve now|start (?:free )?trial|add (?:a )?(?:card|payment method))\b/i;
const DELETE_RE = /\b(delete|remove|erase|destroy|deactivate|close (?:my |your )?account|cancel (?:my |your )?(?:subscription|plan|membership|order|account)|unsubscribe|discard|wipe|revoke|empty trash|permanently)\b/i;
const SEND_RE = /\b(send|post|publish|submit|tweet|share|transfer|withdraw|authori[sz]e|grant access|approve|merge|deploy|sign (?:and|&) send|reply all)\b/i;
const PAYMENT_FIELD_RE = /\b(card ?number|cardnumber|cc-?num(?:ber)?|ccnum|credit ?card|debit ?card|cvc|cvv|csc|cvn|security code|card ?code|expir(?:y|ation)|exp(?:iry)? ?date|iban|account ?number|routing ?number|sort ?code)\b/i;
const OTP_FIELD_RE = /\b(otp|one[- ]?time|2fa|two[- ]factor|totp|mfa|verification ?code|auth(?:entication)? ?code|security ?code from|passcode|sms ?code|enter (?:the )?code)\b/i;

function fieldWords(attrs, name) {
  return [attrs.name, attrs.id, attrs['aria-label'], attrs.placeholder, attrs['data-testid'], name]
    .filter(Boolean).join(' ').replace(/[_-]+/g, ' ');
}

/**
 * Decide whether an action on an element needs the user's approval.
 *
 * target: { action: 'click'|'type'|'select'|'key', role, name, nodeName,
 *           attributes (CDP flat array or object), formHasPayment }
 * Returns null, or { kind, label } where kind is one of password, payment,
 * one-time-code, file, purchase, delete, send.
 */
export function classifyTarget(target = {}) {
  const action = target.action || 'click';
  const attrs = attributeMap(target.attributes);
  const tag = String(target.nodeName || '').toUpperCase();
  const type = String(attrs.type || '').toLowerCase();
  const autocomplete = String(attrs.autocomplete || '').toLowerCase();
  const role = String(target.role || '');
  const name = clip(target.name || attrs['aria-label'] || attrs.value || attrs.title || '', 80);
  const words = fieldWords(attrs, target.name);

  if (tag === 'INPUT' && type === 'file') return { kind: 'file', label: name || 'file upload' };

  if (action === 'type') {
    if (type === 'password' || /\b(current|new)-password\b/.test(autocomplete)) return { kind: 'password', label: name || 'password' };
    if (/\bcc-/.test(autocomplete) || PAYMENT_FIELD_RE.test(words)) return { kind: 'payment', label: name || 'card details' };
    if (/\bone-time-code\b/.test(autocomplete) || OTP_FIELD_RE.test(words)) return { kind: 'one-time-code', label: name || 'one-time code' };
    return null;
  }

  // Enter in a field of a card form submits the payment.
  if (action === 'key' && tag === 'INPUT' && !['submit', 'button', 'image', 'reset', 'checkbox', 'radio', 'file'].includes(type) && target.formHasPayment) {
    return { kind: 'purchase', label: 'submit the payment form' };
  }

  if (action === 'click' || action === 'key') {
    const clickable = ['button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab', 'gridcell', 'cell', 'row', 'listitem', 'StaticText', 'generic', 'img', 'image', 'ToggleButton', 'PopUpButton'].includes(role)
      || ['BUTTON', 'A', 'INPUT', 'SUMMARY', 'DIV', 'SPAN', 'LI', 'TD', 'IMG', 'svg'].includes(tag);
    if (!clickable) return null;
    if (tag === 'INPUT' && !['submit', 'button', 'image', 'reset'].includes(type)) return null;
    if (name && name.length <= 80) {
      if (PURCHASE_RE.test(name)) return { kind: 'purchase', label: name };
      if (DELETE_RE.test(name)) return { kind: 'delete', label: name };
      if (SEND_RE.test(name)) return { kind: 'send', label: name };
    }
    const isSubmit = (tag === 'BUTTON' && (type === '' || type === 'submit')) || (tag === 'INPUT' && (type === 'submit' || type === 'image'));
    if (isSubmit && target.formHasPayment) return { kind: 'purchase', label: name || 'submit' };
  }
  return null;
}

/** A plain sentence for the approval card. */
export function describeSensitiveAction(classification, { host = '', action = 'click' } = {}) {
  if (!classification) return '';
  const where = host ? ` on ${host}` : '';
  const label = classification.label ? `“${classification.label}”` : 'this button';
  switch (classification.kind) {
    case 'password': return `Type into the password field${where}`;
    case 'payment': return `Type card or bank details${where}`;
    case 'one-time-code': return `Type a one-time sign-in code${where}`;
    case 'file': return `Open a file picker${where} to upload a file`;
    case 'purchase':
      if (classification.label === 'submit the payment form') return `Submit the payment form${where}: this may buy something or make a payment`;
      return `${action === 'key' ? 'Press' : 'Click'} ${label}${where}: this may buy something or make a payment`;
    case 'delete': return `${action === 'key' ? 'Press' : 'Click'} ${label}${where}: this may delete or cancel something`;
    case 'send': return `${action === 'key' ? 'Press' : 'Click'} ${label}${where}: this may send, post or approve something`;
    default: return `${action === 'key' ? 'Press' : 'Click'} ${label}${where}`;
  }
}

/** Stable key so an approval covers this exact action and nothing else. */
export function approvalKey(classification, { backendNodeId, host = '' } = {}) {
  if (!classification) return null;
  return `${classification.kind}:${backendNodeId ?? '?'}:${host}`;
}
