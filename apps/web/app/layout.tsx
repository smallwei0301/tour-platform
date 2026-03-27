import './globals.css';

export const metadata = {
  title: 'Tour Platform MVP',
  description: 'MVP demo for local guide booking platform'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
