import { Link } from "react-router";
import {
  Building2,
  Utensils,
  Mountain,
  Boxes,
  ArrowUpRight,
  Clock3,
  AlertCircle,
  Inbox,
} from "lucide-react";
import {
  categories,
  evidenceLabels,
  type Category,
  type PublicPost,
} from "@secondlook/contracts";
import { date } from "../lib/resource";
export function CategoryIcon({
  category,
  size = 20,
}: {
  category: Category;
  size?: number;
}) {
  const Icon = {
    COMPANY: Building2,
    RESTAURANT: Utensils,
    ATTRACTION: Mountain,
    OTHER: Boxes,
  }[category];
  return <Icon size={size} strokeWidth={1.6} />;
}
export function EvidenceTag({
  post,
}: {
  post: Pick<PublicPost, "evidence" | "disputed">;
}) {
  return (
    <span className="tags">
      <span className={`tag ${post.evidence.toLowerCase()}`}>
        <i />
        {evidenceLabels[post.evidence]}
      </span>
      {post.disputed && (
        <span className="tag disputed">
          <i />
          存在争议
        </span>
      )}
    </span>
  );
}
export function PostCard({
  post,
  index = 0,
}: {
  post: PublicPost;
  index?: number;
}) {
  return (
    <article className="post-card">
      <div className="record-index" aria-hidden="true">
        {String(index + 1).padStart(2, "0")}
      </div>
      <div className="record-main">
        <div className="post-top">
          <Link className="object-link" to={`/subjects/${post.subject.id}`}>
            <span className="object-icon">
              <CategoryIcon category={post.subject.category} size={17} />
            </span>
            <span>
              <strong>{post.subject.name}</strong>
              <small>
                {categories[post.subject.category]}
                <span>·</span>
                {post.subject.city}
              </small>
            </span>
          </Link>
          <EvidenceTag post={post} />
        </div>
        <Link className="post-content" to={`/posts/${post.id}`}>
          <h3>
            {post.title}
            <ArrowUpRight size={21} />
          </h3>
          <p>{post.body}</p>
        </Link>
        <div className="post-bottom">
          <span className="author">
            <span className="avatar">
              {post.anonymous ? "匿" : post.authorName.slice(0, 1)}
            </span>
            {post.authorName}
          </span>
          <span className="record-date">
            <Clock3 size={13} />
            {date(post.occurredOn)}发生
          </span>
          <Link className="record-follow" to={`/posts/${post.id}`}>
            查看后续
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </div>
    </article>
  );
}
export function Feedback({
  error,
  loading,
  empty,
}: {
  error?: string;
  loading?: boolean;
  empty?: string;
}) {
  if (loading)
    return (
      <div className="loading" role="status">
        <span className="loading-orbit" />
        正在读取记录…
      </div>
    );
  return (
    <div
      className={`feedback${error ? " error" : ""}`}
      role={error ? "alert" : undefined}
    >
      {error ? <AlertCircle size={24} /> : <Inbox size={28} />}
      <p>{error || empty || "还没有记录。"}</p>
    </div>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <header className="page-heading">
      <div className="section-kicker">{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
