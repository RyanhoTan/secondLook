import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
} from "react-native";
import { router } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  categories,
  evidenceLabels,
  type PublicPost,
} from "@secondlook/contracts";
import { useApp } from "../lib/context";
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bg }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.screen}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
export function Heading({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 10, marginBottom: 24 }}>
      {eyebrow && (
        <Text style={{ color: colors.muted, fontSize: 12, letterSpacing: 1.2 }}>
          {eyebrow}
        </Text>
      )}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.ink,
          fontSize: 30,
          fontWeight: "600",
          letterSpacing: -0.8,
          lineHeight: 40,
        }}
      >
        {title}
      </Text>
      {description && (
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 23 }}>
          {description}
        </Text>
      )}
    </View>
  );
}
export function Button({
  children,
  onPress,
  secondary = false,
  disabled = false,
}: {
  children: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
}) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: secondary ? colors.soft : colors.accent,
        borderRadius: 12,
        padding: 15,
        alignItems: "center",
        opacity: disabled ? 0.5 : pressed ? 0.78 : 1,
        minHeight: 48,
      })}
    >
      <Text
        style={{
          color: secondary ? colors.accent : colors.buttonInk,
          fontSize: 16,
          fontWeight: "600",
        }}
      >
        {children}
      </Text>
    </Pressable>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 8, marginBottom: 17 }}>
      <Text style={{ color: colors.ink, fontSize: 12, fontWeight: "500" }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          {
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.surface,
            color: colors.ink,
            borderRadius: 10,
            padding: 13,
            fontSize: 16,
            lineHeight: 22,
            minHeight: 48,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.multiline && { minHeight: 140 },
          props.style,
        ]}
      />
    </View>
  );
}
export function Message({
  error,
  loading,
  empty,
}: {
  error?: string;
  loading?: boolean;
  empty?: string;
}) {
  const { colors } = useApp();
  return (
    <View style={{ paddingVertical: 28, gap: 15 }}>
      {loading && <ActivityIndicator color={colors.accent} />}
      <Text
        accessibilityRole={error ? "alert" : "text"}
        style={{
          color: error ? colors.danger : colors.muted,
          fontSize: 15,
          lineHeight: 23,
        }}
      >
        {error || (loading ? "正在读取记录…" : (empty ?? "还没有记录。"))}
      </Text>
    </View>
  );
}
export function LoginGate() {
  return (
    <Screen>
      <Heading
        title="登录后继续"
        description="发布经历、关注后续和查看自己的记录，需要先登录。"
      />
      <Button onPress={() => router.push("/login")}>前往登录</Button>
    </Screen>
  );
}
export function PostCard({ post }: { post: PublicPost }) {
  const { colors } = useApp();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={post.title}
      onPress={() => router.push(`/posts/${post.id}`)}
      style={({ pressed }) => ({
        backgroundColor: colors.surface,
        borderColor: colors.line,
        borderWidth: 1,
        borderRadius: 18,
        padding: 20,
        marginBottom: 14,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          marginBottom: 17,
        }}
      >
        <View
          style={{
            backgroundColor: colors.soft,
            padding: 10,
            borderRadius: 10,
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
            color={colors.accent}
            size={19}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text
            numberOfLines={1}
            style={{ color: colors.ink, fontSize: 12, fontWeight: "500" }}
          >
            {post.subject.name}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 3 }}>
            {categories[post.subject.category]} · {post.subject.city}
          </Text>
        </View>
      </View>
      <Text
        style={{
          fontSize: 17,
          fontWeight: "600",
          color: colors.ink,
          lineHeight: 26,
          marginBottom: 9,
        }}
      >
        {post.title}
      </Text>
      <Text
        numberOfLines={2}
        style={{
          fontSize: 12,
          lineHeight: 22,
          color: colors.muted,
          marginBottom: 17,
        }}
      >
        {post.body}
      </Text>
      <EvidenceTags post={post} />
      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: colors.line,
          marginTop: 16,
          paddingTop: 13,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {post.authorName}
        </Text>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          {post.occurredOn} 发生 ↗
        </Text>
      </View>
    </Pressable>
  );
}
export function EvidenceTags({
  post,
}: {
  post: Pick<PublicPost, "evidence" | "disputed">;
}) {
  const { dark } = useApp();
  const palette = {
    STATEMENT: dark ? ["#303a33", "#c1ccc2"] : ["#eef0ec", "#59645b"],
    MATERIAL: dark ? ["#273647", "#b5ccef"] : ["#eaf0fa", "#3b5e99"],
    CORROBORATED: dark ? ["#254238", "#a7d4c4"] : ["#e3f2ee", "#226858"],
  };
  return (
    <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
      <Text
        style={{
          fontSize: 12,
          backgroundColor: palette[post.evidence][0],
          color: palette[post.evidence][1],
          paddingVertical: 4,
          paddingHorizontal: 8,
          borderRadius: 5,
        }}
      >
        ● {evidenceLabels[post.evidence]}
      </Text>
      {post.disputed && (
        <Text
          style={{
            fontSize: 12,
            backgroundColor: dark ? "#473b25" : "#fbf0d8",
            color: dark ? "#ecd2a5" : "#8c5c18",
            padding: 4,
            borderRadius: 5,
          }}
        >
          ● 存在争议
        </Text>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  screen: { padding: 22, paddingBottom: 45, gap: 0 },
});
