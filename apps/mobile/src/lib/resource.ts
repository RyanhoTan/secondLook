import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useApp } from "./context";
export function useResource<T>(path: string, version = 0) {
  const { api } = useApp();
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void version; // Re-fetch after a successful mutation or an explicit refresh.
      setData(undefined);
      setLoading(true);
      setError("");
      api<T>(path)
        .then((d) => {
          if (active) setData(d);
        })
        .catch((e) => {
          if (active)
            setError(
              e instanceof Error
                ? e.message
                : "无法连接，请确认本地 API 已启动且手机与电脑处于同一网络。",
            );
        })
        .finally(() => {
          if (active) setLoading(false);
        });
      return () => {
        active = false;
      };
    }, [api, path, version]),
  );
  return { data, loading, error };
}
