"use client";

import { LoaderCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useI18n } from "@/i18n/provider";

export type WebSocialProvider = "GOOGLE" | "APPLE";

type SocialConfig = {
  googleClientId: string | null;
  appleClientId: string | null;
  appleRedirectUri: string | null;
};

type GoogleCredentialResponse = { credential?: string };
type AppleSignInResponse = {
  authorization?: { id_token?: string; state?: string };
};
type AppleSignInSuccessDetail = AppleSignInResponse & { data?: AppleSignInResponse };
type AppleSignInFailureDetail = { error?: string | { error?: string } };

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (options: { client_id: string; callback: (response: GoogleCredentialResponse) => void; context?: string; ux_mode?: string }) => void;
          renderButton: (element: HTMLElement, options: Record<string, string | number>) => void;
        };
      };
    };
    AppleID?: {
      auth: {
        init: (options: { clientId: string; scope: string; redirectURI: string; state: string; nonce: string; usePopup: boolean }) => void;
        signIn: () => Promise<AppleSignInResponse>;
      };
    };
  }
}

const scriptPromises = new Map<string, Promise<void>>();

function loadScript(src: string) {
  const existing = scriptPromises.get(src);
  if (existing) return existing;
  const promise = new Promise<void>((resolve, reject) => {
    const loaded = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (loaded?.dataset.loaded === "true") return resolve();
    const script = loaded ?? document.createElement("script");
    script.src = src;
    script.async = true;
    script.defer = true;
    script.onload = () => { script.dataset.loaded = "true"; resolve(); };
    script.onerror = () => reject(new Error("SOCIAL_PROVIDER_UNAVAILABLE"));
    if (!loaded) document.head.appendChild(script);
  });
  scriptPromises.set(src, promise);
  return promise;
}

