import { useEffect, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { Search, MapPin, ArrowRight } from "lucide-react";
import {
  categories,
  paginationSchema,
  subjectBrowseParams,
  type Category,
  type Page,
  type Subject,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { CategoryFilter } from "../components/CategoryFilter";
import { Pagination } from "../components/Pagination";
import { CategoryIcon, Feedback, PageHeading } from "../components/ui";

export function Objects() {
  const [params, setParams] = useSearchParams();
  const [q, setQuery] = useState(params.get("q") ?? "");
  const [city, setCity] = useState(params.get("city") ?? "");
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const queryParam = params.get("q") ?? "";
  const cityParam = params.get("city") ?? "";
  useEffect(() => {
    setQuery(queryParam);
    setCity(cityParam);
    setError("");
  }, [queryParam, cityParam]);
  const parsed = paginationSchema.safeParse(Object.fromEntries(params));
  const subjects = useResource<Page<Subject>>(`/subjects?${params}`, revision);
  const category = params.get("category") ?? "";
  function apply(patch: { category?: Category | "" } = {}) {
    const checked = paginationSchema.safeParse({
      ...Object.fromEntries(params),
      q,
      city,
      category: (patch.category ?? category) || undefined,
      page: 1,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setError("");
    setParams(subjectBrowseParams(checked.data));
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    apply();
  }
  return (
    <div className="objects-page">
      <Link className="back-link" to="/">
        返回经历
      </Link>
      <PageHeading
        eyebrow="找到具体对象，再看相关经历"
        title="查找对象"
        description="按名称或门店地址查找公司、饭店、景点，也包含暂无公开经历的对象。"
      />
      <form className="search-bar" onSubmit={submit}>
        <Search size={22} strokeWidth={1.7} />
        <input
          aria-label="搜索对象名称或门店地址"
          placeholder="名称或门店地址"
          value={q}
          onChange={(e) => setQuery(e.target.value)}
          maxLength={100}
        />
        <label className="city-filter">
          <MapPin size={16} />
          <input
            aria-label="对象所在城市"
            placeholder="全国"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            maxLength={30}
          />
        </label>
        <button className="search-submit" type="submit" aria-label="查找对象">
          <ArrowRight size={20} />
        </button>
      </form>
      <div className="object-toolbar">
        <CategoryFilter
          value={category}
          onChange={(category) => apply({ category })}
          label="对象分类"
          allLabel="全部对象"
        />
        <button
          className="text-button"
          type="button"
          onClick={() => {
            setQuery("");
            setCity("");
            setError("");
            setParams({});
          }}
        >
          清除条件
        </button>
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="feed-heading">
        <h2>
          对象结果<span>{subjects.data?.total ?? "—"}</span>
        </h2>
        <span>按收录时间</span>
      </div>
      <p className="small-note browse-sample">
        公开经历数量不代表对象整体质量；暂无记录不能作为好坏判断。
      </p>
      {subjects.loading || subjects.error ? (
        <>
          <Feedback loading={subjects.loading} error={subjects.error} />
          {subjects.error && (
            <button
              className="button secondary"
              onClick={() => refresh((v) => v + 1)}
            >
              重试查找
            </button>
          )}
        </>
      ) : subjects.data?.items.length ? (
        <div className="subject-results">
          {subjects.data.items.map((subject) => (
            <article className="subject-row" key={subject.id}>
              <div className="subject-identity">
                <span className="object-icon" aria-hidden="true">
                  <CategoryIcon category={subject.category} />
                </span>
                <Link to={`/subjects/${subject.id}`}>
                  <h3>{subject.name}</h3>
                  <p className="small-note">
                    {categories[subject.category]} · {subject.city}
                  </p>
                </Link>
              </div>
              <p className="subject-count">
                {subject.postCount
                  ? `${subject.postCount} 条公开经历`
                  : "暂无公开经历"}
              </p>
              <p className="subject-address small-note">
                {subject.address || "未填写具体地址"}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <Feedback empty="没有找到对象，试试其他名称、地址或城市。" />
      )}
      {subjects.data && parsed.success && (
        <Pagination
          label="对象检索分页"
          page={parsed.data.page}
          pageSize={parsed.data.limit}
          total={subjects.data.total}
          loading={subjects.loading}
          onChange={(page) =>
            setParams(subjectBrowseParams({ ...parsed.data, page }))
          }
        />
      )}
    </div>
  );
}
