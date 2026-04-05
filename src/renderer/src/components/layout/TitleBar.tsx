export default function TitleBar(): JSX.Element {
  return (
    <div className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__brand-dot" />
        GameGatherer
      </div>
      <div className="titlebar__controls">
        <button
          className="titlebar__btn"
          title="Minimize"
          onClick={() => window.api.windowMinimize()}
        >
          ─
        </button>
        <button
          className="titlebar__btn"
          title="Maximize"
          onClick={() => window.api.windowMaximize()}
        >
          □
        </button>
        <button
          className="titlebar__btn titlebar__btn--close"
          title="Close"
          onClick={() => window.api.windowClose()}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
