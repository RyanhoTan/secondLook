import type { RefObject } from "react";
import type { PostPreview as Preview } from "@secondlook/compose";
import { categories } from "@secondlook/contracts";
import { IssueTypes } from "./IssueTypes";

export function PostPreview({
  preview,
  nickname,
  busy,
  conflict,
  headingRef,
  onBack,
  onSubmit,
}: {
  preview: Preview;
  nickname: string;
  busy: boolean;
  conflict: boolean;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { content, subject } = preview;
  return (
    <section className="form-surface post-preview" aria-label="发布前预览">
      <h2 ref={headingRef} tabIndex={-1}>
        发布前预览
      </h2>
      <p className="small-note">
        请核对以下内容。提交后先审核，通过后才会公开。
      </p>
      <div className="preview-object">
        <strong>{subject.name}</strong>
        <p className="small-note">
          {categories[subject.category]} · {subject.city}
        </p>
        <p className="small-note">{subject.address || "未填写具体地址"}</p>
      </div>
      <h3>{content.title}</h3>
      <p className="small-note">发生日期：{content.occurredOn}</p>
      <p className="preview-identity">
        对外身份：{content.anonymous ? "匿名亲历者" : nickname}
      </p>
      <p className="small-note">
        {content.anonymous
          ? "公开页面隐藏账号昵称，平台仍保留账号关联。"
          : "公开页面会显示你的昵称。"}
      </p>
      <IssueTypes value={content.issueTypes} />
      <div className="revision-text preview-body">{content.body}</div>
      <p className="small-note">
        已确认亲身经历。问题类型仅作分类，不代表事实已被平台确认。图片材料可在投稿后单独添加、脱敏并审核。
      </p>
      <div className="form-actions">
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={onBack}
        >
          返回修改
        </button>
        <button
          type="button"
          className="button primary"
          disabled={busy || conflict}
          onClick={onSubmit}
        >
          {busy ? "正在提交…" : "提交审核"}
        </button>
      </div>
    </section>
  );
}
