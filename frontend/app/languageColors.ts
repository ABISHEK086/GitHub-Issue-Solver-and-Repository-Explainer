// A subset of GitHub's linguist language colors — used to render the
// repo language bar exactly like the real GitHub UI.
export const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "#f1e05a",
  TypeScript: "#3178c6",
  Python: "#3572A5",
  HTML: "#e34c26",
  CSS: "#563d7c",
  SCSS: "#c6538c",
  Java: "#b07219",
  Go: "#00ADD8",
  Rust: "#dea584",
  "C++": "#f34b7d",
  C: "#555555",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4F5D95",
  Shell: "#89e051",
  Dockerfile: "#384d54",
  Vue: "#41b883",
  Swift: "#F05138",
  Kotlin: "#A97BFF",
  Dart: "#00B4AB",
  Elixir: "#6e4a7e",
  Haskell: "#5e5086",
  Lua: "#000080",
  Scala: "#c22d40",
  R: "#198CE7",
  "Objective-C": "#438eff",
  PowerShell: "#012456",
  MATLAB: "#e16737",
  Perl: "#0298c3",
  Makefile: "#427819",
  Vim: "#199f4b",
  Julia: "#a270ba",
  Zig: "#ec915c",
  Svelte: "#ff3e00",
  Jupyter: "#DA5B0B",
  "Jupyter Notebook": "#DA5B0B",
};

export function languageColor(name: string): string {
  return LANGUAGE_COLORS[name] || "#8b949e";
}