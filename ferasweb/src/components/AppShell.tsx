import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Icon } from './Icon';
import { WalletMenu } from './WalletMenu';

const NAV_LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/arena', label: 'Arena', end: false },
  { to: '/train', label: 'Train', end: false },
  { to: '/profile', label: 'Profile', end: false },
];

export function AppShell() {
  const { pathname } = useLocation();
  const gameScreen = pathname.startsWith('/arena');

  return (
    <div className="app-shell">
      <div className="nav-wrap">
        <nav className="nav" aria-label="Primary">
          <NavLink to="/" className="brand" aria-label="Feras overview">
            <img className="brand-mark" src="/logo.png" alt="" />
            <span className="brand-word">Feras</span>
          </NavLink>

          <div className="nav-links">
            {NAV_LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
              >
                {link.label}
              </NavLink>
            ))}
          </div>

          <div className="nav-right">
            <span className="badge soft nav-devnet">
              <span className="dot" />
              Devnet
            </span>
            <WalletMenu />
          </div>
        </nav>
      </div>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer" hidden={gameScreen}>
        <div className="footer-inner">
          <div className="footer-brand">
            <img src="/logo.png" alt="" />
            <span>Feras</span>
            <span className="footer-sep">·</span>
            <span>Autonomous chess on Solana</span>
          </div>
          <div className="footer-links">
            <Link to="/arena">Arena</Link>
            <Link to="/train">Train</Link>
            <Link to="/profile">Profile</Link>
            <a
              href="https://explorer.solana.com/?cluster=devnet"
              target="_blank"
              rel="noreferrer"
            >
              Explorer
              <Icon name="arrow-up-right" size={11} />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
