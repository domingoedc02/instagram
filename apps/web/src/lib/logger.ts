import "server-only";
import { createLogger } from "@ins/shared/logger";

/** Root logger for the web app. Request code uses the per-request child from `withApi()`. */
export const logger = createLogger("web");
