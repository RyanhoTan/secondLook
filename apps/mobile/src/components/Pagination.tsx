import { Text, View } from "react-native";
import { useApp } from "../lib/context";
import { Button } from "./ui";
export function Pagination({
  page,
  total,
  onChange,
  pageSize = 12,
}: {
  page: number;
  total: number;
  onChange: (page: number) => void;
  pageSize?: number;
}) {
  const { colors } = useApp();
  if (page === 1 && total <= pageSize) return null;
  return (
    <View style={{ gap: 12, marginVertical: 20 }}>
      <Text
        accessibilityLiveRegion="polite"
        style={{ color: colors.muted, fontSize: 13, textAlign: "center" }}
      >
        第 {page} / {Math.max(1, Math.ceil(total / pageSize))} 页
      </Text>
      <Button secondary disabled={page <= 1} onPress={() => onChange(page - 1)}>
        上一页
      </Button>
      <Button
        secondary
        disabled={page * pageSize >= total}
        onPress={() => onChange(page + 1)}
      >
        下一页
      </Button>
    </View>
  );
}
