import { useEffect, useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import {
  categories,
  postBrowseSchema,
  postBrowseParams,
  postSortLabels,
  type Category,
  type Page,
  type PublicPost,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { PostCard, Feedback, CategoryIcon } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { EvidenceGuide } from "../components/EvidenceGuide";
function filterInputs(params: URLSearchParams) {
  return {
    q: params.get("q") ?? "",
    city: params.get("city") ?? "",
    occurredFrom: params.get("occurredFrom") ?? "",
    occurredTo: params.get("occurredTo") ?? "",
    sort: params.get("sort") ?? "PUBLISHED_DESC",
  };
}
export function Discover() {
  const [params, setParams] = useSearchParams();
  const [inputs, setInputs] = useState(() => filterInputs(params));
  const [error, setError] = useState("");
  useEffect(() => {
    setInputs(filterInputs(params));
    setError("");
  }, [params]);
  const active = postBrowseSchema.safeParse(Object.fromEntries(params));
  const page = active.success ? active.data.page : 1;
  const pageSize = active.success ? active.data.limit : 12;
  const category = params.get("category") ?? "";
  const sortLabel = active.success
    ? postSortLabels[active.data.sort]
    : "请检查筛选条件";
  const posts = useResource<Page<PublicPost>>(`/posts?${params}`);
  function apply(patch: { category?: Category | "" } = {}) {
    const checked = postBrowseSchema.safeParse({
      ...Object.fromEntries(params),
      ...inputs,
      ...patch,
      category: (patch.category ?? category) || undefined,
      page: 1,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setError("");
    setParams(postBrowseParams(checked.data));
  }
  function submit(e: FormEvent) {
    e.preventDefault();
    apply();
  }
  function setPage(next: number) {
    if (active.success)
      setParams(postBrowseParams({ ...active.data, page: next }));
  }
  return (
    <div className="discover-page">
      <section className="discovery-heading">
        <span className="section-kicker">A little more perspective.</span>
        <h1>
          发现经历
          <span className="heading-dot" aria-hidden="true">
            .
          </span>
        </h1>
        <p>在决定之前，听听另一种声音。</p>
      </section>
      <form className="discovery-search" onSubmit={submit}>
        <div className="search-bar">
          <Search size={22} strokeWidth={1.7} />
          <input
            aria-label="搜索公司、饭店、景点或经历"
            placeholder="搜索你关心的公司、餐厅、目的地…"
            value={inputs.q}
            onChange={(e) => setInputs({ ...inputs, q: e.target.value })}
            maxLength={100}
          />
          <label className="city-filter">
            <MapPin size={16} />
            <input
              aria-label="筛选城市"
              placeholder="全国"
              value={inputs.city}
              onChange={(e) => setInputs({ ...inputs, city: e.target.value })}
              maxLength={30}
            />
          </label>
          <button className="search-submit" type="submit" aria-label="搜索">
            <ArrowRight size={20} />
          </button>
        </div>
        <details className="browse-filters">
          <summary>时间与排序</summary>
          <div className="browse-filter-fields">
            <label>
              发生日期从
              <input
                type="date"
                value={inputs.occurredFrom}
                onChange={(e) =>
                  setInputs({ ...inputs, occurredFrom: e.target.value })
                }
              />
            </label>
            <label>
              发生日期至
              <input
                type="date"
                value={inputs.occurredTo}
                onChange={(e) =>
                  setInputs({ ...inputs, occurredTo: e.target.value })
                }
              />
            </label>
            <label>
              排序方式
              <select
                value={inputs.sort}
                onChange={(e) => setInputs({ ...inputs, sort: e.target.value })}
              >
                {Object.entries(postSortLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="button secondary">
              应用筛选
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => setParams({})}
            >
              清除筛选
            </button>
          </div>
        </details>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
      </form>
      <div className="browse-toolbar">
        <LayoutGroup id="category-filter">
          <div className="category-tabs" role="group" aria-label="经历分类">
            {[["", "全部经历"], ...Object.entries(categories)].map(
              ([key, label]) => (
                <button
                  key={key}
                  aria-pressed={category === key}
                  onClick={() => {
                    apply({ category: key as Category | "" });
                  }}
                >
                  {category === key && (
                    <motion.span
                      className="category-selection"
                      layoutId="category-selection"
                      transition={{ type: "spring", bounce: 0, duration: 0.35 }}
                    />
                  )}
                  <span className="category-label">
                    {key && (
                      <CategoryIcon category={key as Category} size={17} />
                    )}
                    <span>{label}</span>
                  </span>
                </button>
              ),
            )}
          </div>
        </LayoutGroup>
        <EvidenceGuide />
      </div>
      <section className="experience-section">
        <div className="feed-heading">
          <h2>
            {params.get("q")
              ? "搜索结果"
              : active.success && active.data.sort !== "PUBLISHED_DESC"
                ? "经历列表"
                : "最新经历"}
            <span>{posts.data?.total ?? "—"}</span>
          </h2>
          <span>{sortLabel}</span>
        </div>
        <p className="browse-sample small-note">
          {active.success &&
            (active.data.occurredFrom || active.data.occurredTo) &&
            `发生日期：${active.data.occurredFrom ?? "不限"} 至 ${active.data.occurredTo ?? "不限"}。`}
          仅统计当前范围内已公开的经历，不代表对象整体评价。
        </p>
        {posts.error || posts.loading ? (
          <Feedback error={posts.error} loading={posts.loading} />
        ) : posts.data?.items.length ? (
          <div className="post-list">
            {posts.data.items.map((post, index) => (
              <PostCard post={post} index={index} key={post.id} />
            ))}
          </div>
        ) : (
          <Feedback empty="没有找到相关经历。试试其他关键词，或记录你的第一次体验。" />
        )}
        {posts.data && (
          <Pagination
            label="经历分页"
            page={page}
            pageSize={pageSize}
            total={posts.data.total}
            onChange={setPage}
            loading={posts.loading}
          />
        )}
      </section>
      <div className="reading-note">
        <span className="note-symbol" aria-hidden="true">
          ↳
        </span>
        <p>
          经历可以被补充，判断也可以改变。
          <br />
          <strong>关注后续，给事情一点时间。</strong>
        </p>
      </div>
    </div>
  );
}
