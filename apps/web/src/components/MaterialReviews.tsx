import { useState, type FormEvent } from "react";
import {
  materialReviewSchema,
  type MaterialReview,
  type Redaction,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { useSession } from "../lib/session";
import { Feedback } from "./ui";
import { RedactionEditor } from "./RedactionEditor";

export function MaterialReviews({ refreshKey = 0 }: { refreshKey?: number }) {
  const [version, setVersion] = useState(0);
  const resource = useResource<MaterialReview[]>(
    "/admin/materials",
    version + refreshKey,
  );
  return (
    <section className="material-reviews" aria-label="材料审核">
      <h2>图片材料审核</h2>
      {resource.data ? (
        resource.data.length ? (
          <div className="review-list">
            {resource.data.map((item) => (
              <MaterialReviewItem
                key={item.id}
                item={item}
                onDone={() => setVersion((v) => v + 1)}
              />
            ))}
          </div>
        ) : (
          <p className="small-note">没有等待审核的图片材料。</p>
        )
      ) : (
        <Feedback loading={resource.loading} error={resource.error} />
      )}
    </section>
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
        <p className="small-note">{item.postOccurredOn}发生</p>
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
