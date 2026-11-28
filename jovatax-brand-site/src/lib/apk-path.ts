import path from "path";
import fs from "fs";

/** APK hors public/ — servi uniquement via API session. */
export function getAndroidApkPath(): string {
  return path.join(process.cwd(), "secured", "downloads", "jovatax-beta.apk");
}

export function assertSecuredApk(): {
  path: string;
  underSecured: boolean;
  underPublic: boolean;
  exists: boolean;
} {
  const p = getAndroidApkPath();
  const norm = path.normalize(p);
  const securedRoot = path.normalize(path.join(process.cwd(), "secured"));
  const publicRoot = path.normalize(path.join(process.cwd(), "public"));
  return {
    path: p,
    underSecured: norm.startsWith(securedRoot + path.sep) || norm === securedRoot,
    underPublic: norm.startsWith(publicRoot + path.sep),
    exists: fs.existsSync(p),
  };
}
