---
name: doorman
description: One login for every site you own. Put a passkey in front of every site on your domain with Doorman, about a thousand lines of Python behind Caddy. Sign in once with Face ID or Touch ID and every site opens; let a friend into one site for a week with three words and two digits.
---
# One login for every site you own

Use this skill when the person you are working with wants to do what the title says. Work through the steps in order and do only what each step says. Run every line under Check before moving on and tell them what it printed. Any step marked ASK FIRST spends money, touches production or needs their finger: stop and ask before acting. After each step, report what its Report line asks for, in one line if you can.

Verified 2026-09-06 · Doorman main · Caddy 2 · Ubuntu 24.04. The readable guide is https://ideasos.io/ideas/doorman.md; this file is generated from it and should not be edited by hand.

## Step 1 of 6: Give it a box, a user and a directory

On the server, create the `doorman` system user and its directory, then clone the repository and build its virtualenv, all as that user:

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin doorman
sudo mkdir -p /opt/doorman/data
sudo chown -R doorman:doorman /opt/doorman
sudo -u doorman git clone https://github.com/jclark2496/doorman.git /opt/doorman/app
sudo -u doorman python3 -m venv /opt/doorman/venv
sudo -u doorman /opt/doorman/venv/bin/pip install -r /opt/doorman/app/requirements.txt
```

If `venv` is missing, install `python3-venv` with apt and run the venv line again.

Check:
- `id doorman` prints a uid and the shell `/usr/sbin/nologin`.
- `/opt/doorman/venv/bin/pip check` reports no broken requirements.

Report: The Python version from `/opt/doorman/venv/bin/python --version` and the commit from `git -C /opt/doorman/app rev-parse --short HEAD`.

## Step 2 of 6: Tell it who it is

ASK FIRST: The domain, the hosts to protect and the owner's name. Ask before writing them.

Copy the example env file into place with the right owner and mode, then edit it. Do not invent the values: ask your human for the domain, the list of hosts to protect and the owner's name, then write them in.

```bash
sudo cp /opt/doorman/app/examples/doorman.env.example /opt/doorman/doorman.env
sudo chown doorman:doorman /opt/doorman/doorman.env
sudo chmod 640 /opt/doorman/doorman.env
```

Set `AUTH_ORIGIN`, `AUTH_RP_ID`, `AUTH_COOKIE_DOMAIN` (with its leading dot), `AUTH_HOSTS` and `AUTH_OWNER_NAME`. Keep every quoted value quoted.

Check:
- `sudo sh -c 'set -a; . /opt/doorman/doorman.env; echo "$AUTH_HOSTS"'` prints the host list and the origin's own host is in it.
- `stat -c '%U %a' /opt/doorman/doorman.env` prints `doorman 640`.

Report: The five values you set, so your human can read them back.

## Step 3 of 6: Run it as a service

Install the unit and start the service:

```bash
sudo cp /opt/doorman/app/examples/doorman.service /etc/systemd/system/doorman.service
sudo systemctl daemon-reload
sudo systemctl enable --now doorman.service
```

Then run the health check exactly as written, retries included. Do not replace it with a single `curl`; the unit is `Type=simple` and reports active before it listens.

```bash
( url=http://127.0.0.1:8401/_auth/health; n=15
  while [ "$n" -gt 0 ]; do
    body=$(curl -fs "$url") && { printf '%s\n' "$body"; break; }
    n=$((n - 1)); sleep 1
  done
  [ "$n" -gt 0 ] || { curl -fsS "$url" >/dev/null; echo "STOP: $url did not answer within 15s."; exit 1; } )
```

If it prints STOP, read `journalctl -u doorman.service -n 50 --no-pager` and stop here; the usual cause is a missing host in `AUTH_HOSTS` from step 2.

Check:
- The health check prints `{"ok": true}` and nothing else.
- `systemctl is-active doorman.service` prints `active`.

Report: The health output and the last three lines of the journal.

## Step 4 of 6: Put Caddy in front

ASK FIRST: Reloading Caddy touches every site on this box. Show your human the diff of the Caddyfile and get a yes before the reload.

Edit `/etc/caddy/Caddyfile`: add the `gate` snippet, the `/_auth/*` proxy and the `@open` matcher on the origin host, and `import gate` on every protected host, following `/opt/doorman/app/examples/Caddyfile`. Copy the reference pages into the origin's web root. Validate, and only then reload.

```bash
sudo cp /opt/doorman/app/web/*.html /var/www/example.com/
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Check:
- `caddy validate` prints `Valid configuration`.
- `curl -sI https://notes.example.com/ | head -1` shows a 302 (a signed-out visitor is sent to the login page), and `curl -sI https://example.com/login.html | head -1` shows 200.

Report: The validate line and both status lines.

## Step 5 of 6: Enroll your own passkey

This step needs your human's finger. Run the command, hand them the link it prints, and wait until they say they have enrolled:

```bash
sudo -u doorman /opt/doorman/venv/bin/python /opt/doorman/app/doorman.py enroll-owner
```

Do not open the link yourself and do not run the command twice; each run invalidates the previous link.

Check:
- After they confirm, `sudo -u doorman /opt/doorman/venv/bin/python /opt/doorman/app/doorman.py list` shows the owner with one key.

Report: The owner's name and key count from `list`.

## Step 6 of 6: Let someone in, and keep a copy

Who gets in is your human's decision, made in the admin page; do not invite anyone. Your part is the backup:

```bash
sudo -u doorman sqlite3 /opt/doorman/data/auth.db ".backup '/opt/doorman/data/auth-$(date +%F).db'"
```

If `sqlite3` is not installed, install it with apt first.

Check:
- The backup file exists, and `sudo -u doorman sqlite3 /opt/doorman/data/auth-$(date +%F).db 'pragma integrity_check'` prints `ok`.

Report: The backup path and its size, and a reminder to copy it off the box.
