# Kubernetes deployment

Production topology for the trip search service. Image: multi-stage Dockerfile → `node server.js` on port 3000.

---

## Topology

```
Route 53 → ALB (TLS, idle timeout 30s) → Service :3000 → Deployment (N pods)
                                                              ↓
                                                         Redis (ElastiCache)
                                                              ↓
                                                    Sabre / Amadeus / HotelBeds / OpenAI
```

Namespace: `ziarah-search`. ConfigMap for non-secret env; Secrets (or External Secrets Operator) for keys and `REDIS_URL`.

---

## Scaling

This deployment is the **trip search module** only — chat shell, auth, bookings, and payments run in other services. Peak load here is **in-flight searches** (concurrent `/api/trips/search*` requests), not total app concurrency.

In a conversational trip planner, most concurrent app users are reading results, typing, or comparing offers — not waiting on a search. During peak, roughly **8–15%** of whole-app sessions have an active search in flight.

```text
concurrent app users ≈ in-flight searches ÷ active-search ratio
```

| Peak target (this module) | Implied whole-app concurrent users |
|---------------------------|-------------------------------------|
| **10k in-flight searches** | **~67k–125k** (at 8–15% active-search ratio) |

**Capacity model — 10k in-flight searches**

| Input | Value | Notes |
|-------|-------|-------|
| Peak in-flight searches | 10k | Module-local; one open search per active session |
| Active-search ratio (whole app) | 8–15% | Browse/chat time between searches |
| Avg search duration | ~2s | Blended hit/miss; p95 miss budget is 3s |
| Capacity per pod | ~100 in-flight | On 512Mi / 1 CPU — measured via `load/capacity.js` |
| HPA scale signal | ~100 in-flight/pod | Custom `http_inflight_requests` (see HPA manifest) |
| Peak replicas | ~100 | 10k ÷ 100; provider rate limits may bind before pod count |

Search is I/O-bound. CPU alone is a poor HPA signal. Target 60% CPU *and* `http_inflight_requests` (~100/pod).

HPA: min 4, max 100. Scale up fast (30s), scale down slow (5 min stabilization) to avoid flapping on traffic spikes.

| Replicas | ~In-flight searches (at 100/pod) | ~Whole-app users (at 10% active-search) |
|----------|-----------------------------------|------------------------------------------|
| 10 | 1k | ~10k |
| 25 | 2.5k | ~25k |
| 50 | 5k | ~50k |
| 75 | 7.5k | ~75k |
| 100 | 10k | ~100k |

**Capacity notes:** Per-pod throughput is bounded by memory (offer payload size), outbound connection pools, upstream latency, and provider rate limits — often before Kubernetes runs out of pods. `load/capacity.js` step-ramps VUs on 512Mi / 1 CPU hardware to confirm the ~100 in-flight/pod assumption and tune HPA targets.

---

## Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ziarah-trip-search
  namespace: ziarah-search
spec:
  replicas: 8
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxUnavailable: 0
      maxSurge: 25%
  template:
    metadata:
      labels:
        app: ziarah-trip-search
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/port: "3000"
        prometheus.io/path: "/api/metrics"
    spec:
      serviceAccountName: ziarah-trip-search
      securityContext:
        runAsNonRoot: true
        runAsUser: 1001
      containers:
        - name: app
          image: ziarah/trip-search:latest
          ports:
            - name: http
              containerPort: 3000
          envFrom:
            - configMapRef:
                name: trip-search-config
            - secretRef:
                name: trip-search-secrets
          env:
            - name: REDIS_URL
              valueFrom:
                secretKeyRef:
                  name: trip-search-secrets
                  key: REDIS_URL
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 1000m
              memory: 512Mi
          livenessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 10
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /api/health
              port: http
            initialDelaySeconds: 5
            periodSeconds: 10
          startupProbe:
            httpGet:
              path: /api/health
              port: http
            failureThreshold: 30
            periodSeconds: 5
```

Pods are stateless. Rolling deploy with `maxUnavailable: 0` so capacity doesn't drop mid-release. Query cache and result store live in Redis (ElastiCache), not pod memory — restarts don't evict cache entries.

---

## Service + HPA

```yaml
apiVersion: v1
kind: Service
metadata:
  name: ziarah-trip-search
  namespace: ziarah-search
spec:
  type: ClusterIP
  selector:
    app: ziarah-trip-search
  ports:
    - port: 80
      targetPort: http
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: trip-search-hpa
  namespace: ziarah-search
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: ziarah-trip-search
  minReplicas: 4
  maxReplicas: 100
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
    scaleDown:
      stabilizationWindowSeconds: 300
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 60
    - type: Pods
      pods:
        metric:
          name: http_inflight_requests
        target:
          type: AverageValue
          averageValue: "100"
