import "./globals.css";

export const metadata = {
  title: "ระบบสต็อกอะไหล่รถ",
  description: "MVP - ถ่ายรูป แท็ก ค้นหาอะไหล่รถ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <body>{children}</body>
    </html>
  );
}
