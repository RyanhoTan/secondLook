import { useRef, useState, type PointerEvent } from "react";
import { redactionSchema, type Redaction } from "@secondlook/contracts";
import { MaterialImage } from "./Materials";

export function RedactionEditor({
  id,
  rectangles,
  onChange,
  disabled,
}: {
  id: string;
  rectangles: Redaction[];
  onChange: (rectangles: Redaction[]) => void;
  disabled: boolean;
}) {
  const start = useRef<{ x: number; y: number; pointer: number } | null>(null);
  const [draft, setDraft] = useState<Redaction>();
  const [ready, setReady] = useState(false);
  const [fields, setFields] = useState({ x: 0, y: 0, width: 20, height: 10 });
  const [error, setError] = useState("");
  function point(e: PointerEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    };
  }
  function rectangle(e: PointerEvent<HTMLDivElement>) {
    if (!start.current || start.current.pointer !== e.pointerId) return;
    const p = point(e),
      s = start.current;
    return {
      x: Math.min(p.x, s.x),
      y: Math.min(p.y, s.y),
      width: Math.abs(p.x - s.x),
      height: Math.abs(p.y - s.y),
    };
  }
  function add(value: Redaction) {
    const parsed = redactionSchema.safeParse(value);
    if (!parsed.success || rectangles.length >= 30) {
      setError("遮挡范围需在图片内，最多 30 处。");
      return;
    }
    setError("");
    onChange([...rectangles, parsed.data]);
  }
  return (
    <div className="redaction-editor">
      <p className="small-note">
        在图片上拖动添加实色遮挡，或用下方百分比输入。检查姓名、头像、电话、二维码等位置。遮挡会写入公开图片。
      </p>
      <div
        className="redaction-canvas"
        role="group"
        aria-label="图片脱敏区域"
        onPointerDown={(e) => {
          if (disabled || !ready || e.button !== 0 || start.current) return;
          start.current = { ...point(e), pointer: e.pointerId };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          const value = rectangle(e);
          if (value) setDraft(value);
        }}
        onPointerUp={(e) => {
          const value = rectangle(e);
          if (value && value.width > 0.005 && value.height > 0.005) add(value);
          start.current = null;
          setDraft(undefined);
        }}
        onPointerCancel={() => {
          start.current = null;
          setDraft(undefined);
        }}
      >
        <MaterialImage
          id={id}
          variant="preview"
          alt="待审核图片，拖动选择需要隐藏的区域"
          onLoad={() => setReady(true)}
        />
        {[...rectangles, ...(draft ? [draft] : [])].map((r, i) => (
          <span
            aria-hidden="true"
            className="redaction-mask"
            key={i}
            style={{
              left: `${r.x * 100}%`,
              top: `${r.y * 100}%`,
              width: `${r.width * 100}%`,
              height: `${r.height * 100}%`,
            }}
          />
        ))}
      </div>
      <div className="redaction-fields">
        {(
          [
            ["x", "左侧位置 %"],
            ["y", "顶部位置 %"],
            ["width", "遮挡宽度 %"],
            ["height", "遮挡高度 %"],
          ] as const
        ).map(([key, label]) => (
          <label key={key}>
            {label}
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              value={fields[key]}
              disabled={disabled}
              onChange={(e) =>
                setFields({ ...fields, [key]: Number(e.target.value) })
              }
            />
          </label>
        ))}
      </div>
      <button
        type="button"
        className="button secondary"
        disabled={disabled}
        onClick={() =>
          add({
            x: fields.x / 100,
            y: fields.y / 100,
            width: fields.width / 100,
            height: fields.height / 100,
          })
        }
      >
        添加遮挡
      </button>
      {rectangles.map((_, i) => (
        <button
          type="button"
          className="text-button"
          key={i}
          disabled={disabled}
          onClick={() =>
            onChange(rectangles.filter((_r, index) => index !== i))
          }
        >
          移除遮挡 {i + 1}
        </button>
      ))}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
