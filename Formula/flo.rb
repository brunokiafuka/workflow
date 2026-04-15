class Flo < Formula
  desc "Local git workflow helper (graphite-style)"
  homepage "https://github.com/bruno_kiafuka/workflow"
  head "https://github.com/bruno_kiafuka/workflow.git", branch: "main"

  depends_on "node"

  def install
    cd "tools/flo" do
      system "npm", "install"
      libexec.install Dir["*"]
    end

    (bin/"flo").write_env_script libexec/"flo"
  end

  test do
    assert_match "flo -- your local git workflow helper", shell_output("#{bin}/flo --help")
  end
end
