import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { AuthProvider } from "@/components/AuthProvider";

export const metadata: Metadata = {
  title: "My Family Tree",
  description: "Your family's story, passed on for generations.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>
          {children}
          <footer className="site-footer">
            <p>© {new Date().getFullYear()} My Family Tree. All rights reserved.</p>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
