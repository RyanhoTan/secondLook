import { useState } from "react";
import { router } from "expo-router";
import { Switch, Text, View } from "react-native";
import {
  categories,
  postSchema,
  type Category,
  type Subject,
} from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { SubjectPicker } from "../../components/SubjectPicker";
import {
  Screen,
  Heading,
  Field,
  Button,
  Message,
  LoginGate,
} from "../../components/ui";
export default function Write() {
  const { user } = useApp();
  return user ? <Compose /> : <LoginGate />;
}
function Compose() {
  const { api, colors } = useApp();
  const [selected, setSelected] = useState<Subject | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("RESTAURANT");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [occurredOn, setDate] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [personal, setPersonal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [postId, setPostId] = useState("");
  async function create() {
    setBusy(true);
    setError("");
    try {
      const subject = await api<Subject>("/subjects", {
        method: "POST",
        body: JSON.stringify({ name, category, city, address }),
      });
      setSelected(subject);
      setCreating(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    const checked = postSchema.safeParse({
      subjectId: selected?.id ?? "",
      title,
      body,
      occurredOn,
      anonymous,
      personalExperience: personal,
    });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const post = await api<{ id: string }>("/posts", {
        method: "POST",
        body: JSON.stringify(checked.data),
      });
      setPostId(post.id);
      setDone(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <Screen>
        <Heading
          title="感谢你，多留一份依据。"
          description="投稿正在等待审核。通过后才会公开，可以在“我的记录”查看状态。"
        />
        <View style={{ marginBottom: 16 }}>
          <Button secondary onPress={() => router.push(`/materials/${postId}`)}>
            添加图片材料（可选）
          </Button>
        </View>
        <Button
          onPress={() => {
            setDone(false);
            setTitle("");
            setBody("");
            setDate("");
            setPersonal(false);
            router.push("/me");
          }}
        >
          查看我的记录
        </Button>
      </Screen>
    );
  return (
    <Screen>
      <Heading
        eyebrow="真实、具体，也允许有后续"
        title={creating ? "添加一个具体对象" : "记录一次经历"}
      />
      {error && <Message error={error} />}{" "}
      {creating ? (
        <>
          <Field
            label="名称"
            value={name}
            onChangeText={setName}
            maxLength={80}
          />
          <Text style={{ fontSize: 12, color: colors.ink, marginBottom: 12 }}>
            类别
          </Text>
          <View style={{ gap: 8, marginBottom: 18 }}>
            {Object.entries(categories).map(([k, v]) => (
              <Button
                key={k}
                secondary={category !== k}
                onPress={() => setCategory(k as Category)}
              >
                {v}
              </Button>
            ))}
          </View>
          <Field
            label="城市"
            value={city}
            onChangeText={setCity}
            maxLength={30}
          />
          <Field
            label="地址/门店信息"
            value={address}
            onChangeText={setAddress}
            maxLength={150}
          />
          <View style={{ gap: 12 }}>
            <Button disabled={busy} onPress={() => void create()}>
              保存对象
            </Button>
            <Button secondary onPress={() => setCreating(false)}>
              返回投稿
            </Button>
          </View>
        </>
      ) : (
        <>
          <SubjectPicker selected={selected} onChange={setSelected} />
          <Button secondary onPress={() => setCreating(true)}>
            找不到？添加新对象
          </Button>
          <View style={{ height: 22 }} />
          <Field
            label="用一句话概括"
            value={title}
            onChangeText={setTitle}
            maxLength={80}
          />
          <Field
            label="发生日期（YYYY-MM-DD）"
            placeholder="例如 2026-10-01"
            value={occurredOn}
            onChangeText={setDate}
            maxLength={10}
          />
          <Field
            label="说说你的亲身经历"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={5000}
            placeholder="具体经过、遇到的问题和目前的处理情况。至少 20 字。"
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 15,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 12 }}>
              对外匿名发布
            </Text>
            <Switch
              value={anonymous}
              onValueChange={setAnonymous}
              accessibilityLabel="对外匿名发布"
              trackColor={{ true: colors.accent }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 15,
              gap: 12,
            }}
          >
            <Text style={{ color: colors.ink, fontSize: 12, flex: 1 }}>
              确认这是我的亲身经历，并愿意补充后续
            </Text>
            <Switch
              value={personal}
              onValueChange={setPersonal}
              accessibilityLabel="确认亲身经历"
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Message empty="匿名仍保留平台账号关联。请隐藏私人信息。当前先支持文字投稿，图片与佐证会在后续加入。" />
          <Button disabled={busy} onPress={() => void submit()}>
            {busy ? "正在提交…" : "提交审核"}
          </Button>
        </>
      )}
    </Screen>
  );
}
