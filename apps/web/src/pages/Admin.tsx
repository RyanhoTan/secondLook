import {
  formatOccurrence,
  reviewKinds,
  reviewQueueSchema,
  reviewQueueParams,
  type ReviewQueueQuery,
  type ReviewQueuePage,
  type Review,
} from "@secondlook/contracts";
import { useState, useRef, useEffect, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Pagination } from "../components/Pagination";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { NeedLogin } from "./Account";
import { MaterialReviews } from "../components/MaterialReviews";
import { IssueTypes } from "../components/IssueTypes";
export function Admin() {
  const { user } = useSession();
  const [params, setParams] = useSearchParams();
  function navigate(value?: ReviewQueueQuery) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const key of ["kind", "q", "page", "limit"]) next.delete(key);
      if (value) reviewQueueParams(value).forEach((v, key) => next.set(key, v));
      return next;
    });
  }
  const parsed = reviewQueueSchema.safeParse(
    Object.fromEntries(
      ["kind", "q", "page", "limit"].map((key) => {
        const values = params.getAll(key);
        return [key, values.length > 1 ? values : values[0]];
      }),
    ),
  );
  if (!user) return <NeedLogin />;
  if (user.role !== "ADMIN") return <Feedback error="需要管理员权限" />;
  if (!parsed.success)
    return (
      <>
        <PageHeading eyebrow="管理后台" title="待审队列" />
        <Feedback error="审核筛选条件无效，请清除后重试。" />
        <button className="button secondary" onClick={() => navigate()}>
          清除无效条件
        </button>
      </>
    );
  return <ReviewQueue key={user.id} query={parsed.data} navigate={navigate} />;
}
function ReviewQueue({
  query,
  navigate,
}: {
  query: ReviewQueueQuery;
  navigate: (query: ReviewQueueQuery) => void;
}) {
  const [version, setVersion] = useState(0);
  const current = useRef("");
  current.current = reviewQueueParams(query).toString();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function reviewed(completed: ReviewQueueQuery, rows: number) {
    if (!active.current) return;
    setVersion((v) => v + 1);
    if (
      current.current === reviewQueueParams(completed).toString() &&
      rows === 1 &&
      completed.page > 1
    )
      navigate({ ...completed, page: completed.page - 1 });
  }
  return (
    <>
      <PageHeading
        eyebrow="管理后台 / 待审队列"
        title="认真看完，再做决定"
        description="核对具体经历与隐私信息。审核通过代表符合发布规则，不代表事实已经证实。"
      />
      <TextQueue
        key={reviewQueueParams({ ...query, page: 1 }).toString()}
        query={query}
        navigate={navigate}
        version={version}
        onDone={reviewed}
      />
      <MaterialReviews refreshKey={version} />
    </>
  );
}
function TextQueue({
  query,
  navigate,
  version,
  onDone,
}: {
  query: ReviewQueueQuery;
  navigate: (query: ReviewQueueQuery) => void;
  version: number;
  onDone: (query: ReviewQueueQuery, rows: number) => void;
}) {
  const [q, setQuery] = useState(query.q),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  const resource = useResource<ReviewQueuePage>(
    `/admin/review-queue?${reviewQueueParams(query)}`,
    version + retry,
  );
  function apply(kind = query.kind) {
    const parsed = reviewQueueSchema.safeParse({ ...query, q, kind, page: 1 });
    if (!parsed.success) {
      setError("搜索条件过长或无效，请调整后重试。");
      return;
    }
    setError("");
    setQuery(parsed.data.q);
    navigate(parsed.data);
  }
  return (
    <section aria-label="文字审核队列">
      <form
        className="review-search"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <label>
          搜索待审标题、正文或对象
          <input
            value={q}
            onChange={(e) => setQuery(e.target.value)}
            maxLength={100}
          />
        </label>
        <button className="button primary">查找待审内容</button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setQuery("");
            setError("");
            navigate(reviewQueueSchema.parse({}));
          }}
        >
          清除筛选
        </button>
      </form>
      <div className="follow-tabs" role="group" aria-label="审核类型">
        {Object.entries(reviewKinds).map(([kind, label]) => (
          <button
            key={kind}
            className={`button ${kind === query.kind ? "primary" : "secondary"}`}
            aria-pressed={kind === query.kind}
            onClick={() => apply(kind as ReviewQueueQuery["kind"])}
          >
            {label} ·{" "}
            {resource.data?.counts[kind as keyof typeof reviewKinds] ?? "—"}
          </button>
        ))}
      </div>
      <p className="small-note">
        较早提交的内容优先显示。数量仅统计当前搜索条件下仍可审核的文字内容。
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {!resource.data ? (
        <>
          <Feedback loading={resource.loading} error={resource.error} />
          {resource.error && (
            <button
              className="button secondary"
              onClick={() => setRetry((v) => v + 1)}
            >
              重试文字队列
            </button>
          )}
        </>
      ) : resource.data.items.length ? (
        <div className="review-list">
          {resource.data.items.map((item) => (
            <ReviewItem
              key={`${item.kind}:${item.id}`}
              item={item}
              onDone={() => onDone(query, resource.data!.items.length)}
            />
          ))}
        </div>
      ) : (
        <Feedback
          empty={
            resource.data.total
              ? "这一页没有待审内容，请返回上一页。"
              : "当前条件下没有待审文字内容。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          label="文字审核分页"
          page={query.page}
          pageSize={query.limit}
          total={resource.data.total}
          onChange={(page) => navigate({ ...query, page })}
        />
      )}
    </section>
  );
}
function ReviewItem({ item, onDone }: { item: Review; onDone: () => void }) {
  const { api } = useSession();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value",
    );
    if (!action) return;
    setBusy(true);
    setError("");
    try {
      await api(`/admin/reviews/${item.kind}/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify({ action, reason: form.get("reason") }),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="review-item">
      <span className="eyebrow">
        {
          { POST: "新亲历", UPDATE: "后续更新", REVISION: "原文修订" }[
            item.kind
          ]
        }{" "}
        · {item.subjectName}
      </span>
      <h3>{item.title}</h3>
      {item.previous && (
        <details className="review-previous">
          <summary>对照当前公开版本（第 {item.previous.version} 版）</summary>
          <h4>{item.previous.title}</h4>
          <p>{formatOccurrence(item.previous)}发生</p>
          <p className="revision-text">{item.previous.body}</p>
          <IssueTypes value={item.previous.issueTypes} />
        </details>
      )}
      {item.changeReason && (
        <p className="revision-text">更正说明：{item.changeReason}</p>
      )}
      {item.occurredOn && (
        <p className="small-note">
          发生时间：
          {formatOccurrence({
            occurredOn: item.occurredOn,
            occurredPrecision: item.occurredPrecision ?? "DAY",
            occurredUntil: item.occurredUntil ?? "",
          })}
        </p>
      )}
      <p className="review-body">{item.body}</p>
      {item.issueTypes && <IssueTypes value={item.issueTypes} />}
      <form onSubmit={submit}>
        <label>
          审核说明
          <input
            name="reason"
            required
            minLength={2}
            maxLength={500}
            placeholder="说明决定及需要补充的内容"
          />
        </label>
        <div className="form-actions">
          <button
            className="button secondary"
            name="action"
            value="REJECT"
            disabled={busy}
          >
            不予公开
          </button>
          <button
            className="button primary"
            name="action"
            value="APPROVE"
            disabled={busy}
          >
            通过并公开
          </button>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </form>
    </article>
  );
}
