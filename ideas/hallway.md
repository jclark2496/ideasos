---
title: They don't share a brain. They share a hallway.
kind: note
summary: Two AI desks on two subscriptions cannot see each other. Copying chats between them is not an office. A hallway is: one room both desks can post into, each speaking as a seat.
by: ideasos
time: 6 minutes
verified: 3 September 2026 · methodology, not a build
pdf: yes
lanes: north=North office | hall=The hallway | south=South office
flow: pn@north[North principal] -> morgan@north[Morgan · CoS] : desk chat; morgan -> channel@hall[#ops-hallway] : as a seat; ps@south[South principal] -> riley@south[Riley · CoS] : desk chat; riley -> channel : as a seat; hermes@hall[Hermes profiles] -> channel : worker; channel -> notebook@hall[Week notebook] : facts
---
## The desks cannot see each other

A second Grok Bot seat is a second account. Separate meter, separate memory, separate computer. Agents on desk A cannot message agents on desk B. Standing up Hermes (a second harness, with named bot profiles) does not fix that. You now have three islands and a person in the middle.

The hallway is Slack. Not because Slack is clever. Because it is the one room a human, a Grok Bot chief of staff, and a Hermes profile can all enter without sharing a login.

```
  North desk ─────── #ops-hallway ─────── South desk
  Grok Bot · Morgan     Slack, in-channel     Grok Bot · Riley
                              │
                      Hermes profiles (optional)
                      same room · never the coding model
```

Durable facts do not live in Slack. Slack is talk. A week notebook (a repo, a board, a dated file) is what has to survive Friday.

## Stand up the hallway

- One Slack workspace. One channel for the two offices. Name it like a room, not a product.
- Each office gets its own Slack seat (a real user, not the principal's personal login). The chief of staff bot posts as that seat.
- Invite the Slack app the Grok Bot connector uses into that exact channel. A private channel is invisible until the app is in it.
- If Hermes is in play, it joins the same channel as a bot user. It does not become a third chief of staff unless you want a third office.
- The chief of staff posts *in the channel*, not in a thread. Threads hide the other desk.
- Skip echoes: if the message came from Slack, do not paste it back into Slack.

**What each surface is for.** Grok Bot chat is the desk. Slack is the hallway between desks. Hermes is leftover local work if you still run it: not the coding model, not a second inbox, not a place to hide a clock job. Recurring workers belong on a scheduler, not in a chat harness.

## Paste-ready chief of staff: Morgan (North)

Seat, not the principal. Swap North and South, Morgan and Riley, and the channel name. Keep the rules.

```
You are Morgan, Chief of Staff for the North office.

You post in Slack as Morgan, the North seat: never as the principal, never as their personal Slack login.

Slack is the live hallway to the South office (Riley, CoS). The week notebook is the system of record. Slack is talk. Do not treat a channel message as a merge, a send, a payment, or a deploy.

Rules:
- In #ops-hallway, post in the CHANNEL, not a thread.
- If a message originated in Slack, do not echo it back into Slack.
- Never dump OTP, door codes, tokens, webhook URLs, passwords, or card data.
- Do not speak in the first person as the principal. You are Morgan.
- Nothing is booked, emailed, paid, merged, or shipped unless the principal said yes in the desk chat.
- Invite the Slack app this connector uses to #ops-hallway. A private channel is silent until that invite.

When North needs South: write a short in-channel note Riley can act on. When South writes to North: answer in-channel, then put durable facts in the notebook.

You do not run Hermes jobs. If Hermes is in the room, it is a worker, not a second CoS.
```

**Riley (South), the one-line change.** Same prompt. Replace North with South, Morgan with Riley, and the peer with Morgan. Do not invent a second hallway. One channel. Two seats.

**A good post.** "Riley: North locked the map recut. Hold merge. No live patch. Notebook issue 10."

**A bad post.** "Here's the webhook and the OTP so you can ship it."

## Best practice

- **One chief of staff per office.** One Slack seat. Do not dual-home a bot on two human logins.
- **Separate subscriptions stay separate.** Two Grok Bot accounts do not share a roster. Do not buy a second seat on the same account hoping for a second meter.
- **Do not fan work to dodge quota.** One job, one writer. The hallway coordinates. It does not clone the job.
- **Channel, not thread, in the chief of staff room.** The other desk will miss a thread.
- **Skip Slack-originated echoes.** Loops are how a hallway becomes noise.
- **Secrets never travel.** OTP, tokens, webhook URLs, door codes, cards: desk only, never Slack, never the notebook's public files.
- **Yes is a desk event.** Merge, send, book, pay, deploy: the principal says it in the desk chat. Slack is not a signature.
- **Hermes is optional infrastructure.** Named profiles, groups of a few, not the coding model. Do not rebuild Hermes to hold clocks. Park it if the desk already covers talk and connectors.
- **Clocks don't live in chat.** Recurring workers belong on a scheduler. The desk pings only when there is a result.
- **Invite the app.** A listener on a channel the bot was never invited to is a dead listener.
- **Notebook for locks.** If another harness has to pick the work up next week, it is not a Slack message.

**Out of scope.** This is not a shared memory pool, not a coding harness, not a way to make two subscriptions one. It is a hallway so two offices can talk in public-enough language without pretending they share a brain.
