class ClaudeTools < Formula
  desc "Claude Code customizations — 3-line HUD status line"
  homepage "https://github.com/brunokiafuka/workflow"
  head "https://github.com/brunokiafuka/workflow.git", branch: "main"

  depends_on "node"

  def install
    cd "tools/claude" do
      libexec.install Dir["*"]
    end
    chmod 0755, libexec/"install"

    # Shim: expose `claude-tools` in PATH. Uses opt_libexec so brew upgrades
    # don't leave stale symlinks pointing at old cellar versions.
    (bin/"claude-tools").write <<~SH
      #!/usr/bin/env bash
      export CLAUDE_TOOLS_HOME="#{opt_libexec}"
      exec "#{opt_libexec}/install" "$@"
    SH
    chmod 0755, bin/"claude-tools"
  end

  def caveats
    <<~EOS
      Finish setup with:
        claude-tools

      This symlinks the status line into ~/.claude/statusline.js.
      Then merge the snippet from #{opt_libexec}/settings.example.json into
      ~/.claude/settings.json (statusLine + optional Stop-sound hook).
    EOS
  end

  test do
    assert_predicate libexec/"statusline.js", :exist?
    assert_predicate libexec/"install", :executable?
    assert_predicate bin/"claude-tools", :executable?
  end
end
