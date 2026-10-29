import { resolve } from "node:path";

/** Same database selection as the web app: DATABASE_URL, else the PGlite folder the app uses. */
export const dbOptions = {
  url: process.env.DATABASE_URL || undefined,
  dataDir: process.env.DATABASE_URL ? undefined : resolve(process.env.PGLITE_DIR ?? "../../apps/web/.data/pglite"),
};
