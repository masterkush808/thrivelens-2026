"""Shared checkers contract between the ThriveLens serving layer and the app.

Conventions (mirrored verbatim in the app at src/services/inference.ts):

- Action identifiers: the value of ``CoachAction.type``, restricted to the
  allowlist ``SUPPORTED_ACTION_TYPES``. Unknown types are never executed.
- Discriminator: ``type`` switches on which payload model validates the action.
- Units: grams (g) for amounts, kg for body weight, cm for height, meters (m)
  for distance/accuracy.
- Date format: ISO-8601 calendar date ``YYYY-MM-DD`` (e.g. ``2026-09-19``).
- Datetime format: ISO-8601 local datetime with offset (e.g.
  ``2026-09-19T10:00:00+02:00``). ``now_iso`` and ``timezone`` in the context
  anchor all date reasoning to the user's clock.
- Week: Monday-first; ``PlanDay.day`` is 0=Monday ... 6=Sunday; ``week_start``
  is the Monday date of the plan week.
- Execution results: ``CoachActionExecution.status`` is one of the literal
  ``ExecutionStatus`` values. ``completed`` is reported only when every
  required sub-step succeeded.
"""

from typing import Any, Dict, Iterable, List, Literal, Optional, Type

from pydantic import BaseModel, ConfigDict, Field, ValidationError


class FoodCandidate(BaseModel):
    name: str
    task: str
    confidence: float = Field(ge=0.0, le=1.0)
    raw: str = ""


class SourceRef(BaseModel):
    type: Literal["model", "dataset", "catalogue", "provider", "mock"]
    value: str


class AnalyzeResponse(BaseModel):
    request_id: str
    model_revision: str
    candidate_status: Literal["candidate", "abstained"]
    candidates: List[FoodCandidate]
    confidence: Optional[float] = None
    abstention_reason: Optional[str] = None
    source_refs: List[SourceRef]
    latency_ms: int
    is_mock: bool


class NutritionLookupRequest(BaseModel):
    request_id: str = ""
    food_name: str = Field(min_length=1, max_length=200)
    barcode: Optional[str] = None
    amount_g: float = Field(gt=0, le=2000)


class NutritionBasis(BaseModel):
    food_name: str
    matched_from: Literal["catalogue", "provider"]
    source: str
    source_ref: Optional[str] = None
    freshness: Literal["static", "fetched"]
    basis: str
    per_100g: "MacroSnapshot"
    missing_fields: List[str]


class MacroSnapshot(BaseModel):
    energy_kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    fiber_g: Optional[float] = None


class ConfirmedPortion(BaseModel):
    amount_g: float
    energy_kcal: float
    protein_g: float
    fat_g: float
    carbs_g: float
    fiber_g: Optional[float] = None


class NutritionLookupResponse(BaseModel):
    request_id: str
    candidate_status: Literal["candidate", "abstained"]
    food: Optional[NutritionBasis] = None
    confirmed: Optional[ConfirmedPortion] = None
    deterministic: bool
    abstention_reason: Optional[str] = None
    source_refs: List[SourceRef]
    is_mock: bool


class CoachMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class CoachProfile(BaseModel):
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    goal: Optional[str] = None
    activity_level: Optional[str] = None
    dietary_preference: Optional[str] = None
    dietary_restrictions: List[str] = Field(default_factory=list)


class RecentFoodLog(BaseModel):
    date: Optional[str] = None
    meal_type: Optional[str] = None
    food_name: str
    amount_g: Optional[float] = None
    energy_kcal: Optional[float] = None
    ai_model_version: Optional[str] = None
    ai_confidence: Optional[float] = None
    nutrient_source: Optional[str] = None


class FridgeItem(BaseModel):
    name: str
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    added_date: Optional[str] = None
    expiry_date: Optional[str] = None


class AdherenceSnapshot(BaseModel):
    active_days_30: int
    target_days_30: int
    logged_workouts_30: int
    streak_days: int
    cheat_day_eligible: bool
    last_cheat_day: Optional[str] = None


