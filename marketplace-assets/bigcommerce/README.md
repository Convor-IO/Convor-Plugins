# BigCommerce App Marketplace Assets

Prepared: 2026-07-07

Official references:

- Publishing apps:
  https://docs.bigcommerce.com/developer/docs/integrations/apps/guide/publishing-apps
- Approval requirements:
  https://docs.bigcommerce.com/developer/docs/integrations/apps/guide/approval-requirements

## Current BigCommerce Requirements

- Media assets include app icon, primary logo, alternate logo, and app
  screenshots.
- App icon should be square with a transparent background.
- Primary logo should use a white or transparent background.
- Alternate logo should use a solid color background.
- Screenshots should show the app as end users experience it.
- Screenshot guidance from BigCommerce support: up to 4 screenshots,
  `1280x720` or larger, maintaining the same 16:9 aspect ratio.

## Prepared Files

- `icon-1024.png`
  - Source: `/home/Maczuga/Programowanie/convor-dev/favicon.png`
  - Use for: app icon
  - Alt text: Convor app icon.
- `primary-logo-banner.png`
  - Source: `/home/Maczuga/Programowanie/convor-dev/banner.png`
  - Use for: primary logo or banner-style logo where accepted.
  - Alt text: Convor live chat logo for ecommerce customer support.
- `alternate-logo-dark.png`
  - Source: `/home/Maczuga/Programowanie/convor-dev/banner.png`
  - Use for: alternate logo if BigCommerce asks for a solid-color background.
  - Alt text: Convor live chat logo on a dark background.
- `screenshot-003-dashboard-light.png`
  - Source: `/tmp/ai-shots/003-dashboard-light.png`
  - Alt text: Convor dashboard overview showing live chat metrics and activity.
- `screenshot-004-conversations-light.png`
  - Source: `/tmp/ai-shots/004-conversations-light.png`
  - Alt text: Convor inbox showing customer conversations and operator workflow.
- `screenshot-101-int-big-commerce-light.png`
  - Source: `/tmp/ai-shots/101-int-big-commerce-light.png`
  - Alt text: Convor BigCommerce integration screen in the Convor dashboard.
- `screenshot-102-int-big-commerce-configure-light.png`
  - Source: `/tmp/ai-shots/102-int-big-commerce-configure-light.png`
  - Alt text: Convor BigCommerce integration configuration screen.

## Notes

- The original English dashboard screenshots are `1440x900`. These prepared
  copies are centered on a `1600x900` white canvas to satisfy 16:9 upload
  guidance without distorting the UI.
- BigCommerce's listing flow may validate exact logo dimensions in-browser. If
  it rejects either logo, resize from `banner.png` or `favicon.png` and record
  the accepted size here.
