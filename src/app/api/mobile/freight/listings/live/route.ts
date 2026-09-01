import { requireFreightMarketplaceAccess } from "@/server/freight/access";
import { readLiveMarketplaceEvents } from "@/server/freight/live-feed";
import { freightSafeError } from "@/server/freight/response";
import { mobileSuccess } from "@/server/mobile/response";
import { MARKETPLACE_SCOPES, type MarketplaceScopeValue } from "@/server/freight/constants";
import { requireMarketplaceScopeFeature } from "@/server/features/product-status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireFreightMarketplaceAccess(request);
    const url = new URL(request.url);
    const afterValue = url.searchParams.get("after");
    const after = safeAfter(afterValue);
    const scope = safeScope(url.searchParams.get("scope"));
    await requireMarketplaceScopeFeature(scope);
    const wantsStream = request.headers.get("accept")?.includes("text/event-stream") || url.searchParams.get("stream") === "1";
    if (!supportsLiveListingCards(request)) {
      return mobileSuccess({ events: [], cursor: after.toISOString() });
    }
    if (!wantsStream) {
      const events = await readLiveMarketplaceEvents(after, Number(url.searchParams.get("limit") || 100), context.user.id, !afterValue, scope);
      return mobileSuccess({ events, cursor: events.at(-1)?.cursor ?? after.toISOString() });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor = after;
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* connection already closed */ }
        };
        const abort = () => close();
        request.signal.addEventListener("abort", abort, { once: true });
        try {
          controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ cursor: cursor.toISOString() })}\n\n`));
          const deadline = Date.now() + 55_000;
          while (!closed && Date.now() < deadline) {
            const events = await readLiveMarketplaceEvents(cursor, 100, context.user.id, false, scope);
            for (const item of events) {
              controller.enqueue(encoder.encode(`id: ${item.cursor}\nevent: ${item.event}\ndata: ${JSON.stringify(item.listing)}\n\n`));
              cursor = new Date(item.cursor);
            }
            if (!events.length) controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
            await delay(3_000, request.signal);
          }
        } catch {
          // A disconnected SSE client is not an application error.
        } finally {
          request.signal.removeEventListener("abort", abort);
          close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return freightSafeError(error);
  }
}

function supportsLiveListingCards(request: Request) {
  const platform = request.headers.get("x-client-platform")?.trim().toLowerCase();
  if (platform !== "android") return true;

  const versionCode = Number(request.headers.get("x-logivya-version-code"));
  return !Number.isInteger(versionCode) || versionCode >= 201;
}

function safeAfter(value: string | null) {
  if (!value) return new Date(Date.now() - 30 * 60_000);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return new Date(Date.now() - 30 * 60_000);
  return parsed < new Date(Date.now() - 24 * 60 * 60_000) ? new Date(Date.now() - 24 * 60 * 60_000) : parsed;
}

function safeScope(value: string | null): MarketplaceScopeValue {
  return MARKETPLACE_SCOPES.includes(value as MarketplaceScopeValue) ? value as MarketplaceScopeValue : "GLOBAL";
}

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
