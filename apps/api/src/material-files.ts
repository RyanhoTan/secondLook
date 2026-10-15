import sharp from "sharp";
import { randomUUID, createHash } from "node:crypto";
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { materialLimits, type Redaction } from "@secondlook/contracts";
import { HttpError } from "./http.js";

const formats: Record<string, string> = {
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};
export async function prepareImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > materialLimits.maxBytes)
    throw new HttpError(400, "图片为空或超过 10MB");
  try {
    const image = sharp(bytes, {
      limitInputPixels: materialLimits.maxPixels,
      failOn: "warning",
    });
    const metadata = await image.metadata();
    if (!formats[metadata.format ?? ""] || (metadata.pages ?? 1) > 1)
      throw new HttpError(400, "仅支持静态 JPEG、PNG 和 WebP 图片");
    // Decoding and re-encoding validates pixels, applies orientation and removes metadata.
    const preview = await image
      .rotate()
      .resize({
        width: 2000,
        height: 2000,
        fit: "inside",
        withoutEnlargement: true,
      })
      .flatten({ background: "#ffffff" })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    return {
      preview: preview.data,
      width: preview.info.width,
      height: preview.info.height,
      mime: formats[metadata.format!],
      digest: createHash("sha256").update(bytes).digest("hex"),
    };
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "图片无法完整读取，或像素超过 2000 万；请更换有效图片",
    );
  }
}

export class MaterialFiles {
  readonly root: string;
  constructor(
    root = process.env.UPLOAD_DIR ??
      resolve(dirname(fileURLToPath(import.meta.url)), "../uploads"),
  ) {
    this.root = resolve(root);
  }
  async save(bytes: Buffer) {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    const key = randomUUID();
    try {
      await writeFile(join(this.root, key), bytes, { flag: "wx", mode: 0o600 });
    } catch (e) {
      await this.remove(key);
      throw e;
    }
    return key;
  }
  async read(key: string) {
    // Database storage keys are opaque server-generated UUIDs, never request paths.
    if (!/^[0-9a-f-]{36}$/.test(key)) throw new HttpError(404, "图片不存在");
    try {
      return await readFile(join(this.root, key));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT")
        throw new HttpError(404, "图片文件暂不可用");
      throw e;
    }
  }
  async remove(key: string) {
    await unlink(join(this.root, key)).catch(() => {});
  }
  async redacted(
    previewKey: string,
    width: number,
    height: number,
    redactions: Redaction[],
  ) {
    const preview = await this.read(previewKey);
    if (!redactions.length) return preview;
    const blocks = redactions.map((r) => {
      const left = Math.floor(r.x * width),
        top = Math.floor(r.y * height);
      const w = Math.min(
        width - left,
        Math.max(1, Math.ceil((r.x + r.width) * width) - left),
      );
      const h = Math.min(
        height - top,
        Math.max(1, Math.ceil((r.y + r.height) * height) - top),
      );
      return {
        input: {
          create: {
            width: w,
            height: h,
            channels: 3 as const,
            background: "#111111",
          },
        },
        left,
        top,
      };
    });
    // Solid masks are burned into the image; a viewer cannot remove a CSS overlay.
    return sharp(preview).composite(blocks).webp({ quality: 95 }).toBuffer();
  }
}
