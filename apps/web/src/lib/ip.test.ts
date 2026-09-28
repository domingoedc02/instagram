import { describe, expect, it } from "vitest";
import { truncateIp } from "./ip";

describe("truncateIp", () => {
  it.each([
    ["203.0.113.57", "203.0.113.0/24"],
    ["::ffff:198.51.100.9", "198.51.100.0/24"],
    ["2001:db8:85a3:8d3:1319:8a2e:370:7348", "2001:db8:85a3::/48"],
    ["2001:0DB8::1", "2001:db8::/48"],
    ["::1", "::/48"],
    ["2001:0:0:1::1", "2001::/48"],
    ["unknown", "unknown"],
    ["", "unknown"],
    [null, "unknown"],
  ])("%s → %s", (ip, expected) => {
    expect(truncateIp(ip)).toBe(expected);
  });
});
