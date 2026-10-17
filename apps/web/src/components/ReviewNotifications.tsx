import { useState } from "react";
import { Link } from "react-router";
import {
  privatePageParams,
  reviewNotificationKinds,
  type ReviewNotification,
  type PrivatePagination,
  type Page,
} from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback } from "./ui";
import { Pagination } from "./Pagination";

export function ReviewNotifications({
  query,
  navigate,
}: {
  query: PrivatePagination;
  navigate: (query: PrivatePagination) => void;
}) {
  const { api } = useSession();
  const [version, setVersion] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const resource = useResource<Page<ReviewNotification>>(
    `/me/review-notifications?${privatePageParams(query)}`,
    version,
  );
  async function mark(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`/review-notifications/${id}/read`, { method: "PATCH" });
      setMessage("已标为已读。");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <section aria-label="本人审核通知">
      <div className="follow-tabs">
        <Link to="/my" className="back-link">
          管理我的记录
        </Link>
        <button
          className="button secondary"
          onClick={() =>
            query.page > 1
              ? navigate({ ...query, page: 1 })
              : setVersion((v) => v + 1)
          }
        >
          查看最新审核
        </button>
      </div>
      <p className="small-note">
        这里记录你的亲历、进展、修订和图片材料的审核结果，仅本人可见。审核决定不代表当前公开状态，请以相关记录为准。
      </p>
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
          <Feedback loading={resource.loading} error={resource.error} />
          {resource.error && (
            <button
              className="button secondary"
              onClick={() => setVersion((v) => v + 1)}
            >
              重试加载审核通知
            </button>
          )}
        </>
      ) : resource.data.items.length ? (
        <div className="notification-list review-notification-list">
          {resource.data.items.map((n) => (
            <article key={n.id} className={n.read ? "read" : ""}>
              <small>
                {new Date(n.createdAt).toLocaleDateString("zh-CN")} ·{" "}
                {n.read ? "已读" : "未读"}
              </small>
              <p>
                {reviewNotificationKinds[n.kind]} ·{" "}
                {n.decision === "APPROVE" ? "审核通过" : "未通过审核"}
              </p>
              <h3>{n.title}</h3>
              {n.kind === "MATERIAL" && <p>对应第 {n.version} 版正文</p>}
              {n.kind === "REVISION" && <p>基于第 {n.version} 版提交的修订</p>}
              <p>审核说明：{n.reason}</p>
              <div className="form-actions">
                <Link
                  className="back-link"
                  to={
                    n.kind === "MATERIAL"
                      ? `/posts/${n.postId}/materials`
                      : n.kind === "REVISION" && n.postAvailable
                        ? `/posts/${n.postId}/revise`
                        : n.postAvailable
                          ? `/posts/${n.postId}`
                          : "/my"
                  }
                >
                  {n.kind === "MATERIAL"
                    ? "管理图片材料"
                    : n.kind === "REVISION" && n.postAvailable
                      ? "管理原文修订"
                      : n.postAvailable
                        ? "查看相关公开记录"
                        : "查看我的记录"}
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
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Feedback
          empty={
            resource.data.total
              ? "这一页没有审核通知，可返回前页或查看最新审核。"
              : "暂无审核结果通知。之后完成审核的内容会在这里通知你。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          label="审核通知分页"
          page={query.page}
          pageSize={query.limit}
          total={resource.data.total}
          loading={busy !== null}
          onChange={(page) => navigate({ ...query, page })}
        />
      )}
    </section>
  );
}
