import { useLocalSearchParams } from "expo-router";
import type { Page, PublicPost, Subject } from "@secondlook/contracts";
import { useResource } from "../../lib/resource";
import { Screen, Heading, PostCard, Message } from "../../components/ui";
export default function SubjectPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const subject = useResource<Subject>(`/subjects/${id}`);
  const posts = useResource<Page<PublicPost>>(`/posts?subjectId=${id}`);
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
      )}{" "}
      {posts.error || posts.loading ? (
        <Message error={posts.error} loading={posts.loading} />
      ) : posts.data?.items.length ? (
        posts.data.items.map((p) => <PostCard key={p.id} post={p} />)
      ) : (
        <Message empty="还没有公开经历。" />
      )}
    </Screen>
  );
}
