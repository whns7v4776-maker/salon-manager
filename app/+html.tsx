import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';

export default function RootHtml({ children }: PropsWithChildren) {
  return (
    <html lang="it">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FAF6EE" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111111" />
        <link rel="icon" type="image/png" href="/favicon-light.png" media="(prefers-color-scheme: light)" />
        <link rel="icon" type="image/png" href="/favicon-dark.png" media="(prefers-color-scheme: dark)" />
        <link rel="apple-touch-icon" id="salonpro-apple-touch-icon" href="/apple-touch-icon-light.png" />
        <link rel="manifest" id="salonpro-manifest" href="/manifest-light.webmanifest" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var manifest = document.getElementById('salonpro-manifest');
                  var appleTouchIcon = document.getElementById('salonpro-apple-touch-icon');
                  if (manifest) {
                    manifest.setAttribute('href', prefersDark ? '/manifest-dark.webmanifest' : '/manifest-light.webmanifest');
                  }
                  if (appleTouchIcon) {
                    appleTouchIcon.setAttribute('href', prefersDark ? '/apple-touch-icon-dark.png' : '/apple-touch-icon-light.png');
                  }
                } catch (error) {}
              })();
            `,
          }}
        />
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
