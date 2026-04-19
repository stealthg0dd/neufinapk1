/**
 * Stable PostHog event names for funnel and journey analytics.
 */

export const JOURNEY_EVENTS = {
  stepViewed: "journey_step_viewed",
  nextActionClicked: "next_action_clicked",
  recommendationViewed: "recommendation_viewed",
  recommendationClicked: "recommendation_clicked",
  /** Fired with CTA navigation intent (not server-side completion). */
  recommendationCompleted: "recommendation_completed",
} as const;

export type JourneySurface =
  | "dashboard"
  | "results"
  | "empty_state"
  | "actions_page";
