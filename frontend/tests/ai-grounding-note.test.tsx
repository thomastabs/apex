import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AiGroundingNote } from "@/components/ai-grounding-note";
import type { ContextFile } from "@/lib/api/types";

const contextFile = (filename: string, content = "content"): ContextFile => ({
  filename,
  label: filename,
  content,
  chars: content.length,
  last_modified: null,
  version: "0.0.0",
});

describe("AiGroundingNote", () => {
  it("lets users add and remove extra grounding files", () => {
    const onChange = vi.fn();

    const props = {
      files: ["project-concept.md"],
      dark: false,
      availableFiles: [
        contextFile("project-concept.md"),
        contextFile("decisions.md", "# Decisions"),
        contextFile("empty.md", ""),
      ],
      onSelectedExtraFilesChange: onChange,
    } as const;

    const { rerender } = render(
      <AiGroundingNote
        {...props}
        selectedExtraFiles={[]}
      />,
    );

    expect(screen.getByText("project-concept.md")).toBeInTheDocument();
    expect(screen.queryByText("empty.md")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTitle("Add context files to this AI call"));
    fireEvent.click(screen.getByText("decisions.md"));
    expect(onChange).toHaveBeenLastCalledWith(["decisions.md"]);

    rerender(<AiGroundingNote {...props} selectedExtraFiles={["decisions.md"]} />);
    fireEvent.click(screen.getByTitle("Remove decisions.md from this AI call"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });
});
