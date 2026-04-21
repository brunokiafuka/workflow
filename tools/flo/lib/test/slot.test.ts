import { strict as assert } from "node:assert";
import { homedir } from "node:os";
import { describe, test } from "node:test";
import { normalizeOrigin, userBaseDir } from "../slot.js";

describe("normalizeOrigin", () => {
  describe("SSH short form (git@host:path)", () => {
    test("github canonical", () => {
      assert.equal(
        normalizeOrigin("git@github.com:owner/repo.git"),
        "github.com/owner/repo",
      );
    });

    test("without .git suffix", () => {
      assert.equal(
        normalizeOrigin("git@github.com:owner/repo"),
        "github.com/owner/repo",
      );
    });

    test("nested group path", () => {
      assert.equal(
        normalizeOrigin("git@gitlab.com:group/sub/repo.git"),
        "gitlab.com/group/sub/repo",
      );
    });

    test("non-git user prefix", () => {
      assert.equal(
        normalizeOrigin("someone@host.example:owner/repo"),
        "host.example/owner/repo",
      );
    });
  });

  describe("URI form", () => {
    test("https with .git", () => {
      assert.equal(
        normalizeOrigin("https://github.com/owner/repo.git"),
        "github.com/owner/repo",
      );
    });

    test("https without .git", () => {
      assert.equal(
        normalizeOrigin("https://github.com/owner/repo"),
        "github.com/owner/repo",
      );
    });

    test("strips trailing slash", () => {
      assert.equal(
        normalizeOrigin("https://github.com/owner/repo/"),
        "github.com/owner/repo",
      );
    });

    test("strips www.", () => {
      assert.equal(
        normalizeOrigin("https://www.github.com/owner/repo.git"),
        "github.com/owner/repo",
      );
    });

    test("lowercases host", () => {
      assert.equal(
        normalizeOrigin("HTTPS://GitHub.COM/owner/repo"),
        "github.com/owner/repo",
      );
    });

    test("ignores userinfo in URI", () => {
      assert.equal(
        normalizeOrigin("https://user:pw@github.com/owner/repo"),
        "github.com/owner/repo",
      );
    });

    test("ssh:// form", () => {
      assert.equal(
        normalizeOrigin("ssh://git@gitlab.example.com/group/sub/repo"),
        "gitlab.example.com/group/sub/repo",
      );
    });

    test("git:// form", () => {
      assert.equal(
        normalizeOrigin("git://github.com/owner/repo.git"),
        "github.com/owner/repo",
      );
    });
  });

  describe("normalization guarantees", () => {
    test("SSH and HTTPS of same repo produce identical slots", () => {
      const ssh = normalizeOrigin("git@github.com:owner/repo.git");
      const https = normalizeOrigin("https://github.com/owner/repo.git");
      const sshUri = normalizeOrigin("ssh://git@github.com/owner/repo");
      assert.equal(ssh, "github.com/owner/repo");
      assert.equal(https, ssh);
      assert.equal(sshUri, ssh);
    });

    test("surrounding whitespace is trimmed", () => {
      assert.equal(
        normalizeOrigin("  git@github.com:owner/repo  "),
        "github.com/owner/repo",
      );
    });
  });

  describe("rejects bad shapes", () => {
    test("empty string", () => {
      assert.equal(normalizeOrigin(""), null);
    });

    test("whitespace only", () => {
      assert.equal(normalizeOrigin("   "), null);
    });

    test("plain text with no URL shape", () => {
      assert.equal(normalizeOrigin("not a url"), null);
    });

    test("rejects .. segment", () => {
      assert.equal(normalizeOrigin("https://github.com/../etc/passwd"), null);
    });

    test("rejects . segment", () => {
      assert.equal(normalizeOrigin("https://github.com/./repo"), null);
    });

    test("rejects empty path", () => {
      assert.equal(normalizeOrigin("https://github.com/"), null);
    });

    test("rejects empty segments (double slash)", () => {
      assert.equal(normalizeOrigin("https://github.com/owner//repo"), null);
    });

    test("rejects unsupported chars in path", () => {
      assert.equal(
        normalizeOrigin("https://github.com/owner/repo with space"),
        null,
      );
    });
  });
});

describe("userBaseDir", () => {
  const originalPlatform = process.platform;
  const setPlatform = (p: NodeJS.Platform) => {
    Object.defineProperty(process, "platform", { value: p });
  };
  const resetPlatform = () => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  };

  test("darwin returns ~/.flo and ignores XDG_CONFIG_HOME", () => {
    setPlatform("darwin");
    try {
      assert.equal(userBaseDir({ XDG_CONFIG_HOME: "/tmp/xdg" }), `${homedir()}/.flo`);
      assert.equal(userBaseDir({}), `${homedir()}/.flo`);
    } finally {
      resetPlatform();
    }
  });

  test("linux honors XDG_CONFIG_HOME when non-empty", () => {
    setPlatform("linux");
    try {
      assert.equal(
        userBaseDir({ XDG_CONFIG_HOME: "/tmp/xdg" }),
        "/tmp/xdg/flo",
      );
    } finally {
      resetPlatform();
    }
  });

  test("linux falls back to ~/.flo when XDG is unset, empty, or whitespace", () => {
    setPlatform("linux");
    try {
      assert.equal(userBaseDir({}), `${homedir()}/.flo`);
      assert.equal(userBaseDir({ XDG_CONFIG_HOME: "" }), `${homedir()}/.flo`);
      assert.equal(userBaseDir({ XDG_CONFIG_HOME: "   " }), `${homedir()}/.flo`);
    } finally {
      resetPlatform();
    }
  });

  test("windows returns ~/.flo regardless of XDG", () => {
    setPlatform("win32");
    try {
      assert.equal(userBaseDir({ XDG_CONFIG_HOME: "/tmp/xdg" }), `${homedir()}/.flo`);
    } finally {
      resetPlatform();
    }
  });
});
