import { createDb, seedDemo } from "../src/index";
import { dbOptions } from "./env";

const handle = await createDb({ ...dbOptions, seed: true });
console.log((await seedDemo(handle.db)) ? "Demo data added." : "Skipped: accounts other than Cash already exist.");
await handle.close();
