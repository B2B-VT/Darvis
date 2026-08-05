export default function CyrusLogo({
  ariaLabel = "Cyrus home",
  className = "",
  onActivate,
  size = 36,
  style,
}) {
  const activate = () => {
    onActivate?.();
  };

  const handleKeyDown = event => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    activate();
  };

  return (
    <>
      <button
        type="button"
        className={`cyrus-logo-button ${className}`.trim()}
        aria-label={ariaLabel}
        onClick={activate}
        onKeyDown={handleKeyDown}
        style={style}
      >
        <img
          src="/cyrus-logo-stable.png"
          alt=""
          className="cyrus-logo"
          style={{ width: size, height: size }}
        />
      </button>
      <style>{`
        .cyrus-logo-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: pointer;
          line-height: 0;
          color: inherit;
          -webkit-tap-highlight-color: transparent;
        }

        .cyrus-logo-button:focus {
          outline: none;
        }

        .cyrus-logo-button:focus-visible {
          outline: 2px solid currentColor;
          outline-offset: 6px;
          border-radius: 12px;
        }

        .cyrus-logo {
          display: block;
          max-width: 100%;
          height: auto;
          aspect-ratio: 1 / 1;
          object-fit: contain;
        }
      `}</style>
    </>
  );
}
