"""Deterministic weekly meal plan / grocery logic for the ThriveLens coach.

The small food model narrates in natural language but is not a reliable
structured JSON emitter, so meal plans, grocery lists and scheduling are built
here deterministically from catalogue-validated foods, the user profile goal
and the current fridge inventory. The model explains the result; the app
executes the action. Dates are ISO-8601 days; weeks start on Monday.
"""

from datetime import date, timedelta
from typing import Dict, List, Literal, Optional

from .catalogue import local_basis
from .contract import (
    FridgeItem,
    GrocerySuggestionItem,
    MealSlot,
    PlanDay,
    PrepSession,
    ScheduleMealPrepPayload,
    SuggestGroceriesPayload,
    WeeklyMealPlanPayload,
)

MealTypeLiteral = Literal["breakfast", "lunch", "dinner", "snack"]
_MEAL_ORDER: tuple[MealTypeLiteral, ...] = ("breakfast", "lunch", "dinner", "snack")

# goal keyword -> canonical goal key
_GOAL_ALIASES = {
    "lose weight": {"lose", "loss", "fat loss", "cut", "weight loss", "slim", "reduce", "deficit"},
    "gain muscle": {"gain", "muscle", "bulk", "build", "grow", "strength"},
    "maintain": {"maintain", "maintenance", "tone", "keep", "healthy lifestyle"},
}

# Each goal has per-slot candidate foods, listed as (name, amount_g).
# Cycle through them across the week; prefer fridge items when available.
_TEMPLATES: Dict[str, Dict[str, List[tuple]]] = {
    "lose weight": {
        "breakfast": [("oatmeal", 60), ("greek yogurt", 150), ("egg", 113)],
        "lunch": [
            ("chicken breast", 150),
            ("salmon", 140),
            ("tofu", 160),
        ],
        "dinner": [
            ("chicken breast", 140),
            ("cod", 160),
            ("lean ground beef", 140),
        ],
        "snack": [("almonds", 20), ("apple", 180), ("carrot", 100)],
    },
    "gain muscle": {
        "breakfast": [("oats", 80), ("egg", 113), ("greek yogurt", 200)],
        "lunch": [
            ("chicken breast", 180),
            ("beef", 160),
            ("salmon", 180),
        ],
        "dinner": [
            ("chicken breast", 170),
            ("tuna", 160),
            ("beef steak", 180),
        ],
        "snack": [("peanut butter", 30), ("banana", 150), ("almonds", 30)],
    },
    "maintain": {
        "breakfast": [("oatmeal", 60), ("egg", 113), ("whole wheat bread", 80)],
        "lunch": [
            ("chicken breast", 150),
            ("lentils", 180),
            ("salmon", 150),
        ],
        "dinner": [
            ("chicken breast", 140),
            ("quinoa", 120),
            ("tilapia", 160),
        ],
        "snack": [("strawberries", 120), ("hummus", 40), ("apple", 180)],
    },
    "general": {
        "breakfast": [("oatmeal", 60), ("egg", 113), ("greek yogurt", 150)],
        "lunch": [
            ("chicken breast", 150),
            ("beef", 150),
            ("lentils", 180),
        ],
        "dinner": [
            ("salmon", 150),
            ("chicken breast", 140),
            ("tofu", 160),
        ],
        "snack": [("almonds", 25), ("banana", 120), ("carrot", 100)],
    },
}

# Companion foods added to a chosen protein to make a rounded plate.
_COMPANIONS = {
    "rice": (100, "side"),  # (amount_g, role)
    "brown rice": (100, "side"),
    "quinoa": (100, "side"),
    "broccoli": (120, "veg"),
    "spinach": (80, "veg"),
    "sweet potato": (140, "side"),
    "vegetables": (130, "veg"),
    "avocado": (60, "veg"),
}


def _known(name: str) -> bool:
    return local_basis(name) is not None


def detect_goal(profile_goal: Optional[str]) -> str:
    if not profile_goal:
        return "general"
    text = profile_goal.lower()
    for key, aliases in _GOAL_ALIASES.items():
        for alias in aliases:
            if alias in text:
                return key
    return "general"


def _fridge_keys(fridge: List[FridgeItem]) -> List[str]:
    keys: List[str] = []
    for item in fridge:
        if not item.name:
            continue
        basis = local_basis(item.name)
        if basis is not None:
            keys.append(basis.food_name.lower())
    return keys


