export async function register() {
  const { initTracing } = await import("@/lib/observability/tracing");
  await initTracing();
}
