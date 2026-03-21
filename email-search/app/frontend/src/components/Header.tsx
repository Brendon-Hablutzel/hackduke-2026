import { useState, useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "../api";

interface Props {
  user: User | null;
}

export default function Header({ user }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  return (
    <header>
      <div className="header-left">
        <NavLink to="/" className="header-logo">
          Essentra
        </NavLink>
        <span className="badge">local</span>
      </div>
      <div className="header-right">
        {user && (
          <>
            <NavLink
              to="/"
              end
              className="btn-ghost header-nav-link"
              style={({ isActive }) => ({ opacity: isActive ? 0.6 : 1 })}
            >
              Search
            </NavLink>
            <NavLink
              to="/todos"
              className="btn-ghost header-nav-link"
              style={({ isActive }) => ({ opacity: isActive ? 0.6 : 1 })}
            >
              ☑ To-do
            </NavLink>
            <div className="user-menu" ref={menuRef}>
              <button
                className="user-chip"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
              >
                {user.picture ? (
                  <img src="/auth/avatar" alt="" />
                ) : (
                  <div className="user-avatar-fallback">
                    {(user.name || user.email)[0].toUpperCase()}
                  </div>
                )}
                <span>{user.name || user.email}</span>
                <span className="user-menu-caret">{menuOpen ? "▲" : "▼"}</span>
              </button>

              {menuOpen && (
                <div className="user-dropdown">
                  <div className="user-dropdown-info">
                    <div className="user-dropdown-name">{user.name}</div>
                    <div className="user-dropdown-email">{user.email}</div>
                  </div>
                  <div className="user-dropdown-divider" />
                  <NavLink
                    to="/"
                    end
                    className="user-dropdown-item user-dropdown-nav"
                    onClick={() => setMenuOpen(false)}
                  >
                    Search
                  </NavLink>
                  <NavLink
                    to="/todos"
                    className="user-dropdown-item user-dropdown-nav"
                    onClick={() => setMenuOpen(false)}
                  >
                    ☑ To-do
                  </NavLink>
                  <div className="user-dropdown-divider" />
                  <a className="user-dropdown-item" href="/auth/logout">
                    Sign out
                  </a>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </header>
  );
}
