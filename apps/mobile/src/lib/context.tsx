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
    bg: "#f5f5f7",
    surface: "#ffffff",
    ink: "#1d1d1f",
    muted: "#626568",
    line: "#e6e9e2",
    accent: "#315c49",
    soft: "#e7eee7",
    buttonInk: "#ffffff",
    danger: "#a34e3f",
  },
  dark: {
    bg: "#101112",
    surface: "#1c1d1f",
    ink: "#f5f5f7",
    muted: "#b0b4b8",
    line: "#343d36",
    accent: "#b4d1b9",
    soft: "#2b4032",
    buttonInk: "#17251c",
    danger: "#f0a394",
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
    await SecureStore.setItemAsync("secondlook-theme", value);
    setMode(value);
  }
  const dark = mode === "dark" || (mode === "system" && system === "dark");
  return {
    api,
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
