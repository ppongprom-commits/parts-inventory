import "./globals.css";
import { AuthProvider } from "../lib/AuthProvider";
import { ThemeProvider } from "../lib/ThemeProvider";

export const metadata = {
  title: "ระบบสต็อกอะไหล่รถ",
  description: "MVP - ถ่ายรูป แท็ก ค้นหาอะไหล่รถ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="th" data-theme="light">
      <body>
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
