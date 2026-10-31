"""Explicit provisioning command. Never runs during application startup."""
import argparse
import asyncio
import json
from pathlib import Path

from .config import BACKEND_DIR, settings
from .integrations.bolna import bolna


def agent_configuration():
    if not settings.public_callback_url.startswith("https://") or not settings.bolna_callback_secret:
        raise SystemExit("Set PUBLIC_CALLBACK_URL to the HTTPS callback origin and BOLNA_CALLBACK_SECRET first.")
    directory = BACKEND_DIR / "bolna"
    config = json.loads((directory / "agent.json").read_text(encoding="utf8"))
    config["agent_prompts"] = {"task_1": {"system_prompt": (directory / "prompt.md").read_text(encoding="utf8")}}
    tools, params = [], {}
    shared = {
        "lattice_voice_run_id": {"type": "string", "description": "Use the lattice_voice_run_id from your prompt."},
        "request_id": {"type": "string", "description": "Unique operation ID. Reuse only for an identical retry."},
    }
    definitions = [
        ("context", {}, [], "Read the latest inspection state before guidance, questions or any action."),
        ("propose", {"field_id": {"type": "string"}, "value": {"type": "string"}},
         ["field_id", "value"], "Stage a spoken answer or correction, then repeat it and request explicit confirmation."),
        ("confirm", {"proposal_id": {"type": "string"}, "confirmed": {"type": "boolean"}},
         ["proposal_id", "confirmed"], "Record the pending answer only after the operator explicitly confirms it."),
        ("action", {"action": {"type": "string", "enum": ["next", "go", "pause", "finish"]},
                    "position": {"type": "integer"}, "confirmed": {"type": "boolean"}},
         ["action"], "Navigate, pause or finish an inspection. Finishing requires explicit operator confirmation."),
    ]
    for action, fields, required, description in definitions:
        name = f"lattice_{action}"
        properties = {**shared, **fields}
        tools.append({"name": name, "key": "custom_task", "description": description,
                      "parameters": {"type": "object", "properties": properties,
                                     "required": [*shared, *required]}})
        mapping = {key: f"%({key})s" for key in properties}
        # Optional values have concrete defaults so provider templates never substitute missing placeholders.
        if action == "action":
            tools[-1]["parameters"]["required"].extend(["position", "confirmed"])
            tools[-1]["parameters"]["properties"]["position"]["description"] = "Zero-based step for go; use 0 otherwise."
            tools[-1]["parameters"]["properties"]["confirmed"]["description"] = "True only after explicit finish confirmation; false otherwise."
        if action != "action":
            mapping["action"] = action
        params[name] = {"url": settings.public_callback_url.rstrip("/") + "/api/v1/integrations/bolna/tool",
                        "method": "POST", "param": mapping,
                        "headers": {"Authorization": f"Bearer {settings.bolna_callback_secret}"}}
    config["agent_config"]["tasks"][0]["tools_config"]["api_tools"] = {"tools": tools, "tools_params": params}
    config["agent_config"]["tasks"][0]["tools_config"]["synthesizer"]["provider_config"]["voice_id"] = settings.bolna_voice_id
    return config


async def setup():
    result = await bolna.request("POST", "/v2/agent", agent_configuration())
    agent_id = result.get("agent_id")
    if not agent_id:
        raise SystemExit("Bolna did not return an agent ID. Check your account configuration.")
    env_path = Path(BACKEND_DIR / ".env")
    lines = env_path.read_text(encoding="utf8").splitlines() if env_path.exists() else []
    lines = [line for line in lines if not line.startswith("BOLNA_AGENT_ID=")]
    env_path.write_text("\n".join([*lines, f"BOLNA_AGENT_ID={agent_id}", ""]), encoding="utf8")
    print("Lattice agent configured. Agent ID saved to backend/.env. Restart the backend to apply it.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Provision the Lattice Bolna voice agent.")
    parser.add_argument("command", choices=["setup-bolna"])
    parser.parse_args()
    asyncio.run(setup())
