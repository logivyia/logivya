import "server-only";

import {
  exchangeFacebookAuthorizationCode,
  facebookGraphRequest,
  readFacebookProfileAndPages,
} from "@/server/facebook/graph-api";

export class FacebookPagesProvider {
  exchangeAuthorizationCode(code: string) {
    return exchangeFacebookAuthorizationCode(code);
  }

  getAuthorizedIdentityAndPages(userAccessToken: string) {
    return readFacebookProfileAndPages(userAccessToken);
  }

  validatePageAuthorization(pageId: string, pageAccessToken: string) {
    return facebookGraphRequest<{ id: string; name?: string; tasks?: string[] }>(`/${pageId}`, {
      accessToken: pageAccessToken,
      query: { fields: "id,name,tasks" },
    });
  }

  publishPhoto(pageId: string, pageAccessToken: string, body: FormData) {
    return facebookGraphRequest<{ id: string }>(`/${pageId}/photos`, {
      accessToken: pageAccessToken,
      method: "POST",
      body,
      timeoutMs: 120_000,
    });
  }

  publishFeed(pageId: string, pageAccessToken: string, body: URLSearchParams) {
    return facebookGraphRequest<{ id: string }>(`/${pageId}/feed`, {
      accessToken: pageAccessToken,
      method: "POST",
      body,
    });
  }

  publishVideo(pageId: string, pageAccessToken: string, body: FormData) {
    return facebookGraphRequest<{ id: string }>(`/${pageId}/videos`, {
      accessToken: pageAccessToken,
      method: "POST",
      body,
      timeoutMs: 10 * 60_000,
    });
  }

  deleteRemoteObject(externalId: string, pageAccessToken: string) {
    return facebookGraphRequest<{ success?: boolean }>(`/${externalId}`, {
      accessToken: pageAccessToken,
      method: "DELETE",
    });
  }

  getPostStatus(externalId: string, pageAccessToken: string) {
    return facebookGraphRequest<{ id: string; permalink_url?: string; is_published?: boolean; created_time?: string }>(`/${externalId}`, {
      accessToken: pageAccessToken,
      query: { fields: "id,permalink_url,is_published,created_time" },
    });
  }
}

export const facebookPagesProvider = new FacebookPagesProvider();
