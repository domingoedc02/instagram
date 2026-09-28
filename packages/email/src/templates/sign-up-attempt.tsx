import { Heading, Link, Text } from "@react-email/components";
import { Layout } from "../components/layout";

export interface SignUpAttemptProps {
  name: string;
  loginUrl: string;
  resetUrl: string;
}

/**
 * Sent to the owner of an existing account when someone signs up with their email. The sign-up
 * response is identical either way (anti-enumeration, INS-22 AC-6), so this is the only signal.
 */
export function SignUpAttempt({ name, loginUrl, resetUrl }: SignUpAttemptProps) {
  return (
    <Layout preview="Someone tried to create an INS account with your email">
      <Heading as="h1" style={{ fontSize: "20px" }}>
        You already have an account
      </Heading>
      <Text>
        Hi {name}, someone just tried to sign up for INS with this email address. If it was you, you
        can <Link href={loginUrl}>log in</Link> instead, or{" "}
        <Link href={resetUrl}>reset your password</Link> if you&apos;ve forgotten it.
      </Text>
      <Text style={{ fontSize: "13px" }}>
        If it wasn&apos;t you, no action is needed — no new account was created.
      </Text>
    </Layout>
  );
}
