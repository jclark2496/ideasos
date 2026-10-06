# VPS2 setup for GitHub Actions deploys

Do this once, as root, on VPS2 (`2.25.183.70`) before merging a commit that contains `.github/workflows/deploy.yml` to `main`. Push to `main` publishes. This page does not publish a release, and it does not edit Caddy.

The layout is already in place. Caddy serves `/var/www/ideasos.io/current`, and `current` points at a directory under `releases/`. Release contents are `www-data`, directories `755`, files `644`. The parent directory and the symlink are root `755`. Do not migrate or rsync the live tree. Do not chown `/var/www/ideasos.io` or `releases/` to the deploy user.

After this setup, the only publish path is GitHub Actions on `main`. The deploy user can upload a tarball and run one root command with no arguments. Repointing `current` by hand is break-glass, and it is root, not the deploy user.

Activator pin (sha256 of `deploy/server/ideasos-activate`):

```text
dc28128a900d959ad9a6286d876b51904ddd8681449ca2b72c615a638aef1305
```

The copy on the server is not updated by a later site publish. Install a new pin only when that file changes, using the same temp-file steps below. A site-only commit uses the activator already installed.

## 1. Snapshot

Take this before creating the user or writing sudoers. It is the rollback target for the tree that is live today.

```bash
ts=$(date -u +%Y%m%dT%H%M%SZ)
snap=/root/ideasos-pre-actions-$ts
mkdir -p "$snap"
readlink /var/www/ideasos.io/current | tee "$snap/current-target.txt"
ls -la /var/www/ideasos.io | tee "$snap/ls-root.txt"
ls -la /var/www/ideasos.io/releases | tee "$snap/ls-releases.txt"
live=$(readlink -f /var/www/ideasos.io/current)
tar -C "$(dirname "$live")" -cf "$snap/live-release.tar" "$(basename "$live")"
sha256sum "$snap/live-release.tar" | tee "$snap/live-release.tar.sha256"
cp -a /etc/sudoers.d "$snap/sudoers.d"
if [[ -f /etc/caddy/Caddyfile ]]; then
  sha256sum /etc/caddy/Caddyfile | tee "$snap/Caddyfile.sha256"
fi
echo "$snap"
```

Confirm `current-target.txt` is the release Caddy is serving (a path under `releases/`, today a full git sha). Do not delete that directory.

## 2. Deploy user

Password login stays locked. The Actions key is the only way in. `restrict` turns off forwarding, a TTY, and user rc files. There is no forced command: publish runs `scp`, a short `bash -s`, and one `sudo`.

```bash
id ideasos-deploy >/dev/null 2>&1 || useradd --create-home --shell /bin/bash --comment "GitHub Actions deploy" ideasos-deploy
passwd -l ideasos-deploy
install -d -m 700 -o ideasos-deploy -g ideasos-deploy /home/ideasos-deploy/.ssh
```

On a trusted machine, not the VPS:

```bash
ssh-keygen -t ed25519 -f ideasos-deploy-key -C ideasos-deploy-actions -N ""
```

Install the public key as a single line. The word `restrict` is required:

```text
restrict ssh-ed25519 AAAA... ideasos-deploy-actions
```

```bash
install -m 600 -o ideasos-deploy -g ideasos-deploy /dev/null /home/ideasos-deploy/.ssh/authorized_keys
printf '%s\n' 'restrict ssh-ed25519 AAAA... ideasos-deploy-actions' > /home/ideasos-deploy/.ssh/authorized_keys
chown ideasos-deploy:ideasos-deploy /home/ideasos-deploy/.ssh/authorized_keys
chmod 600 /home/ideasos-deploy/.ssh/authorized_keys
```

The private key, including the `BEGIN` and `END` lines, is the `VPS_SSH_KEY` secret. Do not put it on the server.

## 3. Incoming directory

