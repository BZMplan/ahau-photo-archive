"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ArrowDown, ArrowUp, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ImageUploader } from "@/components/submit/image-uploader";
import { PhotoMetadataPanel } from "@/components/submit/photo-metadata-panel";
import { PhotoPreview } from "@/components/submit/photo-preview";
import { TurnstileWidget } from "@/components/submit/turnstile-widget";
import { useActivePhoto } from "@/hooks/use-active-photo";
import {
  emptyMetadata,
  nextActivePhotoId,
  submissionFormData,
  validateEditor,
  type AuthorDraft,
  type EditorError,
  type MetadataDraft,
  type UploadItem,
} from "@/lib/submission-editor";

interface SubmissionSuccess {
  submissionId: string;
  photoCount: number;
  status: "pending";
}

export function SubmissionForm({ siteKey }: { siteKey: string }) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [activePhotoId, setActivePhotoId] = useState<string | null>(null);
  const [metadata, setMetadata] = useState<Record<string, MetadataDraft>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [author, setAuthor] = useState<AuthorDraft>({
    authorName: "",
    contactEmail: "",
    message: "",
    consentAccepted: false,
  });
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [editorError, setEditorError] = useState<EditorError>();
  const [serverError, setServerError] = useState("");
  const [success, setSuccess] = useState<SubmissionSuccess>();
  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const [deleteCandidate, setDeleteCandidate] = useState<UploadItem | null>(
    null,
  );
  const itemsRef = useRef(items);
  const busyRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const deleteDialogRef = useRef<HTMLDialogElement>(null);
  const focusTargetRef = useRef<string | null>(null);
  const focusEmptyRef = useRef(false);
  const { viewportRef, scrollToPhoto } = useActivePhoto(
    items,
    activePhotoId,
    setActivePhotoId,
  );
  const activeIndex = items.findIndex((item) => item.id === activePhotoId);
  const activeItem = items[activeIndex];
  const busy = status === "submitting";

  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );
  useEffect(() => {
    panelRef.current?.scrollTo({ top: 0, behavior: "auto" });
  }, [activePhotoId]);
  useEffect(() => {
    const viewport = window.visualViewport;
    const shell = formRef.current?.closest<HTMLElement>(".public-site");
    if (!viewport || !shell) return;
    const resize = () => {
      if (
        window.matchMedia("(max-width: 767px)").matches &&
        viewport.scale === 1
      )
        shell.style.setProperty(
          "--submission-viewport-height",
          `${viewport.height}px`,
        );
      else shell.style.removeProperty("--submission-viewport-height");
    };
    resize();
    viewport.addEventListener("resize", resize);
    window.addEventListener("resize", resize);
    return () => {
      viewport.removeEventListener("resize", resize);
      window.removeEventListener("resize", resize);
      shell.style.removeProperty("--submission-viewport-height");
    };
  }, []);
  useEffect(() => {
    if (focusEmptyRef.current && !items.length) {
      focusEmptyRef.current = false;
      formRef.current
        ?.querySelector<HTMLButtonElement>("#editor-files")
        ?.focus();
    }
  }, [items]);
  useEffect(() => {
    if (
      !focusTargetRef.current ||
      (editorError?.photoId && editorError.photoId !== activePhotoId)
    )
      return;
    const target = formRef.current?.querySelector<HTMLElement>(
      "#editor-" + focusTargetRef.current,
    );
    if (target) {
      target.scrollIntoView({ block: "nearest", behavior: "auto" });
      target.focus({ preventScroll: true });
      focusTargetRef.current = null;
    }
  }, [editorError, activePhotoId]);

  const onToken = useCallback((token: string) => {
    setTurnstileError("");
    setTurnstileToken(token);
  }, []);
  const onTurnstileError = useCallback((message: string) => {
    setTurnstileToken("");
    setTurnstileError(message);
  }, []);

  function replaceItems(next: UploadItem[]) {
    const nextIds = new Set(next.map((item) => item.id));
    for (const item of itemsRef.current)
      if (!nextIds.has(item.id)) URL.revokeObjectURL(item.previewUrl);
    const nextId = nextActivePhotoId(itemsRef.current, next, activePhotoId);
    itemsRef.current = next;
    setItems(next);
    setActivePhotoId(nextId);
    setMetadata((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([id]) => nextIds.has(id)),
      ),
    );
    setEditorError(undefined);
  }
  function updateMetadata(field: keyof MetadataDraft, value: string) {
    if (!activePhotoId) return;
    setMetadata((current) => ({
      ...current,
      [activePhotoId]: {
        ...(current[activePhotoId] ?? emptyMetadata()),
        [field]: value,
      },
    }));
    if (editorError?.photoId === activePhotoId && editorError.field === field)
      setEditorError(undefined);
  }
  function updateAuthor<K extends keyof AuthorDraft>(
    field: K,
    value: AuthorDraft[K],
  ) {
    setAuthor((current) => ({ ...current, [field]: value }));
    if (!editorError?.photoId && editorError?.field === field)
      setEditorError(undefined);
  }
  const commonError = (field: keyof AuthorDraft) =>
    !editorError?.photoId && editorError?.field === field;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    setServerError("");
    const invalid = validateEditor(
      items,
      metadata,
      author,
      requestId,
      turnstileToken,
    );
    setEditorError(invalid);
    if (invalid) {
      focusTargetRef.current = invalid.field;
      if (invalid.photoId) {
        setActivePhotoId(invalid.photoId);
        scrollToPhoto(invalid.photoId, "auto");
      }
      return;
    }
    busyRef.current = true;
    setStatus("submitting");
    const form = submissionFormData(
      items,
      metadata,
      author,
      requestId,
      turnstileToken,
    );
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: form,
      });
      const body: unknown = await response.json();
      if (!body || typeof body !== "object")
        throw new Error("投稿暂时无法完成，请稍后重试。");
      if (
        !response.ok ||
        !("success" in body) ||
        body.success !== true ||
        !("data" in body)
      ) {
        const error =
          "error" in body &&
          body.error &&
          typeof body.error === "object" &&
          "message" in body.error &&
          typeof body.error.message === "string"
            ? body.error.message
            : "投稿暂时无法完成，请稍后重试。";
        throw new Error(error);
      }
      const data = body.data;
      if (
        !data ||
        typeof data !== "object" ||
        !("submissionId" in data) ||
        typeof data.submissionId !== "string" ||
        !("photoCount" in data) ||
        typeof data.photoCount !== "number" ||
        !("status" in data) ||
        data.status !== "pending"
      )
        throw new Error("投稿响应暂时无法确认，请稍后重试。");
      setSuccess({
        submissionId: data.submissionId,
        photoCount: data.photoCount,
        status: data.status,
      });
      replaceItems([]);
      setStatus("success");
    } catch (error) {
      setServerError(
        error instanceof Error
          ? error.message
          : "投稿暂时无法完成，请稍后重试。",
      );
      setStatus("error");
      setTurnstileToken("");
    } finally {
      busyRef.current = false;
    }
  }

  if (status === "success" && success)
    return (
      <section className="submission-editor submission-success" role="status">
        <div>
          <Check aria-hidden="true" className="mb-8 size-10" strokeWidth={1} />
          <p className="text-muted-foreground mb-4 font-mono text-xs tracking-widest">
            SUBMISSION RECEIVED
          </p>
          <h1 className="text-3xl font-medium">校园记忆，已收到。</h1>
          <p className="text-muted-foreground mt-5 text-sm leading-7">
            {success.photoCount} 张影像已进入待审核队列，审核通过后才会公开。
          </p>
          <p className="text-muted-foreground mt-5 text-xs break-all">
            投稿编号 · {success.submissionId}
          </p>
          <Link
            href="/archive"
            className="mt-10 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
          >
            返回影像档案
          </Link>
        </div>
      </section>
    );

  return (
    <form
      ref={formRef}
      className="submission-editor"
      onSubmit={submit}
      noValidate
      aria-label="校园影像投稿编辑器"
    >
      <ImageUploader
        items={items}
        onChange={replaceItems}
        errors={uploadErrors}
        onErrors={setUploadErrors}
        disabled={busy}
        actions={
          items.length ? (
            <div className="flex items-center gap-2">
              <span
                className="text-muted-foreground mr-2 font-mono text-xs"
                aria-hidden="true"
              >
                {String(activeIndex + 1).padStart(2, "0")} /{" "}
                {String(items.length).padStart(2, "0")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="submission-viewer-button"
                aria-label="上一张照片"
                disabled={activeIndex <= 0}
                onClick={() => scrollToPhoto(items[activeIndex - 1].id)}
              >
                <ArrowUp aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="submission-viewer-button"
                aria-label="下一张照片"
                disabled={activeIndex < 0 || activeIndex >= items.length - 1}
                onClick={() => scrollToPhoto(items[activeIndex + 1].id)}
              >
                <ArrowDown aria-hidden="true" className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="submission-viewer-button"
                aria-label="删除当前照片"
                disabled={busy || !activeItem}
                onClick={() => {
                  setDeleteCandidate(activeItem);
                  deleteDialogRef.current?.showModal();
                }}
              >
                <Trash2 aria-hidden="true" className="size-4" />
              </Button>
            </div>
          ) : (
            <span className="text-muted-foreground text-xs">
              LOCAL PREVIEW ONLY
            </span>
          )
        }
      >
        <div
          ref={viewportRef}
          className="submission-photo-scroll"
          aria-label="上下滚动浏览照片"
          tabIndex={0}
        >
          {items.map((item, index) => (
            <div
              key={item.id}
              data-photo-id={item.id}
              className="submission-photo-slide"
              aria-label={`照片 ${index + 1}：${item.file.name}`}
            >
              <PhotoPreview
                item={item}
                eager={Math.abs(index - activeIndex) <= 1}
              />
            </div>
          ))}
        </div>
      </ImageUploader>
      <div className="submission-inspector">
        <div
          ref={panelRef}
          className="submission-info-scroll"
          aria-label="照片与投稿信息"
          tabIndex={0}
        >
          <PhotoMetadataPanel
            item={activeItem}
            index={activeIndex}
            total={items.length}
            value={metadata[activePhotoId ?? ""] ?? emptyMetadata()}
            error={editorError}
            disabled={busy}
            onChange={updateMetadata}
          />
          <section
            className="submission-author"
            aria-labelledby="author-heading"
          >
            <h2 id="author-heading" className="text-sm font-medium">
              本次投稿的公共信息
            </h2>
            <p className="text-muted-foreground mt-2 text-xs leading-6">
              署名用于公开展示。邮箱与备注只用于必要联系，不会公开。
            </p>
            <fieldset disabled={busy} className="mt-6 min-w-0 space-y-5">
              <legend className="sr-only">投稿者信息、授权与安全验证</legend>
              <div className="space-y-2">
                <Label htmlFor="editor-authorName">
                  投稿署名 <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="editor-authorName"
                  required
                  maxLength={50}
                  autoComplete="nickname"
                  value={author.authorName}
                  aria-invalid={commonError("authorName")}
                  aria-describedby={
                    commonError("authorName") ? "editor-error" : undefined
                  }
                  onChange={(event) =>
                    updateAuthor("authorName", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editor-contactEmail">联系邮箱（选填）</Label>
                <Input
                  id="editor-contactEmail"
                  type="email"
                  autoComplete="email"
                  maxLength={254}
                  value={author.contactEmail}
                  aria-invalid={commonError("contactEmail")}
                  aria-describedby={
                    commonError("contactEmail") ? "editor-error" : undefined
                  }
                  onChange={(event) =>
                    updateAuthor("contactEmail", event.target.value)
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="editor-message">投稿备注（选填）</Label>
                <Textarea
                  id="editor-message"
                  maxLength={1000}
                  value={author.message}
                  aria-invalid={commonError("message")}
                  aria-describedby={
                    commonError("message") ? "editor-error" : undefined
                  }
                  onChange={(event) =>
                    updateAuthor("message", event.target.value)
                  }
                />
              </div>
              <label className="flex items-start gap-3 text-xs leading-6">
                <input
                  id="editor-consentAccepted"
                  className="mt-1 size-4 shrink-0 accent-current"
                  type="checkbox"
                  checked={author.consentAccepted}
                  aria-invalid={commonError("consentAccepted")}
                  aria-describedby={
                    commonError("consentAccepted") ? "editor-error" : undefined
                  }
                  onChange={(event) =>
                    updateAuthor("consentAccepted", event.target.checked)
                  }
                />
                <span>
                  我确认拥有照片的版权或必要授权，同意网站在审核通过后公开展示；照片不应侵犯他人隐私或合法权益，管理员可以拒绝不合适的投稿，我可以通过网站联系渠道申请撤回。
                </span>
              </label>
              <div
                id="editor-turnstile"
                tabIndex={-1}
                aria-label="投稿安全验证"
                aria-describedby={
                  editorError?.field === "turnstile"
                    ? "editor-error"
                    : undefined
                }
              >
                <TurnstileWidget
                  siteKey={siteKey}
                  token={turnstileToken}
                  onToken={onToken}
                  onError={onTurnstileError}
                />
                {turnstileError ? (
                  <p className="text-destructive mt-3 text-xs" role="alert">
                    {turnstileError}
                  </p>
                ) : null}
              </div>
            </fieldset>
          </section>
        </div>
        <div className="submission-action-bar">
          {editorError || serverError ? (
            <p
              id="editor-error"
              className="text-destructive mb-3 text-xs leading-5"
              role="alert"
            >
              {editorError?.message || serverError}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm">已选择 {items.length} 张照片</p>
              <p
                className="text-muted-foreground mt-1 text-[11px]"
                role="status"
              >
                {busy ? "正在提交，请稍候…" : "审核通过后公开"}
              </p>
            </div>
            <Button
              type="submit"
              disabled={busy}
              className="min-h-11 rounded-full px-5"
            >
              {busy ? "正在提交…" : "提交全部照片"}
            </Button>
          </div>
        </div>
      </div>
      <dialog
        ref={deleteDialogRef}
        onClose={() => setDeleteCandidate(null)}
        aria-labelledby="delete-photo-title"
        aria-describedby="delete-photo-description"
        className="submission-delete-dialog"
        onClick={(event) => {
          if (event.target === event.currentTarget) event.currentTarget.close();
        }}
      >
        <h2 id="delete-photo-title" className="text-lg font-medium">
          删除这张照片？
        </h2>
        <p
          id="delete-photo-description"
          className="text-muted-foreground mt-3 text-sm leading-7 break-all"
        >
          {deleteCandidate?.file.name}{" "}
          的本地预览及已填写信息将被移除。其他照片的信息会保留。
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => deleteDialogRef.current?.close()}
          >
            取消
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              if (deleteCandidate && !busyRef.current) {
                const next = itemsRef.current.filter(
                  (item) => item.id !== deleteCandidate.id,
                );
                focusEmptyRef.current = !next.length;
                replaceItems(next);
                setUploadErrors([]);
              }
              deleteDialogRef.current?.close();
            }}
          >
            确认删除
          </Button>
        </div>
      </dialog>
    </form>
  );
}
