import { MotionConfig } from "motion/react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Link, useLocation } from "react-router";
import { useEffect } from "react";
import { SessionProvider } from "./lib/session";
import { Layout } from "./components/Layout";
import { Discover } from "./pages/Discover";
import { Detail, SubjectPage } from "./pages/Detail";
import { Login, MyPosts, Notifications } from "./pages/Account";
import { Write } from "./pages/Write";
import { Admin } from "./pages/Admin";
import { Revision } from "./pages/Revision";
import { MaterialManager } from "./pages/Materials";
import { Objects } from "./pages/Objects";
import { FollowingPage } from "./pages/Following";
import "./styles.css";
function ScrollReset() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}
createRoot(document.getElementById("root")!).render(
  <MotionConfig reducedMotion="user">
    <BrowserRouter>
      <SessionProvider>
        <ScrollReset />
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Discover />} />
            <Route path="posts/:id" element={<Detail />} />
            <Route path="posts/:id/revise" element={<Revision />} />
            <Route path="posts/:id/materials" element={<MaterialManager />} />
            <Route path="subjects/:id" element={<SubjectPage />} />
            <Route path="objects" element={<Objects />} />
            <Route path="login" element={<Login />} />
            <Route path="write" element={<Write />} />
            <Route path="my" element={<MyPosts />} />
            <Route path="following" element={<FollowingPage />} />
            <Route path="notifications" element={<Notifications />} />
            <Route path="admin" element={<Admin />} />
            <Route
              path="*"
              element={
                <div className="feedback">
                  页面不存在。<Link to="/">返回发现</Link>
                </div>
              }
            />
          </Route>
        </Routes>
      </SessionProvider>
    </BrowserRouter>
  </MotionConfig>,
);
