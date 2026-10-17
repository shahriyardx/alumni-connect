export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startPushWorker } = await import("./server/push");
    startPushWorker();
  }
}
