import { describe, expect, it } from "vitest";
import { assertSecuredApk, getAndroidApkPath } from "../apk-path";

describe("apk-path", () => {
  it("path is under secured/", () => {
    const info = assertSecuredApk();
    expect(info.underSecured).toBe(true);
    expect(info.underPublic).toBe(false);
    expect(getAndroidApkPath()).toContain("secured");
  });

  it("path is not under public/", () => {
    expect(assertSecuredApk().underPublic).toBe(false);
  });

  it("secured apk exists", () => {
    expect(assertSecuredApk().exists).toBe(true);
  });
});