class LocationContext(BaseModel):
    permission: Literal["granted", "denied", "not_determined", "unavailable"]
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    accuracy_m: Optional[float] = None
    timestamp: Optional[str] = None


class MealPlanSummary(BaseModel):
    id: Optional[str] = None
    week_start: str
    goals: List[str] = Field(default_factory=list)
    days: List["PlanDay"] = Field(default_factory=list)
    shopping_list: List[str] = Field(default_factory=list)
    created_at: Optional[str] = None


class WorkoutPlanSummary(BaseModel):
    id: Optional[str] = None
    name: str
    focus: Optional[str] = None
    days_per_week: Optional[int] = None
    note: Optional[str] = None
    created_at: Optional[str] = None


class ScheduleSummary(BaseModel):
    id: Optional[str] = None
    kind: Literal["workout", "meal_prep"]
    title: str
    scheduled_for: str
    status: Literal["scheduled", "completed", "cancelled"] = "scheduled"


class CoachContext(BaseModel):
    request_id: str = ""
    profile: Optional[CoachProfile] = None
    goal_timeline: Optional[str] = None
    dietary_restrictions: List[str] = Field(default_factory=list)
    recent_food_logs: List[RecentFoodLog] = Field(default_factory=list)
    fridge_items: List[FridgeItem] = Field(default_factory=list)
    active_meal_plan: Optional[str] = None
    active_workout_plan: Optional[str] = None
    meal_plans: List[MealPlanSummary] = Field(default_factory=list)
    workout_plan: Optional[WorkoutPlanSummary] = None
    schedules: List[ScheduleSummary] = Field(default_factory=list)
    adherence: Optional[AdherenceSnapshot] = None
    now_iso: Optional[str] = None
    timezone: Optional[str] = None
    location: Optional[LocationContext] = None


class CoachRequest(BaseModel):
    context: CoachContext
    messages: List[CoachMessage] = Field(min_length=1, max_length=20)


class CoachActionPayload(BaseModel):
    """Base for all action payloads: reject unknown fields on the threshold."""
    model_config = ConfigDict(extra="forbid")


class LogMealPayload(CoachActionPayload):
    food_name: str
    amount_g: float = Field(gt=0, le=2000)
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    date: Optional[str] = None


class MealSlot(CoachActionPayload):
    meal_type: Literal["breakfast", "lunch", "dinner", "snack"]
    food_name: str
    amount_g: float = Field(gt=0, le=2000)
    note: Optional[str] = None


class PlanDay(CoachActionPayload):
    day: int = Field(ge=0, le=6)
    meals: List[MealSlot] = Field(default_factory=list)


class WeeklyMealPlanPayload(CoachActionPayload):
    goal: Optional[str] = None
    week_start: Optional[str] = None
    days: List[PlanDay] = Field(default_factory=list)
    shopping_list: List[str] = Field(default_factory=list)


class WorkoutPlanPayload(CoachActionPayload):
    days_per_week: Optional[int] = Field(default=None, ge=1, le=7)
    focus: Optional[str] = None
    note: Optional[str] = None
    start_date: Optional[str] = None


class PrepSession(CoachActionPayload):
    date: str
    session_title: str
    note: Optional[str] = None
    tasks: List[str] = Field(default_factory=list)


class ScheduleMealPrepPayload(CoachActionPayload):
    goal: Optional[str] = None
    week_start: Optional[str] = None
    sessions: List[PrepSession] = Field(max_length=7, default_factory=list)


class FridgeAddItem(CoachActionPayload):
    name: str
    category: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None


class AddFridgeItemsPayload(CoachActionPayload):
    items: List[FridgeAddItem] = Field(default_factory=list)


class GrocerySuggestionItem(CoachActionPayload):
    name: str
    reason: Optional[str] = None


class SuggestGroceriesPayload(CoachActionPayload):
    items: List[GrocerySuggestionItem] = Field(default_factory=list)


class SetGoalPayload(CoachActionPayload):
    goal: str
    timeline: Optional[str] = None


