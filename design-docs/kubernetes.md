# Kubernetes deployment

Production topology for the trip search service. The YAML below is **reference design** — example manifests for review, not checked into a `k8s/` folder.

Image: multi-stage Dockerfile → `node server.js` on port 3000.

---

## Topology

```
Route 53 → ALB (TLS, idle timeout 30s) → Service :3000 → Deployment (N pods)
                                                              ↓
                                                         Redis (ElastiCache)
                                                              ↓
                                                    Sabre / Amadeus / HotelBeds / OpenAI
```

- **Namespace:** `ziarah-search`
- **ConfigMap:** non-secret env (timeouts, TTL, model name)
- **Secrets** (or External Secrets Operator): provider keys and `REDIS_URL`

This deployment is the **trip search module only**. Chat shell, auth, bookings, and payments would live in other services in a full Ziarah platform.

---

## Scaling (plain English)

**What we're sizing for:** 10,000 searches running at the same time (in-flight), not 10,000 total users.

Most app users are reading results, typing, or comparing — not actively waiting on a search. During peak, roughly **8–15%** of concurrent app sessions have an open search request.

```
concurrent app users ≈ in-flight searches ÷ active-search ratio
```

| Peak in-flight searches | Implied whole-app concurrent users |
|------------------------|-------------------------------------|
| **10k** | **~67k–125k** (at 8–15% ratio) |

### Per-pod capacity

Search is **I/O-bound** (waiting on Sabre/Amadeus/HotelBeds), not CPU-bound. CPU alone is a poor scaling signal.

| Input | Value | How we got it |
|-------|-------|---------------|
| Avg search duration | ~2s | Blended cache hit/miss |
| Capacity per pod | ~100 in-flight | Measured with `load/capacity.js` on 512Mi / 1 CPU |
| Peak replicas needed | ~100 | 10k ÷ 100 |

**HPA settings:** min 4, max 100 replicas. Scale up fast (30s), scale down slow (5 min) to avoid flapping.

| Replicas | ~In-flight searches | ~Whole-app users (at 10% active-search) |
|----------|---------------------|----------------------------------------|
| 10 | 1k | ~10k |
| 25 | 2.5k | ~25k |
| 50 | 5k | ~50k |
| 75 | 7.5k | ~75k |
| 100 | 10k | ~100k |

**Caveats:** Per-pod throughput is also bounded by memory (offer payload size), outbound connection pools, upstream latency, and provider rate limits — often before Kubernetes runs out of pods. Run `load/capacity.js` on hardware matching prod to validate the ~100/pod assumption.

The `http_inflight_requests` HPA metric in the example below is a **planned** custom metric — not implemented in the app yet. See [observability.md](./observability.md).

---

## Deployment (example)

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

Pods are stateless. `maxUnavailable: 0` keeps capacity during rolling deploys. Cache and results live in Redis, not pod memory.

---

## Service + HPA (example)

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

## Ingress (ALB example)

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

TLS terminates at the ALB. Idle timeout 30s — SSE streams keep the connection open; individual events arrive well within that for normal searches.

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

Redis is a **required dependency** — local dev, Docker Compose, and K8s all set `REDIS_URL`. Code: `src/lib/storage/redis.ts` + `redis-keys.ts`.

| Store | Key pattern | TTL |
|-------|-------------|-----|
| Query cache | `trip:cache:{sha256}` | 5 min logical; Redis PX = 3× `TRIP_SEARCH_CACHE_TTL_MS` for stale headroom |
| Result store | `trip:result:{requestId}` | 1 hour (`TRIP_RESULT_TTL_SECONDS`) |
| Refresh lock | `trip:lock:{sha256}` | 30s (`SET NX EX`) |

Stale-while-revalidate uses distributed locks so only one pod refreshes per cache key.

`GET /api/health` pings Redis — 503 when unreachable, so readiness routes traffic away from unhealthy pods.

If Redis goes down entirely, live searches still work; cache hits and cross-pod `GET /api/trips/{id}` are lost. Run Redis Multi-AZ with automatic failover in production.

---

## CI/CD (target pipeline)

```
push → test + lint → docker build → trivy scan → ECR push → helm upgrade → k6 smoke + /api/health
```

Gates: Vitest green (635+ tests, 80% coverage), standalone build succeeds, no critical CVEs, `load/smoke.js` passes, readiness probe passes after deploy.

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
| Region loss | Full outage | Single-region deployment; DR out of scope for v1 |
