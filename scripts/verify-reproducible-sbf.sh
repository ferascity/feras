#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="$repo_root/programs/feras_market/Cargo.toml"
work_root="$(mktemp -d "${TMPDIR:-/tmp}/feras-sbf-repro.XXXXXX")"

cleanup() {
  rm -rf "$work_root"
}
trap cleanup EXIT

build_program() {
  local label="$1"
  local target_dir="$work_root/target-$label"
  local output_dir="$work_root/output-$label"

  mkdir -p "$output_dir"
  if ! env \
    NO_DNA=1 \
    SOURCE_DATE_EPOCH=1 \
    TZ=UTC \
    LC_ALL=C \
    CARGO_TARGET_DIR="$target_dir" \
      cargo-build-sbf \
      --offline \
      --manifest-path "$manifest" \
      --sbf-out-dir "$output_dir" >&2; then
    return 1
  fi

  printf '%s\n' "$output_dir/feras_market.so"
}

binary_a="$(build_program a)"
binary_b="$(build_program b)"

read -r hash_a _ < <(sha256sum "$binary_a")
read -r hash_b _ < <(sha256sum "$binary_b")
size_a="$(stat -c '%s' "$binary_a")"
size_b="$(stat -c '%s' "$binary_b")"

if [[ "$hash_a" != "$hash_b" || "$size_a" != "$size_b" ]]; then
  printf 'SBF reproducibility check failed.\n' >&2
  printf 'build-a sha256=%s bytes=%s\n' "$hash_a" "$size_a" >&2
  printf 'build-b sha256=%s bytes=%s\n' "$hash_b" "$size_b" >&2
  exit 1
fi

printf 'SBF reproducibility verified.\n'
printf 'sha256=%s\n' "$hash_a"
printf 'bytes=%s\n' "$size_a"
