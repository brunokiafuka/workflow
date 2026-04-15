class Flo < Formula
  desc "Local git workflow helper (graphite-style)"
  homepage "https://github.com/brunokiafuka/workflow"
  head "https://github.com/brunokiafuka/workflow.git", branch: "main"

  depends_on "node"

  def install
    cd "tools/flo" do
      system "npm", "install", "--omit=dev", "--no-audit", "--no-fund", "--no-progress"
      libexec.install Dir["*"]
    end

    # The flo shim resolves its own real path via readlink, so a plain
    # symlink into bin is enough — libexec/flo → libexec/node_modules/... works.
    bin.install_symlink libexec/"flo"
  end

  test do
    assert_match "your local git workflow helper", shell_output("#{bin}/flo --help")
  end
end
