import { useState, type FormEvent } from "react";
import { Search, MapPin, ArrowRight } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import {
  categories,
  type Category,
  type Page,
  type PublicPost,
} from "@secondlook/contracts";
import { useResource } from "../lib/resource";
import { PostCard, Feedback, CategoryIcon } from "../components/ui";
import { EvidenceGuide } from "../components/EvidenceGuide";
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
  function submit(e: FormEvent) {
    e.preventDefault();
    setSearch(query);
    setActiveCity(city);
    setPage(1);
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
      <form className="search-bar" onSubmit={submit}>
        <Search size={22} strokeWidth={1.7} />
        <input
          aria-label="搜索公司、饭店、景点或经历"
          placeholder="搜索你关心的公司、餐厅、目的地…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <label className="city-filter">
          <MapPin size={16} />
          <input
            aria-label="筛选城市"
            placeholder="全国"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
        </label>
        <button className="search-submit" type="submit" aria-label="搜索">
          <ArrowRight size={20} />
        </button>
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
                    setCategory(key as Category | "");
                    setPage(1);
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
            {search ? "搜索结果" : "最新经历"}
            <span>{posts.data?.total ?? "—"}</span>
          </h2>
          <span>按发布时间</span>
        </div>
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
        {posts.data && posts.data.total > 12 && (
          <div className="pagination">
            <button disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
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