This is the only path the deploy user can write. The activator reads the tarball from here as root. Mode `700` keeps everyone else out. Do not chown the parent or `releases/`.

```bash
install -d -o ideasos-deploy -g ideasos-deploy -m 700 /var/www/ideasos.io/incoming
stat -c '%U %a %N' /var/www/ideasos.io /var/www/ideasos.io/releases /var/www/ideasos.io/current /var/www/ideasos.io/incoming
```

Expect root and `755` for the site root and `releases/`, root for the `current` symlink, and `ideasos-deploy` with `700` for `incoming`. `current` keeps pointing at the existing release.

## 4. Install the activator

From a checkout of the commit you are about to merge, in `deploy/server`:

```bash
sha256sum -c ideasos-activate.sha256
install -o root -g root -m 0700 ideasos-activate /usr/local/sbin/ideasos-activate.new
got=$(sha256sum /usr/local/sbin/ideasos-activate.new | awk '{print $1}')
test "$got" = "dc28128a900d959ad9a6286d876b51904ddd8681449ca2b72c615a638aef1305"
chmod 0755 /usr/local/sbin/ideasos-activate.new
mv -f /usr/local/sbin/ideasos-activate.new /usr/local/sbin/ideasos-activate
sha256sum /usr/local/sbin/ideasos-activate
cmp ideasos-activate /usr/local/sbin/ideasos-activate
```

`sha256sum -c` checks the repo file. The `test` checks the temp copy before it becomes the live command. `cmp` checks the installed file against that same repo file. If any of them fail, do not continue. Edit the script in git and update the pin; do not patch it on the server.

Confirm the tools the script calls:

```bash
test -x /usr/bin/python3 && test -x /usr/bin/curl && test -x /usr/bin/sha256sum && test -x /usr/bin/flock
test -x /bin/tar || test -x /usr/bin/tar
getent passwd www-data
getent group www-data
python3 -c 'import os; assert os.O_NOFOLLOW'
test -d /var/www/ideasos.io/releases
test -L /var/www/ideasos.io/current
test ! -L /var/www/ideasos.io/incoming
```

## 5. sudoers

The empty argument is deliberate. `sudo` may run the activator with no arguments and must refuse everything else, including `--self-test`.

```bash
install -o root -g root -m 0440 /dev/stdin /etc/sudoers.d/ideasos-deploy <<'EOF'
ideasos-deploy ALL=(root) NOPASSWD: /usr/local/sbin/ideasos-activate ""
EOF
visudo -c -f /etc/sudoers.d/ideasos-deploy
visudo -c
```

Both `visudo -c` commands must say `parsed OK`.

## 6. GitHub Actions secrets

On `jclark2496/ideasos`, from a trusted machine whose `gh` can write Actions secrets:

| Secret | Value |
| --- | --- |
| `VPS_HOST` | `2.25.183.70` |
| `VPS_USER` | `ideasos-deploy` |
| `VPS_SSH_KEY` | private key from step 2 |
| `VPS_SSH_KNOWN_HOSTS` | output of the `ssh-keyscan` below |
| `VPS_SSH_PORT` | omit unless SSH is not on 22 |

```bash
ssh-keyscan -p 22 2.25.183.70 > ideasos-known-hosts
gh secret set VPS_HOST --repo jclark2496/ideasos --body "2.25.183.70"
gh secret set VPS_USER --repo jclark2496/ideasos --body "ideasos-deploy"
gh secret set VPS_SSH_KEY --repo jclark2496/ideasos < ideasos-deploy-key
gh secret set VPS_SSH_KNOWN_HOSTS --repo jclark2496/ideasos < ideasos-known-hosts
```

Publish uses `StrictHostKeyChecking=yes` and this file. Do not use `accept-new`. Do not set `VPS_SSH_PORT` when the daemon listens on 22; the workflow defaults to 22.

## 7. Smoke test

No tarball is in `incoming/` yet. The activator must be allowed to start, then exit because the tarball is missing, without moving `current`.

