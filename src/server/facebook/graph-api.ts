import "server-only";

import { createHmac } from "node:crypto";

import {
  FACEBOOK_GRAPH_VERSION,
  facebookAppId,
  facebookAppSecret,
  facebookOAuthRedirectUri,
} from "@/server/facebook/constants";

type GraphErrorBody = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

export class FacebookGraphError extends Error {
  readonly status: number;
  readonly graphCode?: number;
  readonly graphSubcode?: number;
  readonly traceId?: string;

  constructor(status: number, body: GraphErrorBody) {
    super("FACEBOOK_GRAPH_REQUEST_FAILED");
    this.name = "FacebookGraphError";
    this.status = status;
    this.graphCode = body.error?.code;
    this.graphSubcode = body.error?.error_subcode;
    this.traceId = body.error?.fbtrace_id;
  }
}

function graphUrl(path: string) {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}${normalized}`);
}

function appSecretProof(accessToken: string) {
  return createHmac("sha256", facebookAppSecret()).update(accessToken).digest("hex");
}

async function parseGraphResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & GraphErrorBody;
  if (!response.ok || body.error) throw new FacebookGraphError(response.status, body);
  return body;
}

export async function facebookGraphRequest<T>(path: string, input: {
  accessToken: string;
  method?: "GET" | "POST" | "DELETE";
  query?: Record<string, string | number | boolean | undefined>;
  body?: URLSearchParams | FormData;
  timeoutMs?: number;
}) {
  const url = graphUrl(path);
  url.searchParams.set("appsecret_proof", appSecretProof(input.accessToken));
  for (const [key, value] of Object.entries(input.query || {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs || 60_000);
  try {
    const response = await fetch(url, {
      method: input.method || "GET",
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: input.body,
      cache: "no-store",
      signal: controller.signal,
    });
    return await parseGraphResponse<T>(response);
  } catch (error) {
    if (error instanceof FacebookGraphError) throw error;
    if (error instanceof Error && error.name === "AbortError") throw new Error("FACEBOOK_GRAPH_TIMEOUT");
    throw new Error("FACEBOOK_GRAPH_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
}

export async function exchangeFacebookAuthorizationCode(code: string) {
  const params = new URLSearchParams({
    client_id: facebookAppId(),
    client_secret: facebookAppSecret(),
    redirect_uri: facebookOAuthRedirectUri(),
    code,
  });
  const response = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${params}`, { cache: "no-store" });
  const token = await parseGraphResponse<{ access_token: string; token_type?: string; expires_in?: number }>(response);

  const longLivedParams = new URLSearchParams({
    grant_type: "fb_exchange_token",
    client_id: facebookAppId(),
    client_secret: facebookAppSecret(),
    fb_exchange_token: token.access_token,
  });
  try {
    const longLivedResponse = await fetch(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/oauth/access_token?${longLivedParams}`, { cache: "no-store" });
    return await parseGraphResponse<{ access_token: string; token_type?: string; expires_in?: number }>(longLivedResponse);
  } catch {
    return token;
  }
}

export type FacebookProfile = { id: string; name: string };
export type FacebookManagedPage = {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  username?: string;
  tasks?: string[];
  picture?: { data?: { url?: string } };
};

export async function readFacebookProfileAndPages(userAccessToken: string) {
  const [profile, permissionResult, firstPageResult] = await Promise.all([
    facebookGraphRequest<FacebookProfile>("/me", { accessToken: userAccessToken, query: { fields: "id,name" } }),
    facebookGraphRequest<{ data: Array<{ permission: string; status: string }> }>("/me/permissions", { accessToken: userAccessToken }),
    facebookGraphRequest<{ data: FacebookManagedPage[]; paging?: { cursors?: { after?: string }; next?: string } }>("/me/accounts", {
      accessToken: userAccessToken,
      query: { fields: "id,name,username,access_token,category,tasks,picture{url}", limit: 100 },
    }),
  ]);
  const pages = [...(firstPageResult.data || [])];
  let after = firstPageResult.paging?.cursors?.after;
  for (let pageNumber = 1; after && pageNumber < 20; pageNumber += 1) {
    const next = await facebookGraphRequest<{ data: FacebookManagedPage[]; paging?: { cursors?: { after?: string }; next?: string } }>("/me/accounts", {
      accessToken: userAccessToken,
      query: { fields: "id,name,username,access_token,category,tasks,picture{url}", limit: 100, after },
    });
    pages.push(...(next.data || []));
    after = next.paging?.next ? next.paging.cursors?.after : undefined;
  }
  return {
    profile,
    pages: [...new Map(pages.map((page) => [page.id, page])).values()],
    permissions: permissionResult.data || [],
  };
}
