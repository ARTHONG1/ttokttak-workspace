# Workflows kept from the upstream project (not run)

GitHub runs only the files in `.github/workflows/`. These came from IeumOffice and stay
here, turned off, until this repository has its own release setup:

- `growth.yml`: hourly snapshot of the upstream repository's download counts, committed to
  `docs/tracking/`. Not used by this product.
- `free-models.yml`: weekly check of OpenRouter's free model list.
- `mac-build.yml`, `windows-build.yml`, `linux-build.yml`: installer builds that attach
  files to a GitHub release. They still look for the upstream file names (`IeumOffice-*`),
  so they fail against this product's `HangulAIWorkbench-*` packages.

To turn one on, fix its names and move it back to `.github/workflows/`.
