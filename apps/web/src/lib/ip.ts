import { isIPv4, isIPv6 } from "node:net";

/**
 * The address shown to users: /24 for IPv4, /48 for IPv6 (INS-23, Data). The full address is
 * kept only in audit_logs. Anything unparseable is shown as "unknown".
 */
export function truncateIp(ip: string | null | undefined): string {
  if (!ip) return "unknown";
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip)?.[1];
  const v4 = mapped ?? ip;
  if (isIPv4(v4)) return `${v4.split(".").slice(0, 3).join(".")}.0/24`;
  if (!isIPv6(ip)) return "unknown";
  const prefix = expandIpv6(ip).slice(0, 3);
  // Trailing zero hextets fold into the "::" (0:0:0::/48 is ::/48, 2001:db8:0::/48 is 2001:db8::/48).
  while (prefix.at(-1) === "0") prefix.pop();
  return `${prefix.join(":")}::/48`;
}

/** The eight hextets of an IPv6 address (without an embedded IPv4 tail), leading zeros dropped. */
function expandIpv6(ip: string): string[] {
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const zeros = tail === undefined ? [] : Array(8 - left.length - right.length).fill("0");
  return [...left, ...zeros, ...right].map((h) => (h.replace(/^0+(?=.)/, "") || "0").toLowerCase());
}
