---
title: Build a dedicated personal assistant in iMessage
kind: howto
summary: Give Hermes its own profile, useful tools, clear memory lanes, and approval boundaries—then run it from iMessage without confusing personality with permission.
by: ideasos
time: 30 minutes once Hermes is running
verified: 11 September 2026 · profiles, Photon, memory, tools, browser checkpoints, and Link flow checked against current documentation
pdf: yes
---
## The useful version is more than a chat connection

Putting an agent in iMessage is easy to mistake for the finished product. It is only the front door.

A personal assistant also needs its own identity, the right tools, somewhere sensible to put what it learns, and clear rules for when it may act. Without those pieces it either forgets everything, remembers too much, or sounds confident while doing nothing.

This is a living playbook for an existing Hermes installation. It keeps the public URL stable while the setup evolves. Use the [current Hermes documentation](https://hermes-agent.nousresearch.com/docs/) as the source of truth for commands and configuration; this guide is the operating model around them.

## Give the assistant its own profile

Create a dedicated profile instead of turning a general coding or research agent into a part-time personal assistant. A Hermes profile has its own configuration, credentials, `SOUL.md`, memory, sessions, skills, scheduled work, and gateway state. That separation prevents personal conversations from becoming another project's context.

Start clean when possible:

```bash
hermes profile create personal --description "A private personal assistant for daily life, research, and household coordination."
```

Or clone configuration and skills from a working profile while keeping fresh sessions and memory:

```bash
hermes profile create personal --clone
```

Read the [profile guide](https://hermes-agent.nousresearch.com/docs/user-guide/profiles) before cloning. A clone can inherit credentials and broad tool access you did not mean to give a personal assistant. Remove what it does not need, then inspect the result:

```bash
hermes profile list
hermes profile show personal
hermes -p personal tools list
```

A profile is a state boundary, not an operating-system sandbox. On a local terminal backend it can still reach whatever the host user can reach. Use restricted credentials, a narrow working directory, OS permissions, an isolated terminal backend, or no terminal access when the risk calls for it. A sentence in `SOUL.md` is not containment.

Connect Photon from the dedicated profile, not whichever profile happens to be active:

```bash
hermes -p personal gateway setup
hermes -p personal gateway start
hermes -p personal photon status
```

Choose Photon iMessage in the setup flow. The [official Photon guide](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/photon/) covers the current Node requirement, account approval, assigned iMessage line, pairing, allowlists, status checks, and current service limits.

Use DM pairing or an explicit phone-number allowlist. Do not enable open access for a personal assistant.

## Write an operator, not a character

The profile's `SOUL.md` is its durable identity. Describe the job, voice, judgment, and boundaries. Do not ask for a celebrity impression or mistake constant jokes for personality.

A useful starting point:

```text
You are my dedicated personal assistant.

Be warm, practical, direct, and occasionally playful. Lead with the answer or useful next step. Prefer a natural message over a report. Do not impersonate a real person or pretend to be human.

Own organization, research, household coordination, and follow-through. Give an honest recommendation and push back gently when something is risky, wasteful, or not worth the effort.

Use tools when they improve accuracy. Say what actually happened: a reminder exists only after it was saved and checked; a message was sent only after a real send; a purchase is complete only after the order is confirmed.

Ask before purchases, messages to other people, public posts, destructive changes, security changes, or anything difficult to reverse. Keep private context out of group conversations and specialist handoffs unless it is necessary and approved.

Keep machinery out of ordinary replies. Report a verified result or a clear blocker. Never hide a failure behind a friendly tone.
```

Preserve the profile's existing security rules when editing. Start a fresh conversation after changing `SOUL.md`; existing sessions may still carry the earlier identity. The [personality guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/personality) explains what belongs in `SOUL.md` and what belongs in project context instead.

## Add capabilities deliberately

Tools are permissions to do work. Skills are reusable procedures for doing it well. Give the profile only the toolsets and integrations it needs, then add skills for recurring workflows such as inbox triage, household troubleshooting, travel research, or weekly planning.

Use the interactive tool configuration and inspect the effective result:

```bash
hermes -p personal tools
hermes -p personal tools list
hermes -p personal skills list
```

The current [tools reference](https://hermes-agent.nousresearch.com/docs/user-guide/features/tools/) covers web research, browser work, files, scheduling, memory, delegation, home integrations, and other toolsets. The [skills guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/skills) covers on-demand procedural knowledge.

A good default is:

- broad read access only where it is genuinely useful;
- narrow write access for reminders and personal notes;
- no automatic sending, purchasing, publishing, deleting, security changes, or account changes;
- separate work and personal credentials;
- a human checkpoint whenever an action creates a commitment.

Do not confuse a tool appearing in a list with a working capability. Credentials can expire, websites change, and an integration can be read-only even when the assistant sounds ready to act.

## Put information in the right place

Do not pour every fact into memory.

- **Profile memory** is the tiny always-loaded wallet: stable preferences, recurring conventions, and durable environment facts. It should still matter in most future conversations.
- **Session history** is the searchable record of what was discussed. Use it for “what did we decide last week?” rather than permanently injecting old conversations into every prompt.
- **Skills** hold procedures: how to triage an inbox, prepare a shopping comparison, or troubleshoot a router safely.
- **Durable notes** hold the actual knowledge: project plans, home inventory, warranties, research summaries, decision logs, and troubleshooting history. Keep these in the note or project system you already trust.

The [memory guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/memory/) explains Hermes' bounded memory and session search. For sensitive health, family, financial, legal, identity, or private-message material, require approval before it is summarized or moved into durable notes. “Remember this” should name the destination when the choice matters.

## Set approvals by consequence

Write the boundaries in plain language and enforce them with tool configuration, credential scope, and operating-system controls where possible. Model instructions are useful policy; they are not the only control.

A practical policy:

- **Read freely:** public research, approved calendars, package tracking, device status, manuals, and existing project notes.
- **Prepare freely:** comparisons, plans, draft replies, draft orders, reminder details, and proposed household actions.
- **Act when explicitly requested:** low-risk reminders, lights, or filing into an agreed non-sensitive location—then read back the result.
- **Preview and approve:** messages to people, email sends, calendar writes, purchases, subscriptions, public posts, account changes, locks, alarms, HVAC, networking, destructive edits, and anything expensive or embarrassing.
- **Never paste into chat:** passwords, card numbers, CVCs, API keys, recovery codes, or one-time verification codes.

Keep dangerous-command approvals enabled and review the [Hermes security guide](https://hermes-agent.nousresearch.com/docs/user-guide/security). For especially sensitive profiles, make the technical boundary stricter than the prose boundary.

## Use real-life request patterns

The assistant becomes useful when each request has a clear finish line.

**Calendar and reminders**

“Check my calendar and turn the three commitments I made this morning into reminders. Show me the reminder titles and due times after saving them.”

Calendar reading can be routine. Calendar writing should normally be a preview-and-approve action because invitations and shared calendars affect other people. A reminder is complete only after the assistant reads it back from the real reminder system.

**Email triage and drafting**

“Triage today's inbox into reply, read, and ignore. Draft the two replies that need me, but do not send them.”

Separate reading, drafting, and sending. Before sending, show the recipients, subject, final body, and attachments. Do not delete mail as part of “clean up” unless deletion was specifically approved.

**Research**

“Compare these three options using primary sources, tell me what is still uncertain, and recommend one.”

Require live sources, dates when freshness matters, and a distinction between fact and judgment. A confident paragraph without source checks is not research.

**Shopping with a human at the last gate**

“Find the right replacement filter, check compatibility, delivery date, return policy, and total price. Stop before purchase.”

The assistant can research, build the cart, and present the exact merchant, item, quantity, shipping address, delivery estimate, tax, shipping, and total. Payment remains a human checkpoint. [Link for agents](https://link.com/agents) can provide one-time-use cards or shared payment tokens while keeping payment credentials away from the agent, and its current flow asks the human to approve the amount before each purchase. That is a safer payment rail, not permission to buy. Keep a separate explicit “approve this order for this total” step.

**Household routing**

“Check why the porch light is unavailable. Read status first; do not change automations, networking, locks, or alarms.”

Route device status and low-risk controls to the home integration. Route manuals, serial numbers, warranties, maintenance history, and troubleshooting results to durable home notes. Treat locks, security, HVAC, networking, and costly service calls as approval points.

**Specialist delegation**

“Have the travel specialist compare routes, then bring me one recommendation.”

The personal assistant remains the front door. It gives a specialist the minimum bounded context, receives evidence rather than a vague success claim, checks consequential results itself, and returns one coherent answer. Do not forward an entire private conversation because a specialist might find one paragraph useful. Hermes [profiles and Bot Mode](https://hermes-agent.nousresearch.com/docs/user-guide/bot-mode) can support a durable roster, but delegation should reduce noise, not create a committee for every errand.

## Stop at human checkpoints

CAPTCHAs, passkeys, app approvals, two-factor prompts, and payment confirmations are handoff points.

The assistant may navigate to the checkpoint and explain what is needed. It should not ask you to paste a password, card detail, CVC, recovery code, or one-time code into the conversation. Use Hermes' protected credential flow or your password manager for credentials. Complete a CAPTCHA, passkey, hardware-key request, or app approval yourself in a visible browser session, then let the assistant continue. The [browser guide](https://hermes-agent.nousresearch.com/docs/user-guide/features/browser/) covers headed mode for manual intervention and the risk of browsing with your signed-in profile.

Cloud CAPTCHA solving can help with ordinary anti-bot friction. It does not turn an identity, consent, age, or payment challenge into something the agent is authorized to bypass.

## Test identity without using secrets

Do not prove isolation by handing the assistant something sensitive.

1. Put a harmless, unique phrase in the dedicated profile's `SOUL.md`, such as “When asked for the profile check phrase, answer `blue teacup`.”
2. Start a fresh direct-message conversation and ask for the phrase.
3. Confirm `hermes profile show personal`, the profile's gateway status, and the session location agree with the profile you intended.
4. Confirm an unapproved phone number is paired or ignored according to your chosen authorization policy.
5. Remove the phrase after the test.

This checks routing and prompt loading. It does not prove filesystem isolation, because profiles are not sandboxes. Test technical boundaries with permissions and a harmless canary file outside the allowed workspace—not with private data.

## Be honest about groups

One-to-one iMessage is the safest default for a personal assistant.

Photon can participate in groups and can require a mention before responding. Mention gating controls noise; it does not make a group private. Every reply is visible to the group, participants can change, and a personal assistant must not pull private memory, email, calendar detail, or household data into that room unless the request and audience make that clearly appropriate.

Inbound Photon attachments are currently metadata-only, so the assistant may see a filename and type without being able to inspect the actual file. Shared-line service limits and conversation-initiation rules also apply. Check the [Photon limits](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/photon/#limits-today) before promising group workflows. If identity, ordering, attachment access, or audience is ambiguous, move the task back to the private thread.

## Maintain a verified-capabilities note

Keep a short note inside the profile or its durable operating folder. For each important capability, record:

- capability and scope: “calendar read,” “reminders write,” “email draft,” “email send”;
- state: read, prepare, act, or unavailable;
- approval checkpoint;
- last verified date;
- the harmless test that passed;
- known limits and the source documentation.

Recheck after Hermes updates, credential changes, provider changes, or the first unexpected failure. Test the real path: read one known calendar event, create and read back a disposable reminder, draft an email without sending, or build a cart without purchasing. Remove test artifacts when that is safe and approved.

Never mark a capability verified because the assistant said it has the tool. Mark it verified because the action returned real evidence. When a capability stops working, downgrade the note immediately instead of letting the personality bluff through it.

The goal is not maximum autonomy. It is a personal assistant that is pleasant in the conversation, disciplined at the boundary, and boringly honest about what it actually did.
