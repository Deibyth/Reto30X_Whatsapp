import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Anna — WhatsApp Colsubsidio",
  description: "Anna, tu asesora de seguros Colsubsidio en WhatsApp",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className="min-h-screen bg-gray-950 text-gray-100 antialiased">
        {children}
      </body>
    </html>
  );
}
