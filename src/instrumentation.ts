export async function register() {
  if (
    process.env.NEXT_RUNTIME === "nodejs" &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    const { readAuthEnvironment } = await import("./server/auth/environment");
    const { readStorageEnvironment } =
      await import("./server/storage/environment");
    try {
      readAuthEnvironment();
      readStorageEnvironment();
    } catch (error) {
      console.error(
        error instanceof Error
          ? error.message
          : "Invalid authentication configuration.",
      );
      // Next catches instrumentation errors without exiting; configuration is mandatory.
      process.exit(1);
    }
  }
}
