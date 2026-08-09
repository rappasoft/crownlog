import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const title = "Crownlog — Personal Watch Index";
const description = "A private place to collect, organize, and track the watches on your list.";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const forwardedHost = requestHeaders.get("x-forwarded-host");
  const requestHost = forwardedHost || requestHeaders.get("host") || "localhost:3000";
  const safeHost = /^[a-z0-9.:[\]-]+$/i.test(requestHost) ? requestHost : "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (safeHost.startsWith("localhost") ? "http" : "https");
  const previewImage = `${protocol}://${safeHost}/og.png`;

  return {
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: previewImage, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [previewImage] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
