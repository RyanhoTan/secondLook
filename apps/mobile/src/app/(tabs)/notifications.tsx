import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import {
  privatePaginationSchema,
  privatePageParams,
  type PrivatePagination,
  type Page,
  type Notification,
} from "@secondlook/contracts";
import { Pagination } from "../../components/Pagination";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import {
  Screen,
  Heading,
  LoginGate,
  Message,
  Button,
} from "../../components/ui";
function navigate(query: PrivatePagination) {
  router.setParams({ page: String(query.page), limit: String(query.limit) });
}
export default function Notifications() {
  const { user } = useApp();
  const query = privatePaginationSchema.safeParse(useLocalSearchParams());
  if (!user) return <LoginGate />;
  if (!query.success)
    return (
      <Screen>
        <Heading title="后续追踪" />
        <Message error="通知分页条件无效，请清除后重试。" />
        <Button onPress={() => navigate(privatePaginationSchema.parse({}))}>
          清除无效条件
        </Button>
      </Screen>
    );
  return (
    <List
      key={`${user.id}:${privatePageParams(query.data)}`}
      query={query.data}
    />
  );
}
function List({ query }: { query: PrivatePagination }) {
  const { api, colors } = useApp();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const resource = useResource<Page<Notification>>(
    `/me/notifications?${privatePageParams(query)}`,
    version,
  );
  async function mark(id: string) {
    if (busy) return;
    setBusy(id);
    setError("");
    setMessage("");
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      setMessage("已标为已读。");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Screen>
      <Heading
        eyebrow="持续关注，不错过变化"
        title="后续追踪"
        description="你关注的帖子或对象有新公开经历和重要进展时，会在这里告诉你。"
      />
      {error && <Message error={error} />}
      <Button secondary onPress={() => router.push("/following")}>
        管理我的关注
      </Button>
      <Button
        secondary
        onPress={() =>
          query.page > 1
            ? navigate({ ...query, page: 1 })
            : setVersion((v) => v + 1)
        }
      >
        查看最新进展
      </Button>
      <Text
        style={{
          color: colors.muted,
          fontSize: 14,
          lineHeight: 24,
          marginVertical: 14,
        }}
      >
        仅展示当前可公开查看的通知，按通知时间排列。
      </Text>
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}
        >
          {message}
        </Text>
      )}
      {resource.loading || resource.error ? (
        <>
          <Message error={resource.error} loading={resource.loading} />
          {resource.error && (
            <Button secondary onPress={() => setVersion((v) => v + 1)}>
              重试加载通知
            </Button>
          )}
        </>
      ) : resource.data?.items.length ? (
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
            <Text style={{ fontSize: 12, color: colors.muted }}>
              {new Date(n.createdAt).toLocaleDateString("zh-CN")}{" "}
              {n.read ? "· 已读" : "· 未读"}
            </Text>
            <Text style={{ fontSize: 14, color: colors.muted }}>
              {n.subjectName}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/posts/${n.postId}`)}
            >
              <Text
                style={{
                  fontSize: 16,
                  color: colors.ink,
                  fontWeight: "500",
                  marginBottom: 8,
                }}
              >
                {n.title}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 12, lineHeight: 23 }}
              >
                {n.body}
              </Text>
            </Pressable>
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
            resource.data?.total
              ? "这一页没有通知，可返回前页或查看最新进展。"
              : "还没有新进展。先关注一条经历或一个对象，看看故事的后续。"
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
    </Screen>
  );
}
