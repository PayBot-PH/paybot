# Deployment and CI Fixes

The goal is to resolve the errors in GitHub Actions by simplifying the deployment workflows, correcting file paths, and ensuring toolchain consistency.

## Proposed Changes

### GitHub Actions Workflows

#### [deploy-railway.yml](file:///C:/Users/Admin/Desktop/paybot/.github/workflows/deploy-railway.yml)

- Remove manual frontend build and pnpm installation.
- Let the `Dockerfile` handle the multi-stage build (frontend + backend).
- Simplify Railway deployment to use the repository directly rather than an intermediate GHCR image.

#### [android-release.yml](file:///C:/Users/Admin/Desktop/paybot/.github/workflows/android-release.yml)

- Correct paths to point to `mobile/android/android/` where the `gradlew` script and native project reside.
- Update the patch script for `build.gradle` to use the correct nested path.
- Ensure it uses the primary `package.json` in `mobile/android/`.

#### [ci.yml](file:///C:/Users/Admin/Desktop/paybot/.github/workflows/ci.yml)

- Ensure backend tests are run correctly in a Python 3.11 environment.

---

### Backend Fixes

#### [events.py](file:///C:/Users/Admin/Desktop/paybot/backend/routers/events.py)

- Filter events in `get_recent_events` and `event_stream` by `current_user.id` to ensure users only see their own notifications.

#### [disbursements.py](file:///C:/Users/Admin/Desktop/paybot/backend/routers/disbursements.py)

- Restrict access to `query_disbursementss_all` to Super Admins only.

#### [subscriptions.py](file:///C:/Users/Admin/Desktop/paybot/backend/routers/subscriptions.py)

- Restrict access to `query_subscriptionss_all` to Super Admins only.

#### [customers.py](file:///C:/Users/Admin/Desktop/paybot/backend/routers/customers.py)

- Restrict access to `query_customerss_all` to Super Admins only.

---

## Verification Plan

### Manual Verification
- **GitHub Actions**: Trigger the workflows manually and verify they complete successfully without errors.
- **Data Isolation**: Log in with different users and verify that transactions and notifications are correctly isolated.
- **Admin Access**: Verify that non-admin users cannot access the `/all` endpoints for disbursements, subscriptions, and customers.
