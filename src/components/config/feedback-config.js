// Shared EmailJS configuration for the feedback widget (src/components/js/feedback.js).
// Same IDs used by the homepage's own feedback flow (src/js/index.js).
export const FEEDBACK_CONFIG = {
  SERVICE_ID: "service_n0xzgps",
  TEMPLATE_ID: "template_lui1cw4",
  PUBLIC_KEY: "6IPX1SB_fT0DIA5i2",
  MAX_TITLE_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 3000,

  getMetadata: function () {
    return {
      url: window.location.href,
      pageTitle: document.title,
      version: document.querySelector('meta[name="version"]')?.content || "v1.5.0",
      browser: this.getBrowserInfo(),
      os: this.getOSInfo(),
      screenResolution: window.screen.width + " × " + window.screen.height,
      viewport: window.innerWidth + " × " + window.innerHeight,
      language: document.documentElement.lang || navigator.language || "unknown",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timestamp: new Date().toISOString().replace("T", " ").slice(0, 19),
      userAgent: navigator.userAgent,
    };
  },

  getBrowserInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Chrome")) return "Chrome " + (ua.match(/Chrome\/(\d+)/)?.[1] || "?");
    if (ua.includes("Firefox")) return "Firefox " + (ua.match(/Firefox\/(\d+)/)?.[1] || "?");
    if (ua.includes("Safari") && !ua.includes("Chrome"))
      return "Safari " + (ua.match(/Version\/(\d+)/)?.[1] || "?");
    if (ua.includes("Edge")) return "Edge " + (ua.match(/Edg\/(\d+)/)?.[1] || "?");
    return "Unknown Browser";
  },

  getOSInfo: function () {
    const ua = navigator.userAgent;
    if (ua.includes("Windows")) return "Windows";
    if (ua.includes("Mac OS")) return "macOS";
    if (ua.includes("Linux")) return "Linux";
    if (ua.includes("Android")) return "Android";
    if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) return "iOS";
    return "Unknown OS";
  },
};
