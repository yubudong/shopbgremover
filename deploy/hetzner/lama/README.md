# ShopBG LaMa on the existing Hetzner host

This deployment is an explicitly accepted low-traffic pilot. The 8 GB host did
not pass the conservative co-host capacity gate, so the service must remain
private and feature-flagged while it shares the machine with EcomSellerKit.

Safety boundaries:

- The service binds only to `127.0.0.1:18080`; it must never publish port 8000.
- ShopBG has its own container, HMAC secret, model volume, release directory,
  logs, and later Tunnel/Access identity.
- The container is capped at 6 GiB, 4 CPUs, and two concurrent model calls.
- EcomSellerKit is not modified by this compose project.
- A failed x86 capacity probe stops the rollout before Tunnel, Worker, or Pages.
- Public access remains controlled by `off -> admin_free -> public_free`.

Server layout:

```text
/root/shopbgremover/
  releases/<git-sha>/
  current -> releases/<git-sha>
  shared/lama/.env
```

The secret file contains only:

```text
SHOPBG_INPAINT_HMAC_SECRET=<at least 32 random bytes>
```

The model checkpoint lives in the independent Docker volume
`shopbg_lama_models` at `/models/hub/checkpoints/big-lama.pt`. It may be copied
once from the existing EcomSellerKit model volume, but the running services
must not share a writable volume.

Before starting:

1. Confirm the release checkout matches a pushed commit.
2. Confirm the secret file is owned by root with mode `0600`.
3. Confirm the model volume contains `big-lama.pt`.
4. Render the compose configuration and verify the loopback-only port,
   resource limits, read-only root filesystem, and dropped capabilities.
5. Build and start only this compose project.
6. Run the health check, one real signed request, and then the eight-image
   concurrency-two capacity probe.
7. Record peak host/container memory, success count, latency, throughput, and
   whether EcomSellerKit stayed healthy.

Do not add Caddy routing. Tunnel and Access are a later phase after this private
capacity probe.
