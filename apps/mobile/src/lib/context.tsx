import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useColorScheme } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient } from "@secondlook/contracts/client";
import type { Account } from "@secondlook/contracts";
export const palettes = {
  light: {
    bg: "#fafafa",
    surface: "#ffffff",
    ink: "#1c1c1e",
    muted: "#68686d",
    line: "#e9e9ec",
    accent: "#1c1c1e",
    soft: "#f0f0f3",
    buttonInk: "#ffffff",
    danger: "#af3b32",
  },
  dark: {
    bg: "#0d0d0e",
    surface: "#19191b",
    ink: "#f5f5f7",
    muted: "#aaaab0",
    line: "#303033",
    accent: "#f5f5f7",
    soft: "#242427",
    buttonInk: "#141416",
    danger: "#ffa59d",
  },
};
type Mode = "system" | "light" | "dark";
const base = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000/api/v1";
function useAppState() {
  const system = useColorScheme();
  const [mode, setMode] = useState<Mode>("system");
  const [session, setSession] = useState<{
    token: string;
    user: Account;
  } | null>(null);
  const [ready, setReady] = useState(false);
  const api = useMemo(
    () => createClient(base, () => session?.token ?? null),
    [session],
  );
  useEffect(() => {
    let active = true;
    async function restore() {
      try {
        const savedMode = await SecureStore.getItemAsync("secondlook-theme");
        if (active && (savedMode === "light" || savedMode === "dark"))
          setMode(savedMode);
        const token = await SecureStore.getItemAsync("secondlook-token");
        if (token) {
          const user = await createClient(base, () => token)<Account>("/me");
          if (active) setSession({ token, user });
        }
      } catch {
        /* Offline startup still permits opening the app and signing in again. */
      } finally {
        if (active) setReady(true);
      }
    }
    void restore();
    return () => {
      active = false;
    };
  }, []);
  async function login(value: { token: string; user: Account }) {
    await SecureStore.setItemAsync("secondlook-token", value.token);
    setSession(value);
  }
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      try {
        await SecureStore.deleteItemAsync("secondlook-token");
      } finally {
        setSession(null);
      }
    }
  }
  async function changeMode(value: Mode) {
    setMode(value);
    await SecureStore.setItemAsync("secondlook-theme", value);
  }
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  return {
    api,
    imageSource: (path: string) => ({
      uri: `${base}${path}`,
      headers: session
        ? { Authorization: `Bearer ${session.token}` }
        : undefined,
    }),
    user: session?.user ?? null,
    login,
    logout,
    ready,
    mode,
    changeMode,
    dark,
    colors: dark ? palettes.dark : palettes.light,
  };
}
const AppContext = createContext<ReturnType<typeof useAppState> | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  return (
    <AppContext.Provider value={useAppState()}>{children}</AppContext.Provider>
  );
}
export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("Missing provider");
  return ctx;
}
