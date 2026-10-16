import { useId } from "react";
import { LayoutGroup, motion } from "motion/react";
import { categories, type Category } from "@secondlook/contracts";
import { CategoryIcon } from "./ui";

export function CategoryFilter({
  value,
  onChange,
  label = "经历分类",
  allLabel = "全部经历",
}: {
  value: string;
  onChange: (value: Category | "") => void;
  label?: string;
  allLabel?: string;
}) {
  const id = useId();
  return (
    <LayoutGroup id={id}>
      <div className="category-tabs" role="group" aria-label={label}>
        {[["", allLabel], ...Object.entries(categories)].map(([key, text]) => (
          <button
            type="button"
            key={key}
            aria-pressed={value === key}
            onClick={() => onChange(key as Category | "")}
          >
            {value === key && (
              <motion.span
                className="category-selection"
                layoutId="category-selection"
                transition={{ type: "spring", bounce: 0, duration: 0.35 }}
              />
            )}
            <span className="category-label">
              {key && <CategoryIcon category={key as Category} size={17} />}
              <span>{text}</span>
            </span>
          </button>
        ))}
      </div>
    </LayoutGroup>
  );
}