```bash
test ! -e /var/www/ideasos.io/incoming/release.tar
before=$(readlink /var/www/ideasos.io/current)
systemctl is-active caddy
sudo -n -u ideasos-deploy sudo -n /usr/local/sbin/ideasos-activate
echo "activator exit=$?"
after=$(readlink /var/www/ideasos.io/current)
test "$before" = "$after"
curl -fsS -o /dev/null -w '%{http_code}\n' https://ideasos.io/
curl -fsS -o /dev/null -w '%{http_code}\n' https://ideasos.io/index.json
sudo -n -l -U ideasos-deploy
```

Expect a non-zero activator status and `cannot read .../incoming/release.tar`. `current` is unchanged. The public pages stay HTTP 200. `caddy` stays active. This must be refused:

```bash
sudo -n -u ideasos-deploy sudo -n /usr/local/sbin/ideasos-activate --self-test
echo "self-test via sudo exit=$?"
```

A normal SSH check from the key owner, without a TTY:

```bash
ssh -T -i ideasos-deploy-key -o StrictHostKeyChecking=yes ideasos-deploy@2.25.183.70 true
```

## 8. What a publish does

Actions packs `index.html`, `index.json`, `llms.txt`, `src/`, `ideas/`, `skills/`, and `assets/` into an uncompressed tar plus `release.tar.sha256` (line 1 is the tar's sha256, line 2 is the full git sha). It uploads both into `incoming/` and runs:

```bash
sudo -n /usr/local/sbin/ideasos-activate
```

The activator copies those two files with `O_NOFOLLOW` into a root-only temp directory, checks the hash, and refuses symlink, hardlink, absolute, and `..` members. It extracts to `releases/<UTC timestamp>-<full git sha>`, chowns that directory to `www-data` (`755` directories, `644` files), writes `.deploy-sha`, and swaps `current` to the relative link `releases/<that name>`. It then requests `https://ideasos.io/` and `https://ideasos.io/index.json` through Caddy with `curl --resolve ideasos.io:443:127.0.0.1`. The body must match the new files. On failure it puts the previous symlink back and deletes the new directory.

Existing `releases/<full sha>` directories stay valid symlink targets. The first Actions publish leaves today's target in `/var/www/ideasos.io/.previous-release`. Later publishes keep the five newest release directories plus whatever `current` and `.previous-release` point at. That can delete older pre-Actions directories. The snapshot from step 1 still has the tree that was live when you ran it.

The activator never reloads Caddy and never writes Caddy's config. Caddy must already accept HTTPS for `ideasos.io` on `127.0.0.1:443`. If that local check cannot connect, the activator rolls back and the previous tree stays live.

If the activator returns 0 and the runner's public check of `https://ideasos.io/` or `https://ideasos.io/index.json` then fails, Actions does not roll back. sudoers can run the activator only with an empty argument list, and the deploy user cannot replace `current`. Use the rollback below. The previous target is `/var/www/ideasos.io/.previous-release` and is also printed in the failed job log.

## 9. Rollback

Run as root. `current` is a relative link after the first Actions publish. The pre-Actions target is whatever step 1 saved, which may already be relative.

```bash
cd /var/www/ideasos.io
prev=$(cat .previous-release 2>/dev/null || cat /root/ideasos-pre-actions-*/current-target.txt)
ln -s "$prev" current.new
mv -T current.new current
readlink current
curl --resolve ideasos.io:443:127.0.0.1 -fsS -o /dev/null -w '%{http_code}\n' https://ideasos.io/
curl -fsS -o /dev/null -w '%{http_code}\n' https://ideasos.io/
curl -fsS -o /dev/null -w '%{http_code}\n' https://ideasos.io/index.json
```

If several snapshot directories exist, pass the one you mean instead of the glob. Do not delete `releases/`. Do not edit Caddy to roll back.
