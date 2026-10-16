#!/usr/bin/env python3
"""Validate the backlog; publish with --publish using the authenticated gh CLI.

Creates only milestones, labels and issues in the repository declared below.
Never assigns users, sends messages or modifies repository source code.
Existing task IDs are recovered from GitHub to make interrupted runs resumable.
"""

import argparse
import collections
import json
import re
import subprocess
import tempfile
from pathlib import Path


ROOT = Path(__file__).resolve().parent
REPOSITORY = "gunnero/AIchat"
ROADMAP_MARKER = "<!-- ai-kundetype-roadmap:v1 -->"
LABELS = {
    "type:task": ("5C8C76", "An implementation task with completion criteria"),
    "type:roadmap": ("254B43", "Project scope, milestones and build order"),
    "priority:p0": ("B43B3B", "Critical foundation, security, privacy or release requirement"),
    "priority:p1": ("D4A34A", "Required first-release feature or usability work"),
    "priority:p2": ("A8C3AE", "Optional extension outside the first release"),
    "needs:client-input": ("C8DDEB", "Requires materials, an account or a business/privacy decision"),
    "scope:later": ("D6D6D6", "Optional; not part of the initial release"),
}


def write_json(path, value):
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, indent=2) + "\n")
    temporary.replace(path)


def api(path, method="GET", data=None, pages=False):
    command = ["gh", "api", f"repos/{REPOSITORY}/{path}"]
    if pages:
        command += ["--paginate", "--slurp"]
    if method != "GET":
        command += ["--method", method]
    if data is None:
        result = subprocess.run(command, check=True, capture_output=True, text=True, timeout=90)
    else:
        with tempfile.NamedTemporaryFile(mode="w", suffix=".json") as body:
            json.dump(data, body)
            body.flush()
            result = subprocess.run(command + ["--input", body.name], check=True,
                                    capture_output=True, text=True, timeout=90)
    value = json.loads(result.stdout)
    return [entry for page in value for entry in page] if pages else value


def validate(backlog):
    assert backlog["repository"] == REPOSITORY, "Unexpected destination"
    milestones = {m["id"]: m for m in backlog["milestones"]}
    assert len(milestones) == len(backlog["milestones"]), "Duplicate milestone ID"
    assert len({m["title"] for m in milestones.values()}) == len(milestones)
    seen = set()
    for task in backlog["tasks"]:
        assert re.fullmatch(r"AK-\d{3}", task["id"]), "Invalid task ID"
        assert task["id"] not in seen, "Duplicate task ID"
        assert task["milestone"] in milestones, "Unknown milestone"
        assert task["priority"] in {"P0", "P1", "P2"}, "Unknown priority"
        assert task["deliverable"] and len(task["acceptance"]) >= 2
        assert len(task["depends_on"]) == len(set(task["depends_on"]))
        assert set(task["depends_on"]) <= seen, f"Missing, forward or cyclic dependency: {task['id']}"
        seen.add(task["id"])
    return milestones


def task_body(task, index):
    lines = [f"<!-- ai-kundetype-task:{task['id']} -->", "",
             "## Outcome", "", task["deliverable"], "", "## Completion criteria", ""]
    lines.extend(f"- [ ] {criterion}" for criterion in task["acceptance"])
    lines.extend(["", "## Dependencies", ""])
    if task["depends_on"]:
        lines.extend(f"- #{index['tasks'][dep]['number']} ({dep})" for dep in task["depends_on"])
    else:
        lines.append("Ready to start; no prerequisite task.")
    if task.get("inputs"):
        lines.extend(["", "## Inputs needed", ""])
        lines.extend(f"- {item}" for item in task["inputs"])
    lines.extend(["", "## Planning context", "",
                  f"Suggested responsibility: **{task['role']}**. No individual is assigned.", "",
                  f"Priority: **{task['priority']}**. Project baseline and build order: #{index['roadmap']['number']}."])
    if task["milestone"] == "LATER":
        lines.extend(["", "Optional extension; schedule only if needed after the initial release."])
    return "\n".join(lines) + "\n"


