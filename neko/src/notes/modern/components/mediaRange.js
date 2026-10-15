// Range sliders in a note's video and audio players (class "note-range"): a
// round accent thumb on a thin track. The played part of the track is a
// hard-edged two-colour fill from rangeFill(), not a visual gradient.

const STYLE_ID = "note-range-style";

const CSS = `
  input[type="range"].note-range {
    -webkit-appearance: none;
    appearance: none;
    background: transparent;
  }
  input[type="range"].note-range::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--as-accent);
    cursor: pointer;
    border: 2px solid white;
    margin-top: -4px;
  }
  input[type="range"].note-range::-moz-range-thumb {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--as-accent);
    cursor: pointer;
    border: 2px solid white;
  }
  input[type="range"].note-range::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
  }
  input[type="range"].note-range::-moz-range-track {
    height: 4px;
    border-radius: 2px;
  }
`;

/** Adds the slider styles to the page once. */
export function ensureNoteRangeStyle(doc = globalThis.document) {
  if (!doc || doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement("style");
  style.id = STYLE_ID;
  style.textContent = CSS;
  doc.head.appendChild(style);
}

/**
 * The track background for a slider `percent` (0–100) of the way along:
 * accent up to there, `rest` after it. Out-of-range values are clamped.
 */
export function rangeFill(percent, rest) {
  const at = Math.min(Math.max(Number(percent) || 0, 0), 100);
  return `linear-gradient(to right, var(--as-accent) 0%, var(--as-accent) ${at}%, ${rest} ${at}%, ${rest} 100%)`;
}
