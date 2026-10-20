#!/usr/bin/env python3
"""自检失败时开 Issue。已有同名 open issue 就追加评论，不重复开。

环境变量：GH_TOKEN / REPO / RUN_URL
只依赖标准库。
"""
import json
import os
import tempfile
import time
import urllib.request

REPO = os.environ["REPO"]
TOKEN = os.environ["GH_TOKEN"]
RUN_URL = os.environ.get("RUN_URL", "")
TITLE = "每日自检失败"
LABEL = "ci-failure"

# 不硬编码 /tmp：Git Bash 的 /tmp 和 Windows Python 的 /tmp 不是同一个目录。
# 用 tempfile 拿到的才是两边一致的那个（CI 的 Linux 上就是 /tmp）。
TMP = tempfile.gettempdir()


def api(path, data=None, method=None):
    req = urllib.request.Request(
        f"https://api.github.com/repos/{REPO}{path}",
        data=json.dumps(data).encode("utf-8") if data is not None else None,
        method=method or ("POST" if data is not None else "GET"),
        headers={
            "Authorization": f"Bearer {TOKEN}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def read_failed():
    try:
        with open(os.path.join(TMP, "failed.txt"), encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        return []


def tail_log(name, n=25):
    path = os.path.join(TMP, f"{name}.log")
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8", errors="replace") as f:
        lines = f.read().splitlines()
    return "\n".join(lines[-n:])


def build_body():
    failed = read_failed()
    parts = [f"运行记录：{RUN_URL}", ""]

    if failed:
        parts.append("**失败套件**：" + "、".join(f"`{x}`" for x in failed))
    else:
        parts.append("**失败套件**：未能定位（通常是服务器没起来，见运行日志）")

    for name in failed:
        snippet = tail_log(name)
        if snippet:
            parts.append(
                f"\n<details><summary><b>{name}</b> 日志尾部</summary>\n\n"
                f"```\n{snippet}\n```\n</details>"
            )

    parts.append("\n> 由 GitHub Actions 自动创建。修好后可以手动关掉这条。")
    return "\n".join(parts)


def find_open_issue():
    """找同名的 open issue。

    GitHub 的 issue 列表有短暂延迟，刚创建的那条可能查不到。
    列表为空时多等几轮；列表非空但没有同名，就认为确实没有。
    """
    for _ in range(4):
        issues = api(f"/issues?state=open&labels={LABEL}&per_page=100")
        hit = next(
            (i for i in issues if i.get("title") == TITLE and "pull_request" not in i),
            None,
        )
        if hit:
            return hit
        if issues:
            return None
        time.sleep(3)
    return None


def main():
    body = build_body()
    exist = find_open_issue()

    if exist:
        api(f"/issues/{exist['number']}/comments", {"body": body})
        print(f"已有 issue #{exist['number']}，已追加评论")
    else:
        created = api(
            "/issues",
            {"title": TITLE, "body": body, "labels": [LABEL]},
        )
        print(f"新建 issue #{created['number']}")


if __name__ == "__main__":
    main()
