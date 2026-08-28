import {
  GoogleAnalytics,
  GoogleTagManager,
} from "@next/third-parties/google";
import type { GoogleAnalyticsSettings } from "@/models/SiteSettings";

type Props = {
  config: GoogleAnalyticsSettings;
};

export function PortalAnalytics({ config }: Props) {
  if (!config.enabled) return null;

  if (config.provider === "ga4") {
    const measurementId = config.measurementId.trim();
    if (!measurementId) return null;
    return (
      <GoogleAnalytics gaId={measurementId} debugMode={config.debugMode} />
    );
  }

  const containerId = config.containerId.trim();
  if (!containerId) return null;
  return <GoogleTagManager gtmId={containerId} />;
}
