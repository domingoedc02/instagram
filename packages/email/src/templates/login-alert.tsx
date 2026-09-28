import { Heading, Link, Text } from "@react-email/components";
import { Layout } from "../components/layout";

export interface LoginAlertProps {
  name: string;
  /** When the lock was applied, already formatted in UTC. */
  when: string;
  /** Truncated (/24, /48) — the full address stays in the audit log. */
  network: string;
  resetUrl: string;
}

/**
 * Sent once per lockout (INS-23 AC-4): five wrong passwords locked sign-in for 15 minutes. The
 * caller sees the same 423 whether or not the account exists, so only the owner learns of it.
 */
export function LoginAlert({ name, when, network, resetUrl }: LoginAlertProps) {
  return (
    <Layout preview="We paused sign-in to your INS account after several wrong passwords">
      <Heading as="h1" style={{ fontSize: "20px" }}>
        Unusual login attempts
      </Heading>
      <Text>
        Hi {name}, someone entered the wrong password for your account several times, so we paused
        sign-in for 15 minutes. This happened at {when} from a network around {network}.
      </Text>
      <Text>
        If it was you, wait 15 minutes and try again. If it wasn&apos;t,{" "}
        <Link href={resetUrl}>reset your password</Link> — it also signs out every device.
      </Text>
      <Text style={{ fontSize: "13px" }}>Your password has not been changed.</Text>
    </Layout>
  );
}
