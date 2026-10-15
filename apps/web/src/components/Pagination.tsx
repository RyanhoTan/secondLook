export function Pagination({
  page,
  total,
  onChange,
  label,
  pageSize = 12,
  loading = false,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  label: string;
  pageSize?: number;
  loading?: boolean;
}) {
  if (total <= pageSize && page === 1) return null;
  return (
    <nav className="pagination" aria-label={label}>
      <button
        type="button"
        disabled={loading || page <= 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <span role="status">
        第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
      </span>
      <button
        type="button"
        disabled={loading || page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  );
}
