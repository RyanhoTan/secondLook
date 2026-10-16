import { useState, type FormEvent } from "react";
import type { Review } from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { NeedLogin } from "./Account";
import { MaterialReviews } from "../components/MaterialReviews";
import { IssueTypes } from "../components/IssueTypes";
export function Admin() {
  const { user } = useSession();
  return !user ? (
    <NeedLogin />
  ) : user.role !== "ADMIN" ? (
    <Feedback error="需要管理员权限" />
  ) : (
    <ReviewQueue />
  );
}
function ReviewQueue() {
  const [version, setVersion] = useState(0);
  const resource = useResource<Review[]>("/admin/reviews", version);
  return (
    <>
      <PageHeading
        eyebrow="管理后台 / 待审队列"
        title="认真看完，再做决定"
        description="核对具体经历与隐私信息。审核通过代表符合发布规则，不代表事实已经证实。"
      />
      {!resource.data ? (
        <Feedback loading={resource.loading} error={resource.error} />
      ) : resource.data.length ? (
        <div className="review-list">
          {resource.data.map((item) => (
            <ReviewItem
              key={item.id}
              item={item}
              onDone={() => setVersion((v) => v + 1)}
            />
          ))}
        </div>
      ) : (
        <Feedback empty="当前没有待审文字内容。" />
      )}
      <MaterialReviews refreshKey={version} />
    </>
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
          <p>{item.previous.occurredOn}发生</p>
          <p className="revision-text">{item.previous.body}</p>
          <IssueTypes value={item.previous.issueTypes} />
        </details>
      )}
      {item.changeReason && (
        <p className="revision-text">更正说明：{item.changeReason}</p>
      )}
      {item.occurredOn && (
        <p className="small-note">修改后的发生日期：{item.occurredOn}</p>
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
