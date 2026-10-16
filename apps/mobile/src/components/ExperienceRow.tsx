import { Animated, Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  categories,
  evidenceLabels,
  type PublicPost,
} from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { IssueTypes } from "./IssueTypes";
import { usePressFeedback } from "../lib/interaction";
export function PostCard({ post }: { post: PublicPost }) {
  const { colors } = useApp();
  const feedback = usePressFeedback();
  return (
    <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={post.title}
        onPress={() => router.push(`/posts/${post.id}`)}
        onPressIn={feedback.onPressIn}
        onPressOut={feedback.onPressOut}
        style={({ pressed }) => ({
          backgroundColor: pressed ? colors.soft : colors.surface,
          padding: 22,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
        })}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 10,
            marginBottom: 20,
            flexWrap: "wrap",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 9,
              flexShrink: 1,
            }}
          >
            <View
              style={{
                backgroundColor: colors.soft,
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name={
                  post.subject.category === "COMPANY"
                    ? "business-outline"
                    : post.subject.category === "RESTAURANT"
                      ? "restaurant-outline"
                      : post.subject.category === "ATTRACTION"
                        ? "trail-sign-outline"
                        : "cube-outline"
                }
                size={17}
                color={colors.muted}
              />
            </View>
            <View style={{ flexShrink: 1 }}>
              <Text
                style={{ fontSize: 13, fontWeight: "500", color: colors.ink }}
              >
                {post.subject.name}
              </Text>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 3 }}>
                {categories[post.subject.category]} · {post.subject.city}
              </Text>
            </View>
          </View>
          <EvidenceTags post={post} />
        </View>
        <View
          style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}
        >
          <Text
            style={{
              fontSize: 19,
              fontWeight: "600",
              lineHeight: 29,
              letterSpacing: -0.4,
              color: colors.ink,
              flex: 1,
            }}
          >
            {post.title}
          </Text>
          <Ionicons
            name="arrow-forward"
            style={{ transform: [{ rotate: "-45deg" }] }}
            size={18}
            color={colors.muted}
          />
        </View>
        <Text
          numberOfLines={2}
          style={{
            fontSize: 15,
            lineHeight: 27,
            color: colors.muted,
            marginTop: 10,
          }}
        >
          {post.body}
        </Text>
        {post.issueTypes.length > 0 && <IssueTypes value={post.issueTypes} />}
        {post.correction && (
          <Text
            style={{
              marginTop: 12,
              color: colors.muted,
              fontSize: 13,
              lineHeight: 23,
            }}
            numberOfLines={2}
          >
            作者已更正 · {post.correction.reason}
          </Text>
        )}
        <View
          style={{
            marginTop: 20,
            flexDirection: "row",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {post.authorName}
          </Text>
          <Text style={{ fontSize: 12, color: colors.muted }}>
            {post.occurredOn} 发生
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
export function EvidenceTags({
  post,
}: {
  post: Pick<PublicPost, "evidence" | "disputed">;
}) {
  const { dark } = useApp();
  const palette = {
    STATEMENT: dark ? ["#2c2c30", "#c4c4cb"] : ["#f1f1f4", "#636366"],
    MATERIAL: dark ? ["#273647", "#b5ccef"] : ["#eaf0fa", "#3b5e99"],
    CORROBORATED: dark ? ["#254238", "#a7d4c4"] : ["#e3f2ee", "#226858"],
  };
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      <Text
        style={{
          fontSize: 12,
          color: palette[post.evidence][1],
          backgroundColor: palette[post.evidence][0],
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 6,
        }}
      >
        · {evidenceLabels[post.evidence]}
      </Text>
      {post.disputed && (
        <Text
          style={{
            fontSize: 12,
            color: dark ? "#ecd2a5" : "#8c5c18",
            backgroundColor: dark ? "#473b25" : "#fbf0d8",
            padding: 4,
            borderRadius: 6,
          }}
        >
          · 存在争议
        </Text>
      )}
    </View>
  );
}
