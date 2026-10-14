// den/src/agent/headlessSnapshot.js
// ─── What the agent sees of a page in the headless browser ───────────────────
// Pure functions for headlessBrowser.js, the browser the agent uses when the
// desktop app isn't running. They give the same outline, paging and
// approval rules as the desktop app's browser (electron/browserSnapshot.js),
// so the browser tools read and behave the same either way:
//
//   [e3] heading "Sign in" level=1
//   [e4] textbox "Email" value="ann@example.com" required
//   [e5] textbox "Password" password
//   [e6] button "Continue"
//   [e7] link "Create an account" → /signup
//
// formatOutline reads Puppeteer's accessibility snapshot (interesting nodes
// only, frames included). classifyTarget follows the desktop app's rules
// (den/test/headlessBrowser.test.js checks they agree).

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'checkbox', 'radio', 'switch', 'slider',
  'spinbutton', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'tab', 'treeitem',
  'listbox', 'DisclosureTriangle', 'gridcell', 'columnheader', 'rowheader', 'textarea',
  'ToggleButton', 'PopUpButton', 'MenuListOption', 'colorwell', 'Date', 'DateTime', 'InputTime',
]);
const POINTABLE_ROLES = new Set(['heading', 'img', 'image', 'listitem', 'row', 'cell', 'figure', 'article']);
const STRUCTURE_ROLES = new Set([
  'navigation', 'main', 'banner', 'contentinfo', 'complementary', 'form', 'search', 'region',
  'dialog', 'alertdialog', 'alert', 'status', 'menu', 'menubar', 'tablist', 'tabpanel', 'toolbar',
  'list', 'listitem', 'table', 'grid', 'treegrid', 'tree', 'row', 'rowgroup', 'radiogroup', 'figure',
  'article', 'group', 'heading', 'log', 'marquee', 'timer', 'feed', 'note', 'tooltip',
  'DescriptionList', 'term', 'definition', 'blockquote', 'code', 'Pre', 'math',
]);
const NAMED_ONLY = new Set(['group', 'region', 'form', 'list', 'rowgroup', 'figure', 'article', 'note']);
const SKIP_ROLES = new Set(['InlineTextBox', 'LineBreak', 'ListMarker']);
const TEXT_ROLES = new Set(['StaticText', 'text']);
const TRANSPARENT_ROLES = new Set(['generic', 'none', 'presentation', 'paragraph', 'Section', 'LabelText', 'Abbr', 'Ruby', 'time', 'emphasis', 'strong', 'subscript', 'superscript', 'mark', 'insertion', 'deletion', 'Legend', 'caption', 'Details', 'Canvas', 'Unknown']);
const TEXT_FIELDS = new Set(['textbox', 'searchbox', 'textarea', 'combobox', 'spinbutton']);
const MAX_SELECT_OPTIONS = 25;
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

function shortUrl(href, pageUrl) {
  if (!href) return '';
  try {
    const target = new URL(href, pageUrl || undefined);
    const page = pageUrl ? new URL(pageUrl) : null;
    if (page && target.origin === page.origin) return `${target.pathname}${target.search}${target.hash}` || '/';
    return clip(target.href, 120);
  } catch {
    return clip(href, 120);
  }
}

