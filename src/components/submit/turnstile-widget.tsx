"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

interface TurnstileWidgetProps {
  siteKey: string;
  token: string;
  onToken: (token: string) => void;
  onError: (message: string) => void;
}

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

export function TurnstileWidget({
  siteKey,
  token,
  onToken,
  onError,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | undefined>(undefined);
  const previousTokenRef = useRef(token);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!siteKey || !loaded || !containerRef.current || !window.turnstile)
      return;
    const widgetId = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action: "submit",
      theme: "auto",
      size: "compact",
      callback: onToken,
      "expired-callback": () => onToken(""),
      "timeout-callback": () => onError("安全验证已超时，请重试。"),
      "error-callback": () => onError("安全验证暂时不可用，请重试。"),
    });
    widgetRef.current = widgetId;
    return () => {
      window.turnstile?.remove(widgetId);
      if (widgetRef.current === widgetId) widgetRef.current = undefined;
    };
  }, [loaded, onError, onToken, siteKey]);
  useEffect(() => {
    const previous = previousTokenRef.current;
    previousTokenRef.current = token;
    // Tokens are single-use: a failed submission must request a fresh challenge.
    if (previous && !token && widgetRef.current)
      window.turnstile?.reset(widgetRef.current);
  }, [token]);
  return (
    <div className="space-y-2">
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
        onReady={() => setLoaded(true)}
      />
      <div ref={containerRef} aria-label="人机验证" />
      {!siteKey && (
        <p className="text-muted-foreground text-sm">投稿验证尚未配置。</p>
      )}
      {siteKey && !token && (
        <p className="text-muted-foreground text-xs">
          请完成上方安全验证后提交。
        </p>
      )}
    </div>
  );
}
