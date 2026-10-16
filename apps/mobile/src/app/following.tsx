import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  followingQuerySchema,
  followingParams,
  type Following,
  type FollowingQuery,
  type Page,
} from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";
import { Screen, Heading, Button, Message, LoginGate } from "../components/ui";
import { SegmentedControl } from "../components/SegmentedControl";
import { Pagination } from "../components/Pagination";

function navigate(query: FollowingQuery) {
  router.setParams({
    target: query.target,
    page: String(query.page),
    limit: String(query.limit),
  });
}
export default function FollowingPage() {
  const { user } = useApp();
  const parsed = followingQuerySchema.safeParse(useLocalSearchParams());
  if (!user) return <LoginGate />;
  if (!parsed.success)
    return (
      <Screen>
        <Heading title="我的关注" />
        <Message error={parsed.error.issues[0].message} />
        <Button onPress={() => navigate(followingQuerySchema.parse({}))}>
          清除无效条件
        </Button>
      </Screen>
    );
  return (
    <FollowingList
      key={`${user.id}:${followingParams(parsed.data)}`}
      query={parsed.data}
    />
  );
}
function FollowingList({ query }: { query: FollowingQuery }) {
  const { api, colors } = useApp();
  const [version, refresh] = useState(0),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const resource = useResource<Page<Following>>(
    `/me/follows?${followingParams(query)}`,
    version,
  );
  async function remove(item: Following) {
    if (busy) return;
    setBusy(item.targetId);
    setError("");
    setMessage("");
    try {
      await api(
        `/${item.target === "POST" ? "posts" : "subjects"}/${item.targetId}/follow`,
        { method: "DELETE" },
      );
      setMessage("已取消这项关注；你单独关注的其他帖子或对象不受影响。");
      if (resource.data?.items.length === 1 && query.page > 1)
        navigate({ ...query, page: query.page - 1 });
      else refresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }
  return (
    <Screen>
      <Heading
        title="我的关注"
        description="帖子与对象分别管理。取消其中一项，不影响另一项订阅；已有通知保留。"
      />
      <SegmentedControl
        options={[
          { value: "POST", label: "关注的帖子" },
          { value: "SUBJECT", label: "关注的对象" },
        ]}
        value={query.target}
        onChange={(target) =>
          navigate({
            ...query,
            target: target as FollowingQuery["target"],
            page: 1,
          })
        }
      />
      {error && <Message error={error} />}
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
            <Button secondary onPress={() => refresh((v) => v + 1)}>
              重试查询
            </Button>
          )}
        </>
      ) : resource.data?.items.length ? (
        resource.data.items.map((item) => (
          <View
            key={item.targetId}
            style={{
              gap: 12,
              paddingVertical: 24,
              borderBottomWidth: 1,
              borderBottomColor: colors.line,
            }}
          >
            {item.target === "POST" && !item.available ? (
              <>
                <Text
                  style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}
                >
                  此记录暂不可查看
                </Text>
                <Text
                  style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}
                >
                  内容不再展示，你仍可取消关注。
                </Text>
              </>
            ) : (
              <>
                <Text
                  accessibilityRole="header"
                  style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}
                >
                  {item.target === "POST" ? item.title : item.subject.name}
                </Text>
                <Text
                  style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}
                >
                  {item.target === "POST" ? `${item.subject.name} · ` : ""}
                  {item.subject.city} ·{" "}
                  {item.subject.address || "未填写具体地址"}
                </Text>
                <Button
                  secondary
                  onPress={() =>
                    router.push(
                      item.target === "POST"
                        ? `/posts/${item.targetId}`
                        : `/subjects/${item.targetId}`,
                    )
                  }
                >
                  {item.target === "POST" ? "查看帖子" : "查看对象"}
                </Button>
              </>
            )}
            <Button
              secondary
              disabled={busy !== null}
              onPress={() => void remove(item)}
            >
              {busy === item.targetId ? "取消中…" : "取消关注"}
            </Button>
          </View>
        ))
      ) : (
        <Message
          empty={
            resource.data?.total
              ? "这一页没有关注，请返回上一页。"
              : query.target === "POST"
                ? "还没有关注帖子。可在经历详情关注后续。"
                : "还没有关注对象。可在具体对象页面关注。"
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
