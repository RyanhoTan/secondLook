import { Text, View } from "react-native";
import type { PostPreview as Preview } from "@secondlook/compose";
import { categories } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { Button } from "./ui";
import { IssueTypes } from "./IssueTypes";

export function PostPreview({
  preview,
  nickname,
  busy,
  conflict,
  onBack,
  onSubmit,
}: {
  preview: Preview;
  nickname: string;
  busy: boolean;
  conflict: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const { colors } = useApp();
  const { content, subject } = preview;
  const note = { color: colors.muted, fontSize: 14, lineHeight: 24 };
  return (
    <View style={{ gap: 16, marginTop: 24 }}>
      <Text
        accessibilityRole="header"
        style={{ color: colors.ink, fontSize: 24, fontWeight: "600" }}
      >
        发布前预览
      </Text>
      <Text style={note}>请核对以下内容。提交后先审核，通过后才会公开。</Text>
      <View
        style={{
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.line,
          gap: 8,
        }}
      >
        <Text style={{ color: colors.ink, fontSize: 18, fontWeight: "600" }}>
          {subject.name}
        </Text>
        <Text style={note}>
          {categories[subject.category]} · {subject.city}
        </Text>
        <Text style={note}>{subject.address || "未填写具体地址"}</Text>
      </View>
      <Text
        accessibilityRole="header"
        style={{
          color: colors.ink,
          fontSize: 22,
          lineHeight: 32,
          fontWeight: "600",
        }}
      >
        {content.title}
      </Text>
      <Text style={note}>发生日期：{content.occurredOn}</Text>
      <Text style={{ color: colors.ink, fontSize: 16 }}>
        对外身份：{content.anonymous ? "匿名亲历者" : nickname}
      </Text>
      <Text style={note}>
        {content.anonymous
          ? "公开页面隐藏账号昵称，平台仍保留账号关联。"
          : "公开页面会显示你的昵称。"}
      </Text>
      <IssueTypes value={content.issueTypes} />
      <Text style={{ color: colors.ink, fontSize: 16, lineHeight: 29 }}>
        {content.body}
      </Text>
      <Text style={note}>
        已确认亲身经历。问题类型仅作分类，不代表事实已被平台确认。图片材料可在投稿后单独添加、脱敏并审核。
      </Text>
      <Button secondary disabled={busy} onPress={onBack}>
        返回修改
      </Button>
      <Button disabled={busy || conflict} onPress={onSubmit}>
        {busy ? "正在提交…" : "提交审核"}
      </Button>
    </View>
  );
}
