import { useCallback, useEffect, useRef, useState } from "react";
import {
  postSchema,
  issuesMatchCategory,
  type DraftContent,
  type PostDraft,
  type Subject,
} from "@secondlook/contracts";
import { ApiError, type createClient } from "@secondlook/contracts/client";

const empty: DraftContent = {
  issueTypes: [],
  subjectId: null,
  title: "",
  body: "",
  occurredOn: "",
  anonymous: true,
  personalExperience: false,
};
const contentOf = (d: DraftContent): DraftContent => ({
  issueTypes: d.issueTypes,
  subjectId: d.subjectId,
  title: d.title,
  body: d.body,
  occurredOn: d.occurredOn,
  anonymous: d.anonymous,
  personalExperience: d.personalExperience,
});
const same = (a: DraftContent, b: DraftContent) =>
  JSON.stringify(contentOf(a)) === JSON.stringify(contentOf(b));
type SaveAttempt = DraftContent & { version: number; mutationKey: string };
export type PostPreview = { content: DraftContent; subject: Subject };

// Both platforms share the save queue and submission recovery rules; views stay native.
export function useDraftEditor(
  api: ReturnType<typeof createClient>,
  id: string,
  allowNew: boolean,
  newKey: () => string,
) {
  const [content, setContent] = useState<DraftContent>(empty);
  const current = useRef(content);
  const saved = useRef<PostDraft | null>(null);
  const attempt = useRef<SaveAttempt | null>(null);
  const inFlight = useRef<Promise<PostDraft> | null>(null);
  const active = useRef(true);
  const loadSequence = useRef(0);
  const submitting = useRef(false);
  const [subject, setSubject] = useState<Subject | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("尚未保存");
  const [busy, setBusy] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [pending, setPending] = useState<{
    version: number;
    content: DraftContent;
  } | null>(null);
  const [done, setDone] = useState("");
  const [preview, setPreview] = useState<PostPreview | null>(null);

  const load = useCallback(async () => {
    const sequence = ++loadSequence.current;
    setLoading(true);
    setLoadError("");
    setError("");
    try {
      const draft = await api<PostDraft>(`/me/drafts/${id}`);
      if (!active.current || sequence !== loadSequence.current) return;
      saved.current = draft;
      attempt.current = null;
      current.current = contentOf(draft);
      setContent(current.current);
      setSubject(draft.subject);
      setConflict(false);
      setPending(null);
      setPreview(null);
      setDone(draft.postId ?? "");
      setStatus("草稿已保存");
    } catch (e) {
      if (!active.current || sequence !== loadSequence.current) return;
      if (!(allowNew && e instanceof ApiError && e.status === 404))
        setLoadError(e instanceof Error ? e.message : "读取草稿失败，请重试");
    } finally {
      if (active.current && sequence === loadSequence.current)
        setLoading(false);
    }
  }, [api, id, allowNew]);
  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
    };
  }, [load]);

  const edit = useCallback((patch: Partial<DraftContent>) => {
    setPreview(null);
    current.current = { ...current.current, ...patch };
    setContent(current.current);
    setStatus(
      saved.current && same(saved.current, current.current) && !attempt.current
        ? "草稿已保存"
        : "有修改尚未保存",
    );
  }, []);
  function selectSubject(value: Subject | null) {
    setSubject(value);
    edit({
      subjectId: value?.id ?? null,
      issueTypes: value
        ? current.current.issueTypes.filter((issue) =>
            issuesMatchCategory(value.category, [issue]),
          )
        : [],
    });
  }

  function preparePreview() {
    if (submitting.current || conflict || pending || loading || loadError)
      return;
    const checked = postSchema.safeParse(current.current);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    if (
      !subject ||
      subject.id !== checked.data.subjectId ||
      !issuesMatchCategory(subject.category, checked.data.issueTypes)
    ) {
      setError("请确认具体对象及其问题类型");
      return;
    }
    const normalized = contentOf(checked.data);
    edit(normalized);
    setError("");
    setPreview({ content: normalized, subject: { ...subject } });
  }
  function cancelPreview() {
    if (submitting.current || pending) return;
    setPreview(null);
    setError("");
  }

  const save = useCallback(async (): Promise<PostDraft> => {
    if (inFlight.current) {
      await inFlight.current;
      return save();
    }
    if (
      saved.current &&
      same(saved.current, current.current) &&
      !attempt.current
    )
      return saved.current;
    const perform = async () => {
      if (active.current) {
        setStatus("正在保存草稿…");
        setError("");
      }
      // Retry an uncertain save before writing newer edits with a fresh version.
      for (;;) {
        const input = attempt.current ?? {
          ...current.current,
          version: saved.current?.version ?? 0,
          mutationKey: newKey(),
        };
        attempt.current = input;
        const draft = await api<PostDraft>(`/me/drafts/${id}`, {
          method: "PUT",
          body: JSON.stringify(input),
        });
        saved.current = draft;
        attempt.current = null;
        if (draft.postId || same(draft, current.current)) return draft;
      }
    };
    const promise = perform();
    inFlight.current = promise;
    try {
      const draft = await promise;
      if (active.current) {
        setStatus(
          same(draft, current.current) ? "草稿已保存" : "有修改尚未保存",
        );
        if (draft.postId) setDone(draft.postId);
      }
      return draft;
    } catch (e) {
      if (
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        ![408, 409].includes(e.status)
      )
        attempt.current = null;
      if (active.current) {
        setStatus("未保存，请保持此页并重试");
        setError(
          e instanceof ApiError
            ? e.message
            : "无法保存草稿，请确认连接后重试；离开此页会丢失未保存修改。",
        );
        if (e instanceof ApiError && e.status === 409) setConflict(true);
      }
      throw e;
    } finally {
      if (inFlight.current === promise) inFlight.current = null;
    }
  }, [api, id, newKey]);

  useEffect(() => {
    if (
      loading ||
      loadError ||
      busy ||
      pending ||
      conflict ||
      done ||
      same(content, saved.current ?? empty)
    )
      return;
    const timer = setTimeout(() => {
      void save().catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [content, loading, loadError, busy, pending, conflict, done, save]);

  async function submit() {
    if (submitting.current || conflict) return;
    const snapshot = pending?.content ?? preview?.content;
    if (!snapshot || (!pending && !same(snapshot, current.current))) {
      setPreview(null);
      setError("请先预览当前内容，再提交审核");
      return;
    }
    const checked = postSchema.safeParse(snapshot);
    if (!checked.success) {
      setError(checked.error.issues[0].message);
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError("");
    let request = pending;
    try {
      if (!request) {
        const draft = await save();
        if (draft.postId) {
          setDone(draft.postId);
          return;
        }
        if (!same(draft, snapshot)) {
          setPreview(null);
          setError("保存内容已有变化，请重新预览后提交");
          return;
        }
        request = { version: draft.version, content: contentOf(draft) };
        setPending(request);
      }
      const post = await api<{ id: string }>(`/me/drafts/${id}/submit`, {
        method: "POST",
        body: JSON.stringify({ version: request.version }),
      });
      if (active.current) setDone(post.id);
    } catch (e) {
      if (active.current && request) {
        setError(
          e instanceof ApiError
            ? e.message
            : "连接中断，尚未确认投稿结果，请重试确认。草稿已保存，可重新打开核对。",
        );
        if (e instanceof ApiError && e.status === 409) setConflict(true);
        if (
          e instanceof ApiError &&
          e.status >= 400 &&
          e.status < 500 &&
          ![408, 409].includes(e.status)
        )
          setPending(null);
      }
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }
  return {
    content,
    edit,
    subject,
    selectSubject,
    loading,
    loadError,
    error,
    status,
    busy,
    conflict,
    pending: pending?.content ?? null,
    done,
    save,
    submit,
    load,
    preview,
    preparePreview,
    cancelPreview,
  };
}
