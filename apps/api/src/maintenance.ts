import "dotenv/config";
import { parseArgs } from "node:util";
import { MaterialFiles } from "./material-files.js";
import { databasePath } from "./storage-lock.js";
import { createBackup, restoreBackup, verifyBackup } from "./backup.js";

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { from: { type: "string" }, to: { type: "string" } },
  });
  const operation = positionals[0];
  if (
    positionals.length !== 1 ||
    !["backup", "restore", "verify"].includes(operation)
  )
    throw new Error(
      "用法：backup --to 新目录 / restore --from 备份目录 --to 新目录 / verify --from 备份目录",
    );
  if (operation === "backup") {
    if (!values.to || values.from) throw new Error("备份需要 --to 新目录");
    await createBackup(databasePath(), new MaterialFiles().root, values.to);
  } else {
    if (!values.from || (operation === "restore" ? !values.to : values.to))
      throw new Error("校验需要 --from；恢复还需要 --to 新目录");
    if (operation === "restore") await restoreBackup(values.from, values.to!);
    else await verifyBackup(values.from);
  }
  console.log(`${operation} 完成，数据库与材料关联校验通过。`);
} catch (error) {
  console.error(error instanceof Error ? error.message : "维护操作失败");
  process.exitCode = 1;
}
