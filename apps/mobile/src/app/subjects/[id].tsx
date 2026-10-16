import { Text, View } from "react-native";
import { useApp } from "../../lib/context";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pagination } from "../../components/Pagination";
import type { Page, PublicPost, SubjectDetail } from "@secondlook/contracts";
import { useResource } from "../../lib/resource";
import {
  Screen,
  Heading,
  PostCard,
  Message,
  Button,
} from "../../components/ui";
export default function SubjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SubjectContent key={id} id={id} />;
}
function SubjectContent({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const { user, api, colors } = useApp();
  const [version, refresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const subject = useResource<SubjectDetail>(`/subjects/${id}`, version);
  async function follow() {
    if (!user) {
      router.push("/login");
      return;
    }
    if (!subject.data || busy) return;
    const following = subject.data.following;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/subjects/${id}/follow`, {
        method: following ? "DELETE" : "PUT",
      });
      setMessage(
        following
          ? "已取消对象关注。若仍关注其中的帖子，将继续收到该帖更新。"
          : "已关注此对象，新公开经历和重要进展会出现在站内通知。",
      );
      refresh((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const posts = useResource<Page<PublicPost>>(
    `/posts?subjectId=${id}&page=${page}`,
  );
  return (
    <Screen>
      {subject.data ? (
        <Heading
          eyebrow={`${subject.data.city} · ${subject.data.address}`}
          title={subject.data.name}
          description={`${subject.data.postCount} 条公开记录，数量不代表整体质量。`}
        />
      ) : (
        <Message error={subject.error} loading={subject.loading} />
      )}
      {subject.data && (
        <View style={{ gap: 14, marginVertical: 20 }}>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>
            关注这个具体对象的新公开经历与重要进展，不会订阅同名的其他门店。
          </Text>
          <Button disabled={busy} onPress={() => void follow()}>
            {busy
              ? "处理中…"
              : subject.data.following
                ? "已关注对象 · 点击取消"
                : user
                  ? "关注此对象"
                  : "登录并关注对象"}
          </Button>
        </View>
      )}
      {error && <Message error={error} />}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}
        >
          {message}
        </Text>
      )}
      {posts.error || posts.loading ? (
        <Message error={posts.error} loading={posts.loading} />
      ) : posts.data?.items.length ? (
        posts.data.items.map((p) => <PostCard key={p.id} post={p} />)
      ) : (
        <Message empty="还没有公开经历。" />
      )}
      {posts.data && (
        <Pagination page={page} total={posts.data.total} onChange={setPage} />
      )}
    </Screen>
  );
}
