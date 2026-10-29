import { createDb, resetOwnerPassword } from "../src/index";
import { dbOptions } from "./env";

// For a forgotten owner password. Needs access to the server's database, which is the proof of ownership.
// Stop the app first when using the embedded database (PGlite allows one process at a time).
//   GPA_NEW_PASSWORD='a new long password' npm run owner:reset
const password = process.env.GPA_NEW_PASSWORD;
if (!password) {
  console.error("Set GPA_NEW_PASSWORD to the new owner password, e.g. GPA_NEW_PASSWORD='…' npm run owner:reset");
  process.exit(1);
}
const handle = await createDb(dbOptions);
const username = await resetOwnerPassword(handle.db, password);
console.log(username ? `Password for the owner “${username}” changed, and the owner signed out everywhere.` : "No owner yet: open GPA to set it up.");
await handle.close();
