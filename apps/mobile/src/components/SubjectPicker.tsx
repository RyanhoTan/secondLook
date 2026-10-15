import { useState } from "react";
import { Text, View, Pressable } from "react-native";
import type { Page, Subject } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";
import { Button, Field, Message } from "./ui";
import { Pagination } from "./Pagination";
export function SubjectPicker({
  selected,
  onChange,
}: {
  selected: Subject | null;
  onChange: (subject: Subject | null) => void;
}) {
  const { colors } = useApp();
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const resource = useResource<Page<Subject>>(
    `/subjects?${new URLSearchParams({ q: search, page: String(page) })}`,
  );
  function find() {
    setSearch(query.trim());
    setPage(1);
  }
  return (
    <View style={{ gap: 12, marginBottom: 22 }}>
      <Field
        label="搜索对象名称或门店地址"
        value={query}
        onChangeText={setQuery}
        returnKeyType="search"
        onSubmitEditing={find}
      />
      <Button secondary onPress={find}>
        查找对象
      </Button>
      {selected && (
        <>
          <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 25 }}>
            当前选择：{selected.name} · {selected.city} · {selected.address}
          </Text>
          <Button secondary onPress={() => onChange(null)}>
            清除对象选择
          </Button>
        </>
      )}
      {resource.loading || resource.error ? (
        <Message loading={resource.loading} error={resource.error} />
      ) : resource.data?.items.length ? (
        <>
          <Text style={{ color: colors.muted, fontSize: 13 }}>
            找到 {resource.data.total} 个对象，请选择具体门店或主体。
          </Text>
          {resource.data.items.map((item) => (
            <Pressable
              key={item.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected?.id === item.id }}
              onPress={() => onChange(item)}
              style={({ pressed }) => ({
                minHeight: 52,
                padding: 15,
                borderRadius: 13,
                borderWidth: 1,
                borderColor:
                  selected?.id === item.id ? colors.ink : colors.line,
                backgroundColor:
                  selected?.id === item.id ? colors.soft : colors.surface,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 25 }}>
                {selected?.id === item.id ? "●" : "○"} {item.name} · {item.city}
              </Text>
              {!!item.address && (
                <Text
                  style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}
                >
                  {item.address}
                </Text>
              )}
            </Pressable>
          ))}
        </>
      ) : (
        <Message empty="没有找到对象，可以换个关键词或添加新对象。" />
      )}
      {resource.data && (
        <Pagination
          page={page}
          total={resource.data.total}
          onChange={setPage}
        />
      )}
    </View>
  );
}
