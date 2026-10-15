import { useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import {
  categories,
  type Category,
  type Page,
  type PublicPost,
} from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import {
  Screen,
  Field,
  Heading,
  PostCard,
  Message,
  Button,
} from "../../components/ui";
export default function Discover() {
  const { colors } = useApp();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [activeCity, setActiveCity] = useState("");
  const [category, setCategory] = useState<Category | "">("");
  const [page, setPage] = useState(1);
  const params = new URLSearchParams({
    q: search,
    city: activeCity,
    page: String(page),
    ...(category ? { category } : {}),
  });
  const posts = useResource<Page<PublicPost>>(`/posts?${params}`);
  return (
    <Screen>
      <View
        style={{
          paddingVertical: 12,
          marginBottom: 25,
        }}
      >
        <Heading
          eyebrow="真实经历，持续更新"
          title="发现经历"
          description="搜索你关心的对象，看看亲历记录与后续变化。"
        />
        <Text style={{ fontSize: 12, color: colors.muted }}>
          本地预览 · 所有示例均为虚构
        </Text>
      </View>
      <Field
        label="搜索对象或经历"
        placeholder="公司、饭店、景点，或关心的问题"
        value={q}
        onChangeText={setQ}
        returnKeyType="search"
        onSubmitEditing={() => {
          setSearch(q);
          setActiveCity(city);
          setPage(1);
        }}
      />
      <Field
        label="城市"
        placeholder="留空搜索全国"
        value={city}
        onChangeText={setCity}
      />
      <Button
        secondary
        onPress={() => {
          setSearch(q);
          setActiveCity(city);
          setPage(1);
        }}
      >
        搜索经历
      </Button>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 8, paddingVertical: 23 }}
      >
        {[["", "全部"], ...Object.entries(categories)].map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="button"
            accessibilityState={{ selected: category === key }}
            onPress={() => {
              setCategory(key as Category | "");
              setPage(1);
            }}
            style={({ pressed }) => ({
              paddingVertical: 10,
              paddingHorizontal: 15,
              borderRadius: 10,
              backgroundColor: category === key ? colors.ink : colors.surface,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Text
              style={{
                color: category === key ? colors.bg : colors.muted,
                fontSize: 12,
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      {posts.loading || posts.error ? (
        <Message loading={posts.loading} error={posts.error} />
      ) : posts.data?.items.length ? (
        posts.data.items.map((p) => <PostCard post={p} key={p.id} />)
      ) : (
        <Message empty="没有找到相关经历，试试其他关键词。" />
      )}
      {posts.data && posts.data.total > 12 && (
        <View style={{ gap: 10 }}>
          {page > 1 && (
            <Button secondary onPress={() => setPage((p) => p - 1)}>
              上一页
            </Button>
          )}
          {page * 12 < posts.data.total && (
            <Button secondary onPress={() => setPage((p) => p + 1)}>
              下一页
            </Button>
          )}
          <Text style={{ color: colors.muted, textAlign: "center" }}>
            第 {page} 页
          </Text>
        </View>
      )}
    </Screen>
  );
}
