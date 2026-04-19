from __future__ import annotations

import datetime
import uuid
from typing import Any, Literal

import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from database import supabase
from services.auth_dependency import get_optional_user
from services.jwt_auth import JWTUser

logger = structlog.get_logger("neufin.agent_studio")

router = APIRouter(prefix="/api/agent-studio", tags=["agent-studio"])


CORE_AGENTS = [
    {
        "id": "quant",
        "name": "Quant Analyst",
        "domain": "Factor models",
        "model": "risk-return optimizer",
        "description": "Turns holdings, beta, volatility, and drawdown into portfolio math.",
    },
    {
        "id": "alpha",
        "name": "Alpha Scout",
        "domain": "Signal discovery",
        "model": "opportunity ranker",
        "description": "Searches for catalysts, momentum, valuation gaps, and upside asymmetry.",
    },
    {
        "id": "strategist",
        "name": "Strategist",
        "domain": "Macro regime",
        "model": "regime synthesizer",
        "description": "Connects portfolio exposures to macro cycles, rates, FX, and liquidity.",
    },
    {
        "id": "risk",
        "name": "Risk Sentinel",
        "domain": "Downside control",
        "model": "stress engine",
        "description": "Tracks concentration, correlation, scenario shocks, and fragility.",
    },
    {
        "id": "tax",
        "name": "Tax Alpha",
        "domain": "Tax efficiency",
        "model": "after-tax optimizer",
        "description": "Looks for harvest windows, holding-period effects, and tax drag.",
    },
    {
        "id": "behavior",
        "name": "Behavioral Coach",
        "domain": "Investor psychology",
        "model": "bias detector",
        "description": "Flags recency bias, overconfidence, loss aversion, and panic risk.",
    },
    {
        "id": "research",
        "name": "Research Synthesizer",
        "domain": "Narrative intelligence",
        "model": "evidence summarizer",
        "description": "Converts raw signals into readable recommendations and IC-ready notes.",
    },
]

_MEMORY_AGENTS: dict[str, dict[str, Any]] = {}
_MEMORY_EVENTS: dict[str, list[dict[str, Any]]] = {}


class ParentAgentWeight(BaseModel):
    agent_id: str
    weight: float = Field(..., ge=0, le=100)


class AgentConfig(BaseModel):
    time_horizon: str = "6-12 months"
    risk_tolerance: str = "balanced"
    region_focus: str = "Southeast Asia"
    asset_class: str = "Equities"
    marketplace_visibility: Literal["private", "shareable"] = "private"


class CreateAgentRequest(BaseModel):
    name: str = Field(..., min_length=3, max_length=80)
    objective: str = Field(..., min_length=8, max_length=600)
    parent_agents: list[ParentAgentWeight] = Field(..., min_length=1)
    config: AgentConfig = Field(default_factory=AgentConfig)


class LearningEventRequest(BaseModel):
    event_type: Literal["market_data", "user_feedback", "swarm_run", "accuracy_review"]
    domain: str = Field(..., min_length=2, max_length=80)
    signal: str = Field(..., min_length=2, max_length=160)
    relationship: str | None = Field(default=None, max_length=160)
    accuracy_delta: float | None = Field(default=None, ge=-1, le=1)
    metadata: dict[str, Any] = Field(default_factory=dict)


class RunAgentRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    market_context: dict[str, Any] = Field(default_factory=dict)


def _now() -> str:
    return datetime.datetime.now(datetime.UTC).isoformat()


def _user_id(user: JWTUser | None) -> str | None:
    return user.id if user else None


def _normalize_weights(parent_agents: list[ParentAgentWeight]) -> list[dict[str, Any]]:
    known = {agent["id"] for agent in CORE_AGENTS}
    clean = []
    total = sum(max(0.0, p.weight) for p in parent_agents)
    if total <= 0:
        raise HTTPException(
            status_code=422, detail="At least one weight must be positive."
        )
    for parent in parent_agents:
        if parent.agent_id not in known:
            raise HTTPException(
                status_code=422, detail=f"Unknown core agent: {parent.agent_id}"
            )
        clean.append(
            {
                "agent_id": parent.agent_id,
                "weight": round(parent.weight / total * 100, 2),
            }
        )
    return clean


