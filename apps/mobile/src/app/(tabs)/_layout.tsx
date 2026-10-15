import { Tabs } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useApp } from "../../lib/context";
export default function TabsLayout() {
  const { colors } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.ink,
        headerShadowVisible: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          position: "absolute",
          left: 24,
          right: 24,
          bottom: 24,
          height: 72,
          borderRadius: 28,
          paddingTop: 9,
          paddingBottom: 9,
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.line,
          elevation: 4,
          shadowColor: "#000",
          shadowOpacity: 0.05,
          shadowRadius: 20,
          shadowOffset: { width: 0, height: 6 },
        },
        tabBarLabelStyle: { fontSize: 11, marginTop: 3 },
        tabBarItemStyle: { borderRadius: 21, marginHorizontal: 4 },
        tabBarActiveBackgroundColor: colors.soft,
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "发现",
          headerTitle: "SecondLook",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: "追踪",
          headerTitle: "后续追踪",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="write"
        options={{
          title: "记录",
          headerTitle: "记录一次经历",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="create-outline" color={color} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="me"
        options={{
          title: "我的",
          headerTitle: "我的记录",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" color={color} size={size} />
          ),
        }}
      />
    </Tabs>
  );
}
