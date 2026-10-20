import "./globals.css";

export const metadata = {
  title: "RehabTrack",
  description: "Rehabilitation monitoring for patients and healthcare workers.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
