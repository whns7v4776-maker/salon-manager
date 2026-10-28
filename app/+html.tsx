import type { PropsWithChildren } from 'react';
import { ScrollViewStyleReset } from 'expo-router/html';
import { ICON_ASSET_VERSION } from '../src/lib/icon-asset-version';

export default function RootHtml({ children }: PropsWithChildren) {
  const previewImageUrl = `https://salon-manager-puce.vercel.app/android-chrome-512-light.png?v=${ICON_ASSET_VERSION}`;

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
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#FDFDFD" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#181818" />
        <meta property="og:site_name" content="SalonPro" />
        <meta property="og:title" content="SalonPro" />
        <meta
          property="og:description"
          content="Apri l'area cliente del salone e registrati in pochi passaggi."
        />
        <meta property="og:image" content={previewImageUrl} />
        <meta property="og:image:width" content="512" />
        <meta property="og:image:height" content="512" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="SalonPro" />
        <meta
          name="twitter:description"
          content="Apri l'area cliente del salone e registrati in pochi passaggi."
        />
        <meta name="twitter:image" content={previewImageUrl} />
        <link
          rel="icon"
          type="image/png"
          href={`/favicon-light.png?v=${ICON_ASSET_VERSION}`}
        />
        <link
          rel="apple-touch-icon"
          id="salonpro-apple-touch-icon"
          href={`/apple-touch-icon-light.png?v=${ICON_ASSET_VERSION}`}
        />
        <link
          rel="manifest"
          id="salonpro-manifest"
          href={`/manifest-light.webmanifest?v=${ICON_ASSET_VERSION}`}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var iconVersion = '${ICON_ASSET_VERSION}';
                  var applySalonProThemeAssets = function () {
                    var favicon = document.querySelector('link[rel="icon"]');
                    var appleTouchIcon = document.getElementById('salonpro-apple-touch-icon');
                    var manifest = document.getElementById('salonpro-manifest');
                    if (favicon) {
                      favicon.href = '/favicon-light.png?v=' + iconVersion;
                    }
                    if (appleTouchIcon) {
                      appleTouchIcon.href = '/apple-touch-icon-light.png?v=' + iconVersion;
                    }
                    if (manifest) {
                      manifest.href = '/manifest-light.webmanifest?v=' + iconVersion;
                    }
                  };
                  applySalonProThemeAssets();
                } catch (error) {}
              })();
            `,
          }}
        />
        <style id="agenda-live-interaction" dangerouslySetInnerHTML={{__html: "[role=\"button\"][aria-label^=\"Vai all'orario live\"]{cursor:pointer!important;pointer-events:auto!important;}[role=\"button\"][aria-label^=\"Vai all'orario live\"] *{cursor:pointer!important;pointer-events:none!important;}"}}/>
        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html,
              body,
              #root {
                height: 100%;
                overscroll-behavior-y: contain;
                -webkit-tap-highlight-color: transparent;
              }

              body {
                overflow: hidden;
                touch-action: manipulation;
                -webkit-font-smoothing: antialiased;
                text-rendering: optimizeLegibility;
              }

              [data-scrollview],
              [style*="overflow: auto"],
              [style*="overflow-y: auto"],
              [style*="overflow: scroll"],
              [style*="overflow-y: scroll"] {
                overscroll-behavior-y: contain;
                scroll-behavior: auto;
              }

              @supports (-webkit-touch-callout: none) {
                [data-scrollview],
                [style*="overflow: auto"],
                [style*="overflow-y: auto"],
                [style*="overflow: scroll"],
                [style*="overflow-y: scroll"] {
                  -webkit-overflow-scrolling: touch;
                  transform: translateZ(0);
                  backface-visibility: hidden;
                }
              }
            `,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
