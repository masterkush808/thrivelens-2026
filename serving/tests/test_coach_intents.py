import pytest

from app.coach import _extract_actions, detect_intents, mock_reply, propose_actions
from app.contract import (
    AdherenceSnapshot,
    CoachContext,
    CoachMessage,
    CoachProfile,
    FridgeItem,
)
from app.planner import build_grocery_list, build_meal_plan, detect_goal


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
    )
    return base.model_copy(update=overrides) if overrides else base


def _m(content, role="user"):
    return CoachMessage(role=role if role in ("user", "assistant") else "user", content=content)


def test_find_places_gym():
    actions = detect_intents(_ctx(), [_m("find me the nearest gym")])
    assert any(a.type == "find_places" and a.payload.category == "gym" for a in actions)


def test_find_places_pharmacy():
    actions = detect_intents(_ctx(), [_m("where is a pharmacy near me open now?")])
    assert any(a.type == "find_places" and a.payload.category == "pharmacy" for a in actions)


def test_find_places_without_verb_ignored():
    actions = detect_intents(_ctx(), [_m("I love going to the gym")])
    assert all(a.type != "find_places" for a in actions)


def test_navigate_scanner():
    actions = detect_intents(_ctx(), [_m("open the camera to scan my food")])
    assert any(a.type == "navigate" and a.payload.screen == "scanner" for a in actions)


def test_navigate_tracking():
    actions = detect_intents(_ctx(), [_m("show me my tracking")])
    assert any(a.type == "navigate" and a.payload.screen == "tracking" for a in actions)


def test_schedule_meal_plan_builds_7_days():
    actions = detect_intents(_ctx(), [_m("plan my meals for this week")])
    plans = [a for a in actions if a.type == "schedule_meal_plan"]
    assert len(plans) == 1
    plan = plans[0].payload
    assert len(plan.days) == 7
    assert plan.days[0].meals
    assert plan.shopping_list


def test_schedule_meal_plan_uses_fridge():
    ctx = _ctx(fridge_items=[FridgeItem(name="chicken breast", category="protein")])
    actions = detect_intents(ctx, [_m("give me a meal plan")])
    plans = [a for a in actions if a.type == "schedule_meal_plan"]
    assert plans
    breakfast_or_protein_slots = []
    for day in plans[0].payload.days:
        for meal in day.meals:
            breakfast_or_protein_slots.append(meal.food_name)
    joined = " ".join(breakfast_or_protein_slots).lower()
    assert "chicken" in joined


