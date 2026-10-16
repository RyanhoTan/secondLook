import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import type { Account, OwnPost, Page } from "@secondlook/contracts";
import { Pagination } from "../components/Pagination";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { UpdateForm } from "./Detail";
import { DraftList } from "../components/DraftList";
export function Login() {
  const { api, setSession } = useSession();
  const [register, setRegister] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true);
    setError("");
    try {
      const session = await api<{ token: string; user: Account }>(
        `/auth/${register ? "register" : "login"}`,
        { method: "POST", body: JSON.stringify(data) },
      );
      setSession(session);
      navigate("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-page auth-page">
      <PageHeading
        eyebrow="你的经历，值得被看见"
        title={register ? "从一个账号开始" : "欢迎回来"}
        description="昵称可以公开，经历也可以匿名。"
      />
      <form className="form-surface" onSubmit={submit}>
        <label>
          登录名
          <input
            name="username"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            autoComplete="username"
            placeholder="字母、数字或下划线"
          />
        </label>
        {register && (
          <label>
            公开昵称
            <input
              name="nickname"
              required
              maxLength={24}
              autoComplete="nickname"
            />
          </label>
        )}
        <label>
          密码
          <input
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={128}
            autoComplete={register ? "new-password" : "current-password"}
            placeholder="至少 8 位"
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="button primary" disabled={busy}>
          {busy ? "正在处理…" : register ? "创建账号" : "登录"}
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setRegister(!register);
            setError("");
          }}
        >
          {register ? "已有账号？登录" : "还没有账号？创建一个"}
        </button>
        <p className="small-note">本地开发版本。网页刷新后需重新登录。</p>
      </form>
    </div>
  );
}
export function MyPosts() {
  const { user } = useSession();
  return user ? <OwnList /> : <NeedLogin />;
}
function OwnList() {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<OwnPost>>(`/me/posts?page=${page}`);
  const labels: Record<string, string> = {
    PENDING: "等待审核",
    PUBLISHED: "已公开",
    REJECTED: "未通过审核",
  };
  return (
    <>
      <PageHeading eyebrow="留下记录，也补充后来" title="我的记录" />
      <Link className="back-link" to="/following">
        管理我的关注
      </Link>
      <DraftList />
      {!resource.data ? (
        <Feedback error={resource.error} loading={resource.loading} />
      ) : resource.data.items.length ? (
        <div className="own-list">
          {resource.data.items.map((p) => (
            <article key={p.id}>
              <span className="eyebrow">
                {p.subjectName} · {labels[p.status] ?? p.status}
              </span>
              <h3>
                {p.status === "PUBLISHED" ? (
                  <Link to={`/posts/${p.id}`}>{p.title}</Link>
                ) : (
                  p.title
                )}
              </h3>
              {p.reason && <p className="small-note">审核说明：{p.reason}</p>}
              {(p.status === "PENDING" || p.status === "PUBLISHED") && (
                <Link className="back-link" to={`/posts/${p.id}/materials`}>
                  添加 / 管理图片材料
                </Link>
              )}
              {p.status === "PUBLISHED" && (
                <>
                  <Link className="back-link" to={`/posts/${p.id}/revise`}>
                    修改原文 / 查看审核
                  </Link>
                  <UpdateForm postId={p.id} />
                </>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Feedback
          empty={
            resource.data.total
              ? "这一页没有记录，请返回上一页。"
              : "你还没有留下记录。准备好后，分享一次具体的亲身经历。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          label="我的记录分页"
          page={page}
          total={resource.data.total}
          onChange={setPage}
        />
      )}
    </>
  );
}
export function NeedLogin() {
  return (
    <div className="auth-gate">
      <PageHeading
        eyebrow="为你的关注留个位置"
        title="登录后继续"
        description="发布经历、关注后续和查看自己的记录，需要先登录。"
      />
      <Link className="button primary" to="/login">
        前往登录
      </Link>
    </div>
  );
}
