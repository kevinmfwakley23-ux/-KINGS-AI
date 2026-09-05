import {
  bootstrapAppMegaRouterHttp,
} from "../../core/workforce/app-mega-router-http";

async function main(): Promise<void> {
  const {
    server,
    config,
    runtime,
  } = await bootstrapAppMegaRouterHttp();

  server.listen(
    config.port,
    config.host,
    () => {
      console.log(
        JSON.stringify({
          timestamp:
            new Date().toISOString(),
          event:
            "kings_mega_brain_router_started",
          service:
            "kings-mega-brain-router",
          host:
            config.host,
          port:
            config.port,
          authRequired:
            Boolean(config.accessToken),
          providers:
            runtime.providers
              .listAvailable()
              .map(
                (provider) =>
                  provider.id,
              ),
          models:
            runtime.capabilities
              .list()
              .length,
          learnedRoutes:
            runtime.metrics.size,
        }),
      );
    },
  );
}

main().catch(
  (error) => {
    console.error(
      JSON.stringify({
        timestamp:
          new Date().toISOString(),
        event:
          "kings_mega_brain_router_start_failed",
        message:
          error instanceof Error
            ? error.message
            : String(error),
      }),
    );
    process.exitCode = 1;
  },
);
