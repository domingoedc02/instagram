import { Button, Heading, Text } from "@react-email/components";
import { Layout } from "../components/layout";

export interface VerifyEmailProps {
  name: string;
  url: string;
}

/** Sent at sign-up and on resend (INS-22). The link is single-use and expires in 24 hours. */
export function VerifyEmail({ name, url }: VerifyEmailProps) {
  return (
    <Layout preview="Confirm your email to finish creating your INS account">
      <Heading as="h1" style={{ fontSize: "20px" }}>
        Confirm your email
      </Heading>
      <Text>Hi {name}, tap the button below to confirm your email and sign in to INS.</Text>
      <Button
        href={url}
        style={{
          backgroundColor: "#0095f6",
          borderRadius: "8px",
          color: "#ffffff",
          padding: "12px 20px",
          fontWeight: 600,
        }}
      >
        Confirm email
      </Button>
      <Text style={{ fontSize: "13px" }}>
        This link works once and expires in 24 hours. If you didn&apos;t create an account, you can
        ignore this email.
      </Text>
    </Layout>
  );
}
