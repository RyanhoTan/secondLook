import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  categories,
  paginationSchema,
  subjectBrowseParams,
  type Category,
  type SubjectBrowse,
  type Subject,
  type Page,
} from "@secondlook/contracts";
import { Button, Field, Heading, Message, Screen } from "../components/ui";
import { Pagination } from "../components/Pagination";
import { SegmentedControl } from "../components/SegmentedControl";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";

export default function Objects() {
  const params = useLocalSearchParams();
  const parsed = paginationSchema.safeParse({
    ...params,
    category: params.category || undefined,
  });
  if (!parsed.success)
    return (
      <Screen>
        <Heading title="查找对象" />
        <Message error={parsed.error.issues[0].message} />
        <Button onPress={() => router.replace("/objects")}>清除条件</Button>
      </Screen>
    );
  return (
    <ObjectResults
      key={subjectBrowseParams(parsed.data).toString()}
      initial={parsed.data}
    />
  );
}

function ObjectResults({ initial }: { initial: SubjectBrowse }) {
  const { colors } = useApp();
  const [q, setQuery] = useState(initial.q ?? "");
  const [city, setCity] = useState(initial.city ?? "");
  const [error, setError] = useState("");
  const [revision, refresh] = useState(0);
  const subjects = useResource<Page<Subject>>(
    `/subjects?${subjectBrowseParams(initial)}`,
    revision,
  );
  function navigate(value: SubjectBrowse) {
    router.setParams({
      q: value.q ?? "",
      city: value.city ?? "",
      category: value.category ?? "",
      page: String(value.page),
      limit: String(value.limit),
    });
  }
  function apply(category: Category | "" = initial.category ?? "") {
    const checked = paginationSchema.safeParse({
      ...initial,
      q,
      city,
      category: category || undefined,
      page: 1,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setError("");
    navigate(checked.data);
  }
  return (
    <Screen>
      <Heading
        title="查找对象"
        description="按名称或门店地址查找，也包含暂无公开经历的对象。"
      />
      <Field
        label="搜索对象名称或门店地址"
        value={q}
        onChangeText={setQuery}
        maxLength={100}
        returnKeyType="search"
        onSubmitEditing={() => apply()}
      />
      <Field
        label="对象所在城市"
        placeholder="全国"
        value={city}
        onChangeText={setCity}
        maxLength={30}
        returnKeyType="search"
        onSubmitEditing={() => apply()}
      />
      <Button onPress={() => apply()}>查找对象</Button>
      <SegmentedControl
        options={[
          { value: "", label: "全部对象" },
          ...Object.entries(categories).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        value={initial.category ?? ""}
        onChange={(value) => apply(value as Category | "")}
      />
      <Button secondary onPress={() => router.replace("/objects")}>
        清除条件
      </Button>
      {error && <Message error={error} />}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.ink,
          fontSize: 20,
          fontWeight: "600",
          marginTop: 28,
        }}
      >
        对象结果 · {subjects.data?.total ?? "—"}
      </Text>
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          lineHeight: 24,
          marginVertical: 16,
        }}
      >
        按收录时间排列。公开经历数量不代表对象整体质量；暂无记录不能作为好坏判断。
      </Text>
      {subjects.loading || subjects.error ? (
        <>
          <Message loading={subjects.loading} error={subjects.error} />
          {subjects.error && (
            <Button secondary onPress={() => refresh((v) => v + 1)}>
              重试查找
            </Button>
          )}
        </>
      ) : subjects.data?.items.length ? (
        subjects.data.items.map((subject) => (
          <View
            key={subject.id}
            style={{
              gap: 10,
              paddingVertical: 20,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            <Text
              accessibilityRole="header"
              style={{ color: colors.ink, fontSize: 19, fontWeight: "600" }}
            >
              {subject.name}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {categories[subject.category]} · {subject.city}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>
              {subject.address || "未填写具体地址"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {subject.postCount
                ? `${subject.postCount} 条公开经历`
                : "暂无公开经历"}
            </Text>
            <Button
              secondary
              onPress={() => router.push(`/subjects/${subject.id}`)}
            >
              查看对象记录
            </Button>
          </View>
        ))
      ) : (
        <Message empty="没有找到对象，试试其他名称、地址或城市。" />
      )}
      {subjects.data && (
        <Pagination
          page={initial.page}
          pageSize={initial.limit}
          total={subjects.data.total}
          onChange={(page) => navigate({ ...initial, page })}
        />
      )}
    </Screen>
  );
}
