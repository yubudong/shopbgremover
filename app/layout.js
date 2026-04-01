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
          src="https://www.googletagmanager.com/gtag/js?id=G-GMM5Z81M3X"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-GMM5Z81M3X');
          `}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
