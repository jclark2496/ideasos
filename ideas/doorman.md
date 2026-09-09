---
title: One login for every site you own
kind: guide
summary: Put a passkey in front of every site on your domain with Doorman, about a thousand lines of Python behind Caddy. Sign in once with Face ID or Touch ID and every site opens; let a friend into one site for a week with three words and two digits.
by: ideasos
time: 45 minutes
level: Comfortable with a terminal
verified: 2026-09-06 · Doorman main · Caddy 2 · Ubuntu 24.04
parts: hostinger-vps, caddy, python, github, claude-code
repo: https://github.com/jclark2496/doorman
pdf: yes
lanes: local=Your machine | server=Your server | cloud=Elsewhere
flow: you@local[You] -> cc@local[Claude Code] : what to do; cc -> doorman@server[Doorman] : ssh; github@cloud[GitHub] -> doorman : git clone; doorman -> db@server[auth.db] : keys; caddy@server[Caddy] -> doorman : forward_auth; visitor@cloud[A visitor] -> caddy : https; phone@cloud[Your passkey] -> caddy : passkey
---
You have a handful of small sites on one domain: a recipe box, a photo dump, something half-built you would rather not show anyone yet. You want to reach all of them from any of your devices without typing anything, and you want to let one other person into one of them for a week without making them an account.

Doorman is the thing in front of all of them. Caddy asks it about every request before serving anything, so a site is protected whether it is a folder of HTML or an app on a port, with no library, no SDK and no change to the site itself. There is no shared password anywhere in it and no secret in its config: what it holds is a SQLite file of people, their public keys and their live sessions.

**The one constraint, before you start.** A session cookie is scoped to a domain and a passkey is bound to a registrable domain, so every site Doorman protects has to be that domain or a subdomain of it. `notes.example.com` and `photos.example.com` share one login. `example.net` cannot, and no configuration changes that. Sites on another domain need their own Doorman.

Everywhere below, `example.com` is your domain and `notes.example.com` a site you want behind the door. Replace both.

## 1. Give it a box, a user and a directory
wire: cc -> doorman, github -> doorman

you:
Doorman runs as its own system user that owns nothing but one directory. That is the whole security posture on the box: if the service is ever wrong, it can write to `/opt/doorman/data` and nowhere else.

```bash
sudo useradd --system --no-create-home --shell /usr/sbin/nologin doorman
sudo mkdir -p /opt/doorman/data
sudo chown -R doorman:doorman /opt/doorman
```

Then the code and a virtualenv, both owned by that user:

```bash
sudo -u doorman git clone https://github.com/jclark2496/doorman.git /opt/doorman/app
sudo -u doorman python3 -m venv /opt/doorman/venv
sudo -u doorman /opt/doorman/venv/bin/pip install -r /opt/doorman/app/requirements.txt
```

One dependency installs. If `python3 -m venv` complains, the box needs `python3-venv` from apt first.

agent:
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
check: `id doorman` prints a uid and the shell `/usr/sbin/nologin`.
check: `/opt/doorman/venv/bin/pip check` reports no broken requirements.
report: The Python version from `/opt/doorman/venv/bin/python --version` and the commit from `git -C /opt/doorman/app rev-parse --short HEAD`.

## 2. Tell it who it is
wire: doorman

you:
Everything Doorman knows about itself comes from one env file, and nothing in it is secret, which is why it can sit at mode 640 and be read by anyone who can read the box.

```bash
sudo cp /opt/doorman/app/examples/doorman.env.example /opt/doorman/doorman.env
sudo chown doorman:doorman /opt/doorman/doorman.env
sudo chmod 640 /opt/doorman/doorman.env
```

Open it and set at least these five:

- `AUTH_ORIGIN` is where the login page lives, `https://example.com`.
- `AUTH_RP_ID` is the domain the passkey is bound to, `example.com`.
- `AUTH_COOKIE_DOMAIN` is the cookie's scope, `.example.com`, with the leading dot.
- `AUTH_HOSTS` is every host behind the door, comma-separated. It must include the origin's own host or the service refuses to start, on purpose: a list that omitted it would lock everyone out of the front door.
- `AUTH_OWNER_NAME` is you, as you want to appear in the admin page.

**Quote any value with a space in it.** systemd will accept `AUTH_RP_NAME=Some Site`; `sh` will read it as an assignment followed by a command called `Site`. The shipped example quotes it, and a test in the repo sources the file with `sh` on every run so it cannot drift back.

agent:
Copy the example env file into place with the right owner and mode, then edit it. Do not invent the values: ask your human for the domain, the list of hosts to protect and the owner's name, then write them in.

```bash
sudo cp /opt/doorman/app/examples/doorman.env.example /opt/doorman/doorman.env
sudo chown doorman:doorman /opt/doorman/doorman.env
sudo chmod 640 /opt/doorman/doorman.env
```

Set `AUTH_ORIGIN`, `AUTH_RP_ID`, `AUTH_COOKIE_DOMAIN` (with its leading dot), `AUTH_HOSTS` and `AUTH_OWNER_NAME`. Keep every quoted value quoted.
confirm: The domain, the hosts to protect and the owner's name. Ask before writing them.
check: `sudo sh -c 'set -a; . /opt/doorman/doorman.env; echo "$AUTH_HOSTS"'` prints the host list and the origin's own host is in it.
check: `stat -c '%U %a' /opt/doorman/doorman.env` prints `doorman 640`.
report: The five values you set, so your human can read them back.

## 3. Run it as a service
wire: doorman -> db

you:
The unit file in `examples/` is already hardened: no new privileges, a private tmp, a read-only system with one writable path. Copy it in and start it.

