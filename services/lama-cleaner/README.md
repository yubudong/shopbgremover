# ShopBG private LaMa cleaner

This directory contains ShopBG Remover's independent, CPU-only LaMa service.
It is not a public API and is not deployed in phase 1.

Security boundaries:

- `/v1/inpaint` requires a timestamped HMAC signature over the task ID and
  SHA-256 digests of both request bodies.
- The service rejects images larger than 10 MB, a longest side above 2048 px,
  more than 4,194,304 decoded pixels, mismatched masks, empty masks, and masks
  covering more than 85% of the image.
- PNG is the only output format. RGB changes are limited to the dilated blend
  mask and the original alpha channel is preserved exactly.
- Production must additionally place this service behind Cloudflare Tunnel and
  Access. Do not publish port 8000 directly.

The required secret is `SHOPBG_INPAINT_HMAC_SECRET` and must contain at least
32 UTF-8 bytes. The caller signs:

```text
shopbg-inpaint-v1
<task id>
<unix timestamp>
<sha256 image body>
<sha256 mask body>
```

The Docker image expects the LaMa checkpoint under `TORCH_HOME=/models`.
Phase 2 will define the private model volume, Tunnel, Access, capacity test,
and deployment procedure before any server is changed.
