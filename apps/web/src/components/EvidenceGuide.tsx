import { useState, useId, useRef, useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Info, X } from "lucide-react";
export function EvidenceGuide() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const reduce = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  function close() {
    setOpen(false);
    trigger.current?.focus();
  }
  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  return (
    <div
      className="evidence-guide"
      ref={container}
      onKeyDown={(event) => {
        if (event.key === "Escape") close();
      }}
    >
      <button
        className="guide-trigger"
        ref={trigger}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
      >
        <Info size={16} />
        <span>如何看待这些记录</span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.section
            id={id}
            className="guide-popover"
            initial={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reduce ? 1 : 0.96 }}
            transition={{ type: "spring", bounce: 0, duration: 0.3 }}
          >
            <div className="guide-heading">
              <h3>看依据，也看后续。</h3>
              <button
                className="icon-button"
                aria-label="关闭阅读说明"
                onClick={close}
              >
                <X size={17} />
              </button>
            </div>
            <p>标签描述材料状态，不代表事实裁决。</p>
            {[
              ["statement", "仅本人陈述", "发布者描述自己的亲身经历。"],
              ["material", "已附材料", "有相关材料，但不等于已证实。"],
              ["corroborated", "有独立佐证", "有经过检查的独立支持资料。"],
              ["disputed", "存在争议", "请同时查看异议和后续变化。"],
            ].map(([type, title, body]) => (
              <div className="guide-row" key={type}>
                <span className={`tag ${type}`}>
                  <i />
                  {title}
                </span>
                <p>{body}</p>
              </div>
            ))}
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}
