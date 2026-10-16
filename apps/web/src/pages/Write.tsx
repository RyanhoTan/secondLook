import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import {
  categories,
  postSchema,
  type Subject,
  type Category,
  type PostSubmission,
} from "@secondlook/contracts";
import { ApiError } from "@secondlook/contracts/client";
import { newClientKey } from "../lib/client-key";
import { useSession } from "../lib/session";
import { SubjectPicker } from "../components/SubjectPicker";
import { NeedLogin } from "./Account";
import { PageHeading } from "../components/ui";
export function Write() {
  const { user } = useSession();
  return user ? <WriteForm /> : <NeedLogin />;
}
function WriteForm() {
  const { api } = useSession();
  const [selected, setSelected] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const [pending, setPending] = useState<PostSubmission | null>(null);
  const submitting = useRef(false);
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pending) confirmationHeading.current?.focus();
  }, [pending]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const subject = await api<Subject>("/subjects", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setSelected(subject);
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting.current || busy) return;
    const form = new FormData(e.currentTarget);
    const data = {
      subjectId: selected?.id ?? "",
      title: form.get("title"),
      body: form.get("body"),
      occurredOn: form.get("occurredOn"),
      anonymous: form.get("anonymous") === "on",
      personalExperience: form.get("personalExperience") === "on",
    };
    const checked = postSchema.safeParse(data);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    await send({ ...checked.data, clientKey: newClientKey() });
  }
  async function send(data: PostSubmission) {
    if (submitting.current) return;
    submitting.current = true;
    setPending(data);
    setBusy(true);
    setError("");
    try {
      const post = await api<{ id: string }>("/posts", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setDone(post.id);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? e.message
          : "连接中断，尚未确认投稿结果，请重试确认。",
      );
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 409].includes(e.status)
      )
        setPending(null);
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="success-page">
        <CheckCircle2 size={42} strokeWidth={1.3} />
        <PageHeading
          eyebrow="记录已经收到"
          title="感谢你，多留一份依据。"
          description="本次投稿已确认。你可以在“我的记录”查看当前审核状态；通过审核后才会公开。"
        />
        <Link className="button primary" to="/my">
          查看我的记录
        </Link>
        <Link className="back-link" to={`/posts/${done}/materials`}>
          添加图片材料（可选）
        </Link>
      </div>
    );
  return (
    <div className="form-page">
      <PageHeading
        eyebrow="真实、具体，也允许有后续"
        title="记录一次经历"
        description="说清发生了什么，比一句“避雷”更有帮助。"
      />
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {pending && (
        <section className="form-surface" aria-label="确认投稿结果">
          <h2 ref={confirmationHeading} tabIndex={-1}>
            {busy ? "正在确认投稿…" : "确认这次投稿的结果"}
          </h2>
          <p className="small-note" role="status">
            {busy
              ? "请稍候，内容正在提交。"
              : "尚未确认提交结果。重试会核对同一份投稿，不会重复创建；请先确认结果再编辑或提交新的经历。"}
          </p>
          <h3>{pending.title}</h3>
          <p className="small-note">
            {selected?.name} · {pending.occurredOn} ·{" "}
            {pending.anonymous ? "匿名亲历者" : "使用昵称"}
          </p>
          <p className="revision-text">{pending.body}</p>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() => void send(pending)}
          >
            {busy ? "正在确认…" : "重试并确认结果"}
          </button>
        </section>
      )}
      <div hidden={!!pending}>
        {creating ? (
          <form className="form-surface" onSubmit={create}>
            <h2>添加一个具体对象</h2>
            <label>
              名称
              <input name="name" required minLength={2} maxLength={80} />
            </label>
            <div className="form-columns">
              <label>
                类别
                <select name="category">
                  {Object.entries(categories).map(([k, v]) => (
                    <option value={k as Category} key={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                城市
                <input name="city" required minLength={2} maxLength={30} />
              </label>
            </div>
            <label>
              地址/门店信息
              <input name="address" maxLength={150} />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setCreating(false)}
              >
                返回
              </button>
              <button disabled={busy} className="button primary">
                保存对象
              </button>
            </div>
          </form>
        ) : (
          <form className="form-surface" onSubmit={submit}>
            <SubjectPicker selected={selected} onChange={setSelected} />
            <button
              type="button"
              className="text-button add-subject"
              onClick={() => setCreating(true)}
            >
              找不到？添加一个新对象
            </button>
            <label>
              用一句话概括
              <input
                name="title"
                required
                minLength={5}
                maxLength={80}
                placeholder="具体一点，比如菜单标注与实际收费不一致"
              />
            </label>
            <label>
              发生日期
              <input
                name="occurredOn"
                type="date"
                required
                max={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              说说你的亲身经历
              <textarea
                name="body"
                required
                minLength={20}
                maxLength={5000}
                rows={7}
                placeholder="事情的经过、遇到的具体问题，以及目前的处理情况。请不要填写私人电话、住址等信息。"
              />
            </label>
            <label className="checkbox">
              <input type="checkbox" name="anonymous" defaultChecked />
              <span>
                对外匿名发布
                <small>平台仍保留账号关联，公开页面隐藏你的昵称。</small>
              </span>
            </label>
            <label className="checkbox">
              <input type="checkbox" name="personalExperience" required />
              <span>确认这是我的亲身经历，并愿意补充后续。</span>
            </label>
            <p className="small-note">
              提交后可添加图片材料，选择公开脱敏副本或仅供审核。所有投稿和材料先审核，后公开。
            </p>
            <button className="button primary" disabled={busy}>
              {busy ? "正在提交…" : "提交审核"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
