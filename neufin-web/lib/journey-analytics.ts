/**
 * Stable PostHog event names for funnel and journey analytics.
 */

export const JOURNEY_EVENTS = {
  stepViewed: "journey_step_viewed",
  nextActionClicked: "next_action_clicked",
} as const;

export type JourneySurface =
  | "dashboard"
  | "results"
  | "empty_state"
  | "actions_page";