def roadmap_body(backlog, index):
    lines = [ROADMAP_MARKER, "", "# AI - Kundetypeassistent", "",
        "Implementation backlog based on the agreed proposal and selected design option 1. "
        "This issue tracks planning; it does not indicate that the application has been implemented or verified.", "",
        "## Agreed product", "",
        "- Individual customer accounts. Payment takes place externally; Helle invites customers and manages packages, access and expiry.",
        "- Email-link sign-in is the initial direction. Require MFA for administrators and do not provide customer impersonation.",
        "- Customers have private conversations and history. Administrator account management does not grant access to unshared chat titles or messages.",
        "- Customers can explicitly share a fixed snapshot with Helle and revoke future access. New messages remain private; revocation cannot recall copies already made.",
        "- Customer allowances are separate from internal token/cost accounting. Include renewals, top-ups, usage visibility and enforceable limits.",
        "- Option 1: dark green sidebar, cream workspace and sage accents. Danish customer UI; English engineering tasks.",
        "- Approved instructions and knowledge define the assistant. Customer chats are not automatically reused as shared knowledge or training data.", "",
        "## First implementation batch", "",
        "Start with **AK-001–AK-009**: scope and architecture, local scaffold, design system, synthetic data, CI and a reviewable prototype. "
        "The first demo must work without live credentials or real customer information. "
        "Prepare account access and Helle's assistant materials (**AK-010–AK-011**) alongside this work. "
        "Then run the synthetic-data AI pilot (**AK-012–AK-014**) to measure quality, speed and cost.", "",
        "Milestones group deliverables; they are not a strict calendar sequence. "
        "Follow the dependencies in each issue. Begin privacy/retention decisions (AK-042) and supplier checks (AK-047) early as their inputs become available. "
        "No calendar deadlines or effort estimates have been committed.", "",
        "## Release requirements", "",
        "- Enforce ownership and entitlement checks on the server, backed by appropriate database policies; keep OpenAI credentials server-side.",
        "- Encryption in transit and at rest is required. Do not describe this server-processed architecture as end-to-end encrypted or as preventing all infrastructure administrator access.",
        "- Complete the data inventory, retention and erasure flows, export/rights handling, supplier agreements, transfer assessment and any required DPIA. "
        "GDPR readiness depends on both implementation and reviewed business/legal arrangements.",
        "- Use synthetic data until the applicable permissions, notices, supplier arrangements and privacy/security verification are complete.",
        "- Treat **2 seconds median / 5 seconds p95 to first readable text** as provisional engineering targets, not measured results or promises. "
        "Measure complete-answer time separately, using the actual model, region and privacy settings.", "",
        "## Open decisions", "",
        "Assistant instructions/files and rights to use them; expected users and concurrency; permitted personal/sensitive data; "
        "retention and legal roles; framework and suppliers; account ownership and budget; regional/retention eligibility; "
        "final prices/allowances/reset rules; domain and support arrangements. "
        "Issues requiring supplied materials, account access or owner decisions carry `needs:client-input`.", "",
        "## Backlog", "",
        "**56 first-release tasks + 2 optional extensions.** Every task has dependencies and completion criteria. "
        "P0 covers critical foundations and release requirements; P1 covers required first-release features/usability; P2 is optional. "
        "The labels are priorities, not completion states. Use each issue's open/closed state as the source of truth."]
    for milestone in backlog["milestones"]:
        remote = index["milestones"].get(milestone["id"])
        heading = f"[{milestone['title']}]({remote['html_url']})" if remote else milestone["title"]
        lines.extend(["", f"### {heading}", "", milestone["goal"], ""])
        for task in backlog["tasks"]:
            if task["milestone"] != milestone["id"]:
                continue
            issue = index["tasks"].get(task["id"])
            if issue:
                lines.append(f"- #{issue['number']} — **{task['id']}** · {task['title']} ({task['priority']})")
            else:
                lines.append(f"- **{task['id']}** · {task['title']} ({task['priority']}) — pending publication")
    lines.extend(["", "## Scope boundaries", "",
        "Admin knowledge ingestion belongs to the first release. Private customer uploads and external-payment webhooks are optional extensions. "
        "Team accounts, public sharing links, voice, native mobile apps and autonomous external actions are outside this baseline."])
    return "\n".join(lines) + "\n"


def discover_tasks(issues):
    existing = {}
    for issue in issues:
        marker = re.search(r"<!-- ai-kundetype-task:(AK-\d{3}) -->", issue.get("body") or "")
        if marker:
            task_id = marker.group(1)
            if task_id in existing:
                raise RuntimeError(f"Duplicate published ID: {task_id}")
            existing[task_id] = issue
    return existing


def local_snapshot(backlog, index):
    lines = ["# AI - Kundetypeassistent — task index", "",
             f"[Live GitHub roadmap]({index['roadmap']['url']}) · "
             f"[Milestones](https://github.com/{REPOSITORY}/milestones)", "",
             "This file is a link index. GitHub Issues is the source of truth for current status. "
             "All issues were created open; no implementation is represented as complete.", "",
             "First build batch: AK-001–AK-009. Prepare AK-010–AK-011 alongside it, then measure the synthetic-data AI pilot in AK-012–AK-014. "
             "Privacy and supplier decisions begin as soon as their inputs are available.", "",
             "See [project baseline](PROJECT.md) and [structured backlog](backlog.json)."]
    for milestone in backlog["milestones"]:
        lines.extend(["", f"## {milestone['title']}", "", milestone["goal"], "",
                      "| Task | Priority | Dependencies |", "| --- | --- | --- |"])
        for task in backlog["tasks"]:
            if task["milestone"] == milestone["id"]:
                issue = index["tasks"][task["id"]]
                lines.append(f"| [{task['id']} — {task['title']}]({issue['url']}) | {task['priority']} | "
                             f"{', '.join(task['depends_on']) or 'None'} |")
    (ROOT / "TASKS.md").write_text("\n".join(lines) + "\n")


