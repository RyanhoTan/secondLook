import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Account } from "@secondlook/contracts";
import { createClient } from "@secondlook/contracts/client";
const SessionContext = createContext<ReturnType<typeof useSessionState> | null>(
  null,
);
function useSessionState() {
  const [session, setSession] = useState<{
    token: string;
    user: Account;
  } | null>(null);
  const api = useMemo(
    () =>
      createClient(
        import.meta.env.VITE_API_URL ?? "/api/v1",
        () => session?.token ?? null,
      ),
    [session],
  );
  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setSession(null);
    }
  }
  return { user: session?.user ?? null, api, setSession, logout };
}
export function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <SessionContext.Provider value={useSessionState()}>
      {children}
    </SessionContext.Provider>
  );
}
export function useSession() {
  const session = useContext(SessionContext);
  if (!session) throw new Error("Missing SessionProvider");
  return session;
}
