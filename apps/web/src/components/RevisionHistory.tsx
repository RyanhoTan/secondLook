import { useState, type FormEvent } from "react";
import type { PublicRevision } from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { date } from "../lib/resource";
import { PublicMaterials } from "./Materials";

export function RevisionHistory({
  history,
  currentVersion,
  onChange,
  postId,
}: {
  history: PublicRevision[];
  currentVersion: number;
  onChange: () => void;
  postId: string;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  return (
    <details className="revision-history">
      <summary>版本历史 · 当前第 {currentVersion} 版</summary>
      <p className="small-note">
        历史用于理解更正，当前内容以最新公开版本为准。涉及隐私的旧内容可能限制公开。
      </p>
      {history.map((item) => (
        <article key={item.id}>
          <h3>
            第 {item.version} 版
            {item.version === currentVersion ? " · 当前" : ""}
          </h3>
          <small>{date(item.publishedAt)}公开</small>
          {item.visible ? (
            <>
              <p className="revision-text">{item.changeReason}</p>
              <details
                onToggle={(e) => {
                  const open = e.currentTarget.open;
                  setExpanded((state) => ({ ...state, [item.id]: open }));
                }}
              >
                <summary>阅读此版本</summary>
                <h4>{item.title}</h4>
                <p className="small-note">{item.occurredOn}发生</p>
                <p className="revision-text">{item.body}</p>
                {expanded[item.id] && item.version !== currentVersion && (
                  <PublicMaterials postId={postId} version={item.version} />
                )}
              </details>
              {item.version !== currentVersion && (
                <HideHistory id={item.id} onChange={onChange} />
              )}
            </>
          ) : (
            <p>此版本已限制公开，处理记录由平台保留。</p>
          )}
        </article>
      ))}
    </details>
  );
}
function HideHistory({ id, onChange }: { id: string; onChange: () => void }) {
  const { api, user } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (user?.role !== "ADMIN") return null;
  async function hide(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const reason = new FormData(e.currentTarget).get("reason");
    setBusy(true);
    setError("");
    try {
      await api(`/admin/history/${id}/hide`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      onChange();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="history-moderation" onSubmit={hide}>
      <label>
        隐藏历史的处理理由
        <input name="reason" required minLength={2} maxLength={500} />
      </label>
      <button className="button secondary" disabled={busy}>
        {busy ? "正在处理…" : "限制此历史版本公开"}
      </button>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
