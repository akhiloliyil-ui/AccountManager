import { createDb } from "../src/index";
import { dbOptions } from "./env";

const handle = await createDb({ ...dbOptions, seed: true });
console.log(`Migrated and seeded (${handle.driver}${dbOptions.dataDir ? ` at ${dbOptions.dataDir}` : ""}).`);
await handle.close();
