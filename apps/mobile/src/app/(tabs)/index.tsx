import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import {
  categories,
  postBrowseSchema,
  postBrowseParams,
  postSortLabels,
  issueLabels,
  type PostBrowse,
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
import { BrowseFilters } from "../../components/BrowseFilters";
import { Pagination } from "../../components/Pagination";
import { SegmentedControl } from "../../components/SegmentedControl";
export default function Discover() {
  const { colors } = useApp();
  const blank = {
    q: "",
    city: "",
    occurredFrom: "",
    occurredTo: "",
    sort: "PUBLISHED_DESC",
    issue: "",
  };
  const [inputs, setInputs] = useState(blank);
  const [active, setActive] = useState<PostBrowse>(() =>
    postBrowseSchema.parse({}),
  );
  const [error, setError] = useState("");
  const posts = useResource<Page<PublicPost>>(
    `/posts?${postBrowseParams(active)}`,
  );
  function submit(category: Category | "" = active.category ?? "") {
    const checked = postBrowseSchema.safeParse({
      ...active,
      ...inputs,
      category: category || undefined,
      issue: inputs.issue || undefined,
      page: 1,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setError("");
    setActive(checked.data);
  }
  function clear() {
    setInputs(blank);
    setActive(postBrowseSchema.parse({}));
    setError("");
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
            value={inputs.q}
            onChangeText={(q) => setInputs({ ...inputs, q })}
            maxLength={100}
            returnKeyType="search"
            onSubmitEditing={() => submit()}
            style={{ flex: 1, color: colors.ink, fontSize: 16, minHeight: 46 }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="搜索"
            onPress={() => submit()}
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
            value={inputs.city}
            onChangeText={(city) => setInputs({ ...inputs, city })}
            maxLength={30}
            returnKeyType="search"
            onSubmitEditing={() => submit()}
            style={{ flex: 1, color: colors.ink, fontSize: 13, minHeight: 44 }}
          />
        </View>
      </View>
      <View style={{ marginTop: 12 }}>
        <Button
          secondary
          onPress={() =>
            router.push({
              pathname: "/objects",
              params: {
                q: inputs.q,
                city: inputs.city,
                category: active.category ?? "",
              },
            })
          }
        >
          查找具体对象
        </Button>
      </View>
      <BrowseFilters
        value={inputs}
        onChange={(patch) => setInputs({ ...inputs, ...patch })}
        onApply={() => submit()}
        onClear={clear}
      />
      {error && <Message error={error} />}
      <SegmentedControl
        options={[
          { value: "", label: "全部" },
          ...Object.entries(categories).map(([value, label]) => ({
            value,
            label,
          })),
        ]}
        value={active.category ?? ""}
        onChange={(value) => {
          submit(value as Category | "");
        }}
      />
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginTop: 10,
          marginBottom: 16,
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <Text
          accessibilityRole="header"
          style={{ fontSize: 17, fontWeight: "600", color: colors.ink }}
        >
          {active.q
            ? "搜索结果"
            : active.sort === "PUBLISHED_DESC"
              ? "最新经历"
              : "经历列表"}{" "}
          <Text
            style={{ fontSize: 12, fontWeight: "400", color: colors.muted }}
          >
            {posts.data?.total ?? "—"}
          </Text>
        </Text>
        <Text style={{ fontSize: 13, color: colors.muted }}>
          {postSortLabels[active.sort]}
        </Text>
      </View>
      <Text
        style={{
          color: colors.muted,
          fontSize: 13,
          lineHeight: 24,
          marginBottom: 16,
        }}
      >
        {active.issue ? `问题类型：${issueLabels[active.issue]}。` : ""}
        {active.occurredFrom || active.occurredTo
          ? `发生日期：${active.occurredFrom ?? "不限"} 至 ${active.occurredTo ?? "不限"}。`
          : ""}
        仅统计当前范围内已公开的经历，不代表对象整体评价。
      </Text>
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
      {posts.data && (
        <Pagination
          page={active.page}
          pageSize={active.limit}
          total={posts.data.total}
          onChange={(page) => setActive({ ...active, page })}
        />
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
