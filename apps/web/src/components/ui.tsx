import { Link } from "react-router";
import {
  ArrowUpRight,
  Building2,
  Utensils,
  Mountain,
  Boxes,
  ArrowRight,
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
export function PostCard({ post }: { post: PublicPost }) {
  return (
    <article className="post-card">
      <div className="post-top">
        <Link className="object-link" to={`/subjects/${post.subject.id}`}>
          <span
            className={`object-icon ${post.subject.category.toLowerCase()}`}
          >
            <CategoryIcon category={post.subject.category} />
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
          <ArrowUpRight size={19} />
        </h3>
        <p>{post.body}</p>
      </Link>
      <div className="post-bottom">
        <span>
          <span className="avatar">
            {post.anonymous ? "匿" : post.authorName.slice(0, 1)}
          </span>
          {post.authorName}
        </span>
        <span>
          {date(post.occurredOn)}发生 <span className="meta-dot">·</span>{" "}
          查看后续 <ArrowRight size={13} />
        </span>
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
  if (error)
    return (
      <div className="feedback error" role="alert">
        {error}
      </div>
    );
  if (loading)
    return (
      <div className="loading" role="status">
        正在读取记录<span>…</span>
      </div>
    );
  return <div className="feedback">{empty ?? "还没有记录。"}</div>;
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
      <div className="eyebrow">{eyebrow}</div>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </header>
  );
}
