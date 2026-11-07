# Workflows kept from the upstream project (not run)

GitHub runs only the files in `.github/workflows/`. These came from ttokttak-workspace and stay
here, turned off, until this repository has its own release setup:

- `growth.yml`: hourly snapshot of the upstream repository's download counts, committed to
  `docs/tracking/`. Not used by this product.
- `free-models.yml`: weekly check of OpenRouter's free model list.
- `linux-build.yml`: the Linux installer build. It still looks for the upstream file names
  (`ttokttak-workspace-*`), so it fails against this product's `HangulAIWorkbench-*` packages.

The Mac and Windows builds were renamed for this product and moved back to
`.github/workflows/` (2026-10-31).

To turn one on, fix its names and move it back to `.github/workflows/`.
