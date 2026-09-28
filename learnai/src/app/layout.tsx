import type { Metadata, Viewport } from "next";
import "./globals.css";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = {
  title: "LearnAI — Your personal AI learning system",
  description:
    "Understand, memorize, practice and master any subject with an AI tutor, adaptive quizzes, timed tests, flashcards and study plans.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// Applies saved theme/accessibility settings before paint (no flash).
const themeScript = `(function(){try{var s=JSON.parse(localStorage.getItem('learnai:v1')||'{}').settings||{};var d=document.documentElement;var t=s.theme||'system';if(t==='system'){t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'}d.dataset.theme=t;if(s.largeText)d.classList.add('large-text');if(s.dyslexia)d.classList.add('dyslexia');if(s.reducedMotion||matchMedia('(prefers-reduced-motion: reduce)').matches)d.classList.add('reduce-motion')}catch(e){}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
