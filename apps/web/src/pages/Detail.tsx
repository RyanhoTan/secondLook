import {
  formatOccurrence,
  type PostDetail,
  type Page,
  type PublicPost,
  type Subject,
} from "@secondlook/contracts";
import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ArrowLeft, Bell, Check, ArrowUpRight } from "lucide-react";
import { useResource, date } from "../lib/resource";
import { useSession } from "../lib/session";
import { EvidenceTag, Feedback, PageHeading, PostCard } from "../components/ui";
import { IssueTypes } from "../components/IssueTypes";
import { RevisionHistory } from "../components/RevisionHistory";
import { PublicMaterials } from "../components/Materials";
import { Pagination } from "../components/Pagination";
export function Detail() {
  const { id } = useParams();
  const [version, setVersion] = useState(0);
  const { data, error, loading } = useResource<PostDetail>(
    `/posts/${id}`,
    version,
  );
  const { api, user } = useSession();
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  async function follow() {
    if (!data) return;
    setBusy(true);
    setActionError("");
    try {
      await api(`/posts/${id}/follow`, {
        method: data.following ? "DELETE" : "PUT",
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setActionError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!data) return <Feedback error={error} loading={loading} />;
  return (
    <div className="detail-page">
      <Link className="back-link" to="/">
        <ArrowLeft size={16} />
        返回经历广场
      </Link>
      <header className="detail-header">
        <Link className="eyebrow" to={`/subjects/${data.subject.id}`}>
          {data.subject.name}
          <ArrowUpRight size={14} />
        </Link>
        <h1>{data.title}</h1>
        <div className="detail-meta">
          <span>{data.authorName}</span>
          <span>{formatOccurrence(data)}发生</span>
          <span>{data.subject.city}</span>
        </div>
        <EvidenceTag post={data} />
        <IssueTypes value={data.issueTypes} />
      </header>
      {data.correction && (
        <aside className="correction-note" aria-label="重要更正">
          <strong>作者已更正 · 第 {data.currentVersion} 版</strong>
          <p>{data.correction.reason}</p>
          <small>{date(data.correction.publishedAt)}公开</small>
        </aside>
      )}
      <div className="detail-body">
        {data.body.split("\n").map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
      <PublicMaterials postId={data.id} version={data.currentVersion} />
      <div className="detail-follow">
        <div>
          <h3>故事还在继续</h3>
          <p>关注后，重要进展会出现在你的站内通知中。</p>
        </div>
        {user ? (
          <button
            className={`button ${data.following ? "secondary" : "primary"}`}
            disabled={busy}
            onClick={() => void follow()}
          >
            {data.following ? <Check size={16} /> : <Bell size={16} />}{" "}
            {data.following ? "已关注 · 点击取消" : "关注后续"}
          </button>
        ) : (
          <Link className="button primary" to="/login">
            登录并关注
          </Link>
        )}
      </div>
      {actionError && (
        <p role="alert" className="error">
          {actionError}
        </p>
      )}
      <section className="timeline">
        <h2>
          后续与变化<span>{data.timeline.length}</span>
        </h2>
        {data.timeline.map((item) => (
          <article key={item.id}>
            <i />
            <small>
              {date(item.createdAt)} ·{" "}
              {item.kind === "AUTHOR_UPDATE"
                ? "作者补充"
                : item.kind === "CORRECTION"
                  ? "原文更正"
                  : item.kind === "MATERIAL_APPROVED" ||
                      item.kind === "MATERIAL_WITHDRAWAL"
                    ? "材料变化"
                    : "记录公开"}
            </small>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </article>
        ))}
      </section>
      <RevisionHistory
        postId={data.id}
        history={data.history}
        currentVersion={data.currentVersion}
        onChange={() => setVersion((v) => v + 1)}
      />
      <p className="small-note">
        标签说明当前材料状态，不代表事实裁决。退款或问题解决，不自动代表原经历失实。
      </p>
    </div>
  );
}
export function SubjectPage() {
  const { id } = useParams();
  return <SubjectContent key={id} id={id!} />;
}
function SubjectContent({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const subject = useResource<Subject>(`/subjects/${id}`);
  const posts = useResource<Page<PublicPost>>(
    `/posts?subjectId=${id}&page=${page}`,
  );
  if (!subject.data)
    return <Feedback error={subject.error} loading={subject.loading} />;
  return (
    <>
      <Link to="/" className="back-link">
        <ArrowLeft size={16} />
        返回广场
      </Link>
      <PageHeading
        eyebrow={`${subject.data.city} · ${subject.data.address || "未填写具体地址"}`}
        title={subject.data.name}
        description={`${subject.data.postCount} 条公开经历，数量不代表整体质量。`}
      />
      <div className="narrow-feed">
        {posts.error || posts.loading ? (
          <Feedback error={posts.error} loading={posts.loading} />
        ) : posts.data?.items.length ? (
          posts.data.items.map((p, index) => (
            <PostCard key={p.id} post={p} index={index} />
          ))
        ) : (
          <Feedback empty="这个对象还没有公开经历。" />
        )}
      </div>
      {posts.data && (
        <Pagination
          label="对象经历分页"
          page={page}
          total={posts.data.total}
          onChange={setPage}
        />
      )}
    </>
  );
}
export function UpdateForm({ postId }: { postId: string }) {
  const { api } = useSession();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      await api(`/posts/${postId}/updates`, {
        method: "POST",
        body: JSON.stringify({
          title: data.get("title"),
          body: data.get("body"),
        }),
      });
      form.reset();
      setMessage("进展已提交，审核后公开。");
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="update-form">
      <summary>补充后续进展</summary>
      <form onSubmit={submit}>
        <label>
          更新标题
          <input name="title" required minLength={2} maxLength={80} />
        </label>
        <label>
          发生了什么变化
          <textarea name="body" required minLength={10} maxLength={5000} />
        </label>
        <button className="button primary" disabled={busy}>
          提交审核
        </button>
        {message && <p role="status">{message}</p>}
      </form>
    </details>
  );
}
