# Task Script - Apex

Participant-facing document. Format follows the LiteraFlow task script: a
self-administered, unmoderated sequence with a short NASA-TLX form after each
substantive task and a single SUS at the end.

Source for the Word or Google Docs version handed to participants. Keep the
formatting: numbered tasks, a `[TLX]` marker on tasks that require a form, a
reference screenshot per task, and an explicit stop instruction after each
marked task.

**Marker convention:** `[TLX]` in place of a star symbol. Prints reliably in
every export path and screen reader, and cannot be mistaken for a rating.

**Before handing this out:**
- Replace all nine placeholders per language: `<TOOL LINK>`, the six per-task
  links `<TLX LINK T3>`, `<TLX LINK T4>`, `<TLX LINK T6>`, `<TLX LINK T7>`,
  `<TLX LINK T8>`, `<TLX LINK T9>`, then `<SUS FORM LINK>` and
  `<UX FORM LINK>`. Eighteen substitutions across both languages.
- **The six TLX links are prefilled links, not one link repeated.** Each has its
  task already selected, generated per `FORMS-BUILD-SHEET.md`. Pasting the same
  bare form link into all six slots re-creates exactly the failure the prefilled
  links exist to prevent: a participant selecting the wrong task, or none, and
  six rows that cannot be reassembled into the workload matrix.
- Capture the reference screenshots (slots marked below). They are not optional:
  in an unmoderated study they are the only thing preventing a participant from
  silently doing the wrong thing for ten minutes.
- Run one pilot participant who is not counted.

---
---

# EN version

# Task Script

**Tool link:** `<TOOL LINK>`

---

## Before You Begin

Thank you for taking part in this usability study. I am evaluating Apex, a tool
that supports a process for building software with AI assistance. **I am testing
the tool, not you.** There are no right or wrong answers. If something is
confusing or does not work as you expected, that is exactly the feedback I need.

The session takes about 60 minutes in total.

### Please read carefully before starting

- Complete all tasks in the order listed. Do not skip tasks.
- Tasks marked with `[TLX]` require you to fill in a short form immediately
  after finishing that task, **before** reading the next one.
- The tool uses AI. Some steps take up to a minute to finish. This is normal.
- If you get completely stuck on a task for more than five minutes, move on to
  the next one and note it in the final form.
- After the very last task, fill in the SUS form and then the short UX form.

### Your form links - keep this document open throughout

**Each `[TLX]` task has its own link.** Use the one printed in that task, not
the one above or below it - each link already knows which task it belongs to.

| Form | Link |
|---|---|
| **Workload form, Task 3** | `<TLX LINK T3>` |
| **Workload form, Task 4** | `<TLX LINK T4>` |
| **Workload form, Task 6** | `<TLX LINK T6>` |
| **Workload form, Task 7** | `<TLX LINK T7>` |
| **Workload form, Task 8** | `<TLX LINK T8>` |
| **Workload form, Task 9** | `<TLX LINK T9>` |
| **SUS form** (end of session) | `<SUS FORM LINK>` |
| **Apex UX form** (end of session) | `<UX FORM LINK>` |

Your participant code is on the card you were given. Enter it at the top of
every form so the answers can be linked together. Your name is never recorded.

---

## Tasks

### Task 1 - Sign in and open the project

Sign in to Apex with the credentials on your card, and open the project called
**Demo Project**.

*Reference screenshot:* `[SCREENSHOT: sign-in form with the PM tool selector]`

`->` Continue to the next task without filling in any form.

---

### Task 2 - Connect the project to GitHub

Connect the project to the GitHub repository listed on your card, using the
access token on the same card.

*Reference screenshot:* `[SCREENSHOT: sidebar GitHub section, connected state]`

`->` Continue to the next task without filling in any form.

---

### Task 3 `[TLX]` - Turn a requirement into locked scenarios

The team needs a new feature: **users must be able to reset a forgotten password
by email.**

Using Phase 1, write that requirement in your own words, answer any questions
the tool asks you, produce the Gherkin scenarios, and lock them.

*Reference screenshot:* `[SCREENSHOT: Phase 1 with generated Gherkin and the
assumptions panel visible]`

`->` **Stop here. Open the workload form for Task 3 - `<TLX LINK T3>` - and fill it in before continuing.**

---

### Task 4 `[TLX]` - Produce and lock the design

Continue with the same feature into Phase 2. Generate the technical design and
the visual design, review what the tool assumed on your behalf, change anything
you disagree with, and lock the design.

