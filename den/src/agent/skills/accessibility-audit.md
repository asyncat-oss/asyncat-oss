---
name: accessibility-audit
description: Audit and fix web accessibility — WCAG 2.1, ARIA, keyboard navigation, screen readers, color contrast
brain_region: amygdala
weight: 1.0
tags: [accessibility, a11y, wcag, aria, keyboard, screen-reader, frontend]
when_to_use: |
  When asked to audit, improve, or implement accessibility in a web UI:
  ARIA labels, keyboard navigation, focus management, color contrast,
  semantic HTML, or screen reader compatibility.
---
# Web Accessibility Audit

## The Core Rule
**The right semantic HTML element is always better than ARIA.** Use `<button>` not `<div role="button">`. ARIA supplements HTML when no native element exists.

## Audit Checklist

### 1. Keyboard Navigation
- [ ] Every interactive element is reachable with Tab
- [ ] Tab order follows visual reading order (DOM order matches layout)
- [ ] All actions doable with mouse are doable with keyboard alone
- [ ] Custom components: arrow keys for menus/listboxes, Escape closes modals
- [ ] No keyboard traps (focus can always escape a widget)
- [ ] Visible focus indicator on all interactive elements (`outline: none` without replacement = fail)

### 2. Semantic HTML
- [ ] Page has exactly one `<h1>`; heading levels don't skip (`h1 → h2 → h3`, not `h1 → h3`)
- [ ] Lists use `<ul>/<ol>/<li>`; navigation uses `<nav>`; main content in `<main>`
- [ ] Forms: every input has a `<label>` (associated via `for`/`id` or wrapping)
- [ ] Buttons use `<button>`; links use `<a href="">` (not `<span onClick>`)
- [ ] Images have `alt` text (empty `alt=""` for decorative images)
- [ ] Data tables use `<th scope="col/row">` headers

### 3. ARIA (when needed)
- [ ] `aria-label` or `aria-labelledby` on elements without visible text (icon buttons)
- [ ] `aria-describedby` for additional description (error messages, help text)
- [ ] Dynamic regions: `aria-live="polite"` for status updates, `aria-live="assertive"` for urgent alerts
- [ ] `role="dialog"` modals: `aria-modal="true"`, focus trapped inside, `aria-labelledby` pointing to title
- [ ] `aria-expanded`, `aria-selected`, `aria-checked` for interactive state
- [ ] Don't use ARIA roles that duplicate native HTML semantics

### 4. Color & Visual
- [ ] Normal text: ≥4.5:1 contrast ratio against background (WCAG AA)
- [ ] Large text (18px+ or 14px+ bold): ≥3:1 contrast ratio
- [ ] UI components and focus indicators: ≥3:1 contrast
- [ ] Information is never conveyed by color alone (add icon, pattern, or text)
- [ ] Content readable at 200% zoom without horizontal scrolling

### 5. Motion & Media
- [ ] Animations respect `prefers-reduced-motion` media query
- [ ] Videos have captions; audio has transcript
- [ ] Nothing flashes more than 3 times per second

### 6. Forms & Errors
- [ ] Error messages are associated with the input via `aria-describedby`
- [ ] Required fields marked with `aria-required="true"` (and visually)
- [ ] Error messages are descriptive ("Enter a valid email address", not just "Error")
- [ ] Success/error status announced via `aria-live` region

## Common Quick Fixes
```tsx
// Icon button with no visible text — needs label
<button aria-label="Close dialog">
  <XIcon aria-hidden="true" />
</button>

// Error message linked to input
<input id="email" aria-describedby="email-error" aria-invalid="true" />
<p id="email-error" role="alert">Enter a valid email address.</p>

// Skip link (place as first element in body)
<a href="#main-content" className="sr-only focus:not-sr-only">Skip to content</a>

// Reduced motion
@media (prefers-reduced-motion: reduce) {
  * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
}
```

## Tools
- `axe-core` browser extension — catches ~30% of issues automatically
- Keyboard-only walkthrough — catches what axe misses
- VoiceOver (Mac) / NVDA (Windows) — actual screen reader test
- `color.review` or `whocanuse.com` — contrast checker

## Guardrails
- Never `outline: none` without providing a custom visible focus style.
- Never remove `aria-*` attributes without understanding what they convey.
- Test with an actual keyboard and screen reader, not just automated tools.
- Automated tools find structural issues; they don't test the user experience.
