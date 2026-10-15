import { useEffect, useState } from "react";
import type { PublicMaterial } from "@secondlook/contracts";
import { useSession } from "../lib/session";
import { useResource } from "../lib/resource";

export function MaterialImage({
  id,
  variant = "public",
  alt,
  onLoad,
}: {
  id: string;
  variant?: "public" | "preview";
  alt: string;
  onLoad?: () => void;
}) {
  const { api } = useSession();
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let local = "";
    setUrl("");
    setError("");
    api<Blob>(`/materials/${id}/${variant}`, {
      responseType: "blob",
      signal: controller.signal,
    })
      .then((blob) => {
        if (!controller.signal.aborted) {
          local = URL.createObjectURL(blob);
          setUrl(local);
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError((e as Error).message);
      });
    return () => {
      controller.abort();
      if (local) URL.revokeObjectURL(local);
    };
  }, [id, variant, api]);
  return error ? (
    <p role="alert" className="error">
      {error}
    </p>
  ) : url ? (
    <img className="material-image" src={url} alt={alt} onLoad={onLoad} />
  ) : (
    <p role="status" className="small-note">
      正在读取图片…
    </p>
  );
}

export function PublicMaterials({ postId }: { postId: string }) {
  const resource = useResource<PublicMaterial[]>(`/posts/${postId}/materials`);
  if (resource.error)
    return (
      <p role="alert" className="error">
        材料读取失败：{resource.error}
      </p>
    );
  if (!resource.data?.length) return null;
  return (
    <section className="public-materials" aria-label="公开材料">
      <h2>相关材料</h2>
      <p className="small-note">
        材料已完成基础检查，不代表事实已被证实。仅供审核的材料不在此展示。
      </p>
      {resource.data.map((item) => (
        <figure key={item.id}>
          <MaterialImage id={item.id} alt="审核通过的公开材料" />
          <figcaption>{item.source}</figcaption>
        </figure>
      ))}
    </section>
  );
}