class FindPlacesPayload(CoachActionPayload):
    category: Optional[Literal["gym", "grocery", "restaurant", "pharmacy"]] = None
    query: Optional[str] = None
    open_now: Optional[bool] = None


class RenderedPlanPayload(CoachActionPayload):
    kind: Literal["meal", "workout"]
    title: str
    summary: str


class NavigatePayload(CoachActionPayload):
    screen: Literal[
        "options",
        "home",
        "scanner",
        "barcode",
        "tracking",
        "nutrition",
        "maps",
        "workout",
        "coach",
        "profile",
        "meal-plans",
        "fridge",
        "cheat-day",
    ]
    category: Optional[Literal["gym", "grocery", "restaurant", "pharmacy"]] = None
    query: Optional[str] = None
    params: Dict[str, str] = Field(default_factory=dict)


class CheatDayPayload(CoachActionPayload):
    eligible: bool
    reason: Optional[str] = None


class CoachAction(BaseModel):
    type: str
    payload: Any = None


class Citation(BaseModel):
    type: Literal["profile", "food_log", "catalogue", "policy"]
    label: str
    value: str


ExecutionStatus = Literal["suggested", "awaiting_approval", "executing", "completed", "failed", "cancelled"]


class CoachActionExecution(BaseModel):
    """Execution-result contract, mirrored by the app executor."""
    execution_id: str
    action_type: str
    status: ExecutionStatus
    message: str
    refs: List[Citation] = Field(default_factory=list)
    occurred_at: str


SUPPORTED_ACTION_TYPES: frozenset[str] = frozenset(
    {
        "log_meal",
        "find_places",
        "navigate",
        "schedule_workout",
        "schedule_meal_plan",
        "schedule_meal_prep",
        "add_fridge_items",
        "set_goal",
        "suggest_groceries",
        "cheat_day",
    }
)

ACTION_PAYLOAD_MODELS: Dict[str, Type[CoachActionPayload]] = {
    "log_meal": LogMealPayload,
    "find_places": FindPlacesPayload,
    "navigate": NavigatePayload,
    "schedule_workout": WorkoutPlanPayload,
    "schedule_meal_plan": WeeklyMealPlanPayload,
    "schedule_meal_prep": ScheduleMealPrepPayload,
    "add_fridge_items": AddFridgeItemsPayload,
    "set_goal": SetGoalPayload,
    "suggest_groceries": SuggestGroceriesPayload,
    "cheat_day": CheatDayPayload,
}


def parse_action(action: CoachAction) -> Optional[CoachAction]:
    """Coerce a raw action into a typed, validated action, or ``None``.

    Unknown ``type`` values, malformed payloads and payloads carrying
    undeclared fields never pass the threshold, so model output is never an
    execution authority on its own. Already-typed payloads (built by the
    deterministic intents) pass straight through without re-invention.
    """
    what = action.type.strip()
    if what not in SUPPORTED_ACTION_TYPES:
        return None
    payload_model = ACTION_PAYLOAD_MODELS[what]
    if isinstance(action.payload, payload_model):
        return CoachAction(type=what, payload=action.payload)
    if isinstance(action.payload, BaseModel):
        raw_payload = action.payload.model_dump()
    elif isinstance(action.payload, dict):
        raw_payload = action.payload
    else:
        raw_payload = {}
    try:
        cast_payload = payload_model.model_validate(raw_payload)
    except ValidationError:
        return None
    return CoachAction(type=what, payload=cast_payload)


def parse_actions(actions: Iterable[CoachAction]) -> List[CoachAction]:
    return [parsed for parsed in (parse_action(a) for a in actions) if parsed is not None]


class CoachResponse(BaseModel):
    request_id: str
    reply: str
    model_revision: str
    confidence: Optional[float] = None
    refusal: Optional[str] = None
    citations: List[Citation] = Field(default_factory=list)
    proposed_actions: List[CoachAction] = Field(default_factory=list)
    latency_ms: int
    is_mock: bool


MealPlanSummary.model_rebuild()
CoachActionExecution.model_rebuild()
NutritionBasis.model_rebuild()
NutritionLookupResponse.model_rebuild()