import {
  type Occurrence,
  formatOccurrence,
  revisionSchema,
  type RevisionEditor,
} from "@secondlook/contracts";
import { OccurrenceFields } from "../components/OccurrenceFields";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { NeedLogin } from "./Account";
import { IssuePicker, IssueTypes } from "../components/IssueTypes";

export function Revision() {
  const { user } = useSession();
  return user ? <Editor /> : <NeedLogin />;
}
function Editor() {
  const { id } = useParams();
  const resource = useResource<RevisionEditor>(`/me/posts/${id}/revisions`);
  return resource.data ? (
    <RevisionForm key={id} data={resource.data} />
  ) : (
    <Feedback loading={resource.loading} error={resource.error} />
  );
}
function RevisionForm({ data }: { data: RevisionEditor }) {
  const { api } = useSession();
  const latest = data.latestRevision;
  const content = latest?.status === "REJECTED" ? latest : data.post;
  const [occurrence, setOccurrence] = useState<Occurrence>({
    occurredOn: content.occurredOn,
    occurredPrecision: content.occurredPrecision,
    occurredUntil: content.occurredUntil,
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [issueTypes, setIssueTypes] = useState(content.issueTypes);
  const pending = latest?.status === "PENDING";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const result = revisionSchema.safeParse({
      title: form.get("title"),
      issueTypes,
      body: form.get("body"),
      ...occurrence,
      changeReason: form.get("changeReason"),
      baseVersion: data.post.currentVersion,
    });
    if (!result.success) {
      setError(result.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${data.post.id}/revisions`, {
        method: "POST",
        body: JSON.stringify(result.data),
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-page">
      <PageHeading
        eyebrow={`原文修订 · 当前第 ${data.post.currentVersion} 版`}
        title={
          done ? "修改已提交" : pending ? "修改正在审核" : "把经历说得更准确"
        }
        description="通过审核前，原公开版本继续展示。通过后会保留历史、展示更正说明，并通知关注者。对象和匿名身份保持原设置。"
      />
      {done ? (
        <p role="status">审核结果可回到这里查看。</p>
      ) : pending ? (
        <section className="form-surface">
          <h2>{latest.title}</h2>
          <p className="revision-text">{latest.body}</p>
          <p>发生时间：{formatOccurrence(latest)}</p>
          <IssueTypes value={latest.issueTypes} />
          <p>更正说明：{latest.changeReason}</p>
        </section>
      ) : (
        <form className="form-surface" onSubmit={submit}>
          {latest?.status === "REJECTED" && (
            <p role="status">
              上次修改未通过：{latest.reviewReason}。可调整后重新提交。
            </p>
          )}
          <label>
            标题
            <input
              name="title"
              required
              minLength={5}
              maxLength={80}
              defaultValue={content.title}
            />
          </label>
          <OccurrenceFields
            value={occurrence}
            onChange={(patch) => setOccurrence({ ...occurrence, ...patch })}
          />
          <label>
            经历正文
            <textarea
              name="body"
              required
              minLength={20}
              maxLength={5000}
              defaultValue={content.body}
            />
          </label>
          <label>
            更正说明
            <textarea
              name="changeReason"
              required
              minLength={5}
              maxLength={500}
              defaultValue={
                latest?.status === "REJECTED" ? latest.changeReason : ""
              }
              placeholder="哪些内容有变化？为什么需要修改？此说明会公开展示。"
            />
          </label>
          <IssuePicker
            category={data.post.category}
            value={issueTypes}
            onChange={setIssueTypes}
            disabled={busy}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="button primary" disabled={busy}>
            {busy ? "正在提交…" : "提交修改审核"}
          </button>
        </form>
      )}
      <Link className="back-link" to={`/posts/${data.post.id}`}>
        返回公开记录
      </Link>
    </div>
  );
}