def publish(backlog):
    existing_labels = {label["name"] for label in api("labels?per_page=100", pages=True)}
    for name, (color, description) in LABELS.items():
        if name not in existing_labels:
            api("labels", "POST", {"name": name, "color": color, "description": description})
    existing_milestones = api("milestones?state=all&per_page=100", pages=True)
    index = {"repository": REPOSITORY, "created_from": backlog["date"], "milestones": {}, "tasks": {}}
    for milestone in backlog["milestones"]:
        matches = [m for m in existing_milestones if m["title"] == milestone["title"]]
        if len(matches) > 1:
            raise RuntimeError(f"Duplicate milestone: {milestone['title']}")
        remote = matches[0] if matches else api("milestones", "POST", {
            "title": milestone["title"], "description": milestone["goal"], "state": "open"})
        index["milestones"][milestone["id"]] = {
            "number": remote["number"], "html_url": remote["html_url"], "title": remote["title"]}
    print(f"Milestones ready: {len(index['milestones'])}", flush=True)
    issues = api("issues?state=all&per_page=100", pages=True)
    roadmaps = [i for i in issues if ROADMAP_MARKER in (i.get("body") or "")]
    if len(roadmaps) > 1:
        raise RuntimeError("Duplicate roadmap issues")
    roadmap = roadmaps[0] if roadmaps else api("issues", "POST", {
        "title": "AI - Kundetypeassistent — implementation roadmap",
        "body": roadmap_body(backlog, index), "labels": ["type:roadmap"]})
    index["roadmap"] = {"number": roadmap["number"], "url": roadmap["html_url"]}
    existing = discover_tasks(issues)
    for task in backlog["tasks"]:
        if task["id"] in existing:
            remote = existing[task["id"]]
        else:
            collisions = [i for i in issues if i["title"].startswith(f"[{task['id']}]")]
            if collisions:
                raise RuntimeError(f"Unrecognised issue with task ID {task['id']}; review before retrying")
            labels = ["type:task", f"priority:{task['priority'].lower()}"]
            if task.get("inputs"):
                labels.append("needs:client-input")
            if task["milestone"] == "LATER":
                labels.append("scope:later")
            remote = api("issues", "POST", {
                "title": f"[{task['id']}] {task['title']}", "body": task_body(task, index),
                "labels": labels, "milestone": index["milestones"][task["milestone"]]["number"]})
        index["tasks"][task["id"]] = {"number": remote["number"], "url": remote["html_url"]}
        write_json(ROOT / "github-issues.json", index)
        print(f"{task['id']} -> #{remote['number']}", flush=True)
    api(f"issues/{index['roadmap']['number']}", "PATCH", {"body": roadmap_body(backlog, index)})
    local_snapshot(backlog, index)
    verify(backlog, index)
    print(f"Roadmap: {index['roadmap']['url']}", flush=True)


def verify(backlog, index):
    issues = api("issues?state=all&per_page=100", pages=True)
    tasks = discover_tasks(issues)
    assert set(tasks) == {task["id"] for task in backlog["tasks"]}, "Published task set differs"
    for task in backlog["tasks"]:
        issue = tasks[task["id"]]
        assert issue["number"] == index["tasks"][task["id"]]["number"]
        assert issue["title"] == f"[{task['id']}] {task['title']}"
        assert issue["milestone"]["number"] == index["milestones"][task["milestone"]]["number"]
        assert issue["body"] == task_body(task, index), f"Body differs: {task['id']}"
        actual_labels = {label["name"] for label in issue["labels"]}
        assert {"type:task", f"priority:{task['priority'].lower()}"} <= actual_labels
        if task.get("inputs"):
            assert "needs:client-input" in actual_labels
        if task["milestone"] == "LATER":
            assert "scope:later" in actual_labels
        assert not issue["assignees"], "Unexpected assignment"
    roadmap = next(i for i in issues if i["number"] == index["roadmap"]["number"])
    assert roadmap["body"] == roadmap_body(backlog, index), "Roadmap differs"
    print(f"Verified {len(tasks)} task bodies, milestones, labels and dependency links; "
          f"{sum(i['state'] == 'open' for i in tasks.values())} open.", flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--publish", action="store_true", help="Create GitHub planning objects")
    parser.add_argument("--verify", action="store_true", help="Check the already-published snapshot")
    args = parser.parse_args()
    if args.publish and args.verify:
        parser.error("Choose --publish or --verify")
    backlog = json.loads((ROOT / "backlog.json").read_text())
    validate(backlog)
    counts = collections.Counter(task["milestone"] for task in backlog["tasks"])
    print(f"Validated {len(backlog['tasks'])} tasks and {len(backlog['milestones'])} milestones: {dict(counts)}", flush=True)
    if args.publish:
        publish(backlog)
    elif args.verify:
        verify(backlog, json.loads((ROOT / "github-issues.json").read_text()))
    else:
        print("Validation only. No GitHub changes made.")


if __name__ == "__main__":
    main()
