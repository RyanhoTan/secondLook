import "dotenv/config";
import { createApp } from "./app.js";
import { openDatabase } from "./db.js";
import { MaterialFiles } from "./material-files.js";
import { databasePath, lockStorage } from "./storage-lock.js";
const releaseStorage = lockStorage(databasePath(), new MaterialFiles().root, "api");
process.on("exit", releaseStorage);
const db = openDatabase();
const server = createApp(db, {
  authLimit: Number(process.env.AUTH_RATE_LIMIT ?? 20),
}).listen(Number(process.env.PORT ?? 3000), "0.0.0.0", () =>
  console.log("SecondLook API http://localhost:3000/api/v1"),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
