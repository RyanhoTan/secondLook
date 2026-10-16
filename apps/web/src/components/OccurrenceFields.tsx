import { occurrencePrecisions, type Occurrence } from "@secondlook/contracts";

export function OccurrenceFields({
  value,
  onChange,
}: {
  value: Occurrence;
  onChange: (patch: Partial<Occurrence>) => void;
}) {
  return (
    <div className="occurrence-fields">
      <label>
        发生时间精度
        <select
          value={value.occurredPrecision}
          onChange={(e) => {
            const precision = e.target.value as Occurrence["occurredPrecision"];
            onChange({
              occurredPrecision: precision,
              occurredOn:
                precision === "MONTH"
                  ? value.occurredOn.slice(0, 7)
                  : value.occurredPrecision === "MONTH"
                    ? ""
                    : value.occurredOn,
              occurredUntil: precision === "RANGE" ? value.occurredUntil : "",
            });
          }}
        >
          {Object.entries(occurrencePrecisions).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <label>
        {value.occurredPrecision === "DAY"
          ? "发生日期"
          : value.occurredPrecision === "MONTH"
            ? "发生月份"
            : "发生时间从"}
        <input
          type={value.occurredPrecision === "MONTH" ? "month" : "date"}
          required
          value={value.occurredOn}
          max={new Date()
            .toISOString()
            .slice(0, value.occurredPrecision === "MONTH" ? 7 : 10)}
          onChange={(e) => onChange({ occurredOn: e.target.value })}
        />
      </label>
      {value.occurredPrecision === "RANGE" && (
        <label>
          发生时间至
          <input
            type="date"
            required
            value={value.occurredUntil}
            min={value.occurredOn || undefined}
            max={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onChange({ occurredUntil: e.target.value })}
          />
        </label>
      )}
      <p className="small-note">
        记不清具体哪天时，可选择月份或起止范围；公开展示会保留时间精度。
      </p>
    </div>
  );
}
