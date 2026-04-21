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
        <meta
          name="theme-color"
          media="(prefers-color-scheme: light)"
          content="#ffffff"
        />
        <meta
          name="theme-color"
          media="(prefers-color-scheme: dark)"
          content="#060816"
        />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-light-v3.png"
          media="(prefers-color-scheme: light)"
        />
        <link
          rel="icon"
          type="image/png"
          href="/favicon-dark-v3.png"
          media="(prefers-color-scheme: dark)"
        />
        <link rel="apple-touch-icon" href="/apple-touch-icon-v3.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (typeof window === 'undefined') return;
                var overlayId = '__salonpro_web_error_overlay__';
                var contentId = '__salonpro_web_error_content__';

                function ensureOverlay() {
                  var overlay = document.getElementById(overlayId);
                  if (overlay) return overlay;

                  overlay = document.createElement('div');
                  overlay.id = overlayId;
                  overlay.style.position = 'fixed';
                  overlay.style.left = '12px';
                  overlay.style.right = '12px';
                  overlay.style.bottom = '12px';
                  overlay.style.zIndex = '999999';
                  overlay.style.background = '#111827';
                  overlay.style.color = '#F8FAFC';
                  overlay.style.border = '1px solid #EF4444';
                  overlay.style.borderRadius = '16px';
                  overlay.style.padding = '14px 16px';
                  overlay.style.boxShadow = '0 18px 40px rgba(0,0,0,0.35)';
                  overlay.style.fontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
                  overlay.style.fontSize = '12px';
                  overlay.style.lineHeight = '1.5';
                  overlay.style.whiteSpace = 'pre-wrap';
                  overlay.style.maxHeight = '40vh';
                  overlay.style.overflow = 'auto';

                  var title = document.createElement('div');
                  title.textContent = 'Errore web runtime';
                  title.style.fontFamily = 'system-ui, -apple-system, sans-serif';
                  title.style.fontWeight = '800';
                  title.style.fontSize = '14px';
                  title.style.marginBottom = '8px';
                  title.style.color = '#FCA5A5';
                  overlay.appendChild(title);

                  var content = document.createElement('div');
                  content.id = contentId;
                  overlay.appendChild(content);
                  document.body.appendChild(overlay);
                  return overlay;
                }

                function showMessage(message) {
                  var overlay = ensureOverlay();
                  var content = document.getElementById(contentId);
                  if (!content) return;
                  content.textContent = String(message || 'Errore sconosciuto');
                  overlay.style.display = 'block';
                }

                window.addEventListener('error', function (event) {
                  var error = event && event.error;
                  var message = error && error.stack
                    ? error.stack
                    : event && event.message
                      ? event.message
                      : 'Errore JavaScript';
                  showMessage(message);
                });

                window.addEventListener('unhandledrejection', function (event) {
                  var reason = event && event.reason;
                  var message = reason && reason.stack
                    ? reason.stack
                    : reason && reason.message
                      ? reason.message
                      : typeof reason === 'string'
                        ? reason
                        : JSON.stringify(reason);
                  showMessage(message || 'Promise rejection non gestita');
                });
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
