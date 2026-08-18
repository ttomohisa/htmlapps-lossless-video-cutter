# LLM workflow notes

When modifying this app:

1. Read `AGENTS.md` and `APP_SPEC.md` first.
2. Keep the generated application runtime network-free.
3. Do not replace WORKERFS input with a full `arrayBuffer()` copy.
4. Do not add encoders/decoders merely to make frame-accurate cuts; that would change the product's lossless stream-copy contract.
5. Keep Builder dependency versions explicit and release-based.
6. Run `scripts/check-repository.ps1` before release.
