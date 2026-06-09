import "./globals.css";

export const metadata = {
  title: "ブラログ",
  description: "食べ歩き・テイクアウト特化のグルメマップ",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
