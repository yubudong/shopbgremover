import Script from 'next/script';

export const metadata = {
  title: 'ShopBG Remover - AI Background Removal for Shopify',
  description: 'Batch remove backgrounds from product images for Shopify sellers',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-JW8MGVZV6J"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-JW8MGVZV6J');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
