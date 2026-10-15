import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  ArrowUpRight,
  Search,
  SlidersHorizontal,
  ArrowRight,
} from "lucide-react";
import {
  categories,
  type Category,
  type Page,
  type PublicPost,
  type Subject,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { PostCard, Feedback, CategoryIcon } from "../components/ui";
export function Discover() {
  const [category, setCategory] = useState<Category | "">("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [activeCity, setActiveCity] = useState("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    q: search,
    page: String(page),
    city: activeCity,
    ...(category ? { category } : {}),
  });
  const posts = useResource<Page<PublicPost>>(`/posts?${params}`);
  const subjects = useResource<Page<Subject>>(`/subjects?${params}`);
  function submit(e: FormEvent) {
    e.preventDefault();
    setSearch(query);
    setActiveCity(city);
    setPage(1);
  }
  return (
    <>
      <section className="hero">
        <div className="eyebrow">多看一面，再做决定</div>
        <h1>发现经历</h1>
        <p>搜索你关心的对象，看看亲历记录与后续变化。</p>
      </section>
      <form className="search-bar" onSubmit={submit}>
        <Search size={20} />
        <input
          aria-label="搜索公司、饭店、景点或经历"
          placeholder="搜索公司、饭店、景点，或你关心的问题"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="city-filter">
          <SlidersHorizontal size={15} />
          <input
            aria-label="筛选城市"
            placeholder="全国"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
        <button className="button search-submit" type="submit">
          搜索
          <ArrowRight size={15} />
        </button>
      </form>
      <div className="discover-grid">
        <section className="feed">
          <div className="feed-heading">
            <h2>
              经历广场<span>{posts.data?.total ?? "—"}</span>
            </h2>
            <span>按发布时间</span>
          </div>
          <div className="category-tabs" role="group" aria-label="经历分类">
            {[["", "全部经历"], ...Object.entries(categories)].map(
              ([key, label]) => (
                <button
                  key={key}
                  aria-pressed={category === key}
                  className={category === key ? "selected" : ""}
                  onClick={() => {
                    setCategory(key as Category | "");
                    setPage(1);
                  }}
                >
                  {key && <CategoryIcon category={key as Category} size={16} />}
                  {label}
                </button>
              ),
            )}
          </div>
          {posts.error || posts.loading ? (
            <Feedback error={posts.error} loading={posts.loading} />
          ) : posts.data?.items.length ? (
            <div className="post-list">
              {posts.data.items.map((post) => (
                <PostCard post={post} key={post.id} />
              ))}
            </div>
          ) : (
            <Feedback empty="没有找到相关经历。试试其他关键词，或记录你的第一次体验。" />
          )}
          {posts.data && posts.data.total > 12 && (
            <div className="pagination">
              <button
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                上一页
              </button>
              <span>第 {page} 页</span>
              <button
                disabled={page * 12 >= posts.data.total}
                onClick={() => setPage((p) => p + 1)}
              >
                下一页
              </button>
            </div>
          )}
        </section>
        <aside className="reading-aside">
          <section className="aside-guide">
            <div className="eyebrow">阅读之前</div>
            <h3>看标签，也看依据。</h3>
            <div className="guide-row">
              <i className="guide-dot gray" />
              <div>
                <strong>仅本人陈述</strong>
                <p>来自发布者的亲历描述</p>
              </div>
            </div>
            <div className="guide-row">
              <i className="guide-dot blue" />
              <div>
                <strong>已附材料</strong>
                <p>有相关材料，不代表已证实</p>
              </div>
            </div>
            <div className="guide-row">
              <i className="guide-dot teal" />
              <div>
                <strong>有独立佐证</strong>
                <p>有经检查的独立支持资料</p>
              </div>
            </div>
            <div className="guide-row">
              <i className="guide-dot amber" />
              <div>
                <strong>存在争议</strong>
                <p>请同时查看异议与后续</p>
              </div>
            </div>
          </section>
          {!!subjects.data?.items.length && (
            <section className="aside-objects">
              <div className="eyebrow">看看具体对象</div>
              {subjects.data.items.slice(0, 3).map((s) => (
                <Link to={`/subjects/${s.id}`} key={s.id}>
                  <span>
                    {s.name}
                    <small>
                      {s.city} · {s.postCount} 条公开记录
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </Link>
              ))}
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
