# Semi-structured interview guides

Two guides, two populations, two purposes. **Both evaluate the framework, not
the tool.** SUS, Raw TLX and the UX questionnaire already cover the tool; if
these interviews drift into "the button was hard to find", the framework is left
with no evidence at all and the whole evaluation collapses onto the
instantiation.

Scheduled as a separate session, 30-45 minutes, not immediately after the
hour-long task session.

Recorded with explicit consent, transcribed, analysed thematically. Codebook
developed from the first two transcripts, then applied to the rest, with codes
added as they emerge.

**Semi-structured means the questions below are prompts, not a script.** Follow
what the participant raises. The one hard rule: do not defend the framework. If
a participant is wrong about what it does, note the misunderstanding as data and
correct it only at the very end of the interview.

---

## Guide 1 - Practitioners

Target: 5-8 people who have used Apex, or who work in the setting where it was
demonstrated. Establishes practicality, feasibility and perceived value in real
workflows.

### Opening (5 min)

1. Describe how your team currently goes from an idea to code in production.
2. Where does AI already appear in that, if at all? Who decided that?
3. What goes wrong most often in that path today?

Purpose: get the baseline in their own words before Apex is mentioned, so that
later comparisons are against their real process and not against an idealised
one they reconstruct after seeing the framework.

### Framework practicality (12 min)

4. The framework splits the lifecycle into six phases with a human decision at
   the end of each. Which of those decisions would genuinely be made in your
   team, and which would be rubber-stamped?
5. Which phase would your team resist most? Why that one?
6. The framework requires a specification to exist before code is generated.
   What does your team do today instead, and what would change?
7. Where would the framework slow you down for no benefit?

Question 7 is the important one and it must be asked directly. A set of
interviews in which nobody names a cost is an interview protocol failure, not a
validation.

### Value and cost (10 min)

8. What would have to be true for your team to adopt this for one project?
9. What would make you abandon it after two sprints?
10. Who in your team would have to own this for it to survive? Does that person
    exist?
11. If the tool disappeared tomorrow but you kept the framework, would you still
    use it? Which parts?

Question 11 separates the method from the instantiation directly from the
participant's mouth. It is the single strongest piece of interview evidence this
thesis can obtain.

### Governance and responsibility (8 min)

12. When AI writes code that ships and later fails, who is accountable in your
    organisation today?
13. Does the framework change that answer? Should it?
14. Does the framework's record of what was decided, and by whom, have value to
    anyone outside the team? Who?

### Close (5 min)

15. What is missing from the framework entirely?
16. Is there anything you expected me to ask and I did not?

---

## Guide 2 - Agile and Scrum experts

Target: 2-3 people with recognised depth in Agile delivery methodology, not
necessarily users of Apex. Establishes alignment with, and departure from,
established methodology.

Give them the framework document in advance. This interview is about the method
on paper; they do not have to have used the tool.

### Opening (5 min)

1. How would you describe what this framework is, in your own words?

Purpose: an immediate comprehension check. If an expert cannot restate the
framework after reading the document, that is a finding about the framework's
clarity, and it belongs in the analytical assessment criterion "clarity".

### Alignment and departure (15 min)

2. Where does this align with Scrum, or with Agile principles more broadly?
3. Where does it depart from them? Is the departure justified by what AI
   changes, or is it a reversion to stage-gated delivery?
4. The framework has explicit gates between phases. Distinguish for me: is that
   a guardrail or is that a phase gate in the Waterfall sense?
5. Does the framework make the same mistake that heavyweight processes made in
   the 2000s? What specifically protects it from that, if anything?

Questions 4 and 5 must be asked as bluntly as they are written. "Too linear,
this is Waterfall" is already the known criticism from earlier feedback; putting
it in front of an expert and recording the answer is far stronger evidence than
the author arguing against it.

### Roles and artefacts (10 min)

6. The framework treats roles as hats rather than as people. Does that work in a
   real team, or does it collapse into one person wearing all of them?
7. Which of the required artefacts would you drop? Which would you add?
8. Is the amount of documentation the framework produces proportionate to what
   it buys?

### Adoption (10 min)

9. What kind of team is this framework wrong for?
10. What would a coach have to teach for a team to run this correctly?
11. Would you recommend this to a client? Under what conditions would you refuse?

### Close (5 min)

12. If you had to defend this framework to a sceptical engineering manager, what
    would your strongest argument be? And your weakest point?

---

## Analysis

- Transcribe fully. Do not analyse from notes.
- Codebook from the first two transcripts of each group, then applied across.
- Report themes with representative anonymised quotations, identified as
  practitioner or expert.
- **Report disconfirming evidence with the same prominence as supporting
  evidence.** A themes section in which every quotation is favourable will be
  read, correctly, as selection.
- Cross-read against the UX questionnaire items E1-E3, which are the only
  framework-level items on that sheet.
- Where practitioners and experts disagree with each other, that disagreement is
  a finding: it usually marks the gap between what a method claims and what
  survives contact with a delivery team.
