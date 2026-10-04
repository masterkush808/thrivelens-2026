import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Root HTML for static web rendering. Adding the manifest, theme colour and
 * iOS web-app meta tags here is what lets a phone install Thrive Lens to the
 * home screen instead of opening it in a browser tab.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        <ScrollViewStyleReset />

        {/*
          The document title is set through <Head> in the root layout so it
          fills the placeholder Expo already renders. Declaring a second
          <title> here would lose, because browsers honour the first one.
        */}
        <meta
          name="description"
          content="Track food, movement, workouts, and progress in one calm place."
        />

        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0C0B09" />
        <meta name="color-scheme" content="dark" />

        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="icon" type="image/png" sizes="32x32" href="/pwa/favicon-32.png" />
        <link rel="apple-touch-icon" href="/pwa/apple-touch-icon.png" />

        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta
          name="apple-mobile-web-app-status-bar-style"
          content="black-translucent"
        />
        <meta name="apple-mobile-web-app-title" content="Thrive Lens" />
      </head>
      <body>{children}</body>
    </html>
  );
}
