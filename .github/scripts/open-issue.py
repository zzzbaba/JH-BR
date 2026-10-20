#!/usr/bin/env python3
"""自检失败时开 Issue。已有同名 open issue 就追加评论，不重复开。

环境变量：GH_TOKEN / REPO / RUN_URL
只依赖标准库。
"""
import json
import os
import urllib.request

REPO = os.environ["REPO"]
TOKEN = os.environ["GH_TOKEN"]
RUN_URL = os.environ.get("RUN_URL", "")
TITLE = "每日自检失败"


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
        with open("/tmp/failed.txt", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    except FileNotFoundError:
        return []


def tail_log(name, n=25):
    path = f"/tmp/{name}.log"
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


def main():
    body = build_body()

    issues = api("/issues?state=open&per_page=100")
    exist = next(
        (i for i in issues if i.get("title") == TITLE and "pull_request" not in i),
        None,
    )

    if exist:
        api(f"/issues/{exist['number']}/comments", {"body": body})
        print(f"已有 issue #{exist['number']}，已追加评论")
    else:
        created = api("/issues", {"title": TITLE, "body": body})
        print(f"新建 issue #{created['number']}")


if __name__ == "__main__":
    main()
