"""LLM provider adapter.

All model calls go through one adapter so models/prompts are swappable without
touching call sites (docs/agentic-system.md). The interface exposes:

- `stream_chat` — streamed companion replies (wired to SSE later).
- `classify`    — the safety classifier pass returning {severity, category}.

Default model is `gpt-4o-mini` (OPENAI_MODEL). The safety classifier is a
first-class, non-bypassable subsystem — see docs/safety-and-privacy.md.
"""

from __future__ import annotations

from collections.abc import AsyncIterator, Sequence
from typing import Literal, Protocol

from openai import AsyncOpenAI
from pydantic import BaseModel

from app.core.config import get_settings

Role = Literal["system", "user", "assistant"]


class ChatMessage(BaseModel):
    role: Role
    content: str


class ClassifierResponse(BaseModel):
    """Output of the classifier pass. See docs/safety-and-privacy.md."""

    category: str | None = None
    severity: Literal["ok", "concern", "crisis"]
    confidence: float


class LLMAdapter(Protocol):
    """Provider-agnostic LLM interface."""

    def stream_chat(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        """Stream an assistant reply token-by-token."""
        ...

    async def chat(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str | None = None,
    ) -> str:
        """Get a non-streamed assistant response."""
        ...

    async def classify(
        self,
        text: str,
        *,
        categories: Sequence[str],
        model: str | None = None,
        context: Sequence[ChatMessage] | None = None,
    ) -> ClassifierResponse:
        """Run the safety classification pass on an inbound seeker message."""
        ...

    async def embed(
        self,
        text: str,
        *,
        model: str | None = None,
    ) -> list[float]:
        """Generate text embedding."""
        ...


class OpenAIAdapter:
    """OpenAI implementation (GPT-4o mini by default)."""

    def __init__(self, model: str | None = None) -> None:
        self._model = model or get_settings().OPENAI_MODEL
        self._client: AsyncOpenAI | None = None

    @property
    def client(self) -> AsyncOpenAI:
        if self._client is None:
            self._client = AsyncOpenAI(api_key=get_settings().OPENAI_API_KEY)
        return self._client

    async def stream_chat(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str | None = None,
    ) -> AsyncIterator[str]:
        model_name = model or self._model
        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]
        response = await self.client.chat.completions.create(
            model=model_name,
            messages=formatted,
            stream=True,
        )
        async for chunk in response:
            token = chunk.choices[0].delta.content
            if token:
                yield token

    async def chat(
        self,
        messages: Sequence[ChatMessage],
        *,
        model: str | None = None,
    ) -> str:
        model_name = model or self._model
        formatted = [{"role": msg.role, "content": msg.content} for msg in messages]
        response = await self.client.chat.completions.create(
            model=model_name,
            messages=formatted,
        )
        content = response.choices[0].message.content
        if content is None:
            raise ValueError("No response content received from OpenAI")
        return content

    async def embed(
        self,
        text: str,
        *,
        model: str | None = None,
    ) -> list[float]:
        # CLINICAL REVIEW REQUIRED (embedding model must match dimensions of vector table)
        model_name = model or "text-embedding-3-small"
        response = await self.client.embeddings.create(
            input=text,
            model=model_name,
        )
        return response.data[0].embedding

    async def classify(
        self,
        text: str,
        *,
        categories: Sequence[str],
        model: str | None = None,
        context: Sequence[ChatMessage] | None = None,
    ) -> ClassifierResponse:
        # CLINICAL REVIEW REQUIRED
        categories_str = ", ".join(f"'{cat}'" for cat in categories)
        system_prompt = (
            "You are a safety classification assistant for Hovio, a mental health companion.\n"
            "Analyze the user's input and classify it for safety concerns.\n\n"
            f"Available Categories: {categories_str}\n\n"
            "Evaluate the severity of any safety issues:\n"
            "- crisis: Active suicidal ideation, self-harm, intent to harm others, "
            "or active/immediate abuse.\n"
            "- concern: Historic/past issues, general sadness, or safety queries "
            "without active intent.\n"
            "- ok: No safety issues detected.\n\n"
            "You must respond with a JSON object containing:\n"
            "- category: The matched safety category name from the list above, or null if none.\n"
            '- severity: One of "crisis", "concern", or "ok".\n'
            "- confidence: A confidence score between 0.0 and 1.0.\n\n"
            "Ensure your output is strictly valid JSON matching this schema, "
            "with no additional text."
        )
        messages: list[dict[str, str]] = [{"role": "system", "content": system_prompt}]

        if context:
            for msg in context:
                messages.append({"role": msg.role, "content": msg.content})

        messages.append({"role": "user", "content": text})

        # CLINICAL REVIEW REQUIRED
        model_name = model or self._model

        # Use structured outputs via beta.chat.completions.parse to enforce model output schema
        response = await self.client.beta.chat.completions.parse(
            model=model_name,
            messages=messages,
            response_format=ClassifierResponse,
            temperature=0.0,
        )
        parsed = response.choices[0].message.parsed
        if parsed is None:
            raise ValueError("Failed to parse safety classification response")
        return parsed
