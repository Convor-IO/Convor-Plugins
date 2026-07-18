import {ConvorWidget} from "@convor/widget-react";
import type {ReactNode} from "react";

export default function RootLayout({children}: {children: ReactNode}) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Convor live-chat widget — drop your org slug in here. */}
        <ConvorWidget
          slug="demo"
          primaryColor="#3b82f6"
          position="bottom-right"
        />
      </body>
    </html>
  );
}
