import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { PostDetail } from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import { RevisionHistory } from "../../components/RevisionHistory";
import {
  Screen,
  Heading,
  Button,
  Message,
  EvidenceTags,
} from "../../components/ui";
export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, user, colors } = useApp();
  const [version, setVersion] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const resource = useResource<PostDetail>(`/posts/${id}`, version);
  const post = resource.data;
  async function follow() {
    if (!post) return;
    if (!user) {
      router.push("/login");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${id}/follow`, {
        method: post.following ? "DELETE" : "PUT",
      });
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (!post)
    return (
      <Screen>
        <Message error={resource.error} loading={resource.loading} />
      </Screen>
    );
  return (
    <Screen>
      <Pressable
        onPress={() => router.push(`/subjects/${post.subject.id}`)}
        accessibilityRole="button"
      >
        <Text style={{ color: colors.accent, fontSize: 12, marginBottom: 15 }}>
          {post.subject.name} ↗
        </Text>
      </Pressable>
      <Heading
        title={post.title}
        description={`${post.authorName} · ${post.occurredOn} 发生 · ${post.subject.city}`}
      />
      <EvidenceTags post={post} />
      {post.correction && (
        <View
          style={{
            marginTop: 24,
            padding: 20,
            gap: 10,
            backgroundColor: colors.soft,
            borderRadius: 15,
          }}
        >
          <Text style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}>
            作者已更正 · 第 {post.currentVersion} 版
          </Text>
          <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 27 }}>
            {post.correction.reason}
          </Text>
        </View>
      )}
      <Text
        style={{
          fontSize: 15,
          lineHeight: 29,
          color: colors.ink,
          marginVertical: 28,
        }}
      >
        {post.body}
      </Text>
      <View
        style={{
          padding: 20,
          backgroundColor: colors.surface,
          borderRadius: 15,
          gap: 15,
          marginBottom: 30,
        }}
      >
        <Text style={{ fontSize: 16, color: colors.ink, fontWeight: "600" }}>
          故事还在继续
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 21 }}>
          关注重要进展，看看问题如何变化。
        </Text>
        <Button disabled={busy} onPress={() => void follow()}>
          {post.following ? "已关注 · 点击取消" : "关注后续"}
        </Button>
        {error && <Message error={error} />}
      </View>
      <Heading title="后续与变化" />
      {post.timeline.map((event) => (
        <View
          key={event.id}
          style={{
            paddingLeft: 20,
            borderLeftWidth: 1,
            borderLeftColor: colors.line,
            paddingBottom: 25,
            gap: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {new Date(event.createdAt).toLocaleDateString("zh-CN")}
          </Text>
          <Text style={{ fontSize: 15, color: colors.ink, fontWeight: "500" }}>
            {event.title}
          </Text>
          <Text style={{ fontSize: 15, color: colors.muted, lineHeight: 24 }}>
            {event.body}
          </Text>
        </View>
      ))}
      <RevisionHistory
        history={post.history}
        currentVersion={post.currentVersion}
      />
      <Message empty="标签说明材料状态，不代表事实裁决。退款不自动等于原经历失实。" />
    </Screen>
  );
}