function stateWords(node, role, field) {
  const words = [];
  if (role === 'heading' && node.level) words.push(`level=${node.level}`);
  if (node.checked === true) words.push('checked');
  else if (node.checked === 'mixed') words.push('mixed');
  else if (node.checked === false && ['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role)) words.push('unchecked');
  if (node.pressed === true) words.push('pressed');
  if (node.selected === true) words.push('selected');
  if (node.expanded === true) words.push('expanded');
  else if (node.expanded === false) words.push('collapsed');
  if (node.disabled) words.push('disabled');
  if (node.required) words.push('required');
  if (node.readonly && TEXT_FIELDS.has(role)) words.push('readonly');
  if (node.focused) words.push('focused');
  if (node.invalid && node.invalid !== 'false') words.push('invalid');
  if (node.haspopup && node.haspopup !== 'false' && role !== 'combobox') words.push(`haspopup=${node.haspopup}`);
  if (['slider', 'spinbutton', 'progressbar'].includes(role) && node.valuemin !== undefined && node.valuemax !== undefined) {
    words.push(`range=${node.valuemin}..${node.valuemax}`);
  }
  if (field.password) words.push('password');
  if (field.file) words.push('file');
  return words;
}

/**
 * Turn Puppeteer's accessibility snapshot into outline lines.
 *
 * opts.refFor(node) → 'e12' gives (and remembers) a ref for a node.
 * opts.attributesFor(node) → the element's attributes ({ href, type, … }),
 *   for links' addresses and password or file inputs.
 * opts.pageUrl shortens same-site links to their path.
 *
 * Returns { lines, refCount }.
 */
export function formatOutline(root, { refFor = () => '', attributesFor = () => ({}), pageUrl = '' } = {}) {
  const lines = [];
  let refCount = 0;
  const giveRef = (node) => {
    const ref = refFor(node);
    if (!ref) return '';
    refCount += 1;
    return `[${ref}] `;
  };
  const emit = (depth, text) => lines.push(`${'  '.repeat(Math.min(depth, 12))}${text}`);

  // Runs of text in one container become one line, with the ref of the first
  // piece (clicking it clicks the element holding the text).
  let pending = null;
  const flush = () => {
    if (!pending) return;
    const text = clip(pending.parts.join(' '), MAX_TEXT);
    if (text) emit(pending.depth, `${pending.ref}text ${quote(text)}`);
    pending = null;
  };
  const addText = (depth, node) => {
    const value = String(node.name || '').replace(/\s+/g, ' ').trim();
    if (!value) return;
    if (pending && pending.depth === depth) {
      pending.parts.push(value);
      return;
    }
    flush();
    pending = { depth, parts: [value], ref: giveRef(node) };
  };

  const walk = (node, depth, parentName, frameUrl) => {
    if (!node) return;
    const role = String(node.role || '');
    const children = Array.isArray(node.children) ? node.children : [];
    if (SKIP_ROLES.has(role)) return;

    if (role === 'RootWebArea' || role === 'WebArea') {
      for (const child of children) walk(child, depth, parentName, node.url || frameUrl);
      return;
    }

    const name = clip(node.name, MAX_NAME);

    if (TEXT_ROLES.has(role)) {
      // A button's or link's label is already in its name.
      if (name && parentName && parentName.includes(name)) return;
      addText(depth, node);
      return;
    }

    flush();

    if (role === 'Iframe' || role === 'iframe') {
      const inner = children.find((child) => child.role === 'RootWebArea');
      emit(depth, `${giveRef(node)}iframe${name ? ` ${quote(name)}` : ''}${inner?.url ? ` → ${shortUrl(inner.url)}` : ''}`);
      for (const child of children) walk(child, depth + 1, '', inner?.url || frameUrl);
      flush();
      return;
    }

    const interactive = INTERACTIVE_ROLES.has(role);
    const structural = STRUCTURE_ROLES.has(role) && !(NAMED_ONLY.has(role) && !name);
    const pointable = POINTABLE_ROLES.has(role) && (name || role === 'listitem' || role === 'row' || role === 'cell');
    const shown = interactive || structural || pointable || (!TRANSPARENT_ROLES.has(role) && name);
    if (!shown) {
      for (const child of children) walk(child, depth, parentName, frameUrl);
      flush();
      return;
    }

    const attrs = (TEXT_FIELDS.has(role) || role === 'button' || role === 'link') ? attributesFor(node) || {} : {};
    const type = String(attrs.type || '').toLowerCase();
    const field = { password: TEXT_FIELDS.has(role) && type === 'password', file: type === 'file' };
    const ref = interactive || pointable || role === 'img' || role === 'image' ? giveRef(node) : '';
    const parts = [`${ref}${role}`];
    if (name) parts.push(quote(name));
    const rawValue = node.value;
    if (rawValue !== undefined && rawValue !== null && rawValue !== '' && !field.password && !field.file
      && !['button', 'link', 'heading', 'img', 'image', 'listitem', 'row', 'cell'].includes(role)) {
      const value = clip(rawValue, MAX_VALUE);
      if (value && value !== name) parts.push(`value=${quote(value)}`);
    }
    parts.push(...stateWords(node, role, field));
    if (role === 'link') {
      const href = shortUrl(attrs.href, frameUrl || pageUrl);
      if (href) parts.push(`→ ${href}`);
    }
    emit(depth, parts.join(' '));

    // A drop-down list's options are listed (up to a point) without refs:
    // choose them with preview_select_option on the list itself.
    if (role === 'combobox' && children.some((child) => child.role === 'option' || child.role === 'MenuListOption')) {
      const options = children.filter((child) => child.role === 'option' || child.role === 'MenuListOption');
      for (const option of options.slice(0, MAX_SELECT_OPTIONS)) {
        emit(depth + 1, `option ${quote(clip(option.name, MAX_NAME))}${option.selected ? ' selected' : ''}`);
      }
      if (options.length > MAX_SELECT_OPTIONS) emit(depth + 1, `… ${options.length - MAX_SELECT_OPTIONS} more options`);
      return;
    }

    for (const child of children) walk(child, depth + 1, name || parentName, frameUrl);
    flush();
  };

  walk(root, 0, '', root?.url || pageUrl);
  flush();
  // Drop runs of identical lines (repeated icons, separators).
  const compact = [];
  for (const line of lines) {
    if (compact.length && compact[compact.length - 1] === line && !/\[e\d+\]/.test(line)) continue;
    compact.push(line);
  }
  return { lines: compact, refCount };
}

/** One page of outline lines: at most `limit` lines and `maxChars` characters. */
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
  return { text: out.join('\n'), offset: start, nextOffset: truncated ? index : null, totalLines: total, truncated };
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
  return { text: value.slice(start, end), offset: start, nextOffset: end < total ? end : null, totalChars: total, truncated: end < total };
}

// ─── Which actions need the user's yes ────────────────────────────────────────

const PURCHASE_RE = /\b(buy|purchase|pay|payment|place (?:your |my )?order|order now|submit order|check ?out|complete (?:your )?(?:order|purchase|payment|booking)|confirm (?:and pay|order|purchase|payment|booking)|subscribe|upgrade|donate|book now|reserve now|start (?:free )?trial|add (?:a )?(?:card|payment method))\b/i;
const DELETE_RE = /\b(delete|remove|erase|destroy|deactivate|close (?:my |your )?account|cancel (?:my |your )?(?:subscription|plan|membership|order|account)|unsubscribe|discard|wipe|revoke|empty trash|permanently)\b/i;
const SEND_RE = /\b(send|post|publish|submit|tweet|share|transfer|withdraw|authori[sz]e|grant access|approve|merge|deploy|sign (?:and|&) send|reply all)\b/i;
const PAYMENT_FIELD_RE = /\b(card ?number|cardnumber|cc-?num(?:ber)?|ccnum|credit ?card|debit ?card|cvc|cvv|csc|cvn|security code|card ?code|expir(?:y|ation)|exp(?:iry)? ?date|iban|account ?number|routing ?number|sort ?code)\b/i;
// For the in-page check of whether a form takes card details.
export const PAYMENT_FIELD_PATTERN = PAYMENT_FIELD_RE.source;
const OTP_FIELD_RE = /\b(otp|one[- ]?time|2fa|two[- ]factor|totp|mfa|verification ?code|auth(?:entication)? ?code|security ?code from|passcode|sms ?code|enter (?:the )?code)\b/i;

/**
 * Decide whether an action on an element needs the user's approval.
 *
 * target: { action: 'click'|'type'|'select'|'key', role, name, nodeName,
 *           attributes ({ name: value }), formHasPayment }
 * Returns null, or { kind, label } where kind is one of password, payment,
 * one-time-code, file, purchase, delete, send.
 */
export function classifyTarget(target = {}) {
  const action = target.action || 'click';
  const attrs = Object.fromEntries(Object.entries(target.attributes || {}).map(([key, value]) => [String(key).toLowerCase(), String(value)]));
  const tag = String(target.nodeName || '').toUpperCase();
  const type = String(attrs.type || '').toLowerCase();
  const autocomplete = String(attrs.autocomplete || '').toLowerCase();
  const role = String(target.role || '');
  const name = clip(target.name || attrs['aria-label'] || attrs.value || attrs.title || '', 80);
  const words = [attrs.name, attrs.id, attrs['aria-label'], attrs.placeholder, attrs['data-testid'], target.name]
    .filter(Boolean).join(' ').replace(/[_-]+/g, ' ');

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
      || ['BUTTON', 'A', 'INPUT', 'SUMMARY', 'DIV', 'SPAN', 'LI', 'TD', 'IMG', 'SVG'].includes(tag);
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
  const verb = action === 'key' ? 'Press' : 'Click';
  switch (classification.kind) {
    case 'password': return `Type into the password field${where}`;
    case 'payment': return `Type card or bank details${where}`;
    case 'one-time-code': return `Type a one-time sign-in code${where}`;
    case 'file': return `Open a file picker${where} to upload a file`;
    case 'purchase':
      if (classification.label === 'submit the payment form') return `Submit the payment form${where}: this may buy something or make a payment`;
      return `${verb} ${label}${where}: this may buy something or make a payment`;
    case 'delete': return `${verb} ${label}${where}: this may delete or cancel something`;
    case 'send': return `${verb} ${label}${where}: this may send, post or approve something`;
    default: return `${verb} ${label}${where}`;
  }
}

/**
 * Turn "Control+Shift+T", "ctrl+a" or "Enter" into Puppeteer key names:
 * { modifiers: ['Control', 'Shift'], key: 'T' }.
 */
export function parseKeyCombo(combo, { platform = process.platform } = {}) {
  const NAMES = {
    ctrl: 'Control', control: 'Control', shift: 'Shift', alt: 'Alt', option: 'Alt',
    meta: 'Meta', cmd: 'Meta', command: 'Meta', super: 'Meta', win: 'Meta',
    cmdorctrl: platform === 'darwin' ? 'Meta' : 'Control',
    enter: 'Enter', return: 'Enter', esc: 'Escape', escape: 'Escape', tab: 'Tab', space: 'Space', ' ': 'Space',
    backspace: 'Backspace', delete: 'Delete', del: 'Delete', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight',
    arrowup: 'ArrowUp', arrowdown: 'ArrowDown', arrowleft: 'ArrowLeft', arrowright: 'ArrowRight',
    pageup: 'PageUp', pagedown: 'PageDown', home: 'Home', end: 'End', insert: 'Insert',
  };
  const raw = String(combo || '');
  const pieces = raw === '+' ? ['+'] : raw.split('+').map((piece) => piece.trim()).filter(Boolean);
  if (!pieces.length) throw new Error('Say which key to press, e.g. "Enter" or "Control+A".');
  const named = (piece) => NAMES[piece.toLowerCase()] || (/^f\d{1,2}$/i.test(piece) ? piece.toUpperCase() : piece.length === 1 ? piece : piece[0].toUpperCase() + piece.slice(1));
  const modifiers = pieces.slice(0, -1).map(named);
  for (const modifier of modifiers) {
    if (!['Control', 'Shift', 'Alt', 'Meta'].includes(modifier)) throw new Error(`"${modifier}" isn't a modifier key (use Control, Shift, Alt or Meta).`);
  }
  return { modifiers, key: named(pieces[pieces.length - 1]) };
}
