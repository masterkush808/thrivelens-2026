"""Contract-level tests for the coach application-controller.

Covers the action registry (allowlist, typed coercion, malformed/unknown
rejection), the structured context blocks, quantity-aware grocery diff, meal-prep
scheduling limits, cheat-day monthly rule and week anchoring.
"""

from app.coach import build_coach_messages, detect_intents, propose_actions
from app.contract import (
    AdherenceSnapshot,
    CoachAction,
    CoachActionExecution,
    CoachContext,
    CoachMessage,
    CoachProfile,
    ExecutionStatus,
    FridgeItem,
    LocationContext,
    MealPlanSummary,
    PlanDay,
    ScheduleSummary,
    parse_action,
    parse_actions,
)
from app.planner import build_grocery_list, build_meal_plan, build_prep_sessions


def _ctx(**overrides):
    base = CoachContext(
        profile=CoachProfile(weight_kg=70.0, goal="Gain Muscle", activity_level="moderate"),
        fridge_items=[],
        adherence=AdherenceSnapshot(
            active_days_30=26,
            target_days_30=30,
            logged_workouts_30=12,
            streak_days=14,
            cheat_day_eligible=True,
        ),
        now_iso="2026-09-19T10:00:00+00:00",
        timezone="Europe/Helsinki",
    )
    return base.model_copy(update=overrides) if overrides else base


def _m(content, role="user"):
    return CoachMessage(role=role if role in ("user", "assistant") else "user", content=content)


# ---------------------------------------------------------------------------
# Action registry
# ---------------------------------------------------------------------------


