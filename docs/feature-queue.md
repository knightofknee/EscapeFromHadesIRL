# Feature queue

Ideas waiting their turn. Nothing here is started.

## Friends see each other's week view

Share your habit week screen with a friend as a live view inside the app, not a PDF. The friend opens it and sees your week the way you see it.

Open questions:
- How friends connect (invite link, code, contacts).
- What is shared: every habit, or ones you pick.
- Whether the friend sees it in your colors or theirs.
- Turning sharing off, per friend.

Notes: the app has no accounts-talking-to-accounts yet. Firestore rules are owner-only per collection, so this needs a share/grant model in the rules, not just new screens.

## Give chores to other people

Assign a chore to someone else, so it shows up in their Chores tab and they can mark it done.

Open questions:
- How the other person is found (same friend connection as above?).
- Who can edit or delete an assigned chore.
- Whether you see when they finish it.
- One-time tasks only, or the repeating time-since chores too.

Notes: same cross-account question as the week view sharing. Worth designing both on one friend/share model.
