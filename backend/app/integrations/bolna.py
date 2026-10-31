import httpx
from fastapi import HTTPException

from ..config import settings


class BolnaClient:
    async def request(self, method, path, body=None):
        if not settings.bolna_api_key:
            raise HTTPException(503, "Bolna is not configured. Add the backend voice settings.")
        try:
            async with httpx.AsyncClient(base_url="https://api.bolna.ai", timeout=settings.bolna_timeout_seconds,
                                          headers={"Authorization": f"Bearer {settings.bolna_api_key}"}) as client:
                response = await client.request(method, path, json=body)
                response.raise_for_status()
                return response.json()
        except (httpx.HTTPError, ValueError):
            # Provider payloads can contain secrets and session credentials. Do not log or reflect them.
            raise HTTPException(502, "The voice service could not complete this request. Try again shortly.") from None

    async def mint(self, run_id):
        return await self.request("POST", "/web-call/session", {
            "agent_id": settings.bolna_agent_id, "user_data": {"lattice_voice_run_id": run_id}})


bolna = BolnaClient()
