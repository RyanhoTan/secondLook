import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import type { Page, PostDraft } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";
import { Button, Message } from "./ui";
import { Pagination } from "./Pagination";

export function DraftList() {
  const { colors } = useApp();
  const [page, setPage] = useState(1);
  const resource = useResource<Page<PostDraft>>(`/me/drafts?page=${page}`);
  return (
    <View style={{ gap: 16, marginBottom: 28 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.ink, fontSize: 22, fontWeight: "600" }}
      >
        我的草稿
      </Text>
      <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>
        只有你可以读取。已保存的内容可重新登录或换设备继续；离线未保存的修改仍须保持编辑页。
      </Text>
      {resource.loading || resource.error ? (
        <Message loading={resource.loading} error={resource.error} />
      ) : resource.data?.items.length ? (
        resource.data.items.map((d) => (
          <View
            key={d.id}
            style={{
              gap: 10,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {d.postId ? "已提交，结果可核对" : "未提交"} ·{" "}
              {d.subject?.name ?? "尚未选择对象"}
            </Text>
            <Text
              style={{ color: colors.ink, fontSize: 16, fontWeight: "500" }}
            >
              {d.title || "未命名草稿"}
            </Text>
            <Button
              secondary
              onPress={() =>
                router.push({ pathname: "/write", params: { draft: d.id } })
              }
            >
              {d.postId ? "查看投稿结果" : "继续编辑"}
            </Button>
          </View>
        ))
      ) : (
        <Text style={{ color: colors.muted, fontSize: 14 }}>
          还没有保存的草稿。
        </Text>
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
