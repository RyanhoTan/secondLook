import { useState } from "react";
import { router } from "expo-router";
import { Text, View } from "react-native";
import type { OwnPost } from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import { Screen, Heading, Message, Button } from "../../components/ui";
export default function Me() {
  const { user, colors, mode, changeMode, logout } = useApp();
  const [error, setError] = useState("");
  return (
    <Screen>
      <Heading
        eyebrow="SECONDLOOK"
        title={user ? user.nickname : "留一个位置，记录经历"}
        description="真实、具体，也允许有后续。"
      />
      <View style={{ gap: 9, marginBottom: 24 }}>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 6 }}>
          外观设置
        </Text>
        {(["system", "light", "dark"] as const).map((m) => (
          <Button
            key={m}
            secondary={mode !== m}
            onPress={() =>
              void changeMode(m).catch((e) => setError((e as Error).message))
            }
          >
            {{ system: "跟随系统", light: "浅色模式", dark: "深色模式" }[m]}
          </Button>
        ))}
      </View>
      {error && <Message error={error} />}{" "}
      {user ? (
        <>
          <OwnList />
          <Button
            secondary
            onPress={() =>
              void logout().catch((e) => setError((e as Error).message))
            }
          >
            退出登录
          </Button>
        </>
      ) : (
        <Button onPress={() => router.push("/login")}>登录或创建账号</Button>
      )}
      <Message empty="本地开发版本 · 所有示例均为虚构。" />
    </Screen>
  );
}
function OwnList() {
  const { colors } = useApp();
  const resource = useResource<OwnPost[]>("/me/posts");
  const labels: Record<string, string> = {
    PENDING: "等待审核",
    PUBLISHED: "已公开",
    REJECTED: "未通过审核",
  };
  return (
    <View style={{ marginBottom: 24 }}>
      {resource.error || resource.loading ? (
        <Message error={resource.error} loading={resource.loading} />
      ) : resource.data?.length ? (
        resource.data.map((p) => (
          <View
            key={p.id}
            style={{
              padding: 18,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.surface,
              borderRadius: 13,
              marginBottom: 12,
              gap: 11,
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 12 }}>
              {p.subjectName} · {labels[p.status] ?? p.status}
            </Text>
            <Text
              style={{ fontSize: 15, color: colors.ink, fontWeight: "500" }}
            >
              {p.title}
            </Text>
            {p.reason && (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                审核说明：{p.reason}
              </Text>
            )}
            {p.status === "PUBLISHED" && (
              <>
                <Button secondary onPress={() => router.push(`/posts/${p.id}`)}>
                  查看记录
                </Button>
                <Button
                  secondary
                  onPress={() => router.push(`/update/${p.id}`)}
                >
                  补充后续进展
                </Button>
              </>
            )}
          </View>
        ))
      ) : (
        <Message empty="还没有发布过经历。" />
      )}
    </View>
  );
}
