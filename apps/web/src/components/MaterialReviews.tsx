import { useState, useRef, useEffect, type FormEvent } from "react";
import {
  materialReviewSchema,
  materialQueueSchema,
  materialQueueParams,
  type MaterialQueueQuery,
  type Page,
  type MaterialReview,
  type Redaction,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { useSession } from "../lib/session";
import { Feedback } from "./ui";
import { RedactionEditor } from "./RedactionEditor";
import { useSearchParams } from "react-router";
import { Pagination } from "./Pagination";

const routeKeys = {
  q: "materialQ",
  status: "materialStatus",
  visibility: "materialVisibility",
  page: "materialPage",
  limit: "materialLimit",
} as const;
export function MaterialReviews({ refreshKey = 0 }: { refreshKey?: number }) {
  const [params, setParams] = useSearchParams();
  const parsed = materialQueueSchema.safeParse(
    Object.fromEntries(
      Object.entries(routeKeys).map(([key, param]) => {
        const values = params.getAll(param);
        return [key, values.length > 1 ? values : values[0]];
      }),
    ),
  );
  function navigate(query?: MaterialQueueQuery) {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const param of Object.values(routeKeys)) next.delete(param);
      if (query)
        materialQueueParams(query).forEach((value, key) =>
          next.set(routeKeys[key as keyof typeof routeKeys], value),
        );
      return next;
    });
  }
  if (!parsed.success)
    return (
      <section className="material-reviews" aria-label="材料审核">
        <h2>图片材料审核</h2>
        <Feedback error="材料筛选条件无效，请清除后重试。" />
        <button className="button secondary" onClick={() => navigate()}>
          清除无效材料条件
        </button>
      </section>
    );
  return (
    <MaterialQueue
      query={parsed.data}
      navigate={navigate}
      refreshKey={refreshKey}
    />
  );
}
function MaterialQueue({
  query,
  navigate,
  refreshKey,
}: {
  query: MaterialQueueQuery;
  navigate: (query: MaterialQueueQuery) => void;
  refreshKey: number;
}) {
  const [version, setVersion] = useState(0);
  const current = useRef("");
  current.current = materialQueueParams(query).toString();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  function reviewed(completed: MaterialQueueQuery, rows: number) {
    if (!active.current) return;
    setVersion((v) => v + 1);
    if (
      current.current === materialQueueParams(completed).toString() &&
      rows === 1 &&
      completed.page > 1
    )
      navigate({ ...completed, page: completed.page - 1 });
  }
  return (
    <section className="material-reviews" aria-label="材料审核">
      <h2>图片材料审核</h2>
      <MaterialQueueContents
        key={materialQueueParams({ ...query, page: 1 }).toString()}
        query={query}
        navigate={navigate}
        version={version + refreshKey}
        onDone={reviewed}
      />
    </section>
  );
}
function MaterialQueueContents({
  query,
  navigate,
  version,
  onDone,
}: {
  query: MaterialQueueQuery;
  navigate: (query: MaterialQueueQuery) => void;
  version: number;
  onDone: (query: MaterialQueueQuery, rows: number) => void;
}) {
  const [q, setQuery] = useState(query.q),
    [status, setStatus] = useState(query.status),
    [visibility, setVisibility] = useState(query.visibility),
    [retry, setRetry] = useState(0);
  const resource = useResource<Page<MaterialReview>>(
    `/admin/material-queue?${materialQueueParams(query)}`,
    version + retry,
  );
  return (
    <>
      <form
        className="review-search material-search"
        onSubmit={(e) => {
          e.preventDefault();
          navigate({ ...query, q: q.trim(), status, visibility, page: 1 });
        }}
      >
        <label>
          搜索材料来源、正文或对象
          <input
            maxLength={100}
            value={q}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label>
          材料待审状态
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as MaterialQueueQuery["status"])
            }
          >
            <option value="ALL">全部待审状态</option>
            <option value="PENDING">首次待审</option>
            <option value="NEEDS_REVIEW">新版待复核</option>
          </select>
        </label>
        <label>
          材料公开范围
          <select
            value={visibility}
            onChange={(e) =>
              setVisibility(e.target.value as MaterialQueueQuery["visibility"])
            }
          >
            <option value="ALL">全部公开范围</option>
            <option value="PUBLIC">申请公开</option>
            <option value="REVIEW_ONLY">仅供审核</option>
          </select>
        </label>
        <button className="button primary">查找待审材料</button>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setQuery("");
            setStatus("ALL");
            setVisibility("ALL");
            navigate(materialQueueSchema.parse({}));
          }}
        >
          清除材料筛选
        </button>
      </form>
      <p className="small-note">
        按材料上传时间从早到晚排列；只统计当前条件下仍可审核的材料。
        {resource.data && `共 ${resource.data.total} 份。`}
      </p>
      {!resource.data ? (
        <>
          <Feedback loading={resource.loading} error={resource.error} />
          {resource.error && (
            <button
              className="button secondary"
              onClick={() => setRetry((v) => v + 1)}
            >
              重试材料队列
            </button>
          )}
        </>
      ) : resource.data.items.length ? (
        <div className="review-list">
          {resource.data.items.map((item) => (
            <MaterialReviewItem
              key={`${item.id}:${item.version}`}
              item={item}
              onDone={() => onDone(query, resource.data!.items.length)}
            />
          ))}
        </div>
      ) : (
        <p className="small-note">
          {resource.data.total
            ? "这一页没有待审材料，请返回上一页。"
            : "没有等待审核的图片材料。"}
        </p>
      )}
      {resource.data && (
        <Pagination
          label="材料审核分页"
          page={query.page}
          pageSize={query.limit}
          total={resource.data.total}
          onChange={(page) => navigate({ ...query, page })}
        />
      )}
    </>
  );
}
function MaterialReviewItem({
  item,
  onDone,
}: {
  item: MaterialReview;
  onDone: () => void;
}) {
  const { api } = useSession();
  const [redactions, setRedactions] = useState<Redaction[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const action = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
      "value",
    );
    const checked = materialReviewSchema.safeParse({
      action,
      reason: form.get("reason"),
      privacyChecked: form.get("privacyChecked") === "on",
      redactions,
      baseVersion: item.version,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/admin/materials/${item.id}/decision`, {
        method: "POST",
        body: JSON.stringify(checked.data),
      });
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="material-review-item review-item">
      <span className="eyebrow">
        {item.subjectName} ·{" "}
        {item.visibility === "PUBLIC" ? "申请公开" : "仅供审核，不会公开"}
      </span>
      <h3>{item.postTitle}</h3>
      <p className="small-note">
        本次复核第 {item.version} 版；上传关联版本：
        {item.submittedVersion ?? "未记录"}。
      </p>
      <details>
        <summary>阅读本次复核的正文</summary>
        <p className="small-note">{item.postOccurrenceLabel}发生</p>
        <p className="revision-text">{item.postBody}</p>
      </details>
      <p className="revision-text">来源与关联：{item.source}</p>
      <RedactionEditor
        id={item.id}
        rectangles={redactions}
        onChange={setRedactions}
        disabled={busy}
      />
      <form onSubmit={submit}>
        <label>
          材料审核说明
          <input name="reason" required minLength={2} maxLength={500} />
        </label>
        <label className="checkbox">
          <input type="checkbox" name="privacyChecked" />
          <span>
            已检查图片、来源说明的隐私与相关性；公开副本遮挡范围完整。
          </span>
        </label>
        <div className="form-actions">
          <button className="button secondary" value="REJECT" disabled={busy}>
            拒绝此材料
          </button>
          <button className="button primary" value="APPROVE" disabled={busy}>
            {item.visibility === "PUBLIC" ? "通过并公开副本" : "通过，仅供审核"}
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
    </article>
  );
}
