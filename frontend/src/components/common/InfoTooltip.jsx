// Small "?" affordance that reveals a plain-English explanation on hover/focus
// — CSS-only (see .tp-info-tip* in index.css), no extra JS state or library.
// stopPropagation on click so tapping it inside a clickable card (e.g. a KPI
// tile) doesn't also trigger the card's own onClick.
export function InfoTooltip({ text }) {
  return (
    <span className="tp-info-tip" tabIndex={0} onClick={(e) => e.stopPropagation()}>
      <span className="tp-info-tip-icon" aria-hidden="true">
        ?
      </span>
      <span className="tp-info-tip-bubble" role="tooltip">
        {text}
      </span>
    </span>
  );
}
