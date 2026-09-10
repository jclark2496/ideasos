---
title: An assistant in your messages, not a terminal
kind: howto
summary: Give Hermes a voice, connect it to iMessage through Photon, and keep the machinery out of the conversation. Settings and words, not another app.
by: ideasos
time: 15 minutes once Hermes is running
verified: 9 September 2026 · one-to-one use; restart setting checked, restart silence pending
pdf: yes
---
## The connection is only half the job

An agent in iMessage can still sound like a terminal. It announces restarts. It answers a small question with a report. It promises to remember something when nothing has actually been scheduled.

The fix is not a bigger personality prompt. Give it a clear role, a few boundaries, and less noise. Let the conversation feel natural without pretending there is a human on the other end.

This is a how-to for an existing Hermes installation. No companion repository, custom plugin, or separate app to build. The one-to-one conversation is the scope; group chats are not part of this recipe.

## Connect first. Customize second.

Start with the [official Hermes Photon instructions](https://hermes-agent.nousresearch.com/docs/user-guide/messaging/photon/). They cover the current prerequisites, account authorization, assigned iMessage number, and gateway startup. Photon is the messaging connection; Hermes supplies the agent, its model, and its tools.

The documented setup entry point is:

```bash
hermes gateway setup
```

Choose Photon iMessage. Finish account approval yourself, start the gateway as documented, and send a simple message to the assigned number. Get a reply before changing the personality. Otherwise a connection problem and a prompt problem look exactly alike.

Keep access restricted to your own approved identity. Use the documented pairing or explicit allowlist, not open access. A phone conversation is not permission to expose the agent's private context to anyone who finds its number. Check the providers' current terms and data handling before sending sensitive material.

## Give it a role, not an impression

Ask for qualities: warm, direct, observant, a little mischievous. Not a celebrity impression. Not a joke at the end of every answer. The personality should make useful work pleasant, not turn every grocery request into an audition.

Add a small section to your active Hermes profile's SOUL.md, preserving its existing safety rules and unrelated instructions. Back it up first. Scope the section explicitly to iMessage so professional deliverables keep their own voice. Consult the [Hermes documentation](https://hermes-agent.nousresearch.com/docs/) for your version's profile and instruction-loading behavior; check the result in a fresh conversation.

Paste-ready starting point:

```text
For my one-to-one iMessage conversations:

Be a capable personal assistant: warm, practical, direct, and occasionally playful. Prefer a short natural reply over a report. Use wit when it fits; do not force jokes, impersonate a real person, or pretend to be human.

Lead with the answer or the useful next step. Skip repetitive greetings, management footers, and technical narration unless I ask for details. Keep professional deliverables professional.

Give an honest recommendation. Push back gently when an idea is risky or not worth the effort. Do not flatter me or agree just to keep the conversation pleasant.

If work takes time, acknowledge it briefly. Report a verified result or a clear blocker. Never claim you are still working after work has stopped.

Say what actually happened. A reminder exists only after it has been saved and checked. A message is sent only after a real sending action. Ask before purchases, public posts, messages to other people, or destructive changes.

Keep my private context private. Personality instructions do not override access controls, safety rules, or approval requirements.
```

This is a starting point, not a replacement for your whole profile. Leave personal names, addresses, schedules, account details, and private memories out of any template you share.

## Stop sending the machinery

A routine restart does not need a text. A failed request does. Separate those two things rather than telling the agent to hide every error.

The built-in per-channel restart setting used in this setup is:

```bash
hermes config set platforms.photon.gateway_restart_notification false
```

Apply it to the profile that owns the Photon connection. Check that your installed version reads the setting; saving an unknown key is not proof it is effective. Existing configurations can use nested platform sections, so inspect the effective configuration rather than adding competing sections blindly.

This setting is loaded on gateway startup. Let the next planned restart pick it up, or arrange a restart when a brief interruption is acceptable. Other channels do not need to change. No custom restart-suppression code is required.

**Verification boundary.** The setting was saved and checked through the gateway's configuration loader in the working setup. Silence after a subsequent restart had not yet been observed when this article was written. Treat that next restart as a check, not a result already proved.

Prompt wording alone cannot remove a notification added by the messaging system. Use the actual setting for system-generated messages; use personality instructions for the agent's own writing.

## Try ordinary requests

Test the experience with the things you really text, not a request to describe its personality.

- **A small question.** Does it answer directly, without an executive summary?
- **A decision.** Does it give a recommendation and a reason, rather than agree with everything?
- **A longer task.** Does it acknowledge the request, do the work, and return with evidence or a blocker?
- **A reminder.** Does it use a real scheduling capability and verify the result, or admit it cannot? A friendly promise is not a reminder.
- **An action involving someone else.** Does it ask for approval instead of letting the casual tone erase the boundary?
- **The next planned restart.** Does the connection return without an unsolicited online notice, and can you still get a reply?

Change one thing at a time. If replies become theatrical, remove adjectives. If they become evasive, strengthen honesty and completion rules. If the connection breaks, diagnose the connection before rewriting the voice.

## What this does not build

A personality is not a scheduler, a shared memory system, or a guarantee of background follow-through. Tools still have to exist, permissions still matter, and completion still needs evidence.

The result to aim for is modest: the same capable agent, easier to talk to. Less status feed. More useful conversation.