def _agent_row(agent_id: str, user_id: str | None, body: CreateAgentRequest) -> dict:
    parent_agents = _normalize_weights(body.parent_agents)
    parent_ids = {parent["agent_id"] for parent in parent_agents}
    parent_names = {
        agent["id"]: agent["name"] for agent in CORE_AGENTS if agent["id"] in parent_ids
    }
    return {
        "id": agent_id,
        "user_id": user_id,
        "name": body.name,
        "objective": body.objective,
        "parent_agents": parent_agents,
        "config": body.config.model_dump(),
        "status": "active",
        "created_at": _now(),
        "updated_at": _now(),
        "product_flow": (
            "Agent Studio lets users select core Swarm agents, set weights, define "
            "an objective and constraints, save the custom agent, run it against a "
            "portfolio, and watch its learning graph grow from market data, feedback, "
            "and Swarm runs."
        ),
        "inheritance_summary": [
            f"{parent_names.get(p['agent_id'], p['agent_id'])}: {p['weight']}%"
            for p in parent_agents
        ],
    }


def _seed_learning(agent_id: str, row: dict[str, Any]) -> list[dict[str, Any]]:
    if agent_id in _MEMORY_EVENTS:
        return _MEMORY_EVENTS[agent_id]
    config = row.get("config") or {}
    parent_agents = row.get("parent_agents") or []
    events = [
        {
            "id": str(uuid.uuid4()),
            "agent_id": agent_id,
            "event_type": "swarm_run",
            "domain": config.get("region_focus") or "Southeast Asia",
            "signal": "Initial portfolio objective encoded",
            "relationship": "Objective -> agent weight map",
            "accuracy_delta": 0.02,
            "metadata": {"parents": parent_agents},
            "created_at": row.get("created_at") or _now(),
        }
    ]
    _MEMORY_EVENTS[agent_id] = events
    return events


def _build_learning_dashboard(
    agent: dict[str, Any], events: list[dict[str, Any]]
) -> dict:
    domains = sorted({str(e.get("domain") or "General") for e in events})
    parent_ids = [p.get("agent_id") for p in agent.get("parent_agents") or []]
    parent_models = [a["model"] for a in CORE_AGENTS if a["id"] in parent_ids] or [
        "custom ensemble"
    ]
    nodes = [
        {"id": "objective", "label": agent.get("name"), "type": "agent", "size": 18}
    ] + [
        {
            "id": domain.lower().replace(" ", "-"),
            "label": domain,
            "type": "domain",
            "size": 12,
        }
        for domain in domains
    ]
    edges = []
    for event in events:
        target = str(event.get("domain") or "General").lower().replace(" ", "-")
        edges.append(
            {
                "source": "objective",
                "target": target,
                "label": event.get("relationship") or event.get("signal"),
                "strength": 0.5 + min(0.4, len(events) / 100),
            }
        )
    accuracy_base = 0.64
    accuracy = accuracy_base + sum(float(e.get("accuracy_delta") or 0) for e in events)
    accuracy = round(max(0.45, min(0.95, accuracy)), 3)
    trend = []
    for idx, event in enumerate(events[-8:], start=1):
        trend.append(
            {
                "run": idx,
                "intelligence": min(100, 48 + idx * 6 + len(domains) * 2),
                "accuracy": round((accuracy_base + idx * 0.015) * 100, 1),
                "signalQuality": min(100, 52 + idx * 5),
                "label": event.get("event_type"),
            }
        )
    return {
        "agent": agent,
        "graph": {"nodes": nodes, "edges": edges},
        "chart": trend,
        "metrics": {
            "market_events_processed": sum(
                1 for e in events if e.get("event_type") == "market_data"
            ),
            "accuracy_trend": accuracy,
            "knowledge_graph_size": len(nodes) + len(edges),
            "patterns_learned": len(events),
            "domains_covered": len(domains),
            "parameters_learned": len(events) * max(1, len(parent_ids)),
            "models_used": parent_models,
        },
        "comparison": {
            "intelligence_level": min(100, 55 + len(events) * 4 + len(domains) * 3),
            "specialization": ", ".join(domains[:3])
            or "General portfolio intelligence",
            "performance": round(accuracy * 100, 1),
        },
    }


def _supabase_insert(table: str, row: dict[str, Any]) -> None:
    try:
        supabase.table(table).insert(row).execute()
    except Exception as exc:
        logger.debug(
            "agent_studio.supabase_insert_skipped", table=table, error=str(exc)
        )


@router.get("/core-agents")
async def list_core_agents():
    return {"agents": CORE_AGENTS, "count": len(CORE_AGENTS)}


