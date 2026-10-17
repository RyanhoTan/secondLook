import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  notificationQuerySchema,
  notificationParams,
  privatePageParams,
  type PrivatePagination,
  type Notification,
  type Page,
} from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { NeedLogin } from "./Account";
import { ReviewNotifications } from "../components/ReviewNotifications";

export function Notifications() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const query = notificationQuerySchema.safeParse(
    Object.fromEntries(
      ["page", "limit", "type"].map((key) => {
        const values = params.getAll(key);
        return [key, values.length > 1 ? values : values[0]];
      }),
    ),
  );
  if (!user) return <NeedLogin />;
  if (!query.success)
    return (
      <>
        <PageHeading eyebrow="持续关注，不错过变化" title="后续追踪" />
        <Feedback error="通知分页条件无效，请清除后重试。" />
        <button className="button secondary" onClick={() => setParams({})}>
          清除无效条件
        </button>
      </>
    );
  const selected = query.data;
  const navigate = (value: PrivatePagination) =>
    setParams(notificationParams({ ...value, type: selected.type }));
  return (
    <>
      <PageHeading
        eyebrow="关注变化，了解审核结果"
        title="后续追踪"
        description="公开进展与本人审核结果分开查看。审核结果仅本人可见。"
      />
      <div className="follow-tabs" role="group" aria-label="通知类型">
        {(["PUBLIC", "REVIEW"] as const).map((type) => (
          <button
            key={type}
            className={`button ${selected.type === type ? "primary" : "secondary"}`}
            aria-pressed={selected.type === type}
            onClick={() =>
              setParams(notificationParams({ ...selected, type, page: 1 }))
            }
          >
            {type === "PUBLIC" ? "公开进展" : "我的审核"}
          </button>
        ))}
      </div>
      {selected.type === "REVIEW" ? (
        <ReviewNotifications
          key={`${user.id}:${privatePageParams(selected)}`}
          query={selected}
          navigate={navigate}
        />
      ) : (
        <NotificationList
          key={`${user.id}:${privatePageParams(selected)}`}
          query={selected}
          navigate={navigate}
        />
      )}
    </>
  );
}
function NotificationList({
  query,
  navigate,
}: {
  query: PrivatePagination;
  navigate: (query: PrivatePagination) => void;
}) {
  const { api } = useSession();
  const [version, refresh] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const resource = useResource<Page<Notification>>(
    `/me/notifications?${privatePageParams(query)}`,
    version,
  );
  async function mark(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      setMessage("已标为已读。");
      refresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <div className="follow-tabs">
        <Link className="back-link" to="/following">
          管理我的关注
        </Link>
        <button
          className="button secondary"
          onClick={() =>
            query.page > 1
              ? navigate({ ...query, page: 1 })
              : refresh((v) => v + 1)
          }
        >
          查看最新进展
        </button>
      </div>
      <p className="small-note">仅展示当前可公开查看的通知，按通知时间排列。</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="small-note">
          {message}
        </p>
      )}
      {!resource.data ? (
        <>
          <Feedback error={resource.error} loading={resource.loading} />
          {resource.error && (
            <button
              className="button secondary"
              onClick={() => refresh((v) => v + 1)}
            >
              重试加载通知
            </button>
          )}
        </>
      ) : resource.data.items.length ? (
        <div className="notification-list">
          {resource.data.items.map((n) => (
            <article key={n.id} className={n.read ? "read" : ""}>
              <small>
                {new Date(n.createdAt).toLocaleDateString("zh-CN")}{" "}
                {n.read ? "· 已读" : "· 未读"}
              </small>
              <Link to={`/posts/${n.postId}`}>
                <p className="small-note">{n.subjectName}</p>
                <h3>{n.title}</h3>
                <p>{n.body}</p>
              </Link>
              {!n.read && (
                <button
                  className="text-button"
                  disabled={busy !== null}
                  onClick={() => void mark(n.id)}
                >
                  {busy === n.id ? "处理中…" : "标为已读"}
                </button>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Feedback
          empty={
            resource.data.total
              ? "这一页没有通知，可返回前页或查看最新进展。"
              : "还没有新的进展。先关注一条经历或一个对象，后续变化会出现在这里。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          label="通知分页"
          page={query.page}
          pageSize={query.limit}
          total={resource.data.total}
          loading={busy !== null}
          onChange={(page) => navigate({ ...query, page })}
        />
      )}
    </>
  );
}
