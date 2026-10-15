import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { CheckCircle2 } from "lucide-react";
import {
  categories,
  postSchema,
  type Subject,
  type Page,
  type Category,
} from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { NeedLogin } from "./Account";
import { PageHeading } from "../components/ui";
export function Write() {
  const { user } = useSession();
  return user ? <WriteForm /> : <NeedLogin />;
}
function WriteForm() {
  const { api } = useSession();
  const [version, setVersion] = useState(0);
  const subjects = useResource<Page<Subject>>("/subjects?limit=50", version);
  const [selected, setSelected] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
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
      setVersion((v) => v + 1);
      setSelected(subject.id);
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const data = {
      subjectId: selected,
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
    setBusy(true);
    setError("");
    try {
      await api("/posts", {
        method: "POST",
        body: JSON.stringify(checked.data),
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
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
          description="经历正在等待审核，通过后才会公开。你可以在“我的记录”查看状态。"
        />
        <Link className="button primary" to="/my">
          查看我的记录
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
      {subjects.error && (
        <p role="alert" className="error">
          {subjects.error}
        </p>
      )}
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
          <label>
            这次经历关于谁？
            <select
              aria-label="选择对象"
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">选择公司、门店、景点或其他对象</option>
              {subjects.data?.items.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.city}
                </option>
              ))}
            </select>
          </label>
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
            当前阶段支持文字经历，图片与佐证功能将在后续步骤加入。所有投稿先审核，后公开。
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? "正在提交…" : "提交审核"}
          </button>
        </form>
      )}
    </div>
  );
}
