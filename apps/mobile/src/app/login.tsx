import { useState } from "react";
import { router } from "expo-router";
import type { Account } from "@secondlook/contracts";
import { useApp } from "../lib/context";
import { Screen, Heading, Field, Button, Message } from "../components/ui";
export default function Login() {
  const { api, login } = useApp();
  const [register, setRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const session = await api<{ token: string; user: Account }>(
        `/auth/${register ? "register" : "login"}`,
        {
          method: "POST",
          body: JSON.stringify({ username, nickname, password }),
        },
      );
      await login(session);
      router.replace("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen>
      <Heading
        eyebrow="你的经历，值得被看见"
        title={register ? "从一个账号开始" : "欢迎回来"}
        description="昵称可以公开，经历也可以匿名。"
      />
      <Field
        label="登录名"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={32}
      />
      {register && (
        <Field
          label="公开昵称"
          value={nickname}
          onChangeText={setNickname}
          maxLength={24}
        />
      )}
      <Field
        label="密码"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        maxLength={128}
      />
      {error && <Message error={error} />}
      <Button disabled={busy} onPress={() => void submit()}>
        {busy ? "正在处理…" : register ? "创建账号" : "登录"}
      </Button>
      <Message empty="本地账号，不需要手机号。密码至少 8 位。" />
      <Button
        secondary
        onPress={() => {
          setRegister(!register);
          setError("");
        }}
      >
        {register ? "已有账号？登录" : "还没有账号？创建一个"}
      </Button>
    </Screen>
  );
}
