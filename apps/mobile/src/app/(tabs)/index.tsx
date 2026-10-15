import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
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
  Heading,
  PostCard,
  Message,
  Button,
} from "../../components/ui";
import { SegmentedControl } from "../../components/SegmentedControl";
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
  function submit() {
    setSearch(q);
    setActiveCity(city);
    setPage(1);
  }
  return (
    <Screen>
      <Heading
        eyebrow="A little more perspective."
        title="发现经历."
        description="在决定之前，听听另一种声音。"
      />
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 20,
          padding: 15,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <Ionicons name="search-outline" size={20} color={colors.muted} />
          <TextInput
            accessibilityLabel="搜索对象或经历"
            placeholder="公司、餐厅、目的地…"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
            onSubmitEditing={submit}
            style={{ flex: 1, color: colors.ink, fontSize: 16, minHeight: 46 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索"
            onPress={submit}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 13,
              backgroundColor: colors.ink,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="arrow-forward" size={20} color={colors.bg} />
          </Pressable>
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            marginTop: 10,
            paddingTop: 6,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Ionicons name="location-outline" size={16} color={colors.muted} />
          <TextInput
            accessibilityLabel="筛选城市"
            placeholder="全国"
            placeholderTextColor={colors.muted}
            value={city}
            onChangeText={setCity}
            returnKeyType="search"
            onSubmitEditing={submit}
            style={{ flex: 1, color: colors.ink, fontSize: 13, minHeight: 40 }}
          />
        </View>
      </View>
      <SegmentedControl
        options={[
          { value: "", label: "全部" },
          ...Object.entries(categories).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        value={category}
        onChange={(value) => {
          setCategory(value as Category | "");
          setPage(1);
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
          marginBottom: 16,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}
        >
          最新经历{" "}
          <Text
            style={{ fontSize: 12, fontWeight: "400", color: colors.muted }}
          >
            {posts.data?.total ?? "—"}
          </Text>
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>按发布时间</Text>
      </View>
      <View
        style={{
          borderRadius: 24,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: colors.line,
          backgroundColor: colors.surface,
        }}
      >
        {posts.loading || posts.error ? (
          <Message loading={posts.loading} error={posts.error} />
        ) : posts.data?.items.length ? (
          posts.data.items.map((p) => <PostCard post={p} key={p.id} />)
        ) : (
          <Message empty="没有找到相关经历，试试其他关键词。" />
        )}
      </View>
      {posts.data && posts.data.total > 12 && (
        <View style={{ gap: 10, marginTop: 20 }}>
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
        </View>
      )}
      <View style={{ paddingVertical: 30, gap: 8 }}>
        <Text style={{ fontSize: 13, color: colors.muted, lineHeight: 24 }}>
          经历可以被补充，判断也可以改变。{"\n"}关注后续，给事情一点时间。
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted, marginTop: 14 }}>
          本地预览 · 所有示例均为虚构
        </Text>
      </View>
    </Screen>
  );
}
