/**
 * Telemetry event names for demo & onboarding — use with useNeufinAnalytics().capture
 */

export const ONBOARDING_EVENTS = {
  demoStarted: "demo_started",
  demoCompleted: "demo_completed",
  tutorialViewed: "tutorial_viewed",
  onboardingCompleted: "onboarding_completed",
  featureDiscovered: "feature_discovered",
  exportAfterTutorial: "export_after_tutorial",
  helpCenterOpened: "help_center_opened",
  productTourLaunched: "product_tour_launched",
} as const;

export type OnboardingEventName =
  (typeof ONBOARDING_EVENTS)[keyof typeof ONBOARDING_EVENTS];
