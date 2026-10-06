#!/bin/bash
# The files publish packs. A new public file has to be added here in the same commit.
set -euo pipefail

root="${1:-.}"
cd "$root"

expected=(
  assets/brand/favicon.svg
  ideas/doorman.md
  ideas/hallway.md
  ideas/hermes-imessage.md
  index.html
  index.json
  llms.txt
  skills/doorman/SKILL.md
  src/app.css
  src/app.js
)

mapfile -t found < <(find assets ideas skills src index.html index.json llms.txt \( -type f -o -type l \) | sort)

if [[ "${#found[@]}" -ne "${#expected[@]}" ]]; then
  echo "static sanity: expected ${#expected[@]} files, found ${#found[@]}" >&2
  printf '%s\n' "${found[@]}" >&2
  exit 1
fi

i=0
for path in "${expected[@]}"; do
  if [[ "${found[$i]}" != "$path" ]]; then
    echo "static sanity: file list mismatch at ${path} (found ${found[$i]})" >&2
    exit 1
  fi
  if [[ -L "$path" ]]; then
    echo "static sanity: refusing symlink ${path}" >&2
    exit 1
  fi
  if [[ ! -f "$path" || ! -s "$path" ]]; then
    echo "static sanity: empty or missing ${path}" >&2
    exit 1
  fi
  i=$((i + 1))
done

grep -q 'rel="canonical" href="https://ideasos.io/"' index.html
grep -q 'ideas_os' index.html
echo "static sanity ok (${#expected[@]} files)"
