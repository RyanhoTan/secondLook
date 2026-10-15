import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, usePathname } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useApp } from "../lib/context";
import { usePressFeedback } from "../lib/interaction";
export function Screen({ children }: { children: ReactNode }) {
  const { colors } = useApp();
  const pathname = usePathname();
  const root = ["/", "/write", "/notifications", "/me"].includes(pathname);
  return (
    <SafeAreaView
      edges={root ? ["top"] : []}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 140 }}
          keyboardShouldPersistTaps="handled"
          contentInsetAdjustmentBehavior="automatic"
        >
          {root && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 13,
                marginBottom: 22,
              }}
            >
              <Text
                style={{
                  fontSize: 20,
                  fontWeight: "600",
                  letterSpacing: -0.8,
                  color: colors.ink,
                }}
              >
                SecondLook.
              </Text>
              <Pressable
                accessibilityLabel="我的账户"
                accessibilityRole="button"
                onPress={() => router.push("/me")}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 22,
                  backgroundColor: pressed ? colors.soft : "transparent",
                })}
              >
                <Ionicons
                  name="person-circle-outline"
                  size={25}
                  color={colors.muted}
                />
              </Pressable>
            </View>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
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
    <View style={{ gap: 11, marginBottom: 28 }}>
      {eyebrow && (
        <Text style={{ color: colors.muted, fontSize: 13, letterSpacing: 0.1 }}>
          {eyebrow}
        </Text>
      )}
      <Text
        accessibilityRole="header"
        style={{
          color: colors.ink,
          fontSize: 34,
          fontWeight: "600",
          letterSpacing: -1.2,
          lineHeight: 43,
        }}
      >
        {title}
      </Text>
      {description && (
        <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 25 }}>
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
  const feedback = usePressFeedback();
  return (
    <Animated.View style={{ transform: [{ scale: feedback.scale }] }}>
      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        accessibilityState={{ disabled }}
        onPress={onPress}
        onPressIn={feedback.onPressIn}
        onPressOut={feedback.onPressOut}
        style={({ pressed }) => ({
          backgroundColor: secondary ? colors.soft : colors.accent,
          borderRadius: 28,
          minHeight: 52,
          paddingVertical: 14,
          paddingHorizontal: 24,
          alignItems: "center",
          justifyContent: "center",
          opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        })}
      >
        <Text
          style={{
            color: secondary ? colors.ink : colors.buttonInk,
            fontSize: 15,
            fontWeight: "600",
            textAlign: "center",
          }}
        >
          {children}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
export function Field({ label, ...props }: TextInputProps & { label: string }) {
  const { colors } = useApp();
  return (
    <View style={{ gap: 10, marginBottom: 23 }}>
      <Text style={{ color: colors.ink, fontSize: 13, fontWeight: "500" }}>
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={colors.muted}
        {...props}
        style={[
          {
            borderWidth: 0,
            backgroundColor: colors.soft,
            color: colors.ink,
            borderRadius: 15,
            padding: 16,
            fontSize: 16,
            lineHeight: 25,
            minHeight: 54,
            textAlignVertical: props.multiline ? "top" : "center",
          },
          props.multiline && { minHeight: 150 },
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
    <View
      style={{
        paddingVertical: 32,
        alignItems: "center",
        gap: 16,
        paddingHorizontal: 12,
      }}
    >
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <Ionicons
          name={error ? "alert-circle-outline" : "layers-outline"}
          color={error ? colors.danger : colors.muted}
          size={25}
        />
      )}
      <Text
        accessibilityRole={error ? "alert" : "text"}
        style={{
          color: error ? colors.danger : colors.muted,
          fontSize: 14,
          lineHeight: 24,
          textAlign: "center",
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
        eyebrow="YOUR PERSPECTIVE MATTERS"
        title="给你的经历，留个位置。"
        description="登录后，记录自己的经历，也关注事情的后来。"
      />
      <Button onPress={() => router.push("/login")}>前往登录</Button>
    </Screen>
  );
}

export { PostCard, EvidenceTags } from "./ExperienceRow";