def _prefer_fridge(candidates: List[tuple], fridge_keys: List[str]) -> tuple:
    for name, amount in candidates:
        basis = local_basis(name)
        cl = basis.food_name.lower() if basis else name.lower()
        for fridge_key in fridge_keys:
            if fridge_key in cl or cl in fridge_key:
                return (name, amount)
    return candidates[0]


def _plan_day(
    day_index: int,
    goal_key: str,
    fridge_keys: List[str],
    with_companions: bool,
) -> PlanDay:
    templates = _TEMPLATES.get(goal_key, _TEMPLATES["general"])
    meals: List[MealSlot] = []
    for meal_type in _MEAL_ORDER:
        candidates = templates[meal_type]
        base_name, base_amount = _prefer_fridge(candidates, fridge_keys)
        meals.append(_slot(meal_type, base_name, base_amount))
    if with_companions:
        # Attach a starch + veg companion to lunch and dinner.
        for slot_index in (1, 2):
            protein = meals[slot_index].food_name
            side_name, side_amount, _ = _prefer_companions(fridge_keys)
            meals.insert(
                slot_index + 1,
                _slot(meals[slot_index].meal_type, side_name, side_amount),
            )
    return PlanDay(day=day_index, meals=meals)


def _slot(meal_type: MealTypeLiteral, name: str, amount_g: int) -> MealSlot:
    return MealSlot(meal_type=meal_type, food_name=name, amount_g=float(amount_g))


def _prefer_companions(fridge_keys: List[str]) -> tuple:
    items = list(_COMPANIONS.items())
    for fk in fridge_keys:
        for name, (amount, _role) in items:
            cl = name.lower()
            if fk in cl or cl in fk:
                return (name, amount, None)
    name, (amount, _role) = items[0]
    return (name, amount, None)


def week_start_for(now_iso: Optional[str]) -> str:
    """Monday (ISO week start) for the plan week.

    ``now_iso`` is the user's local now (ISO-8601); when absent we fall back to
    the server's today so the helper stays deterministic.
    """
    try:
        if now_iso:
            ref = date.fromisoformat(now_iso[:10])
        else:
            ref = date.today()
    except ValueError:
        ref = date.today()
    return (ref - timedelta(days=ref.weekday())).isoformat()


def build_meal_plan(
    profile_goal: Optional[str],
    fridge: List[FridgeItem],
    days: int = 7,
    now_iso: Optional[str] = None,
) -> WeeklyMealPlanPayload:
    goal_key = detect_goal(profile_goal)
    fridge_keys = _fridge_keys(fridge)
    plan_days = [
        _plan_day(i, goal_key, fridge_keys, with_companions=(goal_key in ("lose weight", "maintain")))
        for i in range(max(1, min(days, 7)))
    ]
    shopping = _shopping_list(plan_days, fridge_keys)
    return WeeklyMealPlanPayload(
        goal=goal_key,
        week_start=week_start_for(now_iso),
        days=plan_days,
        shopping_list=shopping,
    )


def _all_foods(plan: WeeklyMealPlanPayload) -> List[str]:
    foods: List[str] = []
    for day in plan.days:
        for meal in day.meals:
            foods.append(meal.food_name)
    return foods


def _shopping_list(plan: List[PlanDay], fridge_keys: List[str]) -> List[str]:
    needed: List[str] = []
    for day in plan:
        for meal in day.meals:
            cl = meal.food_name.lower()
            if any(fk in cl or cl in fk for fk in fridge_keys):
                continue
            basis = local_basis(meal.food_name)
            canonical = basis.food_name if basis else meal.food_name
            if canonical not in needed:
                needed.append(canonical)
    return needed


def _plan_gram_needs(plan: WeeklyMealPlanPayload) -> Dict[str, float]:
    """Canonical food -> total grams planned across the week."""
    needs: Dict[str, float] = {}
    for day in plan.days:
        for meal in day.meals:
            basis = local_basis(meal.food_name)
            canonical = basis.food_name if basis else meal.food_name
            needs[canonical] = needs.get(canonical, 0.0) + meal.amount_g
    return needs


