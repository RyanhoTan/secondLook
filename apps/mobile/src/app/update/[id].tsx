import { useState } from "react";
import { useLocalSearchParams, router } from "expo-router";
import { useApp } from "../../lib/context";
import {
  Screen,
  Heading,
  Field,
  Button,
  Message,
  LoginGate,
} from "../../components/ui";
export default function Update() {
  const { user } = useApp();
  return user ? <Form /> : <LoginGate />;
}
function Form() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api } = useApp();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      await api(`/posts/${id}/updates`, {
        method: "POST",
        body: JSON.stringify({ title, body }),
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
        title={done ? "进展已提交" : "补充后续进展"}
        description={
          done
            ? "审核后公开，并通知关注这条记录的人。"
            : "问题解决、更正或新的变化，都值得留下记录。"
        }
      />
      {done ? (
        <Button onPress={() => router.back()}>返回</Button>
      ) : (
        <>
          <Field
            label="更新标题"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Field
            label="发生了什么变化"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
          />
          {error && <Message error={error} />}
          <Button disabled={busy} onPress={() => void submit()}>
            {busy ? "正在提交…" : "提交审核"}
          </Button>
        </>
      )}
    </Screen>
  );
}