*Reference screenshot:* `[SCREENSHOT: Phase 2 showing Technical Design and the
collapsed Visual Design group]`

`->` **Stop here. Open the workload form for Task 4 - `<TLX LINK T4>` - and fill it in before continuing.**

---

### Task 5 - Resume a previous session

Close the browser tab completely, open the tool link again, sign back in, and
return to the work you were doing instead of starting something new.

*Reference screenshot:* `[SCREENSHOT: returning to the same active project after
a fresh sign-in]`

`->` Continue to the next task without filling in any form.

---

### Task 6 `[TLX]` - Break the work into implementation tasks

Generate the implementation packs for the password reset feature. Then look at
the task breakdown and decide which task would have to be done first.

Write the name of that task, and one sentence saying why, in the NASA-TLX form
when you open it.

*Reference screenshot:* `[SCREENSHOT: Phase 3 packs with the task dependency
graph]`

`->` **Stop here. Open the workload form for Task 6 - `<TLX LINK T6>` - and fill it in before continuing.**

---

### Task 7 `[TLX]` - Test plan and QA sign-off

Generate a test plan for the password reset feature, review it, and record that
QA has passed.

*Reference screenshot:* `[SCREENSHOT: Phase 4 test plan with the QA sign-off
control]`

`->` **Stop here. Open the workload form for Task 7 - `<TLX LINK T7>` - and fill it in before continuing.**

---

### Task 8 `[TLX]` - Deploy a different feature

Now try to deploy a **different** story, the one called **Export board to CSV**.

Tell the form what happened, in your own words.

*Reference screenshot:* `[SCREENSHOT: Phase 5 deployment gate]`

`->` **Stop here. Open the workload form for Task 8 - `<TLX LINK T8>` - and fill it in before continuing.**

---

### Task 9 `[TLX]` - Export what the tool produced

Export the artefacts the tool has produced for the password reset feature.
Download them and confirm that the files opened correctly.

*Reference screenshot:* `[SCREENSHOT: export or download-all control]`

`->` **Stop here. Open the workload form for Task 9 - `<TLX LINK T9>` - and fill it in before continuing.**

---

### Optional - only if you have time and interest

Not required, and not part of the study measures. Nothing to fill in.

- **O1** - Open Phase 6 and find out whether any feature has drifted from what
  was specified.
- **O2** - Find every artefact that traces back to the password reset
  requirement.
- **O3** - Run Autopilot on one epic and stop it before it finishes.

---

## You have completed all tasks

Please now open the **SUS form** (`<SUS FORM LINK>`) and fill it in. This takes
about three minutes.

Then open the **Apex UX form** (`<UX FORM LINK>`), which takes about five
minutes and includes three open questions.

Thank you for your time and feedback.

---
---

# Versão PT

# Guião de Tarefas

**Ligação para a ferramenta:** `<TOOL LINK>`

---

## Antes de Começar

Obrigado por participar neste estudo de usabilidade. Estou a avaliar o Apex, uma
ferramenta que apoia um processo de desenvolvimento de software com apoio de IA.
**Estou a testar a ferramenta, não o participante.** Não há respostas certas ou
erradas. Se algo for confuso ou não funcionar como esperava, é exactamente esse
o contributo de que preciso.

A sessão demora cerca de 60 minutos no total.

### Leia com atenção antes de começar

- Realize todas as tarefas pela ordem indicada. Não salte tarefas.
- As tarefas marcadas com `[TLX]` exigem o preenchimento de um formulário curto
  imediatamente a seguir, **antes** de ler a tarefa seguinte.
- A ferramenta usa IA. Alguns passos demoram até um minuto. É normal.
- Se ficar completamente bloqueado numa tarefa durante mais de cinco minutos,
  passe à seguinte e indique-o no formulário final.
- Depois da última tarefa, preencha o formulário SUS e depois o formulário UX.

### As suas ligações - mantenha este documento aberto

**Cada tarefa `[TLX]` tem a sua própria ligação.** Utilize a que está indicada
nessa tarefa, e não a de cima ou a de baixo - cada ligação já sabe a que tarefa
pertence.

| Formulário | Ligação |
|---|---|
| **Formulário de carga de trabalho, Tarefa 3** | `<TLX LINK T3>` |
| **Formulário de carga de trabalho, Tarefa 4** | `<TLX LINK T4>` |
| **Formulário de carga de trabalho, Tarefa 6** | `<TLX LINK T6>` |
| **Formulário de carga de trabalho, Tarefa 7** | `<TLX LINK T7>` |
| **Formulário de carga de trabalho, Tarefa 8** | `<TLX LINK T8>` |
| **Formulário de carga de trabalho, Tarefa 9** | `<TLX LINK T9>` |
| **Formulário SUS** (fim da sessão) | `<SUS FORM LINK>` |
| **Formulário UX do Apex** (fim da sessão) | `<UX FORM LINK>` |

