# Plan - Fix Date and Day Logic

The user reported that the app is showing incorrect dates (e.g., showing the 20th when it's the 17th) and incorrect days of the week (showing Thursday when it's Monday). I will fix the date calculation logic to ensure it correctly identifies "today" and projects the schedule based on the actual current date.

## Proposed Changes

### Logic Fixes
- **Correct Current Date:** Ensure `new Date()` is correctly handled in the current timezone and environment.
- **Cleaning Day Logic:** Refine `getMostRecentCleaningDay` to accurately find the last scheduled date (Monday/Thursday) relative to today.
- **Future Schedule Projection:**
    - Fix the starting point for `futureSchedule`. If today is a cleaning day, it should be the first item.
    - Ensure the logic for "next" cleaning day correctly skips to the next Monday or Thursday.
    - Verify that room rotation follows the established sequence (6, 7, 8, 9, 10).

### UI Adjustments
- Ensure the "Hoje" (Today) badge only appears on actual cleaning days (Mondays and Thursdays).
- Standardize the date formatting to prevent discrepancies.

## Technical Details
- The logic in `getMostRecentCleaningDay` was using a `while` loop that might be drifting if the timezone isn't handled correctly or if the starting `d` isn't reset properly.
- `getFutureSchedule` start point was problematic: it was using `scheduledDay` which is "most recent", but if today is a cleaning day and not yet finished, it should start with "today".
- I will simplify the "find next cleaning day" logic using a helper function to avoid redundancy.
