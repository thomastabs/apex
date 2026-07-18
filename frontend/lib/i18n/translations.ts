// Core-surface i18n dictionary — EN/PT (pt-PT). Deliberately scoped to the
// app's structural chrome (left/right sidebar nav, command palette, the
// language switch itself), not every string in the app — see
// interview_backlog memory for the scoping decision. Extend incrementally by
// adding keys here and swapping literals for t("key") at the call site.

export const translations = {
  en: {
    // ── left sidebar: nav ──
    "nav.home": "Home",
    "nav.phase1": "Requirements",
    "nav.phase2": "Design",
    "nav.phase3": "Implementation",
    "nav.phase4": "Testing",
    "nav.phase5": "Deployment",
    "nav.phase6": "Maintenance",
    "nav.autopilot": "Autopilot",
    "nav.fixBolt": "Fix Bolt",
    "nav.traceGraph": "Trace Graph",
    "nav.analytics": "Analytics",
    "nav.dividerPhases": "Phases",
    "nav.dividerTools": "Tools",

    // ── left sidebar: chrome ──
    "sidebar.settings": "Settings",
    "sidebar.signOut": "Sign out",
    "sidebar.search": "Search…",
    "sidebar.noProjectHint": "Pick a project in the Workspace panel on the right to unlock the phase workflows.",

    // ── left sidebar: login ──
    "login.password": "Password",
    "login.authToken": "Auth Token",
    "login.signInToTaiga": "Sign in to Taiga",
    "login.createAccount": "Create account",

    // ── right sidebar (Workspace panel) ──
    "workspace.title": "Workspace",
    "workspace.section.project": "Project",
    "workspace.section.context": "Context",
    "workspace.section.board": "Board",
    "workspace.section.tasks": "Tasks",
    "workspace.section.packs": "Packs",
    "workspace.section.testplans": "Test Plans",
    "workspace.section.deploypacks": "Deploy Packs",
    "workspace.section.users": "Users",
    "workspace.selectProjectHint": "Select a project above to unlock the phase workflows.",
    "workspace.search": "Search",

    // ── command palette ──
    "palette.placeholder": "Type a command or search…",
    "palette.noResults": "No results",
    "palette.navigate": "navigate",
    "palette.run": "run",
    "palette.close": "close",
    "palette.group.commands": "Commands",
    "palette.group.epics": "Epics",
    "palette.group.stories": "Stories",
    "palette.group.tasks": "Tasks",
    "palette.group.files": "Files",
    "palette.cmd.home": "Go to Home",
    "palette.cmd.phase1": "Go to Phase 1 — Requirements",
    "palette.cmd.phase2": "Go to Phase 2 — Design",
    "palette.cmd.phase3": "Go to Phase 3 — Implementation",
    "palette.cmd.phase4": "Go to Phase 4 — Testing",
    "palette.cmd.phase5": "Go to Phase 5 — Deployment",
    "palette.cmd.phase6": "Go to Phase 6 — Traceability",
    "palette.cmd.themeDark": "Switch to Dark Mode",
    "palette.cmd.themeLight": "Switch to Light Mode",
    "palette.cmd.rebuildIndex": "Rebuild Story Index",

    // ── settings: language switch ──
    "settings.language": "Language",
    "settings.language.en": "English",
    "settings.language.pt": "Portuguese",
    "settings.language.hint": "Also sets the language AI-generated content (Gherkin, specs) is written in.",
  },
  pt: {
    "nav.home": "Início",
    "nav.phase1": "Requisitos",
    "nav.phase2": "Design",
    "nav.phase3": "Implementação",
    "nav.phase4": "Testes",
    "nav.phase5": "Implantação",
    "nav.phase6": "Manutenção",
    "nav.autopilot": "Piloto Automático",
    "nav.fixBolt": "Fix Bolt",
    "nav.traceGraph": "Grafo de Rastreabilidade",
    "nav.analytics": "Análises",
    "nav.dividerPhases": "Fases",
    "nav.dividerTools": "Ferramentas",

    "sidebar.settings": "Definições",
    "sidebar.signOut": "Terminar sessão",
    "sidebar.search": "Pesquisar…",
    "sidebar.noProjectHint": "Escolha um projeto no painel Espaço de Trabalho à direita para desbloquear os fluxos de fase.",

    "login.password": "Palavra-passe",
    "login.authToken": "Token de Autenticação",
    "login.signInToTaiga": "Iniciar sessão no Taiga",
    "login.createAccount": "Criar conta",

    "workspace.title": "Espaço de Trabalho",
    "workspace.section.project": "Projeto",
    "workspace.section.context": "Contexto",
    "workspace.section.board": "Quadro",
    "workspace.section.tasks": "Tarefas",
    "workspace.section.packs": "Pacotes",
    "workspace.section.testplans": "Planos de Teste",
    "workspace.section.deploypacks": "Pacotes de Implantação",
    "workspace.section.users": "Utilizadores",
    "workspace.selectProjectHint": "Selecione um projeto acima para desbloquear os fluxos de fase.",
    "workspace.search": "Pesquisar",

    "palette.placeholder": "Digite um comando ou pesquise…",
    "palette.noResults": "Sem resultados",
    "palette.navigate": "navegar",
    "palette.run": "executar",
    "palette.close": "fechar",
    "palette.group.commands": "Comandos",
    "palette.group.epics": "Épicos",
    "palette.group.stories": "Histórias",
    "palette.group.tasks": "Tarefas",
    "palette.group.files": "Ficheiros",
    "palette.cmd.home": "Ir para o Início",
    "palette.cmd.phase1": "Ir para a Fase 1 — Requisitos",
    "palette.cmd.phase2": "Ir para a Fase 2 — Design",
    "palette.cmd.phase3": "Ir para a Fase 3 — Implementação",
    "palette.cmd.phase4": "Ir para a Fase 4 — Testes",
    "palette.cmd.phase5": "Ir para a Fase 5 — Implantação",
    "palette.cmd.phase6": "Ir para a Fase 6 — Rastreabilidade",
    "palette.cmd.themeDark": "Mudar para Modo Escuro",
    "palette.cmd.themeLight": "Mudar para Modo Claro",
    "palette.cmd.rebuildIndex": "Reconstruir Índice de Histórias",

    "settings.language": "Idioma",
    "settings.language.en": "Inglês",
    "settings.language.pt": "Português",
    "settings.language.hint": "Também define o idioma em que o conteúdo gerado por IA (Gherkin, specs) é escrito.",
  },
} as const;

export type TranslationKey = keyof (typeof translations)["en"];
