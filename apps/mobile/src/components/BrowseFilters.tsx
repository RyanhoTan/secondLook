import { useState } from "react";
import { View } from "react-native";
import { postSortLabels } from "@secondlook/contracts";
import type { IssueType } from "@secondlook/contracts";
import { IssuePicker } from "./IssueTypes";
import { Button, Field } from "./ui";
import { SegmentedControl } from "./SegmentedControl";

export function BrowseFilters({
  value,
  onChange,
  onApply,
  onClear,
}: {
  value: {
    occurredFrom: string;
    occurredTo: string;
    sort: string;
    issue: string;
  };
  onChange: (
    value: Partial<{
      occurredFrom: string;
      occurredTo: string;
      sort: string;
      issue: string;
    }>,
  ) => void;
  onApply: () => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 12, marginTop: 16 }}>
      <Button secondary onPress={() => setOpen((v) => !v)}>
        {open ? "收起筛选" : "更多筛选与排序"}
      </Button>
      {open && (
        <View style={{ paddingTop: 12 }}>
          <IssuePicker
            filter
            value={value.issue ? [value.issue as IssueType] : []}
            onChange={(value) => onChange({ issue: value[0] ?? "" })}
          />
          <Field
            label="发生日期从（YYYY-MM-DD）"
            placeholder="不限"
            value={value.occurredFrom}
            maxLength={10}
            onChangeText={(occurredFrom) => onChange({ occurredFrom })}
          />
          <Field
            label="发生日期至（YYYY-MM-DD）"
            placeholder="不限"
            value={value.occurredTo}
            maxLength={10}
            onChangeText={(occurredTo) => onChange({ occurredTo })}
          />
          <SegmentedControl
            options={Object.entries(postSortLabels).map(([value, label]) => ({
              value,
              label,
            }))}
            value={value.sort}
            onChange={(sort) => onChange({ sort })}
          />
          <View style={{ gap: 12 }}>
            <Button secondary onPress={onApply}>
              应用筛选
            </Button>
            <Button secondary onPress={onClear}>
              清除筛选
            </Button>
          </View>
        </View>
      )}
    </View>
  );
}