def _fridge_grams(item: FridgeItem) -> Optional[float]:
    """Convert a fridge quantity to grams when the unit allows, else None."""
    if item.quantity is None:
        return None
    unit = (item.unit or "").strip().lower()
    if unit in ("g", "gram", "grams", "gr"):
        return item.quantity
    if unit in ("kg", "kilo", "kilos", "kilograms"):
        return item.quantity * 1000.0
    return None


def _fridge_match(name: str, fridge: List[FridgeItem]) -> Optional[FridgeItem]:
    basis = local_basis(name)
    cl = basis.food_name.lower() if basis else name.lower()
    for item in fridge:
        ib = local_basis(item.name)
        if ib is None:
            continue
        ib_name = ib.food_name.lower()
        if ib_name in cl or cl in ib_name:
            return item
    return None


def _round_g(value: float) -> int:
    return int(round(value, -1))


def build_grocery_list(
    profile_goal: Optional[str],
    fridge: List[FridgeItem],
    accepted_plan: Optional[WeeklyMealPlanPayload] = None,
) -> SuggestGroceriesPayload:
    """Suggest the difference between the accepted plan and known fridge stock.

    Only plan foods are considered. A food already in the fridge is skipped when
    there is enough of it; a plain top-up line is emitted only when the fridge
    has a known gram quantity, with the shortfall spelled out; foods with no
    known fridge match are suggested at their planned quantity. Unknown fridge
    quantities never produce a 'buy' suggestion.
    """
    plan = accepted_plan if accepted_plan is not None else build_meal_plan(profile_goal, fridge)
    needs = _plan_gram_needs(plan)
    items: List[GrocerySuggestionItem] = []
    for name in sorted(needs):
        required = needs[name]
        stocked = _fridge_match(name, fridge)
        if stocked is None:
            items.append(
                GrocerySuggestionItem(
                    name=name,
                    reason=f"used in this week's meal plan (about {_round_g(required)} g)",
                )
            )
            continue
        available = _fridge_grams(stocked)
        if available is None:
            continue
        if available >= required:
            continue
        shortfall = max(0.0, required - available)
        items.append(
            GrocerySuggestionItem(
                name=name,
                reason=(
                    f"need about {_round_g(required)} g this week, "
                    f"have about {_round_g(available)} g in fridge, "
                    f"top up about {_round_g(shortfall)} g"
                ),
            )
        )
    return SuggestGroceriesPayload(items=items)


def build_prep_sessions(
    profile_goal: Optional[str],
    fridge: List[FridgeItem],
    accepted_plan: Optional[WeeklyMealPlanPayload] = None,
    now_iso: Optional[str] = None,
) -> ScheduleMealPrepPayload:
    """Deterministic, limited meal-prep plan: one bulk session and one refresh.

    Sessions never exceed a week's worth of work; both dates and tasks are
    derived from the plan week and its validated foods, not the model.
    """
    plan = accepted_plan if accepted_plan is not None else build_meal_plan(profile_goal, fridge, now_iso=now_iso)
    week_start = date.fromisoformat(plan.week_start or week_start_for(now_iso))
    foods = list(_plan_gram_needs(plan))
    bulk_date = (week_start - timedelta(days=1)).isoformat()
    refresh_date = (week_start + timedelta(days=2)).isoformat()

    bulk_tasks: List[str] = []
    for name in foods[:5]:
        bulk_tasks.append(f"Portion and store {name}")
    if not bulk_tasks:
        bulk_tasks.append("Portion and store this week's core foods")

    veg = [name for name in foods if "vegetables" in name or "broccoli" in name or "spinach" in name or "carrot" in name or "avocado" in name]
    refresh_tasks: List[str] = ["Chop fresh vegetables for the back half of the week"] if veg else ["Prep the lighter meals for midweek"]

    return ScheduleMealPrepPayload(
        goal=detect_goal(profile_goal),
        week_start=week_start.isoformat(),
        sessions=[
            PrepSession(
                date=bulk_date,
                session_title="Weekly bulk prep",
                note="Cook and portion the week's proteins and sides, then label containers.",
                tasks=bulk_tasks,
            ),
            PrepSession(
                date=refresh_date,
                session_title="Midweek refresh",
                note="Refresh vegetables and pack the remaining meals.",
                tasks=refresh_tasks,
            ),
        ],
    )