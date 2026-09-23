import json
import re
from typing import List, Literal, Optional, cast

from .catalogue import local_basis, lookup
from .contract import (
    AddFridgeItemsPayload,
    CheatDayPayload,
    CoachAction,
    CoachContext,
    CoachMessage,
    Citation,
    FindPlacesPayload,
    FridgeAddItem,
    LogMealPayload,
    NavigatePayload,
    parse_actions,
    SetGoalPayload,
    SuggestGroceriesPayload,
    WorkoutPlanPayload,
    ScheduleMealPrepPayload,
    WeeklyMealPlanPayload,
)
from .planner import (
    build_grocery_list,
    build_meal_plan,
    build_prep_sessions,
    detect_goal,
    week_start_for,
)

MealType = Literal["breakfast", "lunch", "dinner", "snack"]
MEAL_TYPES: tuple[MealType, ...] = ("breakfast", "lunch", "dinner", "snack")
PlaceCategory = Literal["gym", "grocery", "restaurant", "pharmacy"]
ScreenName = Literal[
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

POLICY_TERMS = (
    "diagnose",
    "diagnosis",
    "prescription",
    "medication",
    "medicine",
    "drug",
    "overdose",
    "suicidal",
    "suicide",
    "eating disorder",
    "anorexia",
    "bulimia",
    "clinical",
    "medical advice",
    "treat my",
    "cure",
    "injury",
    "fracture",
    "pregnant",
    "pregnancy",
)

GUIDANCE = (
    "You are the grounded ThriveLens coach. You may answer questions about food "
    "identification, nutrition estimates, portion math, and meal proposals using "
    "the supplied user context only. Never invent food records, nutrient values, "
    "exercise sets, or medical facts. Cite profile and recent food log values from "
    "the provided context; if context is missing, say you need that information. "
    "Distinguish 'not provided' from an empty value, and never present a plan, "
    "schedule, or reservation as existing unless the context says so. "
    "You cannot diagnose, prescribe, or treat. For anything safety-relevant, refuse. "
    "Keep answers under about 160 words. To propose logging a meal, end your answer "
    'with a JSON block shaped exactly like {"log_meal":{"food_name":"...",'
    '"amount_g":...,"meal_type":"breakfast|lunch|dinner|snack"}}.'
    ' Dates use YYYY-MM-DD; datetimes use YYYY-MM-DDTHH:MM:SS+ZZ:ZZ. Amounts use grams; '
    "weight uses kg; height uses cm; distances use meters. Weeks start on Monday; "
    "the context's now_iso and timezone anchor all dates to the user's clock."
    "\n\nYou can also control the app. When the user asks to do any of these, "
    "respond with the matching control sentence and the app will act on it: "
    'find a nearby/certain place -> say "I will find the nearest CATEGORY for you."; '
    "check whether a place is open now -> request places filtered by open now; "
    'plan this week\'s meals -> say "Here is your weekly meal plan."; '
    'schedule meal prep -> say "I will set up your meal-prep sessions."; '
    'set up a workout or gym schedule -> say "I will set up your workout week."; '
    "tell you what stock to buy -> say \"Here is your shopping list.\"; "
    "ask for a cheat day -> check eligibility; they get it only if they kept up "
    "with the plan (context consistency) and have not used one this calendar month; "
    "add foods they have at home -> acknowledge the foods they listed."
)


def _last_user_message(messages):
    for message in reversed(messages):
        if message.role == "user":
            return message.content
    return ""


def clean_reply(text: str) -> str:
    """Trim degenerate tails the small model sometimes emits (long runs of the
    same digit/punctuation after a valid answer). Keeps legit multi-line text."""
    if not text:
        return text
    cleaned = text.rstrip()
    while True:
        stripped = re.sub(r"([0-9!?._~=+#*]{6,})\s*$", "", cleaned).rstrip()
        if stripped == cleaned:
            break
        cleaned = stripped
    return cleaned


def _flat(content: str) -> str:
    words = re.sub(r"[^a-z0-9\s]", " ", content.lower())
    return re.sub(r"\s+", " ", words).strip()


def policy_refusal(messages):
    text = _flat(_last_user_message(messages))
    for term in POLICY_TERMS:
        if " " in term and term in text:
            return (
                "I cannot answer that. ThriveLens provides informational nutrition "
                "estimates only and cannot diagnose, prescribe, or treat medical "
                "conditions. Please consult a qualified professional."
            )
        if " " not in term and any(word == term for word in text.split(" ")):
            return (
                "I cannot answer that. ThriveLens provides informational nutrition "
                "estimates only and cannot diagnose, prescribe, or treat medical "
                "conditions. Please consult a qualified professional."
            )
    return None


def _profile_block(context: CoachContext) -> str:
    profile = context.profile
    if profile is None:
        return "Profile: not provided."
    parts = []
    if profile.height_cm is not None:
        parts.append(f"height {profile.height_cm:g} cm")
    if profile.weight_kg is not None:
        parts.append(f"weight {profile.weight_kg:g} kg")
    if profile.age is not None:
        parts.append(f"age {profile.age}")
    if profile.gender:
        parts.append(f"gender {profile.gender}")
    if profile.goal:
        parts.append(f"goal {profile.goal}")
    if profile.activity_level:
        parts.append(f"activity level {profile.activity_level}")
    if profile.dietary_preference:
        parts.append(f"dietary preference {profile.dietary_preference}")
    if profile.dietary_restrictions or context.dietary_restrictions:
        restrictions = profile.dietary_restrictions or context.dietary_restrictions
        parts.append("restrictions: " + ", ".join(restrictions))
    if context.goal_timeline:
        parts.append(f"goal timeline {context.goal_timeline}")
    return "Profile: " + "; ".join(parts) if parts else "Profile: not provided."


def _logs_block(context: CoachContext) -> str:
    logs = context.recent_food_logs
    if not logs:
        return "Recent food logs: none."
    lines = []
    for log in logs[:10]:
        grams = f"{log.amount_g}g" if log.amount_g else "amount unknown"
        kcal = f"{log.energy_kcal} kcal" if log.energy_kcal is not None else "kcal unknown"
        source = log.nutrient_source or ""
        lines.append(f"- {log.food_name} ({grams}, {kcal}, meal {log.meal_type or 'unknown'}, source {source})")
    return "Recent food logs:\n" + "\n".join(lines)


def _fridge_block(context: CoachContext) -> str:
    items = context.fridge_items
    if not items:
        return "Home stock: none recorded."
    references = []
    for item in items[:15]:
        qty = f" x {item.quantity:g} {item.unit or 'portion'}" if item.quantity else ""
        ref = f"{item.name}{qty}"
        if item.expiry_date:
            ref += f" (expires {item.expiry_date})"
        elif item.added_date and context.now_iso:
            ref += f" (added {item.added_date})"
        references.append(ref)
    return "Home stock: " + ", ".join(references) + "."


def _plan_block(context: CoachContext) -> str:
    pieces = []
    if context.active_meal_plan:
        pieces.append(f"meal plan: {context.active_meal_plan}")
    if context.active_workout_plan:
        pieces.append(f"workout plan: {context.active_workout_plan}")
    for plan in context.meal_plans:
        piece = f"meal plan week starting {plan.week_start}"
        if plan.goals:
            piece += " for goals " + ", ".join(plan.goals)
        pieces.append(piece)
    if context.workout_plan:
        piece = f"workout plan {context.workout_plan.name}"
        if context.workout_plan.focus:
            piece += f" focused on {context.workout_plan.focus}"
        if context.workout_plan.days_per_week:
            piece += f" {context.workout_plan.days_per_week} days/week"
        pieces.append(piece)
    for schedule in context.schedules:
        pieces.append(
            f"{schedule.kind} '{schedule.title}' scheduled {schedule.scheduled_for} ({schedule.status})"
        )
    if not pieces:
        return "Plans: none active."
    return "Plans: " + "; ".join(pieces) + "."


def _adherence_block(context: CoachContext) -> str:
    a = context.adherence
    if a is None:
        return "Consistency: no tracking data yet this month."
    used_this_month = _cheat_used_this_month(context)
    status = "used this month" if used_this_month else "available"
    eligible = bool(a.cheat_day_eligible) and not used_this_month
    return (
        f"Consistency last 30 days: {a.active_days_30} active days (target "
        f"{a.target_days_30}), {a.logged_workouts_30} workouts, streak "
        f"{a.streak_days} days. Cheat-day eligible: {'yes' if eligible else 'no'}; "
        f"{status}."
    )


def _clock_block(context: CoachContext) -> str:
    if not context.now_iso:
        return "Clock: not provided."
    if context.timezone:
        return f"Clock: user's local now is {context.now_iso} in timezone {context.timezone}."
    return f"Clock: user's local now is {context.now_iso} (timezone not provided)."


def _location_block(context: CoachContext) -> str:
    location = context.location
    if location is None:
        return "Location: not provided."
    if location.permission != "granted" or location.latitude is None or location.longitude is None:
        return f"Location: permission {location.permission}, coordinates unknown."
    return (
        f"Location: permission granted, approx. {location.latitude:.4f}, "
        f"{location.longitude:.4f}"
        + (f" (accuracy {location.accuracy_m:g} m)" if location.accuracy_m is not None else "")
        + "."
    )


def _cheat_used_this_month(context: CoachContext) -> bool:
    if not context.now_iso or not context.adherence or not context.adherence.last_cheat_day:
        return False
    return context.adherence.last_cheat_day[:7] == context.now_iso[:7]


def _goal_key(context: CoachContext) -> Optional[str]:
    goal = context.profile.goal if context.profile else None
    return detect_goal(goal)


def build_coach_messages(context: CoachContext, history):
    background = (
        f"{_profile_block(context)}\n"
        f"{_logs_block(context)}\n"
        f"{_fridge_block(context)}\n"
        f"{_plan_block(context)}\n"
        f"{_adherence_block(context)}\n"
        f"{_clock_block(context)}\n"
        f"{_location_block(context)}"
    )
    messages = [
        CoachMessage(
            role="user",
            content=f"[grounding context]\n{background}\n----\n{history[0].content}",
        )
    ]
    remaining = history[1:]
    for message in remaining:
        messages.append(message)
    return messages


def cap_chat_context(messages, max_chars: int):
    """Trim the oldest middle messages so the context fits max_chars.

    Always keeps the grounding message (index 0) and the newest message,
    dropping older context from the middle so multi-turn chats keep working
    without hitting the hard backend limit. Returns the input unchanged when
    even the minimal (grounding + newest) context is too large, so the caller
    can fail explicitly (single message too big).
    """
    if not messages:
        return messages
    if len(messages) == 1:
        return messages
    head, tail = messages[0], messages[-1]
    if len(head.content) + len(tail.content) > max_chars:
        return messages
    kept = [head]
    budget = len(head.content)
    for message in messages[1:-1]:
        if budget + len(message.content) + len(tail.content) > max_chars:
            continue
        kept.append(message)
        budget += len(message.content)
    kept.append(tail)
    return kept


def _extract_actions(text: str) -> list[CoachAction]:
    actions: list[CoachAction] = []
    i = 0
    while i < len(text):
        if text[i] != "{":
            i += 1
            continue
        depth = 0
        for j in range(i, len(text)):
            if text[j] == "{":
                depth += 1
            elif text[j] == "}":
                depth -= 1
                if depth == 0:
                    block = text[i : j + 1]
                    i = j
                    if '"log_meal"' in block:
                        try:
                            data = json.loads(block)
                        except (json.JSONDecodeError, ValueError):
                            continue
                        inner = data.get("log_meal")
                        if isinstance(inner, dict):
                            try:
                                validated_meal: MealType = cast(
                                    MealType,
                                    inner.get("meal_type", "snack"),
                                )
                                assert validated_meal in MEAL_TYPES
                                payload = LogMealPayload(
                                    food_name=str(inner["food_name"]),
                                    amount_g=float(inner.get("amount_g", 0)),
                                    meal_type=validated_meal,
                                )
                            except Exception:
                                continue
                            if (
                                payload.meal_type in MEAL_TYPES
                                and 0 < payload.amount_g <= 2000
                            ):
                                outcome = lookup(payload.food_name)
                                if outcome.basis is not None:
                                    actions.append(
                                        CoachAction(type="log_meal", payload=payload)
                                    )
        i += 1
    return actions


# ---------------------------------------------------------------------------
# Deterministic intent engine: turns the last user message into app actions.
# The model is a small food VLM; intent detection must be rule based so every
# user request reliably controls the app.
# ---------------------------------------------------------------------------

_PLACE_KEYWORDS: dict[str, str] = {
    "gym": "gym",
    "workout place": "gym",
    "fitness": "gym",
    "grocery": "grocery",
    "supermarket": "grocery",
    "market": "grocery",
    "grocery store": "grocery",
    "restaurant": "restaurant",
    "cafe": "restaurant",
    "coffee place": "restaurant",
    "pharmacy": "pharmacy",
    "drugstore": "pharmacy",
    "chemist": "pharmacy",
    "apteek": "pharmacy",
}

_PLACE_VERBS = (
    "find",
    "nearest",
    "closest",
    "nearby",
    "near me",
    "near the",
    "take me to",
    "navigate",
    "direction",
    "where is",
    "where's",
    "open",
    "locate",
    "search",
)

_GOAL_OUTCOMES = {
    "lose weight": "Fat Loss",
    "weight loss": "Fat Loss",
    "fat loss": "Fat Loss",
    "fat buning": "Fat Loss",
    "slim down": "Fat Loss",
    "cut": "Fat Loss",
    "lean": "Fat Loss",
    "gain muscle": "Muscle Gain",
    "muscle gain": "Muscle Gain",
    "grow muscle": "Muscle Gain",
    "build muscle": "Muscle Gain",
    "bulk": "Muscle Gain",
    "maintain": "Maintenance",
    "keep": "Maintenance",
    "tone": "Maintenance",
    "stay healthy": "Maintenance",
    "healthier": "Maintenance",
}


def _intent_tokens(text: str) -> str:
    return _flat(text)


def _compact(text: str) -> str:
    return _flat(text).replace(" ", "")


def _find_intent(text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    if not any(verb in flat for verb in _PLACE_VERBS):
        return None
    best: Optional[str] = None
    best_len = 0
    for keyword, category in _PLACE_KEYWORDS.items():
        if keyword in flat and len(keyword) > best_len:
            best = category
            best_len = len(keyword)
    if best is None:
        return None
    return CoachAction(
        type="find_places",
        payload=FindPlacesPayload(
            category=cast(PlaceCategory, best),
            open_now=_open_now_intent(flat),
        ),
    )


def _open_now_intent(flat: str) -> Optional[bool]:
    if "open now" in flat or "is open" in flat or "currently open" in flat:
        return True
    if "closed" in flat:
        return False
    return None


_NAVIGATE_SCREENS = {
    "scanner": "scanner",
    "scan my food": "scanner",
    "open the camera": "scanner",
    "barcode": "barcode",
    "tracking": "tracking",
    "my meals": "tracking",
    "my tracker": "tracking",
    "progress": "tracking",
    "meal plans": "meal-plans",
    "my meal plan": "meal-plans",
    "my kitchen": "fridge",
    "my fridge": "fridge",
    "fridge": "fridge",
    "maps": "maps",
    "nearby": "maps",
    "home": "home",
    "nutrition": "nutrition",
    "workout": "workout",
    "profile": "profile",
    "cheat day": "cheat-day",
    "options": "options",
}


def _navigate_intent(text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    best: Optional[str] = None
    best_len = 0
    for keyword, screen in _NAVIGATE_SCREENS.items():
        if keyword in flat and len(keyword) > best_len:
            best = screen
            best_len = len(keyword)
    if best is None:
        return None
    verbs = ("open", "take me to", "go to", "show me", "show", "where", "where's", "look at", "navigate", "what is in", "celebrate")
    if not any(verb in flat for verb in verbs):
        return None
    return CoachAction(
        type="navigate",
        payload=NavigatePayload(screen=cast(ScreenName, best)),
    )


def _meal_plan_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    compact = _compact(text)
    plan_words = ("meal plan", "plan my meals", "plan my week", "plan this week", "weekly meal", "what should i eat this week", "schedule my meals")
    compact_words = ("mealplan", "planmymeals", "schedulemymeals", "planmyweek")
    matched = any(w in flat for w in plan_words) or any(w in compact for w in compact_words)
    if not matched and "meals" in compact and any(v in flat for v in ("plan", "schedule", "planning")):
        matched = True
    if not matched:
        return None
    goal = context.profile.goal if context.profile else None
    plan = build_meal_plan(goal, context.fridge_items, now_iso=context.now_iso)
    return CoachAction(
        type="schedule_meal_plan",
        payload=plan,
    )


_MEAL_PREP_WORDS = (
    "meal prep",
    "prep my meals",
    "prep meals",
    "prep for the week",
    "bulk cook",
    "batch cook",
    "schedule meal prep",
    "do meal prep",
    "prep on",
    "prep tomorrow",
    "prepare my meals",
    "prepare meals",
)

_MEAL_PREP_COMPACT = (
    "mealprep",
    "schedulemealprep",
    "prepmymeals",
    "prepmeals",
    "domealprep",
)


def _meal_prep_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    compact = _compact(text)
    matched = any(w in flat for w in _MEAL_PREP_WORDS) or any(w in compact for w in _MEAL_PREP_COMPACT)
    if not matched and "prep" in compact and any(v in flat for v in ("meal", "meals", "week", "cook")):
        matched = True
    if not matched:
        return None
    goal = context.profile.goal if context.profile else None
    prep = build_prep_sessions(goal, context.fridge_items, now_iso=context.now_iso)
    return CoachAction(
        type="schedule_meal_prep",
        payload=prep,
    )


_WORKOUT_WORDS = (
    "workout plan",
    "workout schedule",
    "schedule my workouts",
    "schedule workouts",
    "schedules my workouts",
    "training plan",
    "plan my workouts",
    "plan workouts",
    "exercise schedule",
    "training schedule",
    "make a workout plan",
    "create a workout plan",
    "build a workout plan",
    "create a workout schedule",
    "set up my workouts",
    "set up a workout plan",
    "workout routine",
    "training routine",
    "exercise plan",
    "plan my training",
    "gym schedule",
    "gym plan",
    "gym routine",
    "make a gym schedule",
    "create a gym schedule",
    "set up a gym schedule",
)


_WORKOUT_COMPACT = (
    "workoutplan",
    "workoutschedule",
    "scheduleworkouts",
    "schedulemyworkouts",
    "planworkouts",
    "planmyworkouts",
    "trainingplan",
    "trainingschedule",
    "trainingroutine",
    "makeaworkoutplan",
    "createaworkoutplan",
    "buildaworkoutplan",
    "createaworkoutschedule",
    "setupmyworkouts",
    "workoutroutine",
    "exerciseplan",
    "exerciseschedule",
    "planmytraining",
    "gymschedule",
    "gymplan",
    "gymroutine",
)

_SCHEDULING_VERBS = (
    "schedule",
    "plan",
    "planning",
    "set up",
    "setup",
    "make",
    "create",
    "build",
    "set a routine",
)


def _workout_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    compact = _compact(text)
    matched = any(w in flat for w in _WORKOUT_WORDS)
    matched = matched or any(w in compact for w in _WORKOUT_COMPACT)
    if not matched and ("workout" in compact or "gym" in compact):
        matched = any(verb in flat for verb in _SCHEDULING_VERBS)
    if not matched:
        return None
    start_date = context.now_iso[:10] if context.now_iso else None
    return CoachAction(
        type="schedule_workout",
        payload=WorkoutPlanPayload(start_date=start_date),
    )


def _fridge_intent(text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    if "fridge" not in flat:
        return None
    chars = text.lower()
    verbs = ("add ", "put ", "i have", "have in", "stocked", "keep ", "got ")
    if not any(v in chars for v in verbs):
        return None
    words = flat.split(" ")
    items: List[FridgeAddItem] = []
    # Try bigrams first (catalogue entries like "chicken breast"), then single
    # words, validating each against the catalogue so unseen foods are ignored.
    candidates = [" ".join(words[i : i + 2]) for i in range(len(words) - 1)]
    candidates += words
    for candidate in candidates:
        basis = local_basis(candidate)
        if basis is not None:
            key = basis.food_name
            if not any(item.name == key for item in items):
                items.append(FridgeAddItem(name=key))
            if len(items) >= 12:
                break
    if not items:
        return None
    return CoachAction(type="add_fridge_items", payload=AddFridgeItemsPayload(items=items))


def _grocery_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    words = ("shopping list", "grocery list", "what to buy", "what should i buy", "buy groceries", "get groceries", "groceries")
    if not any(w in flat for w in words):
        return None
    goal = context.profile.goal if context.profile else None
    accepted_plan: Optional[WeeklyMealPlanPayload] = None
    if context.meal_plans:
        summary = context.meal_plans[0]
        accepted_plan = WeeklyMealPlanPayload(
            goal=summary.goals[0] if summary.goals else None,
            week_start=summary.week_start,
            days=summary.days,
            shopping_list=summary.shopping_list,
        )
    groceries = build_grocery_list(goal, context.fridge_items, accepted_plan=accepted_plan)
    return CoachAction(type="suggest_groceries", payload=groceries)


_TIMELINE_PHRASES = (
    "as fast as possible",
    "as quick as possible",
    "right away",
    "immediately",
    "as soon as possible",
    "quickly",
    "in 4 weeks",
    "in 8 weeks",
    "in 12 weeks",
    "in 3 months",
    "in 6 months",
    "in a year",
    "by summer",
    "this month",
    "before summer",
    "by the end of summer",
)


def _goal_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    markers = ("my goal", "my target", "goal is", "i want to", "want to become", "trying to", "aiming to", "my main goal", "lose some", "gainer", "fat and")
    if not any(m in flat for m in markers):
        return None
    best: Optional[str] = None
    best_len = 0
    for phrase, label in _GOAL_OUTCOMES.items():
        if phrase in flat and len(phrase) > best_len:
            best = label
            best_len = len(phrase)
    if best is None:
        return None
    prev_goal = context.profile.goal if context.profile else None
    prev_is_same = bool(prev_goal) and prev_goal.casefold() == best.casefold()
    previous_timeline = context.goal_timeline
    timeline = None
    for phrase in _TIMELINE_PHRASES:
        if phrase in flat:
            timeline = phrase
            break
    if timeline is None and previous_timeline and prev_is_same:
        timeline = previous_timeline
    if prev_is_same and timeline == previous_timeline:
        return None
    return CoachAction(
        type="set_goal",
        payload=SetGoalPayload(goal=best, timeline=timeline),
    )


def _cheat_day_intent(context: CoachContext, text: str) -> Optional[CoachAction]:
    flat = _intent_tokens(text)
    if not any(w in flat for w in ("cheat day", "cheat meal", "reward day", "free day")):
        return None
    adherence = context.adherence
    tracked_eligible = bool(adherence and adherence.cheat_day_eligible)
    used_this_month = _cheat_used_this_month(context)
    if used_this_month:
        return CoachAction(
            type="cheat_day",
            payload=CheatDayPayload(
                eligible=False,
                reason="you already used a cheat day this calendar month",
            ),
        )
    if tracked_eligible:
        return CoachAction(
            type="cheat_day",
            payload=CheatDayPayload(
                eligible=True,
                reason="30-day consistency tracked",
            ),
        )
    return CoachAction(
        type="cheat_day",
        payload=CheatDayPayload(
            eligible=False,
            reason="keep tracking to earn a cheat day",
        ),
    )


def detect_intents(context: CoachContext, messages) -> list[CoachAction]:
    text = _last_user_message(messages)
    if not text:
        return []
    actions: list[CoachAction] = []
    for detector in (
        _find_intent,
        _navigate_intent,
        lambda t: _meal_prep_intent(context, t),
        lambda t: _meal_plan_intent(context, t),
        lambda t: _workout_intent(context, t),
        lambda t: _goal_intent(context, t),
        lambda t: _grocery_intent(context, t),
        _fridge_intent,
        lambda t: _cheat_day_intent(context, t),
    ):
        action = detector(text)
        if action is not None:
            actions.append(action)
    return actions


def _dedupe(actions: list[CoachAction]) -> list[CoachAction]:
    seen = set()
    result: list[CoachAction] = []
    for action in actions:
        key = (action.type, json.dumps(action.payload, sort_keys=True, default=str))
        if key in seen:
            continue
        seen.add(key)
        result.append(action)
    return result


def propose_actions(context: CoachContext, messages, reply_text: str) -> list[CoachAction]:
    """Combine model-issued log_meal JSON with deterministic intents.

    Every proposed action passes through the registry allowlist; unknown or
    malformed actions are dropped before they can ever be executed.
    """
    combined = _extract_actions(reply_text) + detect_intents(context, messages)
    return parse_actions(_dedupe(combined))


def mock_reply(messages, actions: list[CoachAction]) -> str:
    """Deterministic coach reply used when no model inference is available.

    Mock mode cannot run the model, so the reply mirrors the actions the
    deterministic intent layer actually proposed. That keeps the local demo
    honest while still exercising the full propose -> approve -> execute
    pipeline for every action type on device.
    """
    if not actions:
        return (
            "I can help with meals, workouts, goals, places and more. I "
            "couldn't propose an action for that - try asking me to plan my "
            "meals, schedule workouts, or add foods to your fridge. "
            "(mock mode - no model inference ran.)"
        )
    verbs = []
    for action in actions:
        if action.type == "log_meal":
            verbs.append("log your meal")
        elif action.type == "find_places":
            verbs.append("find nearby places")
        elif action.type == "navigate":
            verbs.append(f"take you to the {action.payload.screen} screen")
        elif action.type == "schedule_workout":
            verbs.append("schedule workouts for you")
        elif action.type == "schedule_meal_plan":
            verbs.append("build your weekly meal plan")
        elif action.type == "schedule_meal_prep":
            verbs.append("schedule your meal prep")
        elif action.type == "add_fridge_items":
            verbs.append("add items to your fridge")
        elif action.type == "set_goal":
            verbs.append("set your goal")
        elif action.type == "suggest_groceries":
            verbs.append("put together a grocery list")
        elif action.type == "cheat_day":
            verbs.append("settle your cheat day")
        else:
            verbs.append("help with that")
    return (
        "Here's what I can do: "
        + "; ".join(dict.fromkeys(verbs))
        + ". Approve the proposal and I'll apply it right away. "
        "(mock mode - no model inference ran.)"
    )