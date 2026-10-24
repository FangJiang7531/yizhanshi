import { describe, expect, it } from "vitest";
import { assertSafeTargetUrl } from "@/modules/links/services/link.service";

/** 短链服务纯函数测试（SSRF 防护口径） */
describe("assertSafeTargetUrl（SSRF 防护）", () => {
  it("放行合法公网 http/https 链接（host 统一小写）", () => {
    expect(assertSafeTargetUrl("https://example.com/a?b=1")).toBe("https://example.com/a?b=1");
    expect(assertSafeTargetUrl("http://example.ORG/path")).toBe("http://example.org/path");
  });

  it("拒绝非 http(s) 协议", () => {
    expect(() => assertSafeTargetUrl("ftp://example.com")).toThrow();
    expect(() => assertSafeTargetUrl("file:///etc/passwd")).toThrow();
    expect(() => assertSafeTargetUrl("javascript:alert(1)")).toThrow();
  });

  it("拒绝环回与本地地址", () => {
    expect(() => assertSafeTargetUrl("http://localhost/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://127.0.0.1/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://[::1]/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://foo.localhost/x")).toThrow();
  });

  it("拒绝内网与保留地址", () => {
    expect(() => assertSafeTargetUrl("http://10.0.0.1/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://192.168.1.1/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://172.16.0.1/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://172.31.255.255/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://169.254.1.1/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://0.0.0.0/x")).toThrow();
    expect(() => assertSafeTargetUrl("http://my-service.internal/x")).toThrow();
  });

  it("放行 172.32-172.47 区段（非内网）与格式非法输入抛错", () => {
    expect(assertSafeTargetUrl("https://172.32.0.1/x")).toBe("https://172.32.0.1/x");
    expect(() => assertSafeTargetUrl("not a url")).toThrow();
  });
});
