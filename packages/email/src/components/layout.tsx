import { Body, Container, Head, Html, Preview, Text } from "@react-email/components";
import type { ReactNode } from "react";

interface LayoutProps {
  preview: string;
  children: ReactNode;
}

/** Shared chrome for every transactional email. */
export function Layout({ preview, children }: LayoutProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#fafafa", fontFamily: "system-ui, sans-serif" }}>
        <Container style={{ backgroundColor: "#ffffff", padding: "32px", maxWidth: "480px" }}>
          {children}
          <Text style={{ color: "#8e8e8e", fontSize: "12px" }}>
            You received this email because of activity on your INS account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
