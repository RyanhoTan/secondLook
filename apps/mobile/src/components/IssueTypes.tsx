import { Pressable, Text, View } from "react-native";
import {
  categoryIssues,
  issueLabels,
  type Category,
  type IssueType,
} from "@secondlook/contracts";
import { useApp } from "../lib/context";

export function IssueTypes({ value }: { value: IssueType[] }) {
  const { colors } = useApp();
  return (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginVertical: 12,
      }}
    >
      {(value.length
        ? value.map((issue) => issueLabels[issue])
        : ["问题类型未填写"]
      ).map((label) => (
        <Text
          key={label}
          style={{
            color: colors.muted,
            fontSize: 13,
            lineHeight: 22,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderWidth: 1,
            borderColor: colors.line,
            borderRadius: 7,
          }}
        >
          {label}
        </Text>
      ))}
    </View>
  );
}

export function IssuePicker({
  category,
  value,
  onChange,
  filter = false,
  disabled = false,
}: {
  category?: Category;
  value: IssueType[];
  onChange: (value: IssueType[]) => void;
  filter?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  const options = filter
    ? (Object.keys(issueLabels) as IssueType[])
    : category
      ? categoryIssues[category]
      : [];
  return (
    <View style={{ gap: 10, marginVertical: 20 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.ink, fontSize: 14, fontWeight: "500" }}
      >
        {filter ? "问题类型筛选" : "问题类型（可多选）"}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}>
        {filter
          ? "不选择时显示全部类型。"
          : category
            ? "至少选择一项。标签仅作分类，不代表平台确认事实。"
            : "先选择具体对象，再选择问题类型。"}
      </Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {options.map((issue) => (
          <Pressable
            key={issue}
            accessibilityRole="checkbox"
            accessibilityLabel={issueLabels[issue]}
            accessibilityState={{ checked: value.includes(issue), disabled }}
            disabled={disabled}
            onPress={() =>
              onChange(
                value.includes(issue)
                  ? value.filter((v) => v !== issue)
                  : filter
                    ? [issue]
                    : [...value, issue].sort(),
              )
            }
            style={({ pressed }) => ({
              minHeight: 44,
              paddingVertical: 11,
              paddingHorizontal: 14,
              borderWidth: 1,
              borderColor: value.includes(issue) ? colors.ink : colors.line,
              backgroundColor: colors.soft,
              borderRadius: 12,
              opacity: disabled ? 0.4 : pressed ? 0.6 : 1,
            })}
          >
            <Text style={{ color: colors.ink, fontSize: 14 }}>
              {value.includes(issue) ? "✓ " : ""}
              {issueLabels[issue]}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