```

---

## Ingress (ALB)

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ziarah-trip-search
  namespace: ziarah-search
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
    alb.ingress.kubernetes.io/listen-ports: '[{"HTTPS":443}]'
    alb.ingress.kubernetes.io/healthcheck-path: /api/health
    alb.ingress.kubernetes.io/load-balancer-attributes: idle_timeout.timeout_seconds=30
spec:
  ingressClassName: alb
  rules:
    - host: search.ziarah.ai
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: ziarah-trip-search
                port:
                  number: 80
```

TLS terminates at the ALB. Set idle timeout to 30s; SSE streams need the connection kept open but individual events arrive well within that for normal searches.

---

## Config

**ConfigMap (`trip-search-config`)**

```yaml
NODE_ENV: "production"
MOCK_PROVIDERS: "false"
MOCK_LLM: "false"
PROVIDER_TIMEOUT_MS: "2500"
GLOBAL_TIMEOUT_MS: "3000"
SYNC_LLM_PARSE_TIMEOUT_MS: "800"
LLM_PARSE_TIMEOUT_MS: "12000"
TRIP_SEARCH_CACHE_TTL_MS: "300000"
OPENAI_MODEL: "gpt-4o-mini"
OPENAI_PROMPT_CACHE_KEY: "ziarah-trip-parse"
CLIENT_MAX_FLIGHT_OFFERS: "50"
CLIENT_MAX_HOTEL_OFFERS: "30"
LOG_LEVEL: "info"
SERVICE_NAME: "ziarah-trip-search"
```

**Secrets (`trip-search-secrets`)**

| Key | Source |
|-----|--------|
| `OPENAI_API_KEY` | OpenAI |
| `SABRE_CLIENT_ID`, `SABRE_CLIENT_SECRET`, `SABRE_PCC` | Sabre dev portal |
| `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` | Amadeus for Developers |
| `HOTELBEDS_API_KEY`, `HOTELBEDS_API_SECRET` | HotelBeds |
| `REDIS_URL` | ElastiCache endpoint |

Use External Secrets Operator or AWS Secrets Manager CSI. Don't commit secrets to git.

---

## Redis

Redis is a **required dependency** — local dev, Docker Compose, and K8s all set `REDIS_URL`. Implementation: `src/lib/storage/redis.ts` + `redis-keys.ts`.

| Store | Key pattern | TTL |
|-------|-------------|-----|
| Query cache | `trip:cache:{sha256}` | 5 min logical; Redis PX = 3× `TRIP_SEARCH_CACHE_TTL_MS` for stale headroom |
| Result store | `trip:result:{requestId}` | 1 hour (`TRIP_RESULT_TTL_SECONDS`) |
| Refresh lock | `trip:lock:{sha256}` | 30s (`SET NX EX`) |

Stale-while-revalidate uses distributed locks so only one pod refreshes per cache key; concurrent waiters poll for a fresh entry.

`GET /api/health` pings Redis and returns 503 when unreachable — readiness fails so traffic routes to healthy pods only.

If Redis goes down, live searches still work; cache hits and cross-pod `GET /api/trips/{id}` are lost. Run Redis Multi-AZ with automatic failover.

---

## CI/CD

```
push → test + lint → docker build → trivy scan → ECR push → helm upgrade → k6 smoke + /api/health
```

Gates: Vitest green (635+ tests, 80% coverage), standalone build succeeds, no critical CVEs in the image, `load/smoke.js` passes, readiness probe passes after deploy.

---

## Security

| Control | How |
|---------|-----|
| TLS | ALB termination |
| Pod egress | Restrict to provider API CIDRs + OpenAI + Redis |
| Secrets | K8s Secrets / ESO, rotate quarterly |
| Rate limit | WAF or API gateway, ~100 req/min/IP in prod |
| Container user | `USER nextjs` (uid 1001) in Dockerfile |

---

## Failure scenarios

| Event | Impact | Mitigation |
|-------|--------|------------|
| Single pod crash | None | LB routes around; K8s restarts |
| AZ loss | Reduced capacity | Multi-AZ node groups, PDB `minAvailable: 75%` |
| Redis down | Cache misses only | Live search still works |
| All GDS down | 503s | Serve stale cache if available; status page |
| Region loss | Full outage | Single-region deployment; DR is out of scope for v1 |
