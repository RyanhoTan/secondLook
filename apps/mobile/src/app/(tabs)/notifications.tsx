import { useState } from "react";
import { router } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Notification } from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import {
  Screen,
  Heading,
  LoginGate,
  Message,
  Button,
} from "../../components/ui";
export default function Notifications() {
  const { user } = useApp();
  return user ? <List /> : <LoginGate />;
}
function List() {
  const { api, colors } = useApp();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const resource = useResource<Notification[]>("/notifications", version);
  async function mark(id: string) {
    try {
      await api(`/notifications/${id}/read`, { method: "PATCH" });
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
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
      <Button secondary onPress={() => setVersion((v) => v + 1)}>
        刷新进展
      </Button>
      {resource.loading || resource.error ? (
        <Message error={resource.error} loading={resource.loading} />
      ) : resource.data?.length ? (
        resource.data.map((n) => (
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
              {!n.read && "· 未读"}
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
              <Button secondary onPress={() => void mark(n.id)}>
                标为已读
              </Button>
            )}
          </View>
        ))
      ) : (
        <Message empty="还没有新进展。先关注一条经历或一个对象，看看故事的后续。" />
      )}
    </Screen>
  );
}
