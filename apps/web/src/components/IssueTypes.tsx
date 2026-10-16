import {
  categoryIssues,
  issueLabels,
  type Category,
  type IssueType,
} from "@secondlook/contracts";

export function IssueTypes({ value }: { value: IssueType[] }) {
  return (
    <p className="issue-types" aria-label="问题类型">
      {value.length ? (
        value.map((issue) => <span key={issue}>{issueLabels[issue]}</span>)
      ) : (
        <span>问题类型未填写</span>
      )}
    </p>
  );
}

export function IssuePicker({
  category,
  value,
  onChange,
  disabled = false,
}: {
  category?: Category;
  value: IssueType[];
  onChange: (value: IssueType[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="issue-picker" disabled={disabled}>
      <legend>问题类型（可多选）</legend>
      <p className="small-note">
        {category
          ? "至少选择一项。标签仅作分类，不代表平台确认事实。"
          : "先选择具体对象，再选择问题类型。"}
      </p>
      <div className="issue-options">
        {category &&
          categoryIssues[category].map((issue) => (
            <label key={issue}>
              <input
                type="checkbox"
                checked={value.includes(issue)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...value, issue].sort()
                      : value.filter((v) => v !== issue),
                  )
                }
              />
              {issueLabels[issue]}
            </label>
          ))}
      </div>
    </fieldset>
  );
}
