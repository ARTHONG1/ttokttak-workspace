/**
 * Whether the app offers "Send feedback" (Help menu and Settings → About).
 *
 * Off: the survey this entry opened belonged to the upstream maintainer, and this
 * product has no survey of its own yet. Feedback goes to the repository's issues
 * (PRODUCT_CONTACT_URL). To turn it on, publish a form, put its address in
 * FEEDBACK_SURVEY_URL (main/feedback.ts) and set this to true.
 */
export const FEEDBACK_SURVEY_ENABLED: boolean = false
