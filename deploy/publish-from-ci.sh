#!/bin/bash
# Pack the static site, upload it to the deploy user's incoming directory, and
# run the root activator with no arguments. GitHub Actions is the only caller.
set -euo pipefail
shopt -s inherit_errexit 2>/dev/null || true

readonly SCRIPT_NAME="${BASH_SOURCE[0]:-$0}"
[[ -n "$SCRIPT_NAME" ]] || { echo "publish: script name unset" >&2; exit 1; }

die() {
  echo "publish: $*" >&2
  exit 1
}

PACK_TOPS=(index.html index.json llms.txt src ideas skills assets)

pack_tar() {
  local tar_path="$1"
  local src="$2"
  local stage item linked
  stage=$(mktemp -d)
  for item in "${PACK_TOPS[@]}"; do
    [[ -e "${src}/${item}" && ! -L "${src}/${item}" ]] || die "missing ${src}/${item}"
    cp -a "${src}/${item}" "${stage}/"
  done
  linked=$(find "$stage" -type l -print -quit || true)
  if [[ -n "$linked" ]]; then
    rm -rf -- "$stage"
    die "refusing symlink in the pack: ${linked}"
  fi
  tar --format=ustar --owner=0 --group=0 --numeric-owner \
    -cf "$tar_path" -C "$stage" "${PACK_TOPS[@]}"
  rm -rf -- "$stage"
}

write_sidecar() {
  local tar_path="$1"
  local sha="$2"
  local dest="$3"
  local digest
  digest=$(sha256sum "$tar_path" | awk '{print $1}')
  [[ "$digest" =~ ^[0-9a-f]{64}$ ]] || die "sha256sum did not return a digest"
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "git sha must be 40 hex chars"
  printf '%s\n%s\n' "$digest" "$sha" > "$dest"
}

check_pack() {
  local tar_path="$1"
  local side_path="$2"
  local sha="$3"
  python3 - "$tar_path" "$side_path" "$sha" <<'PY'
import hashlib
import sys
import tarfile

tar_path, side_path, gitsha = sys.argv[1], sys.argv[2], sys.argv[3]
expected = {
    "assets/brand/favicon.svg",
    "ideas/doorman.md",
    "ideas/hallway.md",
    "ideas/hermes-imessage.md",
    "index.html",
    "index.json",
    "llms.txt",
    "skills/doorman/SKILL.md",
    "src/app.css",
    "src/app.js",
}

def fail(msg):
    sys.stderr.write(f"publish: {msg}\n")
    sys.exit(1)

raw = open(side_path, "rb").read()
if not raw.endswith(b"\n") or raw.endswith(b"\n\n"):
    fail("sidecar must be exactly two lines")
lines = raw[:-1].split(b"\n")
if len(lines) != 2:
    fail("sidecar must be exactly two lines")
digest, stamped = lines
if digest.decode("ascii") != hashlib.sha256(open(tar_path, "rb").read()).hexdigest():
    fail("sidecar digest does not match the tar")
if stamped.decode("ascii") != gitsha:
    fail("sidecar git sha does not match")

files = set()
with tarfile.open(tar_path, "r:") as tf:
    for member in tf.getmembers():
        name = member.name[2:] if member.name.startswith("./") else member.name
        if name.endswith("/"):
            name = name[:-1]
        if name.startswith("/") or "\\" in name or any(part in ("", ".", "..") for part in name.split("/")):
            fail(f"unsafe member {member.name}")
        if member.issym() or member.islnk() or member.linkname:
            fail(f"link member {member.name}")
        if member.isfile():
            files.add(name)
        elif not member.isdir():
            fail(f"special member {member.name}")
if files != expected:
    fail(f"packed files {sorted(files)} != {sorted(expected)}")
PY
}

self_test() {
  [[ -f index.html && -f deploy/static-sanity.sh ]] || die "run self-test from the repository root"
  bash deploy/static-sanity.sh
  local work sha
  work=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf -- $(printf '%q' "$work")" RETURN
  sha=$(git rev-parse HEAD)
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "HEAD is not a full git sha"
  pack_tar "${work}/release.tar" "$PWD"
  write_sidecar "${work}/release.tar" "$sha" "${work}/release.tar.sha256"
  check_pack "${work}/release.tar" "${work}/release.tar.sha256" "$sha"
  echo "publish self-test ok (script=${SCRIPT_NAME})" >&2
}

public_code() {
  local path="$1"
  local code
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 "https://ideasos.io${path}") || return 1
  code=$(printf '%s' "$code" | tr -d '[:space:]')
  [[ "$code" == "200" ]]
}

