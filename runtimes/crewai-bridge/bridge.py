#!/usr/bin/env python3

import json
import sys

from crewai import Agent, Crew, Process, Task


def main() -> None:
    request = json.load(sys.stdin)

    agent_data = request["agent"]
    task_data = request["task"]

    agent = Agent(
        role=agent_data["role"],
        goal=agent_data["description"],
        backstory=(
            "This agent is executing work under the authority "
            "of the K.I.N.G.S. Workforce."
        ),
        verbose=False,
    )

    task = Task(
        description=task_data["description"],
        expected_output="\n".join(
            task_data.get("expectedOutputs", [])
        )
        or "A completed task result.",
        agent=agent,
    )

    crew = Crew(
        agents=[agent],
        tasks=[task],
        process=Process.sequential,
        verbose=False,
    )

    response = {
        "status": "bridge-ready",
        "agentId": agent_data["id"],
        "taskId": task_data["id"],
        "crewProcess": Process.sequential.value,
        "agentCreated": agent is not None,
        "taskCreated": task is not None,
        "crewCreated": crew is not None,
        "executionStarted": False,
        "reason": (
            "CrewAI objects were constructed successfully. "
            "Actual model execution is intentionally disabled "
            "during bridge verification."
        ),
    }

    print(json.dumps(response))


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "bridge-error",
                    "errorType": type(exc).__name__,
                    "error": str(exc),
                }
            ),
            file=sys.stderr,
        )
        raise