def test_schedule_workout_intent():
    actions = detect_intents(_ctx(), [_m("set up my workout schedule")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_natural_phrasing():
    actions = detect_intents(_ctx(), [_m("schedule workouts for this week")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_plan_phrasing():
    actions = detect_intents(_ctx(), [_m("make me a workout plan")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_work_outs_spaced():
    actions = detect_intents(_ctx(), [_m("schedule work outs for this week")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_setup_phrase():
    actions = detect_intents(_ctx(), [_m("create a workout schedule")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_not_triggered_by_report():
    actions = detect_intents(_ctx(), [_m("I did a workout at the gym today")])
    assert all(a.type != "schedule_workout" for a in actions)


def test_schedule_workout_gym_schedule():
    actions = detect_intents(_ctx(), [_m("create me a gym schedule today")])
    assert len([a for a in actions if a.type == "schedule_workout"]) == 1


def test_schedule_workout_make_a_gym_plan():
    actions = detect_intents(_ctx(), [_m("make me a gym plan")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_gym_routine():
    actions = detect_intents(_ctx(), [_m("I want a gym routine")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_gym_session():
    actions = detect_intents(_ctx(), [_m("schedule a gym session this week")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_set_up_a_gym_schedule():
    actions = detect_intents(_ctx(), [_m("set up a gym schedule")])
    assert any(a.type == "schedule_workout" for a in actions)


def test_schedule_workout_gym_visit_not_triggered():
    actions = detect_intents(_ctx(), [_m("I went to the gym today and did chest")])
    assert all(a.type != "schedule_workout" for a in actions)


def test_find_gym_triggers_places_not_workout():
    actions = detect_intents(_ctx(), [_m("find me the nearest gym")])
    assert any(a.type == "find_places" and a.payload.category == "gym" for a in actions)
    assert all(a.type != "schedule_workout" for a in actions)


def test_schedule_meal_plan_compact_phrasing():
    actions = detect_intents(_ctx(), [_m("give me a meal plan for the week")])
    assert any(a.type == "schedule_meal_plan" for a in actions)


def test_schedule_meal_plan_meals_plus_verb():
    actions = detect_intents(_ctx(), [_m("plan my meals")])
    assert any(a.type == "schedule_meal_plan" for a in actions)


def test_schedule_meal_prep_prepare_phrasing():
    actions = detect_intents(_ctx(), [_m("prepare meals for the week")])
    assert any(a.type == "schedule_meal_prep" for a in actions)


def test_schedule_meal_prep_compact_phrasing():
    actions = detect_intents(_ctx(), [_m("set up meal prep on sunday")])
    assert any(a.type == "schedule_meal_prep" for a in actions)


def test_mock_reply_mirrors_detected_actions():
    ctx = _ctx()
    actions = detect_intents(ctx, [_m("schedule workouts for this week")])
    reply = mock_reply([_m("schedule workouts for this week")], actions)
    assert "schedule workouts" in reply
    assert "no model inference ran" in reply


def test_mock_reply_with_no_actions():
    reply = mock_reply([_m("what is the weather?")], [])
    assert "no model inference ran" in reply
    assert "couldn't propose" in reply


def test_add_fridge_items_intent():
    actions = detect_intents(_ctx(), [_m("add chicken breast and rice to my fridge")])
    fridge = [a for a in actions if a.type == "add_fridge_items"]
    assert len(fridge) == 1
    names = [item.name for item in fridge[0].payload.items]
    assert "chicken breast" in names
    assert "rice" in names


def test_set_goal_fat_loss_with_timeline():
    actions = detect_intents(_ctx(), [_m("my goal is to lose weight as fast as possible")])
    goals = [a for a in actions if a.type == "set_goal"]
    assert len(goals) == 1
    assert goals[0].payload.goal == "Fat Loss"
    assert "fast" in goals[0].payload.timeline


def test_set_goal_muscle_gain():
    actions = detect_intents(_ctx(), [_m("I want to gain muscle")])
    goals = [a for a in actions if a.type == "set_goal"]
    assert goals and goals[0].payload.goal == "Muscle Gain"


def test_suggest_groceries_intent():
    actions = detect_intents(_ctx(), [_m("what should I buy this week?")])
    assert any(a.type == "suggest_groceries" for a in actions)


def test_cheat_day_eligible_when_adherence_true():
    actions = detect_intents(_ctx(), [_m("can I have a cheat day?")])
    cheat = [a for a in actions if a.type == "cheat_day"]
    assert cheat and cheat[0].payload.eligible is True


def test_cheat_day_not_eligible_when_not_adherent():
    ctx = CoachContext(
        adherence=AdherenceSnapshot(
            active_days_30=3,
            target_days_30=30,
            logged_workouts_30=0,
            streak_days=1,
            cheat_day_eligible=False,
        )
    )
    actions = detect_intents(ctx, [_m("can I have a cheat day?")])
    cheat = [a for a in actions if a.type == "cheat_day"]
    assert cheat and cheat[0].payload.eligible is False


def test_propose_actions_combines_log_meal_and_intents():
    ctx = _ctx()
    reply = 'Good choice.\n{"log_meal": {"food_name": "chicken breast", "amount_g": 180, "meal_type": "lunch"}}'
    actions = propose_actions(ctx, [_m("find me the nearest gym and log my lunch")], reply)
    types = {a.type for a in actions}
    assert "log_meal" in types
    assert "find_places" in types


def test_detect_goal_labels():
    assert detect_goal("I want to lose weight") == "lose weight"
    assert detect_goal("Build muscle") == "gain muscle"
    assert detect_goal("stay healthy") == "general"
    assert detect_goal(None) == "general"


def test_build_meal_plan_validates_foods_against_catalogue():
    plan = build_meal_plan("Gain Muscle", [])
    from app.catalogue import local_basis

    for day in plan.days:
        for meal in day.meals:
            assert meal.amount_g > 0 and meal.amount_g <= 2000
            assert local_basis(meal.food_name) is not None


def test_extract_actions_still_parses_log_meal():
    actions = _extract_actions('Here you go: {"log_meal": {"food_name": "egg", "amount_g": 100, "meal_type": "snack"}}')
    assert len(actions) == 1
    assert actions[0].type == "log_meal"