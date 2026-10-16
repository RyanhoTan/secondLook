import { useState } from "react";
import { Link } from "react-router";
import type { Page, PostDraft } from "@secondlook/contracts";
import { useResource, date } from "../lib/resource";
import { Feedback } from "./ui";
import { Pagination } from "./Pagination";

export function DraftList() {
  const [page, setPage] = useState(1);
  const resource = useResource<Page<PostDraft>>(`/me/drafts?page=${page}`);
  return (
    <section id="drafts" className="draft-list" aria-label="我的草稿">
      <h2>我的草稿</h2>
      <p className="small-note">
        只有你可以读取。已保存的内容可在重新登录或换设备后继续；离线未保存的修改仍须保持编辑页。
      </p>
      {!resource.data ? (
        <Feedback loading={resource.loading} error={resource.error} />
      ) : resource.data.items.length ? (
        resource.data.items.map((d) => (
          <article key={d.id}>
            <p className="small-note">
              {d.postId ? "已提交，结果可核对" : "未提交"} · {date(d.updatedAt)}{" "}
              · {d.subject?.name ?? "尚未选择对象"}
            </p>
            <h3>{d.title || "未命名草稿"}</h3>
            <Link className="back-link" to={`/write?draft=${d.id}`}>
              {d.postId ? "查看投稿结果" : "继续编辑"}
            </Link>
          </article>
        ))
      ) : (
        <p className="small-note">还没有保存的草稿。</p>
      )}
      {resource.data && (
        <Pagination
          label="草稿分页"
          page={page}
          total={resource.data.total}
          onChange={setPage}
        />
      )}
    </section>
  );
}
