export async function mockLatency(): Promise<void> {
  const min = Number(process.env.MOCK_LATENCY_MS_MIN ?? 200);
  const max = Number(process.env.MOCK_LATENCY_MS_MAX ?? 800);
  const delay = min + Math.random() * (max - min);
  await new Promise((resolve) => setTimeout(resolve, delay));
}
