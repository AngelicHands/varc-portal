---
name: Namespace varc manifests
overview: "Add explicit `namespace: varc` to all Argo-synced Kubernetes resources so kubectl and Argo both target the varc namespace consistently."
todos:
  - id: ns-manifests
    content: "Add metadata.namespace: varc to deployment, service, ingress, configmap"
    status: completed
isProject: false
---

# Ensure `varc` namespace on k8s manifests

Argo CD already sets `destination.namespace: varc` in [`deploy/argocd/application.yaml`](deploy/argocd/application.yaml), but the resources under [`deploy/k8s/`](deploy/k8s/) have no `metadata.namespace`. That means a plain `kubectl apply -f deploy/k8s` would land in the current/default namespace.

## Change

Add `namespace: varc` under `metadata` for:

- [`deploy/k8s/deployment.yaml`](deploy/k8s/deployment.yaml)
- [`deploy/k8s/service.yaml`](deploy/k8s/service.yaml)
- [`deploy/k8s/ingress.yaml`](deploy/k8s/ingress.yaml)
- [`deploy/k8s/configmap.yaml`](deploy/k8s/configmap.yaml)

[`deploy/docs/secret.example.yaml`](deploy/docs/secret.example.yaml) already has `namespace: varc` — no change.

Argo `CreateNamespace=true` remains so the namespace is created on first sync if missing.
