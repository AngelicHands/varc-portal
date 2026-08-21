---
name: Fix backup worker config
overview: The live backup worker pod is missing all config/secrets env vars because an older manifest was applied. Re-apply the current manifest and bump the image tag to match the portal.
todos:
  - id: bump-image
    content: Bump image tag in backup-worker.yaml from v0.0.34 to v0.0.36
    status: completed
  - id: apply-manifest
    content: Apply backup-worker.yaml to the cluster and verify worker logs show job polling
    status: completed
isProject: false
---

# Fix Backup Worker — Missing envFrom + Stale Image

## Root Cause

The cluster deployment `varc-portal-backup-worker` has only `BACKUP_WORKER_ENABLED=1` injected — no `envFrom` for the configmap or secrets. The worker boots Next.js successfully but cannot connect to MongoDB, S3, or mail because all those env vars are absent.

The repo's [`deploy/k8s/backup-worker.yaml`](deploy/k8s/backup-worker.yaml) already has the correct `envFrom` blocks, but a stale version was deployed. Additionally the worker image is pinned to `v0.0.34` while the portal runs `v0.0.36`.

## Changes Required

- [`deploy/k8s/backup-worker.yaml`](deploy/k8s/backup-worker.yaml) — bump `image` tag from `v0.0.34` → `v0.0.36` to match the portal
- Re-apply the manifest to the cluster with `kubectl apply`

The `envFrom` blocks are already correct in the file:

```yaml
envFrom:
  - secretRef:
      name: varc-portal-secrets
  - configMapRef:
      name: varc-portal-config
```

## Apply Steps

1. Update image tag in `backup-worker.yaml`
2. Apply: `kubectl apply -f deploy/k8s/backup-worker.yaml --kubeconfig ...`
3. Verify the new pod has all env vars and worker logs show polling activity
