import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import {
  followingQuerySchema,
  followingParams,
  type Following,
  type FollowingQuery,
  type Page,
} from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { NeedLogin } from "./Account";

export function FollowingPage() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  const parsed = followingQuerySchema.safeParse(
    Object.fromEntries(
      ["target", "page", "limit"].map((key) => {
        const values = params.getAll(key);
        return [key, values.length > 1 ? values : values[0]];
      }),
    ),
  );
  if (!user) return <NeedLogin />;
  if (!parsed.success)
    return (
      <>
        <PageHeading eyebrow="持续关注，随时调整" title="我的关注" />
        <Feedback error={parsed.error.issues[0].message} />
        <button className="button secondary" onClick={() => setParams({})}>
          清除无效条件
        </button>
      </>
    );
  return (
    <FollowingList
      key={`${user.id}:${followingParams(parsed.data)}`}
      query={parsed.data}
      navigate={(value) => setParams(followingParams(value))}
    />
  );
}
function FollowingList({
  query,
  navigate,
}: {
  query: FollowingQuery;
  navigate: (query: FollowingQuery) => void;
}) {
  const { api } = useSession();
  const [version, refresh] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const resource = useResource<Page<Following>>(
    `/me/follows?${followingParams(query)}`,
    version,
  );
  async function remove(item: Following) {
    if (busy) return;
    setBusy(item.targetId);
    setError("");
    setMessage("");
    try {
      await api(
        `/${item.target === "POST" ? "posts" : "subjects"}/${item.targetId}/follow`,
        { method: "DELETE" },
      );
      setMessage("已取消这项关注；你单独关注的其他帖子或对象不受影响。");
      if (resource.data?.items.length === 1 && query.page > 1)
        navigate({ ...query, page: query.page - 1 });
      else refresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Link className="back-link" to="/my">
        返回我的记录
      </Link>
      <PageHeading
        eyebrow="持续关注，随时调整"
        title="我的关注"
        description="帖子与对象分别管理。取消其中一项，不影响另一项订阅；已有通知保留。"
      />
      <div className="follow-tabs" aria-label="关注类型">
        {(["POST", "SUBJECT"] as const).map((target) => (
          <button
            className={`button ${target === query.target ? "primary" : "secondary"}`}
            aria-pressed={target === query.target}
            key={target}
            onClick={() => navigate({ ...query, target, page: 1 })}
          >
            {target === "POST" ? "关注的帖子" : "关注的对象"}
          </button>
        ))}
      </div>
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
              重试查询
            </button>
          )}
        </>
      ) : resource.data.items.length ? (
        <div className="follow-list">
          {resource.data.items.map((item) => (
            <article key={item.targetId}>
              <div>
                {item.target === "POST" && !item.available ? (
                  <>
                    <h2>此记录暂不可查看</h2>
                    <p className="small-note">内容不再展示，你仍可取消关注。</p>
                  </>
                ) : (
                  <>
                    <Link
                      to={`/${item.target === "POST" ? "posts" : "subjects"}/${item.targetId}`}
                    >
                      <h2>
                        {item.target === "POST"
                          ? item.title
                          : item.subject.name}
                      </h2>
                    </Link>
                    <p className="small-note">
                      {item.target === "POST" ? `${item.subject.name} · ` : ""}
                      {item.subject.city} ·{" "}
                      {item.subject.address || "未填写具体地址"}
                    </p>
                  </>
                )}
              </div>
              <button
                className="button secondary"
                disabled={busy !== null}
                onClick={() => void remove(item)}
              >
                {busy === item.targetId ? "取消中…" : "取消关注"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <Feedback
          empty={
            resource.data.total
              ? "这一页没有关注，请返回上一页。"
              : query.target === "POST"
                ? "还没有关注帖子。可在经历详情关注后续。"
                : "还没有关注对象。可在具体对象页面关注。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          label="我的关注分页"
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
