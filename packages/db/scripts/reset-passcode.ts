import { createDb, setSettings } from "../src/index";
import { dbOptions } from "./env";

// For a forgotten passcode. Needs access to the server's database, which is the proof of ownership.
// Stop the app first when using the embedded database (PGlite allows one process at a time).
const handle = await createDb(dbOptions);
await setSettings(handle.db, { authHash: null, authSecret: null });
console.log("Passcode removed and every device signed out. The next visit to GPA asks for a new passcode.");
await handle.close();