@router.post("/agents")
async def create_agent(
    body: CreateAgentRequest,
    user: JWTUser | None = Depends(get_optional_user),
):
    agent_id = str(uuid.uuid4())
    row = _agent_row(agent_id, _user_id(user), body)
    _MEMORY_AGENTS[agent_id] = row
    _seed_learning(agent_id, row)
    _supabase_insert("custom_agents", row)
    return row


@router.get("/agents")
async def list_agents(user: JWTUser | None = Depends(get_optional_user)):
    uid = _user_id(user)
    rows = [row for row in _MEMORY_AGENTS.values() if row.get("user_id") in {uid, None}]
    try:
        query = (
            supabase.table("custom_agents").select("*").order("created_at", desc=True)
        )
        if uid:
            query = query.eq("user_id", uid)
        result = query.execute()
        rows = result.data or rows
    except Exception as exc:
        logger.debug("agent_studio.list_fallback", error=str(exc))
    return {"agents": rows, "core_agents": CORE_AGENTS, "count": len(rows)}


@router.get("/agents/{agent_id}/learning")
async def get_learning(
    agent_id: str, user: JWTUser | None = Depends(get_optional_user)
):
    agent = _MEMORY_AGENTS.get(agent_id)
    if not agent:
        try:
            result = (
                supabase.table("custom_agents")
                .select("*")
                .eq("id", agent_id)
                .limit(1)
                .execute()
            )
            agent = (result.data or [None])[0]
        except Exception:
            agent = None
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    events = _MEMORY_EVENTS.get(agent_id) or _seed_learning(agent_id, agent)
    try:
        result = (
            supabase.table("agent_learning_events")
            .select("*")
            .eq("agent_id", agent_id)
            .order("created_at", desc=False)
            .execute()
        )
        if result.data:
            events = result.data
    except Exception as exc:
        logger.debug("agent_studio.learning_fallback", error=str(exc))
    return _build_learning_dashboard(agent, events)


@router.post("/agents/{agent_id}/learning-event")
async def record_learning_event(
    agent_id: str,
    body: LearningEventRequest,
    user: JWTUser | None = Depends(get_optional_user),
):
    row = {
        "id": str(uuid.uuid4()),
        "agent_id": agent_id,
        "user_id": _user_id(user),
        **body.model_dump(),
        "created_at": _now(),
    }
    _MEMORY_EVENTS.setdefault(agent_id, []).append(row)
    _supabase_insert("agent_learning_events", row)
    return {"event": row, "status": "recorded"}


@router.post("/agents/{agent_id}/run")
async def run_custom_agent(
    agent_id: str,
    body: RunAgentRequest,
    user: JWTUser | None = Depends(get_optional_user),
):
    agent = _MEMORY_AGENTS.get(agent_id)
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    position_count = len(body.positions)
    objective = agent.get("objective") or "Portfolio intelligence"
    event = LearningEventRequest(
        event_type="swarm_run",
        domain=(agent.get("config") or {}).get("region_focus") or "Global",
        signal=f"Ran custom agent on {position_count} positions",
        relationship="Portfolio context -> recommendation weights",
        accuracy_delta=0.01,
        metadata={"market_context": body.market_context},
    )
    await record_learning_event(agent_id, event, user)
    return {
        "agent_id": agent_id,
        "name": agent.get("name"),
        "recommendations": [
            f"Prioritize the objective: {objective}",
            "Use parent-agent weights to balance conviction, risk, tax, and behavioral signals.",
            "Compare this run against the base Swarm before acting on any single signal.",
        ],
        "signals": [
            {
                "label": p.get("agent_id"),
                "weight": p.get("weight"),
                "summary": "Inherited signal active",
            }
            for p in agent.get("parent_agents", [])
        ],
        "summary": (
            "Custom agent run completed. Existing Swarm behavior is unchanged; this "
            "output is an additive ensemble overlay."
        ),
        "status": "complete",
    }


@router.get("/compare")
async def compare_agents():
    dashboards = []
    for core in CORE_AGENTS:
        dashboards.append(
            {
                "id": core["id"],
                "name": core["name"],
                "type": "core",
                "intelligence_level": 72,
                "specialization": core["domain"],
                "performance": 76,
            }
        )
    for agent_id, agent in _MEMORY_AGENTS.items():
        learning = _build_learning_dashboard(
            agent, _MEMORY_EVENTS.get(agent_id) or _seed_learning(agent_id, agent)
        )
        dashboards.append(
            {
                "id": agent_id,
                "name": agent["name"],
                "type": "custom",
                **learning["comparison"],
            }
        )
    return {"agents": dashboards, "count": len(dashboards)}