publish_release() {
  : "${VPS_HOST:?VPS_HOST is required}"
  : "${VPS_USER:?VPS_USER is required}"
  : "${VPS_SSH_KEY:?VPS_SSH_KEY is required}"
  : "${VPS_SSH_KNOWN_HOSTS:?VPS_SSH_KNOWN_HOSTS is required}"

  local port="${VPS_SSH_PORT:-22}"
  if [[ -z "$port" ]]; then
    port=22
  fi
  [[ "$port" =~ ^[0-9]+$ ]] || die "VPS_SSH_PORT must be numeric"

  [[ -f index.html && -f deploy/static-sanity.sh ]] || die "run publish from the repository root"
  bash deploy/static-sanity.sh

  local sha
  sha=$(git rev-parse HEAD)
  [[ "$sha" =~ ^[0-9a-f]{40}$ ]] || die "HEAD is not a full git sha"

  umask 077
  mkdir -p "${HOME}/.ssh"
  local key_file="${HOME}/.ssh/ideasos_deploy_key"
  local known_file="${HOME}/.ssh/ideasos_known_hosts"
  printf '%s\n' "$VPS_SSH_KEY" > "$key_file"
  chmod 600 "$key_file"
  printf '%s\n' "$VPS_SSH_KNOWN_HOSTS" > "$known_file"
  chmod 600 "$known_file"

  local -a ssh_opts=(
    -T
    -i "$key_file"
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_file"
    -o IdentitiesOnly=yes
    -o ServerAliveInterval=30
    -o ServerAliveCountMax=4
    -o ConnectTimeout=20
    -p "$port"
  )
  local -a scp_opts=(
    -i "$key_file"
    -o StrictHostKeyChecking=yes
    -o UserKnownHostsFile="$known_file"
    -o IdentitiesOnly=yes
    -o ConnectTimeout=20
    -P "$port"
  )
  local remote="${VPS_USER}@${VPS_HOST}"
  local work
  work=$(mktemp -d)
  # shellcheck disable=SC2064
  trap "rm -rf -- $(printf '%q' "$work")" RETURN
  pack_tar "${work}/release.tar" "$PWD"
  write_sidecar "${work}/release.tar" "$sha" "${work}/release.tar.sha256"
  check_pack "${work}/release.tar" "${work}/release.tar.sha256" "$sha"

  scp "${scp_opts[@]}" "${work}/release.tar.sha256" "${remote}:/var/www/ideasos.io/incoming/release.tar.sha256.partial"
  scp "${scp_opts[@]}" "${work}/release.tar" "${remote}:/var/www/ideasos.io/incoming/release.tar.partial"
  ssh "${ssh_opts[@]}" "$remote" -- bash -s <<'EOF'
set -euo pipefail
cd /var/www/ideasos.io/incoming
test -f release.tar.partial
test -f release.tar.sha256.partial
test ! -L release.tar.partial
test ! -L release.tar.sha256.partial
if [[ -d release.tar && ! -L release.tar ]]; then
  echo "publish: release.tar is a directory" >&2
  exit 1
fi
if [[ -d release.tar.sha256 && ! -L release.tar.sha256 ]]; then
  echo "publish: release.tar.sha256 is a directory" >&2
  exit 1
fi
rm -f -- release.tar release.tar.sha256
mv -f -- release.tar.sha256.partial release.tar.sha256
mv -f -- release.tar.partial release.tar
test -f release.tar
test -f release.tar.sha256
test ! -L release.tar
test ! -L release.tar.sha256
EOF

  local status
  set +e
  ssh "${ssh_opts[@]}" "$remote" -- sudo -n /usr/local/sbin/ideasos-activate
  status=$?
  set -e
  if [[ "$status" -ne 0 ]]; then
    echo "publish: activator failed (exit ${status}). If it had already swapped current, it restored the previous link." >&2
    exit "$status"
  fi

  local prev=""
  set +e
  prev=$(ssh "${ssh_opts[@]}" "$remote" -- cat /var/www/ideasos.io/.previous-release)
  set -e
  prev=$(printf '%s' "$prev" | tr -d '\r')
  prev=${prev%%$'\n'*}

  local i ok=0
  for i in 1 2 3; do
    if public_code / && public_code /index.json; then
      ok=1
      break
    fi
    if [[ "$i" -lt 3 ]]; then
      sleep 2
    fi
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "publish: public check failed after the activator returned 0." >&2
    echo "publish: https://ideasos.io/ and https://ideasos.io/index.json must both be HTTP 200." >&2
    echo "publish: this job cannot roll back. sudoers allows only the activator with an empty argument list," >&2
    echo "publish: and the deploy user cannot repoint current. On the server as root, follow deploy/SERVER-SETUP.md." >&2
    echo "publish: previous target: ${prev:-"(see the pre-actions snapshot)"}" >&2
    exit 1
  fi
  echo "publish ok ${sha}" >&2
}

main() {
  local cmd="${1:-}"
  case "$cmd" in
    "")
      publish_release
      ;;
    self-test)
      [[ $# -eq 1 ]] || die "self-test takes no other arguments"
      self_test
      ;;
    *)
      die "usage: publish-from-ci.sh [self-test]"
      ;;
  esac
}

main "$@"