```bash
sudo cp /opt/doorman/app/examples/doorman.service /etc/systemd/system/doorman.service
sudo systemctl daemon-reload
sudo systemctl enable --now doorman.service
```

It is `Type=simple`, so systemd reports it active the moment the process starts, before the socket is bound. A bare `curl` straight after a restart can race it and lose. Every check in this guide is therefore a bounded retry, written the same way each time, and silent until the last attempt so a slow start does not print a dozen red lines in front of a check that is succeeding:

```bash
( url=http://127.0.0.1:8401/_auth/health; n=15
  while [ "$n" -gt 0 ]; do
    body=$(curl -fs "$url") && { printf '%s\n' "$body"; break; }
    n=$((n - 1)); sleep 1
  done
  [ "$n" -gt 0 ] || { curl -fsS "$url" >/dev/null; echo "STOP: $url did not answer within 15s."; exit 1; } )
```

Expected output, and nothing else: `{"ok": true}`

agent:
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
check: The health check prints `{"ok": true}` and nothing else.
check: `systemctl is-active doorman.service` prints `active`.
report: The health output and the last three lines of the journal.

## 4. Put Caddy in front
wire: caddy -> doorman, visitor -> caddy

you:
Two things matter in the Caddyfile and the rest is ordinary Caddy. First, `/_auth/*` on the origin reverse-proxies to `127.0.0.1:8401`; that path is all Doorman serves, and it has to be on the origin because that is where the login page and the cookie live. Second, every protected host imports a `gate` snippet, which is a `forward_auth` to the same service. Caddy asks Doorman about each request; Doorman answers 200, or a redirect to the login or denied page.

```caddyfile
(gate) {
	forward_auth 127.0.0.1:8401 {
		uri /_auth/verify
		header_up Host {host}
		copy_headers X-Doorman-User X-Doorman-Role
	}
}

example.com {
	root * /var/www/example.com
	handle /_auth/* {
		reverse_proxy 127.0.0.1:8401
	}
	@open path /login.html /denied.html /assets/* /favicon.ico /robots.txt
	handle @open {
		file_server
	}
	handle {
		import gate
		file_server
	}
}

notes.example.com {
	root * /var/www/notes.example.com
	import gate
	file_server
}
```

Leave the login and denied pages themselves outside the gate, or nobody can reach the door to knock on it; that is the `@open` matcher. Copy the reference pages from `web/` into the origin's web root. Then validate before you reload, because a reload with a broken Caddyfile takes every site on the box down with it.

```bash
sudo cp /opt/doorman/app/web/*.html /var/www/example.com/
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

agent:
Edit `/etc/caddy/Caddyfile`: add the `gate` snippet, the `/_auth/*` proxy and the `@open` matcher on the origin host, and `import gate` on every protected host, following `/opt/doorman/app/examples/Caddyfile`. Copy the reference pages into the origin's web root. Validate, and only then reload.

```bash
sudo cp /opt/doorman/app/web/*.html /var/www/example.com/
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
```
confirm: Reloading Caddy touches every site on this box. Show your human the diff of the Caddyfile and get a yes before the reload.
check: `caddy validate` prints `Valid configuration`.
check: `curl -sI https://notes.example.com/ | head -1` shows a 302 (a signed-out visitor is sent to the login page), and `curl -sI https://example.com/login.html | head -1` shows 200.
report: The validate line and both status lines.

## 5. Enroll your own passkey
wire: phone -> caddy

you:
Nothing can be administered until the owner has a key. Ask the service for an enrollment link, open it on a device with a biometric, and make one:

```bash
sudo -u doorman /opt/doorman/venv/bin/python /opt/doorman/app/doorman.py enroll-owner
```

It prints a link good for fifteen minutes and single-use: redeeming it clears any other enrollment ticket outstanding, so a link that leaks after you have used it is worth nothing. This is also the recovery path. Lose every key and you run it again on the box.

agent:
This step needs your human's finger. Run the command, hand them the link it prints, and wait until they say they have enrolled:

```bash
sudo -u doorman /opt/doorman/venv/bin/python /opt/doorman/app/doorman.py enroll-owner
```

Do not open the link yourself and do not run the command twice; each run invalidates the previous link.
check: After they confirm, `sudo -u doorman /opt/doorman/venv/bin/python /opt/doorman/app/doorman.py list` shows the owner with one key.
report: The owner's name and key count from `list`.

## 6. Let someone in, and keep a copy
wire: db

you:
Everything else happens as the owner, from the admin page at `/admin.html` or the CLI. Inviting someone mints three words and two digits, `coral-lounger-palm-42`, good for the sites you named, for the days you named, on up to three browsers. Giving them longer moves their deadline without minting a new code, so "give Bob another week" never means "message Bob". Revoking asks the right question: whether their key survives.

```bash
doorman.py list                    # users, roles, keys, live sessions
doorman.py revoke <name> [--keys]  # ends their sessions and invites
doorman.py revoke-all-sessions     # everyone signs in again; keys survive
```

The only state is one SQLite file. Losing it exposes nothing, since it holds public keys, but everyone has to enroll again, so keep a copy somewhere:

```bash
sudo -u doorman sqlite3 /opt/doorman/data/auth.db ".backup '/opt/doorman/data/auth-$(date +%F).db'"
```

agent:
Who gets in is your human's decision, made in the admin page; do not invite anyone. Your part is the backup:

```bash
sudo -u doorman sqlite3 /opt/doorman/data/auth.db ".backup '/opt/doorman/data/auth-$(date +%F).db'"
```

If `sqlite3` is not installed, install it with apt first.
check: The backup file exists, and `sudo -u doorman sqlite3 /opt/doorman/data/auth-$(date +%F).db 'pragma integrity_check'` prints `ok`.
report: The backup path and its size, and a reminder to copy it off the box.
