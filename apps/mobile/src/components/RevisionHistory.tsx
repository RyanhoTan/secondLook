import { useState } from "react";
import { Text, View } from "react-native";
import type { PublicRevision } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { Button } from "./ui";
import { PublicMaterials } from "./Materials";

export function RevisionHistory({
  history,
  currentVersion,
  postId,
}: {
  history: PublicRevision[];
  currentVersion: number;
  postId: string;
}) {
  const { colors } = useApp();
  const [open, setOpen] = useState(false);
  return (
    <View style={{ gap: 15, marginVertical: 25 }}>
      <Button
        secondary
        onPress={() => setOpen(!open)}
      >{`${open ? "收起" : "查看"}版本历史 · 当前第 ${currentVersion} 版`}</Button>
      {open && (
        <>
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}>
            历史用于理解更正，当前内容以最新公开版本为准。涉及隐私的旧内容可能限制公开。
          </Text>
          {history.map((item) => (
            <View
              key={item.id}
              style={{
                gap: 10,
                paddingVertical: 20,
                borderBottomWidth: 1,
                borderBottomColor: colors.line,
              }}
            >
              <Text
                style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}
              >
                第 {item.version} 版
                {item.version === currentVersion ? " · 当前" : ""}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                {new Date(item.publishedAt).toLocaleDateString("zh-CN")}公开
              </Text>
              {item.visible ? (
                <>
                  <Text
                    style={{ color: colors.ink, fontSize: 15, lineHeight: 26 }}
                  >
                    {item.changeReason}
                  </Text>
                  <Text
                    style={{
                      color: colors.ink,
                      fontSize: 17,
                      fontWeight: "500",
                    }}
                  >
                    {item.title}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 13 }}>
                    {item.occurredOn}发生
                  </Text>
                  <Text
                    style={{
                      color: colors.muted,
                      fontSize: 15,
                      lineHeight: 27,
                    }}
                  >
                    {item.body}
                  </Text>
                  {item.version !== currentVersion && (
                    <PublicMaterials postId={postId} version={item.version} />
                  )}
                </>
              ) : (
                <Text style={{ color: colors.muted, fontSize: 15 }}>
                  此版本已限制公开，处理记录由平台保留。
                </Text>
              )}
            </View>
          ))}
        </>
      )}
    </View>
  );
}
