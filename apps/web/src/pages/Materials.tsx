import { useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import {
  materialLimits,
  materialSchema,
  type OwnMaterial,
} from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";
import { Feedback, PageHeading } from "../components/ui";
import { MaterialImage } from "../components/Materials";
import { NeedLogin } from "./Account";

export function MaterialManager() {
  const { user } = useSession();
  return user ? <Manager /> : <NeedLogin />;
}
const statuses: Record<string, string> = {
  PENDING: "等待审核",
  APPROVED: "已通过审核",
  REJECTED: "未通过审核",
  WITHDRAWN: "已撤回",
};
function Manager() {
  const { id } = useParams();
  const { api } = useSession();
  const [version, setVersion] = useState(0);
  const resource = useResource<OwnMaterial[]>(
    `/me/posts/${id}/materials`,
    version,
  );
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [key, setKey] = useState(() => newClientKey());
  const [inputKey, setInputKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function upload(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setMessage("");
    if (!file || file.size > materialLimits.maxBytes) {
      setError("请选择不超过 10MB 的 JPEG、PNG 或 WebP 图片");
      return;
    }
    const parsed = materialSchema.safeParse({
      source,
      visibility,
      clientKey: key,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    const form = new FormData();
    for (const [k, v] of Object.entries(parsed.data)) form.append(k, v);
    form.append("file", file);
    setBusy(true);
    try {
      await api(`/posts/${id}/materials`, { method: "POST", body: form });
      setMessage("材料已上传，审核前不会公开。可继续添加其他材料。");
      setFile(undefined);
      setSource("");
      setKey(newClientKey());
      setInputKey((v) => v + 1);
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(materialId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/materials/${materialId}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      setMessage("材料已撤回，原公开链接已失效。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-page">
      <PageHeading
        eyebrow="图片与来源"
        title="为经历补充材料"
        description="每帖最多 6 份待审或通过的材料。支持静态 JPEG、PNG、WebP，单张最多 10MB、2000 万像素。原件仅本人和授权审核人员可读，公开使用审核后的脱敏副本。"
      />
      {resource.data ? (
        <>
          <form className="form-surface" onSubmit={upload}>
            <label>
              选择图片
              <input
                key={inputKey}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0]);
                  setKey(newClientKey());
                }}
              />
            </label>
            <label>
              来源与关联说明
              <textarea
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setKey(newClientKey());
                }}
                required
                minLength={5}
                maxLength={500}
                placeholder="材料从哪里获得？支持哪项陈述？公开材料的此说明也会公开，请勿填写私人信息。"
              />
            </label>
            <label>
              材料可见范围
              <select
                value={visibility}
                onChange={(e) => {
                  setVisibility(e.target.value);
                  setKey(newClientKey());
                }}
              >
                <option value="PUBLIC">审核后公开脱敏副本</option>
                <option value="REVIEW_ONLY">仅供审核</option>
              </select>
            </label>
            <button className="button primary" disabled={busy}>
              {busy ? "正在处理…" : "上传材料"}
            </button>
            <p className="small-note">
              上传失败时可直接重试。若要改动已提交的说明或范围，请撤回后重新上传。
            </p>
          </form>
          <section className="material-own-list" aria-label="我的材料">
            {resource.data.map((item) => (
              <article key={item.id}>
                <h2>
                  {statuses[item.status]} ·{" "}
                  {item.visibility === "PUBLIC" ? "申请公开" : "仅供审核"}
                </h2>
                <p className="revision-text">{item.source}</p>
                {item.status !== "WITHDRAWN" && (
                  <details>
                    <summary>查看审核用预览</summary>
                    <MaterialImage
                      id={item.id}
                      variant="preview"
                      alt="本人材料的审核预览，并非最终公开副本"
                    />
                  </details>
                )}
                {item.reason && (
                  <p className="small-note">审核说明：{item.reason}</p>
                )}
                {item.status !== "WITHDRAWN" && (
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void withdraw(item.id)}
                  >
                    撤回此材料
                  </button>
                )}
              </article>
            ))}
          </section>
        </>
      ) : (
        <Feedback loading={resource.loading} error={resource.error} />
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <Link className="back-link" to="/my">
        返回我的记录
      </Link>
    </div>
  );
}

// getRandomValues also works on local HTTP LAN pages where randomUUID is unavailable.
function newClientKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}
