import { Image, Text, View } from "react-native";
import { useState } from "react";
import type { PublicMaterial } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { useResource } from "../lib/resource";
import { Message } from "./ui";

export function MaterialImage({
  item,
  variant = "public",
}: {
  item: PublicMaterial;
  variant?: "public" | "preview";
}) {
  const { imageSource } = useApp();
  const [failed, setFailed] = useState(false);
  return failed ? (
    <Message error="图片暂时无法读取，请返回页面重试。" />
  ) : (
    <Image
      source={imageSource(`/materials/${item.id}/${variant}`)}
      accessibilityLabel={
        variant === "public"
          ? "审核通过的公开材料"
          : "本人材料的审核预览，并非最终公开副本"
      }
      style={{
        width: "100%",
        aspectRatio: item.width / item.height,
        borderRadius: 12,
      }}
      resizeMode="contain"
      onError={() => setFailed(true)}
    />
  );
}
export function PublicMaterials({ postId }: { postId: string }) {
  const { colors } = useApp();
  const resource = useResource<PublicMaterial[]>(`/posts/${postId}/materials`);
  if (resource.error) return <Message error={resource.error} />;
  if (!resource.data?.length) return null;
  return (
    <View style={{ gap: 20, marginBottom: 28 }}>
      <Text style={{ color: colors.ink, fontSize: 20, fontWeight: "600" }}>
        相关材料
      </Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}>
        材料已完成基础检查，不代表事实已被证实。仅供审核的材料不在此展示。
      </Text>
      {resource.data.map((item) => (
        <View key={item.id} style={{ gap: 12 }}>
          <MaterialImage item={item} />
          <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 26 }}>
            {item.source}
          </Text>
        </View>
      ))}
    </View>
  );
}
