import { NextResponse } from "next/server";

import { readLiveMarketplaceEvents } from "@/server/freight/live-feed";
import {
  boundedWebLimit,
  requireWebMarketplaceAccess,
  safeWebLiveAfter,
  safeWebMarketplaceScope,
  serializeWebLiveEvents,
  webMarketplaceError,
} from "@/server/freight/web-marketplace";
import { requireMarketplaceScopeFeature } from "@/server/features/product-status";
import { parseMarketplaceFilters } from "../../../../../../shared/marketplace-filters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const context = await requireWebMarketplaceAccess();
    const url = new URL(request.url);
    const afterValue = url.searchParams.get("after");
    const after = safeWebLiveAfter(afterValue);
    const scope = safeWebMarketplaceScope(url.searchParams.get("scope"));
    const limit = boundedWebLimit(url.searchParams.get("limit"));
    await requireMarketplaceScopeFeature(scope);

    if (url.searchParams.get("stream") !== "1") {
      const events = await readLiveMarketplaceEvents(after, limit, context.user.id, !afterValue, scope, { filters: parseMarketplaceFilters(url.searchParams) });
      const safeEvents = await serializeWebLiveEvents(events);
      return NextResponse.json({
        events: safeEvents,
        cursor: safeEvents.at(-1)?.cursor ?? after.toISOString(),
      }, { headers: privateNoStoreHeaders() });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        let cursor = after;
        let closed = false;
        const close = () => {
          if (closed) return;
          closed = true;
          try { controller.close(); } catch { /* The browser already disconnected. */ }
        };
        request.signal.addEventListener("abort", close, { once: true });
        try {
          controller.enqueue(encoder.encode(`event: ready\ndata: ${JSON.stringify({ cursor: cursor.toISOString() })}\n\n`));
          const deadline = Date.now() + 55_000;
          while (!closed && Date.now() < deadline) {
            const events = await readLiveMarketplaceEvents(cursor, limit, context.user.id, false, scope);
            const safeEvents = await serializeWebLiveEvents(events);
            for (const item of safeEvents) {
              controller.enqueue(encoder.encode(`id: ${item.cursor}\nevent: marketplace\ndata: ${JSON.stringify(item)}\n\n`));
              cursor = new Date(item.cursor);
            }
            if (!safeEvents.length) controller.enqueue(encoder.encode(`: heartbeat ${Date.now()}\n\n`));
            await abortableDelay(3_000, request.signal);
          }
        } catch {
          // A disconnected EventSource is expected and does not expose an application error.
        } finally {
          request.signal.removeEventListener("abort", close);
          close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "private, no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return webMarketplaceError(error);
  }
}

function privateNoStoreHeaders() {
  return { "Cache-Control": "private, no-store", Vary: "Cookie" };
}

function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}
