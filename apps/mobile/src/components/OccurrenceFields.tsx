import { Text, View } from "react-native";
import { occurrencePrecisions, type Occurrence } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { Field } from "./ui";
import { SegmentedControl } from "./SegmentedControl";

export function OccurrenceFields({
  value,
  onChange,
}: {
  value: Occurrence;
  onChange: (patch: Partial<Occurrence>) => void;
}) {
  const { colors } = useApp();
  return (
    <View>
      <Text style={{ color: colors.ink, fontSize: 14 }}>发生时间精度</Text>
      <SegmentedControl
        options={Object.entries(occurrencePrecisions).map(([value, label]) => ({
          value,
          label,
        }))}
        value={value.occurredPrecision}
        onChange={(raw) => {
          const precision = raw as Occurrence["occurredPrecision"];
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
      />
      <Field
        label={
          value.occurredPrecision === "DAY"
            ? "发生日期（YYYY-MM-DD）"
            : value.occurredPrecision === "MONTH"
              ? "发生月份（YYYY-MM）"
              : "发生时间从（YYYY-MM-DD）"
        }
        value={value.occurredOn}
        placeholder={
          value.occurredPrecision === "MONTH"
            ? "例如 2026-09"
            : "例如 2026-09-01"
        }
        maxLength={value.occurredPrecision === "MONTH" ? 7 : 10}
        onChangeText={(occurredOn) => onChange({ occurredOn })}
      />
      {value.occurredPrecision === "RANGE" && (
        <Field
          label="发生时间至（YYYY-MM-DD）"
          value={value.occurredUntil}
          maxLength={10}
          onChangeText={(occurredUntil) => onChange({ occurredUntil })}
        />
      )}
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          lineHeight: 23,
          marginBottom: 20,
        }}
      >
        记不清具体哪天时，可选择月份或起止范围；公开展示会保留时间精度。
      </Text>
    </View>
  );
}
