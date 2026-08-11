# Observer sheet - moderated arm only

Print one per participant. **Arm 2 only** - the unmoderated arm has no observer,
which is exactly why arm 2 exists. This sheet produces the observational
evidence a questionnaire cannot reach, and partly answers Chapter 9's own
admitted threat that "the instruments measure perception rather than delivered
software quality".

Task numbering matches `task-script.md`.

```
Participant ID:  P____        Date: __________     Language: EN / PT
Session start: ______   Session end: ______        Remote / In person
Facilitator: ______________
```

## Codes

- **Outcome:** `C` completed unaided, `CA` completed with assists, `F` failed or
  abandoned after three assists.
- **Assist:** any hint given. Write it down **verbatim**. Assists are the most
  reusable output of the whole study - each one is a specific place the
  interface failed to communicate.
- **Error:** an action that had to be undone, or a path that could not reach the
  goal.

## Per-task record

```
T1  Sign in and open the project        start ____ end ____  C / CA / F
    Understood the PM tool selector?    Y / N / N/A
    Assists: ______________________________________________
    Errors:  ______________________________________________

T2  Connect to GitHub                   start ____ end ____  C / CA / F
    Looked in Settings first?           Y / N
    Connected state legible?            Y / N
    Assists: ______________________________________________
    Errors:  ______________________________________________

T3  Requirement to locked Gherkin  [TLX]  start ____ end ____  C / CA / F
    Read the clarifying questions?      Y / N / skimmed
    Noticed the assumptions box?        Y / N
    Hesitated before locking?           Y / N
    Believed the app had hung?          Y / N   at ____ s
    Assists: ______________________________________________
    Errors:  ______________________________________________

T4  Produce and lock the design    [TLX]  start ____ end ____  C / CA / F
    Found the Visual Design group?      Y / N / with assist
    Read the runtime spec?              Y / N / scrolled past
    Edited anything or accepted whole?  edited / accepted
    Assists: ______________________________________________
    Errors:  ______________________________________________

T5  Resume a previous session           start ____ end ____  C / CA / F
    Landed back on the same project?    Y / N
    GitHub still connected?             Y / N        <- a No here is a bug
    Assists: ______________________________________________
    Errors:  ______________________________________________

T6  Implementation tasks          [TLX]  start ____ end ____  C / CA / F
    Named a defensible root task?       Y / N
    Justification, verbatim: ______________________________
    Discovered effort/coverage data?    Y / N
    Read the DAG as a dependency order? Y / N / unclear
    Assists: ______________________________________________

T7  Test plan and QA sign-off     [TLX]  start ____ end ____  C / CA / F
    Understood QA as a human decision?  Y / N / unclear
    Assists: ______________________________________________

T8  The deployment gate           [TLX]  start ____ end ____  C / CA / F
    Read the refusal message aloud?     Y / N
    Looked for an override?             Y / N
    Found the phase-status progression? Y / N

    COMPREHENSION SCORE   2 / 1 / 0
      2 = named the missing QA step and the required order
      1 = knew a process rule blocked them, could not say which
      0 = concluded the tool was broken

    Explanation, verbatim: ________________________________
    _______________________________________________________

T9  Export                        [TLX]  start ____ end ____  C / CA / F
    Export control findable?            Y / N
    Anything downloaded empty/corrupt?  Y / N
    Assists: ______________________________________________
```

## Optional tasks, not timed, not counted

```
O1 Phase 6 drift      attempted Y/N   observations: ______________
O2 Traceability       attempted Y/N   observations: ______________
O3 Autopilot          attempted Y/N   observations: ______________
```

## Critical incidents

Anything that stopped the participant, confused them for more than 30 seconds,
or made them say something unprompted about the tool. One line each, with
timestamp and task.

```
____:____  T__  ______________________________________________
____:____  T__  ______________________________________________
____:____  T__  ______________________________________________
____:____  T__  ______________________________________________
____:____  T__  ______________________________________________
____:____  T__  ______________________________________________
```

## Verbal answers after T9, verbatim

Ask before handing over the SUS form. Do not discuss the answers.

```
1. What surprised you?
   ____________________________________________________________

2. Was there a moment you did not know what the tool wanted?
   ____________________________________________________________

3. Would you use this on your own project? What would change first?
   ____________________________________________________________
```

## Technical failures during the session

Record separately from usability problems. An AI timeout, a 500, a PM API
outage or a stale token is not a usability finding, but it contaminates that
participant's Raw TLX for the task it happened in and must be reported as a
confound against that specific cell of the matrix.

```
____:____  task T__   what failed: ____________________________
           blocked the task?  Y / N
           recovered by:  participant / facilitator / restart
```

## Facilitator debrief, written within 10 minutes

Three sentences, while it is fresh. Worst moment, best moment, and what to
change in the protocol before the next session.

```
____________________________________________________________
____________________________________________________________
____________________________________________________________
```
