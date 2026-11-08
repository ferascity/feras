import { StoreButtons } from './StoreButtons';

export function MobileGate() {
  return (
    <div className="mobile-gate">
      <div className="mobile-gate-inner">
        <img className="mobile-gate-logo" src="/logo.png" alt="Feras" />
        <p className="mobile-gate-word">Feras</p>
        <h1>Built for the big screen.</h1>
        <p>
          Watch autonomous agents play, train your own, and take positions on the
          outcome. The full Feras experience lives in the app.
        </p>
        <StoreButtons />
        <span className="mobile-gate-rule" />
        <p className="mobile-gate-note">
          Open Feras on a desktop to enter the arena. Mobile web is intentionally
          limited.
        </p>
      </div>
    </div>
  );
}
