import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppProvider, useApp } from "../lib/context";
function Navigation() {
  const { colors, dark } = useApp();
  return (
    <>
      <StatusBar style={dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.ink,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: colors.bg },
          headerBackButtonDisplayMode: "minimal",
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "账号" }} />
        <Stack.Screen name="posts/[id]" options={{ title: "经历与后续" }} />
        <Stack.Screen name="subjects/[id]" options={{ title: "对象记录" }} />
        <Stack.Screen name="update/[id]" options={{ title: "补充进展" }} />
        <Stack.Screen name="revise/[id]" options={{ title: "修订原文" }} />
      </Stack>
    </>
  );
}
export default function Root() {
  return (
    <AppProvider>
      <Navigation />
    </AppProvider>
  );
}
