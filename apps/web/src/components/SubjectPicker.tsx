import { useState } from "react";
import type { Page, Subject } from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { Pagination } from "./Pagination";

export function SubjectPicker({
  selected,
  onChange,
}: {
  selected: Subject | null;
  onChange: (subject: Subject | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Subject>>(
    `/subjects?${new URLSearchParams({ q: search, page: String(page) })}`,
  );
  const items = resource.data?.items ?? [];
  function find() {
    setSearch(query.trim());
    setPage(1);
  }
  return (
    <div className="subject-picker">
      <label>
        搜索对象名称或门店地址
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              find();
            }
          }}
        />
      </label>
      <button type="button" className="button secondary" onClick={find}>
        查找对象
      </button>
      <label>
        这次经历关于谁？
        <select
          aria-label="选择对象"
          required
          value={selected?.id ?? ""}
          onChange={(e) =>
            onChange(
              items.find((s) => s.id === e.target.value) ??
                (selected?.id === e.target.value ? selected : null),
            )
          }
        >
          <option value="">请选择具体对象</option>
          {selected && !items.some((s) => s.id === selected.id) && (
            <option value={selected.id}>
              已选：{selected.name} · {selected.city} · {selected.address}
            </option>
          )}
          {items.map((s) => (
            <option value={s.id} key={s.id}>
              {s.name} · {s.city}
              {s.address ? ` · ${s.address}` : ""}
            </option>
          ))}
        </select>
      </label>
      {resource.loading ? (
        <p role="status" className="small-note">
          正在查找对象…
        </p>
      ) : resource.error ? (
        <p className="error" role="alert">
          {resource.error}
        </p>
      ) : (
        <p className="small-note">
          {resource.data?.total
            ? `找到 ${resource.data.total} 个对象。`
            : "没有找到对象，可以换个关键词或添加新对象。"}
          {selected && ` 当前选择：${selected.name}。`}
        </p>
      )}
      {resource.data && (
        <Pagination
          label="对象选择分页"
          page={page}
          total={resource.data.total}
          onChange={setPage}
          loading={resource.loading}
        />
      )}
    </div>
  );
}
