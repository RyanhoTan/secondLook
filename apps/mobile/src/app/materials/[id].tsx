import { useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { randomUUID } from "expo-crypto";
import {
  materialLimits,
  materialSchema,
  type OwnMaterial,
} from "@secondlook/contracts";
import { useApp } from "../../lib/context";
import { useResource } from "../../lib/resource";
import {
  Screen,
  Heading,
  Field,
  Button,
  Message,
  LoginGate,
} from "../../components/ui";
import { SegmentedControl } from "../../components/SegmentedControl";
import { MaterialImage } from "../../components/Materials";

export default function Materials() {
  const { user } = useApp();
  return user ? <Manager /> : <LoginGate />;
}
function Manager() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, colors } = useApp();
  const [version, setVersion] = useState(0);
  const resource = useResource<OwnMaterial[]>(
    `/me/posts/${id}/materials`,
    version,
  );
  const [asset, setAsset] = useState<ImagePicker.ImagePickerAsset>();
  const [source, setSource] = useState("");
  const [visibility, setVisibility] = useState("PUBLIC");
  const [clientKey, setClientKey] = useState(() => randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function select() {
    if (busy) return;
    setError("");
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 1,
        preferredAssetRepresentationMode:
          ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
      });
      if (!result.canceled) {
        const image = result.assets[0];
        if ((image.fileSize ?? 0) > materialLimits.maxBytes) {
          setError("图片不能超过 10MB");
          return;
        }
        setAsset(image);
        setClientKey(randomUUID());
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function upload() {
    if (busy) return;
    setError("");
    setMessage("");
    if (!asset) {
      setError("请先选择一张图片");
      return;
    }
    const checked = materialSchema.safeParse({ source, visibility, clientKey });
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    const form = new FormData();
    for (const [key, value] of Object.entries(checked.data))
      form.append(key, value);
    // Native FormData reads the selected local URI without putting binary data in JS memory.
    form.append("file", {
      uri: asset.uri,
      name: "material",
      type: asset.mimeType ?? "image/jpeg",
    } as unknown as Blob);
    setBusy(true);
    try {
      await api(`/posts/${id}/materials`, { method: "POST", body: form });
      setAsset(undefined);
      setSource("");
      setClientKey(randomUUID());
      setMessage("材料已上传，审核前不会公开。");
      setVersion((v) => v + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function withdraw(materialId: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api(`/materials/${materialId}`, { method: "DELETE" });
      setVersion((v) => v + 1);
      setMessage("材料已撤回，原公开链接已失效。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const labels: Record<string, string> = {
    PENDING: "等待审核",
    APPROVED: "已通过审核",
    REJECTED: "未通过审核",
    WITHDRAWN: "已撤回",
    NEEDS_REVIEW: "新版待复核",
  };
  return (
    <Screen>
      <Heading
        title="为经历补充材料"
        description="每帖最多 6 份待审或通过的材料。支持静态 JPEG、PNG、WebP，单张最多 10MB、2000 万像素。原件仅本人和授权审核人员可读，公开使用审核后的脱敏副本。"
      />
      {error && <Message error={error} />}
      {message && <Message empty={message} />}
      {resource.data ? (
        <>
          <View style={{ gap: 18, marginBottom: 24 }}>
            <Button secondary disabled={busy} onPress={() => void select()}>
              {asset ? "重新选择图片" : "选择一张图片"}
            </Button>
            {asset && (
              <Text style={{ color: colors.muted, fontSize: 13 }}>
                图片已选择，填写说明后上传。
              </Text>
            )}
            <Field
              label="来源与关联说明"
              value={source}
              multiline
              maxLength={500}
              placeholder="材料来源、支持哪项陈述。公开材料的此说明也会公开，请勿填写私人信息。"
              onChangeText={(value) => {
                setSource(value);
                setClientKey(randomUUID());
              }}
            />
            <Text style={{ color: colors.ink, fontSize: 13 }}>
              材料可见范围
            </Text>
            <SegmentedControl
              value={visibility}
              options={[
                { value: "PUBLIC", label: "审核后公开" },
                { value: "REVIEW_ONLY", label: "仅供审核" },
              ]}
              onChange={(value) => {
                setVisibility(value);
                setClientKey(randomUUID());
              }}
            />
            <Button disabled={busy} onPress={() => void upload()}>
              {busy ? "正在处理…" : "上传材料"}
            </Button>
            <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}>
              失败时可直接重试。更改已提交的说明或范围，请撤回后重新上传。
            </Text>
          </View>
          {resource.data.map((item) => (
            <View
              key={item.id}
              style={{
                gap: 15,
                paddingVertical: 24,
                borderTopWidth: 1,
                borderTopColor: colors.line,
              }}
            >
              <Text
                style={{ color: colors.ink, fontSize: 16, fontWeight: "600" }}
              >
                {labels[item.status]} ·{" "}
                {item.visibility === "PUBLIC" ? "申请公开" : "仅供审核"}
              </Text>
              <Text style={{ color: colors.ink, fontSize: 15, lineHeight: 26 }}>
                {item.source}
              </Text>
              <Text
                style={{ color: colors.muted, fontSize: 13, lineHeight: 23 }}
              >
                上传关联版本：{item.submittedVersion ?? "未记录"} · 当前审核第{" "}
                {item.version} 版
              </Text>
              {item.status !== "WITHDRAWN" && (
                <MaterialImage item={item} variant="preview" />
              )}
              {item.reason && (
                <Text style={{ color: colors.muted, fontSize: 13 }}>
                  审核说明：{item.reason}
                </Text>
              )}
              {item.status !== "WITHDRAWN" && (
                <Button
                  secondary
                  disabled={busy}
                  onPress={() => void withdraw(item.id)}
                >
                  撤回此材料
                </Button>
              )}
            </View>
          ))}
        </>
      ) : (
        <Message loading={resource.loading} error={resource.error} />
      )}
    </Screen>
  );
}
