# Thymatic Health

Thymatic Health is the first AI coach for everyday mental and physical wellbeing—helping with stress, overwhelm, and emotional reset while also checking posture and exercise form—so it can hear how you feel, watch how you move, and guide you in real time with truly personalized support.

## Environment setup

The backend reads the repo-root `.env`. The Next.js frontend prefers `frontend/.env.local`, and now also falls back to the repo-root `.env` so shared local setup works.

For the live session flow, set `SPEECHMATICS_API_KEY` before starting the frontend. If `/api/speechmatics-token` fails, the response body now includes the exact server-side reason.
