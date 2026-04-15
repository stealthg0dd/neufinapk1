# PostHog Funnel Definitions — NeuFin Web

These funnels should be created manually in the PostHog UI under
**Product Analytics → Funnels**.

---

## 1. Acquisition Funnel — Landing to First DNA Score

**Goal:** Measure drop-off from first visit through signup to first analysis.

| Step | Event                    | Description                          |
| ---- | ------------------------ | ------------------------------------ |
| 1    | `$pageview` (path = `/`) | User lands on homepage               |
| 2    | `user_signed_up`         | User completes registration          |
| 3    | `dna_score_generated`    | User generates their first DNA score |

**Recommended settings:**

- Conversion window: **7 days**
- Aggregation: **Unique users**
- Filters: `environment = production`

**Insight to create:** Bar chart showing % conversion at each step.

---

## 2. Activation Funnel — DNA Score to Report Purchase

**Goal:** Measure how many users who get a DNA score go on to purchase a report.

| Step | Event                             | Description                   |
| ---- | --------------------------------- | ----------------------------- |
| 1    | `dna_score_generated`             | DNA score computed            |
| 2    | `swarm_analysis_started`          | User initiates swarm analysis |
| 3    | `swarm_analysis_completed`        | Swarm analysis finishes       |
| 4    | `advisor_report_checkout_started` | User clicks checkout          |
| 5    | `advisor_report_purchased`        | Payment confirmed             |

**Recommended settings:**

- Conversion window: **14 days**
- Aggregation: **Unique users**
- Breakdown by: `is_authenticated` (on `dna_score_generated`)

---

## 3. Retention Funnel — Return Visit to New Report

**Goal:** Understand re-engagement and repeat purchase behaviour.

| Step | Event                                    | Description                        |
| ---- | ---------------------------------------- | ---------------------------------- |
| 1    | `$pageview` (path contains `/dashboard`) | Returning user visits dashboard    |
| 2    | `csv_upload_started`                     | User starts a new portfolio upload |
| 3    | `dna_score_generated`                    | New DNA score generated            |
| 4    | `advisor_report_purchased`               | Repeat purchase                    |

**Recommended settings:**

- Conversion window: **30 days**
- Aggregation: **Unique users**
- Filter: Exclude `user_signed_up` in the same session (to isolate returning users)

---

## Key Events Reference

| Event                             | When                        | Key Properties                                                           |
| --------------------------------- | --------------------------- | ------------------------------------------------------------------------ |
| `user_signed_up`                  | Registration complete       | `method: google\|email`                                                  |
| `user_logged_in`                  | Session started             | `method: google\|email\|magic`                                           |
| `csv_upload_started`              | File selected and submitted | —                                                                        |
| `csv_upload_completed`            | File parsed successfully    | `ticker_count`, `file_size_kb`                                           |
| `csv_upload_failed`               | Parse or API error          | `error_reason`                                                           |
| `dna_score_generated`             | Analysis returned           | `score`, `risk_level`, `ticker_count`, `is_authenticated`, `duration_ms` |
| `swarm_analysis_started`          | Swarm fetch begins          | `portfolio_id`                                                           |
| `swarm_analysis_completed`        | Swarm fetch succeeds        | `report_id`, `duration_ms`                                               |
| `advisor_report_checkout_started` | Checkout button clicked     | `plan_type`, `price`                                                     |
| `advisor_report_purchased`        | Payment confirmed           | `plan_type`, `price`, `report_id`                                        |
| `advisor_report_downloaded`       | PDF opened                  | `report_id`                                                              |
| `onboarding_completed`            | Onboarding flow finished    | `steps_skipped`                                                          |
| `referral_link_shared`            | Referral shared             | `channel: copy\|twitter\|whatsapp`                                       |

All events also include: `session_id`, `environment`, `user_id` (when authenticated).
