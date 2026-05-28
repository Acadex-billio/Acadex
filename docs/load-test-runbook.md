# Load Test Runbook (3,000 Concurrent Users)

## Objective
Validate that backend API and storage pipeline support at least 3,000 concurrent active users and 3,000+ materials while preserving acceptable latency and error rates.

## Success Targets
- Availability: >= 99.5% over a 30-minute sustained test.
- Error rate (5xx + timeouts): <= 1.0% overall.
- P95 latency:
  - Read APIs (health/list/preview metadata): <= 800 ms.
  - Auth/login/me endpoints: <= 1000 ms.
  - Material download/preview stream initiation: <= 1500 ms.
- Queue health for conversion:
  - LibreOffice queue depth remains below 70% of max size for most of the run.
  - No sustained QUEUE_FULL responses longer than 2 minutes.

## Prerequisites
- Deploy backend on a paid Render tier (free tier is expected to bottleneck and sleep).
- MongoDB Atlas production-sized cluster with monitoring enabled.
- S3 bucket configured and reachable from backend region.
- Production-like dataset:
  - Users: >= 10,000 seeded users.
  - Materials: >= 3,000 documents across reports/presentations/question papers.
- Environment variables configured:
  - API_RATE_LIMIT_MAX tuned for expected concurrency.
  - LIBREOFFICE_QUEUE_CONCURRENCY and LIBREOFFICE_QUEUE_MAX_SIZE tuned.

## Test Profiles
1. Ramp Test (10 min)
- 0 to 3,000 virtual users.
- Validate no startup collapse.

2. Sustained Test (30 min)
- Hold 3,000 concurrent users.
- Mix:
  - 45% list/read-only endpoints.
  - 20% auth/session validation.
  - 20% preview/download initiation.
  - 10% AI queries (if enabled).
  - 5% admin upload/management APIs.

3. Spike Test (5 min x 3)
- 3 bursts from 1,500 to 4,500 users.
- Confirm auto-recovery under burst traffic.

4. Soak Test (2-4 hours)
- 800 to 1,200 concurrent users.
- Validate memory stability, queue behavior, and Mongo connection health.

## Recommended Tools
- k6 for HTTP workload generation.
- MongoDB Atlas metrics dashboard.
- Render metrics and logs.
- CloudWatch/S3 metrics for object read/write rates.

## Core Endpoint Set
- GET /api/health
- POST /api/auth/login
- GET /api/auth/me
- GET /api/candidate/reports
- GET /api/candidate/presentations
- GET /api/candidate/questions
- GET /api/candidate/reports/preview/:filename
- GET /api/candidate/presentations/preview/:filename
- POST /api/ai/chat (if AI enabled)

## Execution Steps
1. Seed data and verify indexes are built.
2. Warm up for 5 minutes at low traffic (200 users).
3. Run Ramp Test and review immediate failures.
4. Run Sustained Test and capture latency/error/throughput.
5. Run Spike Test and verify recovery to steady-state latency.
6. Run Soak Test for memory/queue drift.
7. Compare results against success targets.

## Failure Criteria
- Error rate > 1% for longer than 5 minutes.
- P95 latency exceeds target by > 30% for longer than 5 minutes.
- Repeated DB connection drop events.
- Repeated queue saturation (QUEUE_FULL) without recovery.

## Immediate Tuning Levers
- Increase Render instance size and instance count.
- Increase MongoDB tier and IOPS.
- Raise API_RATE_LIMIT_MAX and UPLOAD_RATE_LIMIT_MAX conservatively.
- Increase LIBREOFFICE_QUEUE_CONCURRENCY only after CPU headroom validation.
- Shift conversion-heavy traffic to asynchronous preview pre-generation jobs.

## Exit Gate for "Market Ready"
- Two consecutive sustained test runs meeting all success targets.
- One successful spike test run with automatic recovery.
- One successful soak test with no memory leak trend.
- Incident playbook ready for queue saturation and DB latency spikes.
