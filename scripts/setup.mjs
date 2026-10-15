import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { networkInterfaces } from "node:os";
import { execFileSync } from "node:child_process";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.env.npm_execpath;
if (!npm) throw new Error("请通过 npm run setup 启动。");
const apiEnv = resolve(root, "apps/api/.env");
if (!existsSync(apiEnv)) {
  const template = readFileSync(resolve(root, "apps/api/.env.example"), "utf8");
  const content = template
    .replace(
      "SEED_ADMIN_PASSWORD=",
      `SEED_ADMIN_PASSWORD=${randomBytes(18).toString("base64url")}`,
    )
    .replace(
      "SEED_DEMO_PASSWORD=",
      `SEED_DEMO_PASSWORD=${randomBytes(18).toString("base64url")}`,
    );
  writeFileSync(apiEnv, content, { mode: 0o600 });
}
const mobileEnv = resolve(root, "apps/mobile/.env");
if (!existsSync(mobileEnv)) {
  const ip =
    Object.values(networkInterfaces())
      .flat()
      .find(
        (address) => address && address.family === "IPv4" && !address.internal,
      )?.address ?? "localhost";
  writeFileSync(mobileEnv, `EXPO_PUBLIC_API_URL=http://${ip}:3000/api/v1\n`);
}
for (const task of ["db:generate", "db:deploy", "db:seed"])
  execFileSync(process.execPath, [npm, "run", task], {
    cwd: root,
    stdio: "inherit",
  });
console.log(
  "初始化完成。账号 admin / demo 的密码见 apps/api/.env。手机 API 地址见 apps/mobile/.env；多网卡或 IP 变化时请核对。",
);