export function SocialLoginButtons({
  disabled = false,
  onCredential,
  onError,
}: {
  disabled?: boolean;
  onCredential: (provider: WebSocialProvider, identityToken: string, nonce?: string) => Promise<void>;
  onError: () => void;
}) {
  const { t } = useI18n();
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const appleButtonRef = useRef<HTMLDivElement>(null);
  const appleNonceRef = useRef("");
  const appleStateRef = useRef("");
  const credentialHandlerRef = useRef(onCredential);
  const errorHandlerRef = useRef(onError);
  const disabledRef = useRef(disabled);
  const activeRef = useRef<WebSocialProvider | null>(null);
  const [config, setConfig] = useState<SocialConfig | null>(null);
  const [active, setActive] = useState<WebSocialProvider | null>(null);

  useEffect(() => {
    credentialHandlerRef.current = onCredential;
    errorHandlerRef.current = onError;
    disabledRef.current = disabled;
    activeRef.current = active;
  }, [active, disabled, onCredential, onError]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/auth/social/config", { cache: "no-store" })
      .then(async (response) => response.ok ? response.json() as Promise<SocialConfig> : null)
      .then((value) => { if (!cancelled && value) setConfig(value); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!config?.googleClientId || !googleButtonRef.current) return;
    let cancelled = false;
    let resizeObserver: ResizeObserver | null = null;
    void loadScript("https://accounts.google.com/gsi/client").then(() => {
      if (cancelled || !window.google || !googleButtonRef.current || !config.googleClientId) return;
      window.google.accounts.id.initialize({
        client_id: config.googleClientId,
        context: "signin",
        ux_mode: "popup",
        callback: (response) => {
          if (!response.credential || disabledRef.current || activeRef.current) return;
          activeRef.current = "GOOGLE";
          setActive("GOOGLE");
          void credentialHandlerRef.current("GOOGLE", response.credential)
            .catch(() => errorHandlerRef.current())
            .finally(() => {
              activeRef.current = null;
              setActive(null);
          });
        },
      });
      const renderGoogleButton = () => {
        const buttonHost = googleButtonRef.current;
        if (!buttonHost || !window.google || cancelled) return;
        const width = Math.max(200, Math.min(400, Math.floor(buttonHost.getBoundingClientRect().width)));
        buttonHost.replaceChildren();
        window.google.accounts.id.renderButton(buttonHost, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "rectangular",
          logo_alignment: "left",
          width,
        });
      };
      renderGoogleButton();
      resizeObserver = new ResizeObserver(renderGoogleButton);
      resizeObserver.observe(googleButtonRef.current);
    }).catch(() => errorHandlerRef.current());
    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
    };
  }, [config?.googleClientId]);

  useEffect(() => {
    if (!config?.appleClientId || !config.appleRedirectUri || !appleButtonRef.current) return;
    let cancelled = false;

    const configureApple = () => {
      if (cancelled || !window.AppleID || !config.appleClientId || !config.appleRedirectUri) return;
      appleNonceRef.current = `${crypto.randomUUID()}${crypto.randomUUID()}`;
      appleStateRef.current = crypto.randomUUID();
      window.AppleID.auth.init({
        clientId: config.appleClientId,
        scope: "name email",
        redirectURI: config.appleRedirectUri,
        state: appleStateRef.current,
        nonce: appleNonceRef.current,
        usePopup: true,
      });
    };

    const onAppleSuccess = (event: Event) => {
      const detail = (event as CustomEvent<AppleSignInSuccessDetail>).detail;
      const response = detail?.data ?? detail;
      if (cancelled || disabledRef.current || activeRef.current) return;
      if (!response?.authorization?.state || response.authorization.state !== appleStateRef.current) {
        errorHandlerRef.current();
        configureApple();
        return;
      }
      const identityToken = response.authorization.id_token;
      if (!identityToken || !appleNonceRef.current) {
        errorHandlerRef.current();
        configureApple();
        return;
      }
      const nonce = appleNonceRef.current;
      activeRef.current = "APPLE";
      setActive("APPLE");
      void credentialHandlerRef.current("APPLE", identityToken, nonce)
        .catch(() => errorHandlerRef.current())
        .finally(() => {
          activeRef.current = null;
          setActive(null);
          configureApple();
        });
    };

    const onAppleFailure = (event: Event) => {
      if (cancelled) return;
      const detail = (event as CustomEvent<AppleSignInFailureDetail>).detail;
      const rawError = detail?.error;
      const code = typeof rawError === "string" ? rawError : rawError?.error ?? "";
      activeRef.current = null;
      setActive(null);
      if (code !== "popup_closed_by_user" && code !== "user_cancelled_authorize") errorHandlerRef.current();
      configureApple();
    };

    document.addEventListener("AppleIDSignInOnSuccess", onAppleSuccess);
    document.addEventListener("AppleIDSignInOnFailure", onAppleFailure);
    void loadScript("https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/tr_TR/appleid.auth.js")
      .then(configureApple)
      .catch(() => errorHandlerRef.current());
    return () => {
      cancelled = true;
      document.removeEventListener("AppleIDSignInOnSuccess", onAppleSuccess);
      document.removeEventListener("AppleIDSignInOnFailure", onAppleFailure);
    };
  }, [config?.appleClientId, config?.appleRedirectUri]);

  if (!config?.googleClientId && !config?.appleClientId) return null;

  return (
    <div className="mx-auto mt-6 grid w-full max-w-[400px] gap-3">
      <div className="flex items-center gap-3 text-xs font-semibold text-slate-400">
        <span className="h-px flex-1 bg-slate-200" />
        <span>{t("auth.or")}</span>
        <span className="h-px flex-1 bg-slate-200" />
      </div>
      {config.googleClientId ? (
        <div
          aria-disabled={disabled || Boolean(active)}
          aria-busy={active === "GOOGLE"}
          className={`relative grid h-11 w-full place-items-center overflow-hidden rounded-xl outline-none focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2 ${disabled || active ? "pointer-events-none opacity-55" : ""}`}
        >
          <div ref={googleButtonRef} className="grid h-11 w-full place-items-center" aria-label={t("auth.continueWithGoogle")} />
          <span className="pointer-events-none absolute inset-y-px left-12 right-px grid grid-cols-[minmax(0,1fr)_3rem] items-center rounded-r-[11px] bg-white text-sm font-medium text-[#3c4043]" aria-hidden="true">
            <span className="grid min-w-0 place-items-center px-2 text-center">{t("auth.continueWithGoogle")}</span>
            <span />
          </span>
          {active === "GOOGLE" ? <LoaderCircle className="pointer-events-none absolute end-4 size-4 animate-spin text-slate-500" aria-hidden="true" /> : null}
        </div>
      ) : null}
      {config.appleClientId ? (
        <div
          aria-disabled={disabled || Boolean(active)}
          aria-busy={active === "APPLE"}
          className={`relative h-11 w-full overflow-hidden rounded-xl bg-black outline-none focus-within:ring-2 focus-within:ring-orange-500 focus-within:ring-offset-2 ${disabled || active ? "pointer-events-none opacity-55" : ""}`}
        >
          <div
            id="appleid-signin"
            ref={appleButtonRef}
            className="h-11 w-full [&>div]:mx-auto"
            data-color="black"
            data-border="false"
            data-type="continue"
            data-mode="center-align"
            data-border-radius="12"
            data-width="100%"
            data-height="44"
            aria-label={t("auth.continueWithApple")}
          />
          <span className="pointer-events-none absolute inset-y-0 left-12 right-0 grid grid-cols-[minmax(0,1fr)_3rem] items-center rounded-r-xl bg-black text-sm font-medium text-white" aria-hidden="true">
            <span className="grid min-w-0 place-items-center px-2 text-center">{t("auth.continueWithApple")}</span>
            <span />
          </span>
          {active === "APPLE" ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center bg-black/70 text-white">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            </span>
          ) : null}
        </div>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {active ? t("common.loading") : ""}
      </span>
    </div>
  );
}
