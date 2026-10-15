import { Link, NavLink, Outlet, useLocation } from "react-router";
import {
  Compass,
  Bell,
  PenLine,
  ShieldCheck,
  ArrowUpRight,
  BookOpen,
  LogOut,
  Layers,
} from "lucide-react";
import { useSession } from "../lib/session";
import { ThemeButton } from "../lib/theme";
export function Layout() {
  const { user, logout } = useSession();
  const { pathname } = useLocation();
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        跳到主要内容
      </a>
      <aside className="sidebar">
        <Link to="/" className="brand" aria-label="SecondLook 首页">
          <span className="brand-mark">
            <Layers size={24} />
          </span>
          <span>
            SecondLook<span className="brand-caption">多看一面，再做决定</span>
          </span>
        </Link>
        <div className="nav-section-label">你的每一次选择</div>
        <nav className="main-nav">
          <NavLink to="/" end>
            <Compass size={19} />
            发现经历
          </NavLink>
          <NavLink to="/notifications">
            <Bell size={19} />
            后续追踪
          </NavLink>
          <NavLink to="/my">
            <BookOpen size={19} />
            我的记录
          </NavLink>
          {user?.role === "ADMIN" && (
            <NavLink to="/admin">
              <ShieldCheck size={19} />
              内容审核
            </NavLink>
          )}
        </nav>
        <Link to="/write" className="button primary sidebar-write">
          <PenLine size={17} />
          记录一次经历
        </Link>
        <div className="sidebar-bottom">
          <div className="local-label">
            <span />
            本地预览 · 虚构演示数据
          </div>
          <ThemeButton />
          {user ? (
            <div className="account">
              <span className="avatar">{user.nickname.slice(0, 1)}</span>
              <span>{user.nickname}</span>
              <button
                aria-label="退出登录"
                onClick={() => void logout().catch(() => {})}
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <Link className="account login-link" to="/login">
              登录，留下你的经历
              <ArrowUpRight size={16} />
            </Link>
          )}
        </div>
      </aside>
      <div className="content-shell">
        <div className="topbar">
          <span>
            {pathname === "/" ? "发现 / 全部经历" : "SecondLook / 经历与后续"}
          </span>
          <span className="topbar-note">每一种体验，都值得被认真看见</span>
        </div>
        <main id="main" tabIndex={-1}>
          <Outlet />
        </main>
        <footer>
          SecondLook <span>让选择多一份依据，让经历有后续。</span>
          <span>当前为本地开发版本</span>
        </footer>
      </div>
      <nav className="mobile-nav">
        <NavLink to="/" end aria-label="发现">
          <Compass size={20} />
          <span>发现</span>
        </NavLink>
        <NavLink to="/write" aria-label="记录">
          <PenLine size={20} />
          <span>记录</span>
        </NavLink>
        <NavLink to="/notifications" aria-label="追踪">
          <Bell size={20} />
          <span>追踪</span>
        </NavLink>
        <NavLink to="/my" aria-label="我的">
          <BookOpen size={20} />
          <span>我的</span>
        </NavLink>
      </nav>
    </div>
  );
}
