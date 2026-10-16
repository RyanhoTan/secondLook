import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router";
import { useDraftEditor } from "@secondlook/compose";
import { CheckCircle2 } from "lucide-react";
import { categories, type Subject, type Category } from "@secondlook/contracts";
import { newClientKey } from "../lib/client-key";
import { useSession } from "../lib/session";
import { SubjectPicker } from "../components/SubjectPicker";
import { IssuePicker, IssueTypes } from "../components/IssueTypes";
import { NeedLogin } from "./Account";
import { Feedback, PageHeading } from "../components/ui";
export function Write() {
  const { user } = useSession();
  const [params] = useSearchParams();
  const id = params.get("draft");
  if (!user) return <NeedLogin />;
  if (!id)
    return <Navigate replace to={`/write?draft=${newClientKey()}&fresh=1`} />;
  return (
    <WriteForm
      key={`${user.id}:${id}`}
      id={id}
      fresh={params.get("fresh") === "1"}
    />
  );
}
function WriteForm({ id, fresh }: { id: string; fresh: boolean }) {
  const { api } = useSession();
  const draft = useDraftEditor(api, id, fresh, newClientKey);
  const {
    content,
    edit,
    pending,
    busy,
    done,
    subject: selected,
    selectSubject: setSelected,
  } = draft;
  const [creating, setCreating] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  const confirmationHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (pending) confirmationHeading.current?.focus();
  }, [pending]);
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateBusy(true);
    setCreateError("");
    try {
      const data = Object.fromEntries(new FormData(e.currentTarget));
      const subject = await api<Subject>("/subjects", {
        method: "POST",
        body: JSON.stringify(data),
      });
      setSelected(subject);
      setCreating(false);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }
  if (draft.loading || draft.loadError)
    return (
      <div className="form-page">
        <Feedback loading={draft.loading} error={draft.loadError} />
        {draft.loadError && (
          <button
            className="button secondary"
            onClick={() => void draft.load()}
          >
            重试读取草稿
          </button>
        )}
      </div>
    );
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
      {(createError || draft.error) && (
        <p role="alert" className="error">
          {createError || draft.error}
        </p>
      )}
      <div className="draft-actions">
        <p className="small-note" role="status">
          {draft.status}。保存到本地后端账号，草稿不会公开。
        </p>
        <Link className="back-link" to="/my#drafts">
          查看我的草稿
        </Link>
        {!pending && !draft.conflict && (
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void draft.save().catch(() => {})}
          >
            保存草稿
          </button>
        )}
        {draft.conflict && (
          <>
            <p className="error">
              读取最新草稿会替换当前输入，请先复制需要保留的文字。
            </p>
            <button
              type="button"
              className="button secondary"
              onClick={() => void draft.load()}
            >
              替换输入并读取最新草稿
            </button>
          </>
        )}
      </div>
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
          <IssueTypes value={pending.issueTypes} />
          <button
            type="button"
            className="button primary"
            disabled={busy || draft.conflict}
            onClick={() => void draft.submit()}
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
              <button disabled={createBusy} className="button primary">
                保存对象
              </button>
            </div>
          </form>
        ) : (
          <form
            className="form-surface"
            onSubmit={(e) => {
              e.preventDefault();
              void draft.submit();
            }}
          >
            <fieldset disabled={busy} className="compose-fields">
              <SubjectPicker selected={selected} onChange={setSelected} />
              <IssuePicker
                category={selected?.category}
                value={content.issueTypes}
                onChange={(issueTypes) => edit({ issueTypes })}
              />
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
                  value={content.title}
                  onChange={(e) => edit({ title: e.target.value })}
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
                  value={content.occurredOn}
                  onChange={(e) => edit({ occurredOn: e.target.value })}
                  type="date"
                  required
                  max={new Date().toISOString().slice(0, 10)}
                />
              </label>
              <label>
                说说你的亲身经历
                <textarea
                  name="body"
                  value={content.body}
                  onChange={(e) => edit({ body: e.target.value })}
                  required
                  minLength={20}
                  maxLength={5000}
                  rows={7}
                  placeholder="事情的经过、遇到的具体问题，以及目前的处理情况。请不要填写私人电话、住址等信息。"
                />
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="anonymous"
                  checked={content.anonymous}
                  onChange={(e) => edit({ anonymous: e.target.checked })}
                />
                <span>
                  对外匿名发布
                  <small>平台仍保留账号关联，公开页面隐藏你的昵称。</small>
                </span>
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  name="personalExperience"
                  checked={content.personalExperience}
                  onChange={(e) =>
                    edit({ personalExperience: e.target.checked })
                  }
                  required
                />
                <span>确认这是我的亲身经历，并愿意补充后续。</span>
              </label>
              <p className="small-note">
                提交后可添加图片材料，选择公开脱敏副本或仅供审核。所有投稿和材料先审核，后公开。
              </p>
              <button
                className="button primary"
                disabled={busy || draft.conflict}
              >
                {busy ? "正在提交…" : "提交审核"}
              </button>
            </fieldset>
          </form>
        )}
      </div>
    </div>
  );
}
