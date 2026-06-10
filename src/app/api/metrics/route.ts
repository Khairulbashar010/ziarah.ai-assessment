import { getMetricsText, metricsEnabled } from "@/lib/observability/metrics";

export async function GET() {
  if (!metricsEnabled()) {
    return new Response("Metrics disabled", { status: 404 });
  }

  const body = await getMetricsText();
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
