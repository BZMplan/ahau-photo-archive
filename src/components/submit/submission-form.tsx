"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ImageUploader,
  type UploadItem,
} from "@/components/submit/image-uploader";
import { TurnstileWidget } from "@/components/submit/turnstile-widget";

interface MetadataDraft {
  title: string;
  description: string;
  takenAt: string;
  location: string;
}

interface SubmissionSuccess {
  submissionId: string;
  photoCount: number;
  status: "pending";
}

const emptyMetadata = (): MetadataDraft => ({
  title: "",
  description: "",
  takenAt: "",
  location: "",
});

export function SubmissionForm() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [metadata, setMetadata] = useState<Record<string, MetadataDraft>>({});
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const [authorName, setAuthorName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "success" | "error"
  >("idle");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<SubmissionSuccess>();
  const [requestId] = useState(() => globalThis.crypto.randomUUID());
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  useEffect(
    () => () => {
      for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    },
    [],
  );

  const onToken = useCallback((token: string) => {
    setTurnstileError("");
    setTurnstileToken(token);
  }, []);
  const onTurnstileError = useCallback((message: string) => {
    setTurnstileToken("");
    setTurnstileError(message);
  }, []);

  const metadataList = useMemo(
    () => items.map((item) => metadata[item.id] ?? emptyMetadata()),
    [items, metadata],
  );

  function updateMetadata(
    id: string,
    field: keyof MetadataDraft,
    value: string,
  ) {
    setMetadata((current) => ({
      ...current,
      [id]: { ...(current[id] ?? emptyMetadata()), [field]: value },
    }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    setError("");
    if (items.length === 0) {
      setError("请至少选择一张照片。");
      return;
    }
    if (!consentAccepted) {
      setError("请先确认投稿授权说明。");
      return;
    }
    if (!turnstileToken) {
      setError("请完成安全验证。");
      return;
    }
    setStatus("submitting");
    const form = new FormData();
    for (const item of items) form.append("files", item.file, item.file.name);
    form.set("metadata", JSON.stringify(metadataList));
    form.set("authorName", authorName);
    form.set("contactEmail", contactEmail);
    form.set("message", message);
    form.set("consentAccepted", String(consentAccepted));
    form.set("turnstileToken", turnstileToken);
    form.set("submissionRequestId", requestId);
    try {
      const response = await fetch("/api/submissions", {
        method: "POST",
        body: form,
      });
      const body = (await response.json()) as {
        success?: boolean;
        data?: SubmissionSuccess;
        error?: { message?: string };
      };
      if (!response.ok || !body.success || !body.data)
        throw new Error(
          body.error?.message || "投稿暂时无法完成，请稍后重试。",
        );
      setSuccess(body.data);
      setStatus("success");
    } catch (submissionError) {
      setError(
        submissionError instanceof Error
          ? submissionError.message
          : "投稿暂时无法完成，请稍后重试。",
      );
      setStatus("error");
      setTurnstileToken("");
    }
  }

  if (status === "success" && success)
    return (
      <div className="bg-muted/30 rounded-lg border p-6" role="status">
        <h2 className="text-xl font-medium">投稿成功！</h2>
        <p className="text-muted-foreground mt-3 text-sm leading-7">
          你的校园影像已收到，将在管理员审核通过后公开展示。感谢你为校园影像档案留下记录。
        </p>
        <dl className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted-foreground">投稿编号</dt>
            <dd className="mt-1 font-mono text-xs break-all">
              {success.submissionId}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">照片数量</dt>
            <dd className="mt-1">{success.photoCount}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">当前状态</dt>
            <dd className="mt-1">待审核</dd>
          </div>
        </dl>
      </div>
    );

  return (
    <form className="space-y-10" onSubmit={submit}>
      <section className="space-y-4" aria-labelledby="photos-heading">
        <div>
          <h2 id="photos-heading" className="text-lg font-medium">
            选择照片
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            照片只会在提交后发送到私有存储，审核通过前不会公开。
          </p>
        </div>
        <ImageUploader
          items={items}
          onChange={setItems}
          errors={uploadErrors}
          onErrors={setUploadErrors}
        />
      </section>
      {items.length > 0 && (
        <section className="space-y-5" aria-labelledby="metadata-heading">
          <div>
            <h2 id="metadata-heading" className="text-lg font-medium">
              照片信息
            </h2>
            <p className="text-muted-foreground mt-1 text-sm">
              请分别填写每张照片的信息。
            </p>
          </div>
          {items.map((item, index) => {
            const value = metadata[item.id] ?? emptyMetadata();
            return (
              <fieldset
                className="space-y-4 rounded-lg border p-4"
                key={item.id}
              >
                <legend className="px-1 text-sm font-medium">
                  照片 {index + 1} · {item.file.name}
                </legend>
                <div className="space-y-2">
                  <Label htmlFor={`title-${item.id}`}>
                    照片标题 <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id={`title-${item.id}`}
                    value={value.title}
                    maxLength={100}
                    required
                    onChange={(event) =>
                      updateMetadata(item.id, "title", event.target.value)
                    }
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`taken-${item.id}`}>拍摄日期（选填）</Label>
                    <Input
                      id={`taken-${item.id}`}
                      type="date"
                      value={value.takenAt}
                      onChange={(event) =>
                        updateMetadata(item.id, "takenAt", event.target.value)
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`location-${item.id}`}>
                      校园地点（选填）
                    </Label>
                    <Input
                      id={`location-${item.id}`}
                      maxLength={100}
                      value={value.location}
                      onChange={(event) =>
                        updateMetadata(item.id, "location", event.target.value)
                      }
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`description-${item.id}`}>
                    影像说明（选填）
                  </Label>
                  <Textarea
                    id={`description-${item.id}`}
                    maxLength={1000}
                    value={value.description}
                    onChange={(event) =>
                      updateMetadata(item.id, "description", event.target.value)
                    }
                  />
                </div>
              </fieldset>
            );
          })}
        </section>
      )}
      <section className="space-y-5" aria-labelledby="author-heading">
        <div>
          <h2 id="author-heading" className="text-lg font-medium">
            投稿者信息
          </h2>
          <p className="text-muted-foreground mt-1 text-sm">
            署名可以使用昵称，联系方式只用于必要联系，不会公开。
          </p>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="author-name">
              投稿署名 <span aria-hidden="true">*</span>
            </Label>
            <Input
              id="author-name"
              maxLength={50}
              required
              value={authorName}
              onChange={(event) => setAuthorName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contact-email">联系邮箱（选填）</Label>
            <Input
              id="contact-email"
              type="email"
              maxLength={254}
              value={contactEmail}
              onChange={(event) => setContactEmail(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="message">投稿备注（选填）</Label>
          <Textarea
            id="message"
            maxLength={1000}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </div>
      </section>
      <section className="space-y-5" aria-labelledby="consent-heading">
        <h2 id="consent-heading" className="text-lg font-medium">
          投稿授权
        </h2>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input
            className="mt-1 size-4"
            type="checkbox"
            checked={consentAccepted}
            onChange={(event) => setConsentAccepted(event.target.checked)}
          />
          <span>
            我确认拥有照片的版权或必要授权，同意网站在审核通过后公开展示；照片不应侵犯他人隐私或合法权益，管理员可以拒绝不合适的投稿，我可以通过网站联系渠道申请撤回。
          </span>
        </label>
      </section>
      <section className="space-y-4" aria-labelledby="verification-heading">
        <h2 id="verification-heading" className="text-lg font-medium">
          安全验证
        </h2>
        <TurnstileWidget
          siteKey={siteKey}
          token={turnstileToken}
          onToken={onToken}
          onError={onTurnstileError}
        />
        {turnstileError && (
          <p className="text-destructive text-sm" role="alert">
            {turnstileError}
          </p>
        )}
        {error && (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting" ? "正在提交…" : "提交照片"}
        </Button>
      </section>
      <input type="hidden" value={requestId} readOnly aria-hidden="true" />
    </form>
  );
}
