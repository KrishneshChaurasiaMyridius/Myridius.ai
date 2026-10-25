import type { Metadata } from "next";
import { AuthProvider } from "./auth-provider";
import "./styles.css";

export const metadata: Metadata = {
  title: "Risk Assessment Workbench",
  description: "Governed FCRM assessment workflow using synthetic data only.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body><AuthProvider>{children}</AuthProvider></body>
    </html>
  );
}