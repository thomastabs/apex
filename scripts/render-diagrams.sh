#!/usr/bin/env bash
# Re-renders docs/diagrams/*.puml into docs/diagrams/Images/ (PNG + SVG).
#
# Uses the `plantuml` command if installed (Ubuntu/Debian: apt install
# plantuml graphviz). Otherwise downloads plantuml.jar into a scratch dir
# (not committed to the repo — it's a 30MB+ binary with its own GPL license)
# and uses that instead. Either way, `graphviz` (the `dot` binary) must be
# installed for the component diagram's orthogonal routing.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v dot >/dev/null 2>&1; then
  echo "graphviz not found. Install with: sudo apt install graphviz" >&2
  exit 1
fi

if command -v plantuml >/dev/null 2>&1; then
  RUN=(plantuml)
else
  JAR="${PLANTUML_JAR:-/tmp/plantuml.jar}"
  if [ ! -f "$JAR" ]; then
    echo "plantuml not found on PATH; fetching jar to $JAR"
    curl -sL -o "$JAR" "https://github.com/plantuml/plantuml/releases/latest/download/plantuml.jar"
  fi
  RUN=(java -jar "$JAR")
fi

"${RUN[@]}" -tsvg docs/diagrams/*.puml -o Images
"${RUN[@]}" -tpng docs/diagrams/*.puml -o Images

echo "Rendered docs/diagrams/Images/*.{svg,png}"
