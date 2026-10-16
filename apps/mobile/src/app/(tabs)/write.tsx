import { useEffect, useState } from "react";
import { useDraftEditor } from "@secondlook/compose";
import { randomUUID } from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { Switch, Text, View } from "react-native";
import { categories, type Category, type Subject } from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { SubjectPicker } from "../../components/SubjectPicker";
import { IssuePicker, IssueTypes } from "../../components/IssueTypes";
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
  const { draft, fresh } = useLocalSearchParams<{
    draft?: string;
    fresh?: string;
  }>();
  useEffect(() => {
    if (user && !draft) router.setParams({ draft: randomUUID(), fresh: "1" });
  }, [user, draft]);
  if (!user) return <LoginGate />;
  if (!draft)
    return (
      <Screen>
        <Message loading />
      </Screen>
    );
  return (
    <Compose key={`${user.id}:${draft}`} id={draft} fresh={fresh === "1"} />
  );
}
function Compose({ id, fresh }: { id: string; fresh: boolean }) {
  const { api, colors } = useApp();
  const draft = useDraftEditor(api, id, fresh, randomUUID);
  const {
    content,
    edit,
    subject: selected,
    selectSubject: setSelected,
    done: postId,
    pending,
    busy,
  } = draft;
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<Category>("RESTAURANT");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState("");
  async function create() {
    setCreateBusy(true);
    setCreateError("");
    try {
      const subject = await api<Subject>("/subjects", {
        method: "POST",
        body: JSON.stringify({ name, category, city, address }),
      });
      setSelected(subject);
      setCreating(false);
    } catch (e) {
      setCreateError((e as Error).message);
    } finally {
      setCreateBusy(false);
    }
  }
  if (draft.loading || draft.loadError)
    return (
      <Screen>
        <Message loading={draft.loading} error={draft.loadError} />
        {draft.loadError && (
          <Button onPress={() => void draft.load()}>重试读取草稿</Button>
        )}
      </Screen>
    );
  if (postId)
    return (
      <Screen>
        <Heading
          title="感谢你，多留一份依据。"
          description="本次投稿已确认。可以在“我的记录”查看当前审核状态；通过审核后才会公开。"
        />
        <View style={{ marginBottom: 16 }}>
          <Button secondary onPress={() => router.push(`/materials/${postId}`)}>
            添加图片材料（可选）
          </Button>
        </View>
        <Button onPress={() => router.push("/me")}>查看我的记录</Button>
        <View style={{ marginTop: 16 }}>
          <Button
            secondary
            onPress={() =>
              router.setParams({ draft: randomUUID(), fresh: "1" })
            }
          >
            记录新的经历
          </Button>
        </View>
      </Screen>
    );
  return (
    <Screen>
      <Heading
        eyebrow="真实、具体，也允许有后续"
        title={creating ? "添加一个具体对象" : "记录一次经历"}
      />
      {(createError || draft.error) && (
        <Message error={createError || draft.error} />
      )}{" "}
      <Text
        accessibilityLiveRegion="polite"
        style={{
          color: colors.muted,
          fontSize: 14,
          lineHeight: 24,
          marginBottom: 16,
        }}
      >
        {draft.status}。保存到本地后端账号，草稿不会公开。
      </Text>
      {!pending && !draft.conflict && (
        <Button
          secondary
          disabled={busy}
          onPress={() => void draft.save().catch(() => {})}
        >
          保存草稿
        </Button>
      )}
      {draft.conflict && (
        <>
          <Message error="读取最新草稿会替换当前输入，请先复制需要保留的文字。" />
          <Button secondary onPress={() => void draft.load()}>
            替换输入并读取最新草稿
          </Button>
        </>
      )}
      {pending ? (
        <View style={{ gap: 16 }}>
          <Text
            accessibilityRole="header"
            style={{ color: colors.ink, fontSize: 20, fontWeight: "600" }}
          >
            {pending.title}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 24 }}>
            {selected?.name} · {pending.occurredOn} ·{" "}
            {pending.anonymous ? "匿名亲历者" : "使用昵称"}
          </Text>
          <Text style={{ color: colors.ink, fontSize: 16, lineHeight: 28 }}>
            {pending.body}
          </Text>
          <IssueTypes value={pending.issueTypes} />
          <Message
            empty={
              busy
                ? "正在确认投稿，请稍候。"
                : "尚未确认提交结果。重试会核对同一份投稿，不会重复创建；请先确认结果再编辑或提交新的经历。"
            }
          />
          <Button
            disabled={busy || draft.conflict}
            onPress={() => void draft.submit()}
          >
            {busy ? "正在确认…" : "重试并确认结果"}
          </Button>
        </View>
      ) : busy ? (
        <Message empty="正在保存并确认投稿，请稍候。" />
      ) : creating ? (
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
            <Button disabled={createBusy} onPress={() => void create()}>
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
          <IssuePicker
            category={selected?.category}
            value={content.issueTypes}
            onChange={(issueTypes) => edit({ issueTypes })}
            disabled={busy}
          />
          <Button secondary onPress={() => setCreating(true)}>
            找不到？添加新对象
          </Button>
          <View style={{ height: 22 }} />
          <Field
            label="用一句话概括"
            value={content.title}
            onChangeText={(title) => edit({ title })}
            maxLength={80}
          />
          <Field
            label="发生日期（YYYY-MM-DD）"
            placeholder="例如 2026-10-01"
            value={content.occurredOn}
            onChangeText={(occurredOn) => edit({ occurredOn })}
            maxLength={10}
          />
          <Field
            label="说说你的亲身经历"
            value={content.body}
            onChangeText={(body) => edit({ body })}
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
              value={content.anonymous}
              onValueChange={(anonymous) => edit({ anonymous })}
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
              value={content.personalExperience}
              onValueChange={(personalExperience) =>
                edit({ personalExperience })
              }
              accessibilityLabel="确认亲身经历"
              trackColor={{ true: colors.accent }}
            />
          </View>
          <Message empty="匿名仍保留平台账号关联。请隐藏私人信息。提交后可添加图片材料，选择公开脱敏副本或仅供审核。" />
          <Button
            disabled={busy || draft.conflict}
            onPress={() => void draft.submit()}
          >
            {busy ? "正在提交…" : "提交审核"}
          </Button>
        </>
      )}
    </Screen>
  );
}