def test_registry_allows_every_execution_type():
    import app.contract as contract

    allowed = {
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
    assert set(contract.SUPPORTED_ACTION_TYPES) == allowed
    assert set(contract.ACTION_PAYLOAD_MODELS.keys()) == allowed


def test_registry_coerces_raw_navigate_to_typed_payload():
    action = parse_action(CoachAction(type="navigate", payload={"screen": "fridge"}))
    assert action is not None
    assert action.type == "navigate"
    assert action.payload.screen == "fridge"


def test_registry_rejects_unknown_action_type():
    assert (
        parse_action(CoachAction(type="execute_arbitrary_code", payload={})) is None
    )


def test_registry_rejects_malformed_payload():
    assert parse_action(CoachAction(type="navigate", payload={"screen": "not-a-screen"})) is None
    assert parse_action(CoachAction(type="log_meal", payload={"food_name": "x"})) is None


def test_registry_rejects_undeclared_fields():
    action = CoachAction(type="navigate", payload={"screen": "fridge", "sudo": True})
    assert parse_action(action) is None


def test_registry_passes_typed_payload_through():
    from app.contract import WeeklyMealPlanPayload

    plan = WeeklyMealPlanPayload(week_start="2026-09-14")
    action = parse_action(CoachAction(type="schedule_meal_plan", payload=plan))
    assert action is not None
    assert action.payload.week_start == "2026-09-14"


def test_parse_actions_filters_invalid():
    actions = parse_actions(
        [
            CoachAction(type="navigate", payload={"screen": "fridge"}),
            CoachAction(type="bogus", payload={}),
            CoachAction(type="navigate", payload={"screen": "nope"}),
        ]
    )
    assert [a.type for a in actions] == ["navigate"]
    assert actions[0].payload.screen == "fridge"


def test_execution_status_literal_covers_full_lifecycle():
    expected = {"suggested", "awaiting_approval", "executing", "completed", "failed", "cancelled"}
    from typing import get_args

    assert set(get_args(ExecutionStatus)) == expected


def test_execution_result_serializes_consistently():
    exec_result = CoachActionExecution(
        execution_id="ex-1",
        action_type="navigate",
        status="completed",
        message="opened fridge",
        occurred_at="2026-09-19T10:00:00+00:00",
    )
    data = exec_result.model_dump()
    assert data["status"] == "completed"
    assert data["refs"] == []


# ---------------------------------------------------------------------------
# Structured context blocks
# ---------------------------------------------------------------------------


def test_grounding_carries_clock_location_and_diet():
    ctx = _ctx(
        profile=CoachProfile(
            goal="lose weight",
            dietary_preference="vegetarian",
            dietary_restrictions=["gluten"],
        ),
        location=LocationContext(permission="denied"),
    )
    messages = build_coach_messages(ctx, [_m("what should I eat?")])
    block = messages[0].content
    assert "Clock: user's local now is 2026-09-19T10:00:00+00:00 in timezone Europe/Helsinki" in block
    assert "Location: permission denied" in block
    assert "dietary preference vegetarian" in block
    assert "restrictions: gluten" in block


def test_grounding_distinguishes_missing_clock_from_present():
    ctx = _ctx(now_iso=None, timezone=None)
    messages = build_coach_messages(ctx, [_m("hi")])
    assert "Clock: not provided." in messages[0].content


def test_grounding_lists_structured_plans_and_schedules():
    ctx = _ctx(
        meal_plans=[
            MealPlanSummary(
                week_start="2026-09-14",
                goals=["lose weight"],
                days=[PlanDay(day=0, meals=[])],
            )
        ],
        schedules=[
            ScheduleSummary(
                kind="workout",
                title="Upper body",
                scheduled_for="2026-09-21T07:00:00+00:00",
            ),
            ScheduleSummary(
                kind="meal_prep",
                title="Weekly bulk prep",
                scheduled_for="2026-09-13T17:00:00+00:00",
            ),
        ],
    )
    messages = build_coach_messages(ctx, [_m("what's on plan?")])
    block = messages[0].content
    assert "meal plan week starting 2026-09-14" in block
    assert "workout 'Upper body' scheduled 2026-09-21T07:00:00+00:00 (scheduled)" in block
    assert "meal_prep 'Weekly bulk prep'" in block


# ---------------------------------------------------------------------------
# Meal prep understands and respects its limits
# ---------------------------------------------------------------------------


def test_meal_prep_intent_builds_bounded_sessions():
    ctx = _ctx()
    actions = detect_intents(ctx, [_m("can we do meal prep for the week?")])
    prep = [a for a in actions if a.type == "schedule_meal_prep"]
    assert len(prep) == 1
    sessions = prep[0].payload.sessions
    assert 1 <= len(sessions) <= 7
    dates = {s.date for s in sessions}
    assert len(dates) == len(sessions)
    assert all(s.tasks for s in sessions)


def test_meal_prep_sessions_derive_tasks_from_accepted_plan():
    ctx = _ctx()
    actions = detect_intents(ctx, [_m("set up meal prep for next week")])
    prep = [a for a in actions if a.type == "schedule_meal_prep"][0]
    assert any("Portion and store" in task for session in prep.payload.sessions for task in session.tasks)


def test_meal_plan_intent_anchors_week_start():
    ctx = _ctx(now_iso="2026-09-19T10:00:00+00:00")
    actions = detect_intents(ctx, [_m("plan my meals for this week")])
    plans = [a for a in actions if a.type == "schedule_meal_plan"]
    assert plans and plans[0].payload.week_start == "2026-09-14"


def test_build_prep_sessions_respects_max_sessions():
    from app.contract import ScheduleMealPrepPayload

    payload = build_prep_sessions("lose weight", [], now_iso="2026-09-19T10:00:00+00:00")
    assert len(payload.sessions) <= 7
    Schema = ScheduleMealPrepPayload
    revalidated = Schema.model_validate(payload.model_dump())
    assert len(revalidated.sessions) == len(payload.sessions)


# ---------------------------------------------------------------------------
# Quantity-aware grocery diff
# ---------------------------------------------------------------------------


def test_grocery_diff_uses_accepted_plan_and_fridge_quantities():
    fridge = [
        FridgeItem(name="chicken breast", quantity=300, unit="g"),
        FridgeItem(name="oatmeal", quantity=1, unit="kg"),
    ]
    plan = build_meal_plan("lose weight", fridge, now_iso="2026-09-19T10:00:00+00:00")
    grocery = build_grocery_list("lose weight", fridge, accepted_plan=plan)
    by_name = {item.name: item.reason for item in grocery.items}
    # Chicken breast is short: fridge has 300 g, plan needs ~2 kg -> top up.
    assert "chicken breast" in by_name
    reason = by_name["chicken breast"]
    assert reason is not None
    assert "top up" in reason
    # Oatmeal (1 kg) already covers the week's breakfasts -> not re-suggested.
    assert "oatmeal" not in by_name


def test_grocery_diff_honest_about_unknown_quantities():
    fridge = [FridgeItem(name="chicken breast", quantity=None, unit=None)]
    plan = build_meal_plan("lose weight", fridge, now_iso="2026-09-19T10:00:00+00:00")
    grocery = build_grocery_list("lose weight", fridge, accepted_plan=plan)
    names = {item.name for item in grocery.items}
    assert "chicken breast" not in names


def test_grocery_intent_uses_active_plan_when_present():
    plan = build_meal_plan("lose weight", [], now_iso="2026-09-19T10:00:00+00:00")
    assert plan.week_start is not None
    ctx = _ctx(
        meal_plans=[
            MealPlanSummary(
                week_start=plan.week_start,
                goals=["lose weight"],
                days=plan.days,
                shopping_list=plan.shopping_list,
            )
        ]
    )
    actions = detect_intents(ctx, [_m("what should I buy this week?")])
    groceries = [a for a in actions if a.type == "suggest_groceries"]
    assert groceries


# ---------------------------------------------------------------------------
# Cheat day: eligibility is earned and once per calendar month
# ---------------------------------------------------------------------------


def test_cheat_day_not_eligible_when_used_this_month():
    ctx = _ctx(
        adherence=AdherenceSnapshot(
            active_days_30=26,
            target_days_30=30,
            logged_workouts_30=12,
            streak_days=14,
            cheat_day_eligible=True,
            last_cheat_day="2026-09-05",
        )
    )
    actions = detect_intents(ctx, [_m("can I have a cheat day tonight?")])
    cheat = [a for a in actions if a.type == "cheat_day"][0]
    assert cheat.payload.eligible is False
    assert "already used a cheat day this calendar month" in cheat.payload.reason


def test_cheat_day_eligible_when_last_use_was_previous_month():
    ctx = _ctx(
        adherence=AdherenceSnapshot(
            active_days_30=26,
            target_days_30=30,
            logged_workouts_30=12,
            streak_days=14,
            cheat_day_eligible=True,
            last_cheat_day="2026-08-05",
        )
    )
    actions = detect_intents(ctx, [_m("can I have a cheat day?")])
    cheat = [a for a in actions if a.type == "cheat_day"][0]
    assert cheat.payload.eligible is True


# ---------------------------------------------------------------------------
# Navigation and places deep links
# ---------------------------------------------------------------------------


def test_navigate_to_fridge_screen():
    actions = detect_intents(_ctx(), [_m("open my fridge")])
    assert any(
        a.type == "navigate" and a.payload.screen == "fridge" for a in actions
    )


def test_navigate_to_meal_plans_screen():
    actions = detect_intents(_ctx(), [_m("show me my meal plans")])
    assert any(
        a.type == "navigate" and a.payload.screen == "meal-plans" for a in actions
    )


def test_find_places_carries_open_now_filter():
    actions = detect_intents(_ctx(), [_m("is there a pharmacy open now near me?")])
    find = [a for a in actions if a.type == "find_places"]
    assert find and find[0].payload.category == "pharmacy"
    assert find[0].payload.open_now is True


# ---------------------------------------------------------------------------
# propose_actions stays honest
# ---------------------------------------------------------------------------


def test_propose_actions_combines_intents_and_filters_bad_model_json():
    ctx = _ctx()
    reply = '{"totally_unsupported":{"x":1}}'
    actions = propose_actions(ctx, [_m("find me the nearest gym")], reply)
    types = {a.type for a in actions}
    assert types == {"find_places"}