# Kubernetes deployment

How we'd run this in prod. Image: multi-stage Dockerfile → `node server.js` on port 3000.

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

**Assumptions for 10k concurrent users**

| Input | Value |
|-------|-------|
| In-flight searches per user | ~1 |
| Avg search duration | ~2s |
| Capacity per pod | ~250 in-flight |
| Peak replicas | ~40 |

Search is I/O-bound. CPU alone is a poor HPA signal. Target 60% CPU *and* a custom `http_inflight_requests` metric (~100/pod) if we export it from the app.

HPA: min 4, max 40. Scale up fast (30s), scale down slow (5 min stabilization) to avoid flapping on traffic spikes.

| Replicas | ~Concurrent users (at 250 req/pod) |
|----------|-------------------------------------|
| 8 | 2k |
| 16 | 4k |
| 24 | 6k |
| 32 | 8k |
| 40 | 10k |

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

Pods are stateless. Rolling deploy with `maxUnavailable: 0` so capacity doesn't drop mid-release. In-memory cache is lost on restart; acceptable until Redis is live.

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
  maxReplicas: 40
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
LLM_PARSE_TIMEOUT_MS: "12000"
TRIP_SEARCH_CACHE_TTL_MS: "300000"
OPENAI_MODEL: "gpt-4o-mini"
CLIENT_MAX_FLIGHT_OFFERS: "50"
CLIENT_MAX_HOTEL_OFFERS: "30"
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

## Redis cutover

Dev uses in-process `Map` for query cache and result store. Multi-replica prod needs Redis:

| Store | Key pattern | TTL |
|-------|-------------|-----|
| Query cache | `trip:cache:{sha256}` | `TRIP_SEARCH_CACHE_TTL_MS` (5 min) |
| Result store | `trip:result:{requestId}` | 1 hour |
| Refresh lock | `trip:lock:{sha256}` | 30s |

Stale-while-revalidate refresh locks need `SET NX EX` (or Redlock) so only one pod refreshes per cache key.

If Redis goes down, searches still work; we just lose cache hits and `GET /api/trips/{id}` across pods. Run Redis Multi-AZ with automatic failover.

---

## CI/CD

```
push → test + lint → docker build → trivy scan → ECR push → helm upgrade → smoke /api/health
```

Gates: Vitest green, standalone build succeeds, no critical CVEs in the image, readiness probe passes after deploy.

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
| Region loss | Full outage | Multi-region is future work |
