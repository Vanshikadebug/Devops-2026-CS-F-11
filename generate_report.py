import sys
import subprocess
from datetime import datetime
from collections import Counter

import matplotlib.pyplot as plt
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
    Image
)


# ---------------------------------------------------------
# REPORT PERIOD: JULY 1, 2026 TO AUGUST 31, 2026
# ---------------------------------------------------------

START_DATE = "2026-07-01"
END_DATE = "2026-08-31"


def run_git_command(command):
    """Run a git command and return its output."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            capture_output=True,
            text=True
        )
        return result.stdout.strip()
    except Exception as e:
        return ""


def get_commits():
    """Get commits made during July-August 2026."""

    command = (
        f'git log --all '
        f'--since="{START_DATE}" '
        f'--until="{END_DATE} 23:59:59" '
        f'--pretty=format:"%h|%an|%ad|%s" '
        f'--date=short'
    )

    output = run_git_command(command)

    commits = []

    if output:
        for line in output.splitlines():
            parts = line.split("|", 3)

            if len(parts) == 4:
                commits.append({
                    "hash": parts[0],
                    "author": parts[1],
                    "date": parts[2],
                    "message": parts[3]
                })

    return commits


def make_graph(commits):
    """Create monthly commit graph."""

    july = 0
    august = 0

    for commit in commits:
        if commit["date"].startswith("2026-07"):
            july += 1
        elif commit["date"].startswith("2026-08"):
            august += 1

    months = ["July 2026", "August 2026"]
    values = [july, august]

    plt.figure(figsize=(8, 4))
    plt.bar(months, values)
    plt.title("GitHub Commit Activity")
    plt.xlabel("Month")
    plt.ylabel("Number of Commits")
    plt.tight_layout()

    graph_file = "commit_graph.png"
    plt.savefig(graph_file, dpi=150)
    plt.close()

    return graph_file


def create_report(commits):

    filename = "DevOps_July_August_Report.pdf"

    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        rightMargin=40,
        leftMargin=40,
        topMargin=40,
        bottomMargin=40
    )

    styles = getSampleStyleSheet()

    story = []

    # Title
    story.append(
        Paragraph(
            "DEVOPS ASSIGNMENT REPORT",
            styles["Title"]
        )
    )

    story.append(Spacer(1, 12))

    story.append(
        Paragraph(
            "GitHub Activity Report — July to August 2026",
            styles["Heading2"]
        )
    )

    story.append(Spacer(1, 12))

    # Repository information
    repo_name = run_git_command(
        "git config --get remote.origin.url"
    )

    if not repo_name:
        repo_name = "Devops-2026-CS-F-11"

    story.append(
        Paragraph(
            f"<b>Repository:</b> {repo_name}",
            styles["Normal"]
        )
    )

    story.append(
        Paragraph(
            f"<b>Report Period:</b> July 1, 2026 – August 31, 2026",
            styles["Normal"]
        )
    )

    story.append(Spacer(1, 20))

    # Summary
    total_commits = len(commits)

    authors = Counter(
        commit["author"] for commit in commits
    )

    story.append(
        Paragraph(
            "1. Activity Summary",
            styles["Heading2"]
        )
    )

    story.append(Spacer(1, 8))

    summary_data = [
        ["Metric", "Value"],
        ["Total Commits", str(total_commits)],
        ["Contributors", str(len(authors))],
        ["Report Period", "July – August 2026"]
    ]

    table = Table(summary_data, colWidths=[2.8 * inch, 2.5 * inch])

    table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.black),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ALIGN", (0, 0), (-1, -1), "CENTER"),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
        ])
    )

    story.append(table)

    story.append(Spacer(1, 20))

    # Graph
    story.append(
        Paragraph(
            "2. Commit Activity Graph",
            styles["Heading2"]
        )
    )

    story.append(Spacer(1, 10))

    graph = make_graph(commits)

    story.append(
        Image(
            graph,
            width=6.5 * inch,
            height=3.3 * inch
        )
    )

    story.append(Spacer(1, 20))

    # Contributors
    story.append(
        Paragraph(
            "3. Contributors",
            styles["Heading2"]
        )
    )

    story.append(Spacer(1, 8))

    contributor_data = [["Contributor", "Commits"]]

    for author, count in authors.most_common():
        contributor_data.append([author, str(count)])

    if len(contributor_data) == 1:
        contributor_data.append(["No commits found", "0"])

    contributor_table = Table(
        contributor_data,
        colWidths=[4 * inch, 1.5 * inch]
    )

    contributor_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.grey),
            ("ALIGN", (1, 1), (1, -1), "CENTER"),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 8),
            ("TOPPADDING", (0, 0), (-1, 0), 8),
        ])
    )

    story.append(contributor_table)

    story.append(Spacer(1, 20))

    # Commit details
    story.append(
        Paragraph(
            "4. Commit Details",
            styles["Heading2"]
        )
    )

    story.append(Spacer(1, 8))

    commit_data = [
        ["Date", "Author", "Commit", "Message"]
    ]

    for commit in commits:
        message = commit["message"]

        if len(message) > 60:
            message = message[:57] + "..."

        commit_data.append([
            commit["date"],
            commit["author"],
            commit["hash"],
            message
        ])

    if len(commit_data) == 1:
        commit_data.append([
            "-",
            "-",
            "-",
            "No commits found for the selected period."
        ])

    commit_table = Table(
        commit_data,
        colWidths=[0.9 * inch, 1.4 * inch, 0.8 * inch, 3.1 * inch],
        repeatRows=1
    )

    commit_table.setStyle(
        TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.lightgrey),
            ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
            ("GRID", (0, 0), (-1, -1), 0.4, colors.grey),
            ("FONTSIZE", (0, 0), (-1, -1), 7),
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING", (0, 0), (-1, -1), 5),
        ])
    )

    story.append(commit_table)

    story.append(Spacer(1, 20))

    story.append(
        Paragraph(
            "Generated from the Git repository history using Python, "
            "ReportLab and Matplotlib.",
            styles["Normal"]
        )
    )

    doc.build(story)

    print(f"\nReport generated successfully!")
    print(f"PDF: {filename}")


def main():

    if len(sys.argv) < 2 or sys.argv[1].lower() != "final":
        print("Usage: python generate_report.py final")
        return

    print("Generating July-August 2026 DevOps report...")
    
    commits = get_commits()

    print(f"Commits found: {len(commits)}")

    create_report(commits)


if __name__ == "__main__":
    main()