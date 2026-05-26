import "./globals.css";

export const metadata = {
  title: "Image Allotment Tracker",
  description: "Online image allotment tracker backed by Google Sheets.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