O seu código de participante está no cartão que recebeu. Introduza-o no início
de cada formulário para que as respostas possam ser ligadas entre si. O seu nome
nunca é registado.

---

## Tarefas

### Tarefa 1 - Entrar e abrir o projecto

Entre no Apex com as credenciais do seu cartão e abra o projecto chamado
**Demo Project**.

`->` Passe à tarefa seguinte sem preencher qualquer formulário.

---

### Tarefa 2 - Ligar o projecto ao GitHub

Ligue o projecto ao repositório GitHub indicado no seu cartão, usando o token de
acesso do mesmo cartão.

`->` Passe à tarefa seguinte sem preencher qualquer formulário.

---

### Tarefa 3 `[TLX]` - Transformar um requisito em cenários bloqueados

A equipa precisa de uma nova funcionalidade: **os utilizadores devem poder
recuperar uma palavra-passe esquecida por email.**

Usando a Fase 1, escreva esse requisito por palavras suas, responda às perguntas
que a ferramenta lhe fizer, produza os cenários Gherkin e bloqueie-os.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 3 - `<TLX LINK T3>` - e preencha-o antes de continuar.**

---

### Tarefa 4 `[TLX]` - Produzir e bloquear o design

Continue com a mesma funcionalidade para a Fase 2. Gere o design técnico e o
design visual, reveja o que a ferramenta assumiu por si, altere aquilo de que
discordar e bloqueie o design.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 4 - `<TLX LINK T4>` - e preencha-o antes de continuar.**

---

### Tarefa 5 - Retomar uma sessão anterior

Feche completamente o separador do browser, abra novamente a ligação da
ferramenta, volte a entrar e retome o trabalho onde estava, em vez de começar
algo novo.

`->` Passe à tarefa seguinte sem preencher qualquer formulário.

---

### Tarefa 6 `[TLX]` - Dividir o trabalho em tarefas de implementação

Gere os pacotes de implementação para a funcionalidade de recuperação de
palavra-passe. Depois observe a divisão em tarefas e decida qual teria de ser
feita em primeiro lugar.

Escreva o nome dessa tarefa, e uma frase a explicar porquê, no formulário
NASA-TLX quando o abrir.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 6 - `<TLX LINK T6>` - e preencha-o antes de continuar.**

---

### Tarefa 7 `[TLX]` - Plano de testes e aprovação de QA

Gere um plano de testes para a funcionalidade, reveja-o e registe que o QA foi
aprovado.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 7 - `<TLX LINK T7>` - e preencha-o antes de continuar.**

---

### Tarefa 8 `[TLX]` - Colocar em produção uma funcionalidade diferente

Agora tente colocar em produção uma funcionalidade **diferente**, a que se chama
**Export board to CSV**.

Diga no formulário o que aconteceu, por palavras suas.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 8 - `<TLX LINK T8>` - e preencha-o antes de continuar.**

---

### Tarefa 9 `[TLX]` - Exportar o que a ferramenta produziu

Exporte os artefactos que a ferramenta produziu para a funcionalidade de
recuperação de palavra-passe. Descarregue-os e confirme que os ficheiros abriram
correctamente.

`->` **Pare aqui. Abra o formulário de carga de trabalho da Tarefa 9 - `<TLX LINK T9>` - e preencha-o antes de continuar.**

---

### Opcional - só se tiver tempo e interesse

Não é obrigatório e não faz parte das medidas do estudo. Nada a preencher.

- **O1** - Abra a Fase 6 e descubra se alguma funcionalidade se desviou daquilo
  que foi especificado.
- **O2** - Encontre todos os artefactos que remetem para o requisito de
  recuperação de palavra-passe.
- **O3** - Execute o Autopilot num épico e pare-o antes de terminar.

---

## Concluiu todas as tarefas

Abra agora o **formulário SUS** (`<SUS FORM LINK>`) e preencha-o. Demora cerca
de três minutos.

Depois abra o **formulário UX do Apex** (`<UX FORM LINK>`), que demora cerca de
cinco minutos e inclui três perguntas abertas.

Obrigado pelo seu tempo e pelo seu contributo.
