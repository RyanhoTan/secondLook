import { useState } from "react";
import { Link, NavLink, Outlet } from "react-router";
import { motion, LayoutGroup } from "motion/react";
import {
  Compass,
  Bell,
  PenLine,
  UserRound,
  ShieldCheck,
  ArrowUpRight,
  LogOut,
} from "lucide-react";
import { useSession } from "../lib/session";
import { ThemeButton } from "../lib/theme";
const navigation = [
  { to: "/", label: "发现经历", short: "发现", Icon: Compass },
  { to: "/notifications", label: "后续追踪", short: "追踪", Icon: Bell },
  { to: "/my", label: "我的记录", short: "我的", Icon: UserRound },
];
export function Layout() {
  const { user, logout } = useSession();
  const [error, setError] = useState("");
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <header className="global-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="SecondLook 首页">
            <span className="brand-mark" aria-hidden="true">
              <i />
              <i />
            </span>
            <span>
              SecondLook<span className="brand-period">.</span>
            </span>
          </Link>
          <LayoutGroup id="desktop-nav">
            <nav className="main-nav" aria-label="主导航">
              {navigation.map(({ to, label }) => (
                <NavLink key={to} to={to} end={to === "/"}>
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.span
                          className="nav-selection"
                          layoutId="desktop-selection"
                          transition={{
                            type: "spring",
                            bounce: 0,
                            duration: 0.35,
                          }}
                        />
                      )}
                      <span>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
              {user?.role === "ADMIN" && (
                <NavLink to="/admin">
                  <ShieldCheck size={16} />
                  <span>内容审核</span>
                </NavLink>
              )}
            </nav>
          </LayoutGroup>
          <div className="header-actions">
            <ThemeButton />
            {user ? (
              <details className="account-menu">
                <summary aria-label="账户菜单" className="icon-button">
                  <UserRound size={19} />
                </summary>
                <div className="account-popover">
                  <strong>{user.nickname}</strong>
                  <span>已登录</span>
                  <button
                    onClick={() =>
                      void logout().catch(() =>
                        setError("本机已退出，网络连接恢复后可重新登录。"),
                      )
                    }
                  >
                    <LogOut size={16} />
                    退出登录
                  </button>
                </div>
              </details>
            ) : (
              <Link
                className="icon-button login-link"
                to="/login"
                aria-label="登录，留下你的经历"
              >
                <UserRound size={19} />
              </Link>
            )}
            <Link to="/write" className="button primary header-write">
              <PenLine size={16} />
              <span>记录一次经历</span>
            </Link>
          </div>
        </div>
      </header>
      <main id="main" className="content-shell" tabIndex={-1}>
        {error && (
          <p className="error" role="status">
            {error}
          </p>
        )}
        <Outlet />
      </main>
      <footer className="site-footer">
        <span>
          SecondLook<span className="brand-period">.</span>
        </span>
        <p>每一种经历，都有它的另一面。</p>
        <small>
          <i />
          本地预览 · 虚构演示数据
        </small>
      </footer>
      <LayoutGroup id="mobile-nav">
        <nav className="mobile-nav" aria-label="手机导航">
          {[
            navigation[0],
            navigation[1],
            {
              to: "/write",
              label: "记录一次经历",
              short: "记录",
              Icon: PenLine,
            },
            navigation[2],
          ].map(({ to, short, Icon }) => (
            <NavLink key={to} to={to} end={to === "/"} aria-label={short}>
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      className="nav-selection"
                      layoutId="mobile-selection"
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    />
                  )}
                  <Icon size={20} />
                  <span>{short}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </LayoutGroup>
    </div>
  );
}
