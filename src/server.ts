import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { connectMongo } from "./config/mongo.js";
import { startAgenda } from "./jobs/agenda.js";

async function main() {
  await connectMongo();
  await startAgenda();

  const app = createApp();
  if (env.NODE_ENV === "production") {
    app.listen(env.PORT, "0.0.0.0", () => {
      logger.info({ port: env.PORT, host: "0.0.0.0" }, "API server listening");
    });
  } else {
    app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, "API server listening");
    });
  }
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exitCode = 1;
});

