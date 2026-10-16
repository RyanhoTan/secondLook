import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import { revisionSchema, type RevisionEditor } from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import { IssuePicker, IssueTypes } from "../../components/IssueTypes";
import {
  Screen,
  Heading,
  Field,
  Button,
  Message,
  LoginGate,
} from "../../components/ui";

export default function Revise() {
  const { user } = useApp();
  return user ? <Editor /> : <LoginGate />;
}
function Editor() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const resource = useResource<RevisionEditor>(`/me/posts/${id}/revisions`);
  return resource.data ? (
    <Form
      key={`${id}-${resource.data.post.currentVersion}`}
      data={resource.data}
    />
  ) : (
    <Screen>
      <Message loading={resource.loading} error={resource.error} />
    </Screen>
  );
}
function Form({ data }: { data: RevisionEditor }) {
  const { api, colors } = useApp();
  const latest = data.latestRevision;
  const content = latest?.status === "REJECTED" ? latest : data.post;
  const [title, setTitle] = useState(content.title);
  const [body, setBody] = useState(content.body);
  const [occurredOn, setOccurredOn] = useState(content.occurredOn);
  const [issueTypes, setIssueTypes] = useState(content.issueTypes);
  const [changeReason, setChangeReason] = useState(
    latest?.status === "REJECTED" ? latest.changeReason : "",
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const pending = latest?.status === "PENDING";
  async function submit() {
    if (busy) return;
    const checked = revisionSchema.safeParse({
      title,
      body,
      occurredOn,
      issueTypes,
      changeReason,
      baseVersion: data.post.currentVersion,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${data.post.id}/revisions`, {
        method: "POST",
        body: JSON.stringify(checked.data),
      });
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading
        eyebrow={`当前第 ${data.post.currentVersion} 版`}
        title={
          done ? "修改已提交" : pending ? "修改正在审核" : "把经历说得更准确"
        }
        description="审核通过前保留原公开版本。通过后展示更正说明、保留历史，并通知关注者。对象和匿名身份保持原设置。"
      />
      {done ? (
        <Button onPress={() => router.back()}>返回</Button>
      ) : pending ? (
        <View style={{ gap: 15 }}>
          <Text style={{ color: colors.ink, fontSize: 19, fontWeight: "600" }}>
            {latest.title}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 27 }}>
            {latest.body}
          </Text>
          <IssueTypes value={latest.issueTypes} />
          <Text style={{ color: colors.muted, fontSize: 15 }}>
            发生日期：{latest.occurredOn}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 15, lineHeight: 25 }}>
            更正说明：{latest.changeReason}
          </Text>
        </View>
      ) : (
        <>
          {latest?.status === "REJECTED" && (
            <Message
              empty={`上次修改未通过：${latest.reviewReason}。调整后可重新提交。`}
            />
          )}
          <Field
            label="标题"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Field
            label="发生日期（YYYY-MM-DD）"
            value={occurredOn}
            onChangeText={setOccurredOn}
            maxLength={10}
          />
          <Field
            label="经历正文"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
          />
          <Field
            label="更正说明（会公开展示）"
            value={changeReason}
            onChangeText={setChangeReason}
            multiline
            maxLength={500}
          />
          <IssuePicker
            category={data.post.category}
            value={issueTypes}
            onChange={setIssueTypes}
            disabled={busy}
          />
          {error && <Message error={error} />}
          <Button disabled={busy} onPress={() => void submit()}>
            {busy ? "正在提交…" : "提交修改审核"}
          </Button>
        </>
      )}
    </Screen>
  );
}
