import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import {
  privatePageParams,
  reviewNotificationKinds,
  type ReviewNotification,
  type PrivatePagination,
  type Page,
} from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";
import { Button, Message } from "./ui";
import { Pagination } from "./Pagination";

export function ReviewNotifications({
  query,
  navigate,
}: {
  query: PrivatePagination;
  navigate: (query: PrivatePagination) => void;
}) {
  const { api, colors } = useApp();
  const [version, setVersion] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const resource = useResource<Page<ReviewNotification>>(
    `/me/review-notifications?${privatePageParams(query)}`,
    version,
  );
  async function mark(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`/review-notifications/${id}/read`, { method: "PATCH" });
      setMessage("已标为已读。");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  function open(n: ReviewNotification) {
    if (n.kind === "MATERIAL") router.push(`/materials/${n.postId}`);
    else if (n.kind === "REVISION" && n.postAvailable)
      router.push(`/revise/${n.postId}`);
    else if (n.postAvailable) router.push(`/posts/${n.postId}`);
    else router.push("/me");
  }
  return (
    <>
      <Button secondary onPress={() => router.push("/me")}>
        管理我的记录
      </Button>
      <Button
        secondary
        onPress={() =>
          query.page > 1
            ? navigate({ ...query, page: 1 })
            : setVersion((v) => v + 1)
        }
      >
        查看最新审核
      </Button>
      <Text
        style={{
          color: colors.muted,
          fontSize: 14,
          lineHeight: 24,
          marginVertical: 14,
        }}
      >
        这里记录你的亲历、进展、修订和图片材料的审核结果，仅本人可见。审核决定不代表当前公开状态，请以相关记录为准。
      </Text>
      {error && <Message error={error} />}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}
        >
          {message}
        </Text>
      )}
      {!resource.data ? (
        <>
          <Message loading={resource.loading} error={resource.error} />
          {resource.error && (
            <Button secondary onPress={() => setVersion((v) => v + 1)}>
              重试加载审核通知
            </Button>
          )}
        </>
      ) : resource.data.items.length ? (
        resource.data.items.map((n) => (
          <View
            key={n.id}
            style={{
              padding: 20,
              borderRadius: 15,
              backgroundColor: colors.surface,
              marginTop: 15,
              gap: 12,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {new Date(n.createdAt).toLocaleDateString("zh-CN")} ·{" "}
              {n.read ? "已读" : "未读"}
            </Text>
            <Text style={{ color: colors.muted, fontSize: 14 }}>
              {reviewNotificationKinds[n.kind]} ·{" "}
              {n.decision === "APPROVE" ? "审核通过" : "未通过审核"}
            </Text>
            <Text
              style={{
                color: colors.ink,
                fontSize: 16,
                fontWeight: "500",
                lineHeight: 26,
              }}
            >
              {n.title}
            </Text>
            {n.kind === "MATERIAL" && (
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                对应第 {n.version} 版正文
              </Text>
            )}
            {n.kind === "REVISION" && (
              <Text style={{ color: colors.muted, fontSize: 14 }}>
                基于第 {n.version} 版提交的修订
              </Text>
            )}
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>
              审核说明：{n.reason}
            </Text>
            <Button secondary onPress={() => open(n)}>
              {n.kind === "MATERIAL"
                ? "管理图片材料"
                : n.kind === "REVISION" && n.postAvailable
                  ? "管理原文修订"
                  : n.postAvailable
                    ? "查看相关公开记录"
                    : "查看我的记录"}
            </Button>
            {!n.read && (
              <Button
                secondary
                disabled={busy !== null}
                onPress={() => void mark(n.id)}
              >
                {busy === n.id ? "处理中…" : "标为已读"}
              </Button>
            )}
          </View>
        ))
      ) : (
        <Message
          empty={
            resource.data.total
              ? "这一页没有审核通知，可返回前页或查看最新审核。"
              : "暂无审核结果通知。之后完成审核的内容会在这里通知你。"
          }
        />
      )}
      {resource.data && (
        <Pagination
          page={query.page}
          pageSize={query.limit}
          total={resource.data.total}
          onChange={(page) => navigate({ ...query, page })}
        />
      )}
    </>
  );
}
