import type { Metadata } from "next";
import "@/styles/globals.css";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { SignInModal } from "@/components/SignInModal";

export const metadata: Metadata = {
  title: "Clarity AI — Video Interaction & Post-Meeting Intelligence",
  description:
    "Real-time video calls with personalized AI agents powered by Stream Video SDK, Inngest background pipelines, and timestamped post-meeting intelligence suite.",
  icons: {
    icon: [
      { url: "/favicon.svg?v=clarity-v2", type: "image/svg+xml" },
      { url: "/favicon.ico?v=clarity-v2", sizes: "32x32" },
      { url: "/icon.svg?v=clarity-v2", type: "image/svg+xml" },
    ],
    shortcut: "/favicon.svg?v=clarity-v2",
    apple: "/favicon.svg?v=clarity-v2",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg?v=clarity-v2" />
        <link rel="alternate icon" href="/favicon.ico?v=clarity-v2" />
        <link rel="apple-touch-icon" href="/favicon.svg?v=clarity-v2" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Mono:ital,wght@0,300;0,400;0,500&family=Manrope:wght@300;400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="bg-canvas text-ink antialiased flex min-h-screen">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main className="flex-1 p-8 max-w-[1440px] w-full mx-auto">{children}</main>
        </div>
        <SignInModal />
      </body>
    </html>
  );
}
