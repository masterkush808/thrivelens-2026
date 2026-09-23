import { PremiumScreen } from "@/components/brand/PremiumScreen";
import React, { useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { router, type Href } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Text, Button } from "@/components/ui";
import { buildRequestId } from "@/lib/food-recognition";
import { buildCoachContext } from "@/lib/coach-context";
import { executeCoachAction } from "@/lib/coach-executor";
import { currentUser } from "@/lib/auth";
import {
  coachChat,
  Citation,
  CoachAction,
  CoachActionExecution,
  CoachMessage,
  CoachResult,
  NavigateScreen,
  parseCoachActions,
} from "@/services/inference";

const suggestedPrompts = [
  "Schedule workouts for this week",
  "Plan my meals for the week",
  "Add chicken breast and rice to my fridge",
  "Prepare meals for the week",
  "Where is the nearest gym?",
  "Set my goal to lose weight",
];

const MAX_INPUT_CHARS = 2000;
const MAX_HISTORY_TURNS = 8;

const coachErrorText = (error: unknown): string => {
  const code = (error as { code?: string })?.code;
  if (code === "not_configured") {
    return "The coach is not available right now.";
  }
  if (code === "timeout") return "The coach timed out. Please try again.";
  if (code === "network") {
    return "Could not reach the coach. Please try again.";
  }
  return "I could not respond just now. Please try again.";
};

interface ChatMessage {
  id: string;
  role: "user" | "ai";
  content: string;
  refusal?: string | null;
  citations?: Citation[];
  actions?: CoachAction[];
  controls?: CoachActionExecution[];
}

const aiThinking = {
  id: "__thinking__",
  role: "ai" as const,
  content: "",
};

function asCoachMessages(history: ChatMessage[]): CoachMessage[] {
  return history
    .filter((message) => message.id !== "__thinking__")
    .slice(-MAX_HISTORY_TURNS)
    .map((message) => ({
      role: message.role === "user" ? ("user" as const) : ("assistant" as const),
      content: message.content,
    }));
}

const SCREEN_ROUTES: Record<NavigateScreen, string> = {
  options: "/",
  home: "/(tabs)",
  scanner: "/food-scanner",
  barcode: "/scan-barcode",
  tracking: "/(tabs)/tracking",
  nutrition: "/(tabs)/nutrition",
  maps: "/(tabs)/maps",
  workout: "/(tabs)/workout",
  coach: "/ai-coach",
  profile: "/profile",
  "meal-plans": "/meal-plans",
  fridge: "/fridge",
  "cheat-day": "/cheat-day",
};

function describeAction(action: CoachAction): { title: string; detail: string; approveLabel: string } {
  switch (action.type) {
    case "log_meal":
      return {
        title: `Log ${action.payload.food_name} (${action.payload.amount_g} g)`,
        detail: `${action.payload.meal_type} · ${action.payload.amount_g} g`,
        approveLabel: "Approve & Log",
      };
    case "find_places": {
      const where = action.payload.category ?? action.payload.query ?? "nearby places";
      return {
        title: `Find ${where}${action.payload.open_now ? " open now" : ""}`,
        detail: "Opens Maps with these places.",
        approveLabel: "Open Maps",
      };
    }
    case "navigate":
      return {
        title: `Go to ${action.payload.screen}${action.payload.query ? ` for “${action.payload.query}”` : ""}`,
        detail: "Moves you to the relevant screen.",
        approveLabel: "Go there",
      };
    case "schedule_workout":
      return {
        title: "Schedule workouts",
        detail: `${action.payload.days_per_week ?? 4} session${(action.payload.days_per_week ?? 4) === 1 ? "" : "s"}/week${action.payload.focus ? ` · ${action.payload.focus}` : ""}${action.payload.start_date ? ` · from ${action.payload.start_date}` : ""}`,
        approveLabel: "Approve & Schedule",
      };
    case "schedule_meal_plan":
      return {
        title: "Build your weekly meal plan",
        detail: `${action.payload.days.length} day${action.payload.days.length === 1 ? "" : "s"} planned${action.payload.week_start ? ` · week of ${action.payload.week_start}` : ""}${action.payload.goal ? ` · ${action.payload.goal}` : ""}`,
        approveLabel: "Approve & Save",
      };
    case "schedule_meal_prep":
      return {
        title: "Schedule meal prep",
        detail: `${action.payload.sessions.length} session${action.payload.sessions.length === 1 ? "" : "s"}${action.payload.week_start ? ` · week of ${action.payload.week_start}` : ""}`,
        approveLabel: "Approve & Schedule",
      };
    case "add_fridge_items":
      return {
        title: "Add to your fridge",
        detail: `${action.payload.items.map((item) => item.name).join(", ")}`,
        approveLabel: "Approve & Add",
      };
    case "set_goal":
      return {
        title: `Set goal: ${action.payload.goal}`,
        detail: action.payload.timeline ? `Aiming for ${action.payload.timeline}` : "No timeline set.",
        approveLabel: "Approve & Save",
      };
    case "suggest_groceries":
      return {
        title: "Groceries to restock",
        detail: `${action.payload.items.length} suggestion${action.payload.items.length === 1 ? "" : "s"} shown below.`,
        approveLabel: "Show list",
      };
    case "cheat_day":
      return action.payload.eligible
        ? {
            title: "Take your cheat day",
            detail: "You've earned this one.",
            approveLabel: "Enjoy it",
          }
        : {
            title: "Cheat day unavailable",
            detail: action.payload.reason ?? "Keep tracking to earn it.",
            approveLabel: "Got it",
          };
    default:
      return { title: "Coach action", detail: "", approveLabel: "Approve" };
  }
}

export default function AICoachScreen() {
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [approvalNote, setApprovalNote] = useState<CoachActionExecution | null>(null);

  const handleNavigate = (
    screen: NavigateScreen,
    params?: { category?: string; query?: string },
  ) => {
    const route = SCREEN_ROUTES[screen] ?? "/(tabs)";
    const query = params?.category ?? params?.query;
    if (query && screen === "maps") {
      const href = { pathname: route, params: { query } } as Href;
      router.replace(href);
      return;
    }
    router.replace(route as Href);
  };

  const handleSend = async () => {
    const trimmed = message.trim().slice(0, MAX_INPUT_CHARS);
    if (!trimmed || pending) return;
    setMessage("");
    setApprovalNote(null);

    const userMessage: ChatMessage = {
      id: buildRequestId(),
      role: "user",
      content: trimmed,
    };
    const nextHistory = [...messages, userMessage];
    setMessages([...nextHistory, aiThinking]);
    setPending(true);

    try {
      const user = await currentUser();
      if (!user) throw new Error("You must be signed in to chat with Thrive Lens.");
      const context = await buildCoachContext(user.id);

      const result = await coachChat({
        context,
        messages: asCoachMessages(nextHistory),
      });
      const safeActions = parseCoachActions(result.proposed_actions);
      const manualActions = safeActions.filter((action) => action.type === "log_meal");
      const autoActions = safeActions.filter((action) => action.type !== "log_meal");
      let controls: CoachActionExecution[] = [];
      for (const action of autoActions) {
        try {
          const execution = await executeCoachAction({
            action,
            userId: user.id,
            onNavigate: handleNavigate,
          });
          controls.push(execution);
        } catch (caught) {
          controls.push({
            execution_id: buildRequestId(),
            action_type: action.type,
            status: "failed",
            message: coachErrorText(caught),
            refs: [],
            occurred_at: new Date().toISOString(),
          });
        }
      }
      setMessages([
        ...nextHistory,
        {
          ...toAiMessage(result, buildRequestId()),
          actions: manualActions,
          controls,
        },
      ]);
    } catch (caught) {
      setMessages([
        ...nextHistory,
        {
          id: buildRequestId(),
          role: "ai",
          content: coachErrorText(caught),
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const handleApprove = async (action: CoachAction) => {
    setApprovalNote(null);
    try {
      const user = await currentUser();
      const result = await executeCoachAction({
        action,
        userId: user?.id ?? "",
        onNavigate: handleNavigate,
      });
      setApprovalNote(result);
    } catch (caught) {
      setApprovalNote({
        execution_id: buildRequestId(),
        action_type: action.type,
        status: "failed",
        message: coachErrorText(caught),
        refs: [],
        occurred_at: new Date().toISOString(),
      });
    }
  };

  const renderActionCard = (action: CoachAction) => {
    const described = describeAction(action);
    return (
      <View
        key={action.type}
        className="bg-surface-highlight rounded-xl p-3 border border-border"
      >
        <Text variant="bodySmall" className="text-text-primary">
          {described.title}
        </Text>
        {described.detail ? (
          <Text variant="caption" className="text-text-secondary mt-0.5">
            {described.detail}
          </Text>
        ) : null}
        <View className="mt-2">
          <Button
            title={described.approveLabel}
            size="sm"
            onPress={() => void handleApprove(action)}
          />
        </View>
      </View>
    );
  };

  return (
    <PremiumScreen>
    <SafeAreaView className="flex-1 bg-transparent" edges={["top"]}>
      <View className="flex-row items-center justify-between px-6 py-4 border-b border-border">
        <Pressable onPress={() => router.back()}>
          <Text variant="body" className="text-primary">
            ← Back
          </Text>
        </Pressable>
        <View className="items-center">
          <Text variant="h3">Thrive Lens AI</Text>
          <Text variant="caption" className="text-text-secondary">
            Your application coach
          </Text>
        </View>
        <View className="w-12" />
      </View>

      <ScrollView
        className="flex-1 px-6"
        contentContainerStyle={{ paddingVertical: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((msg) => (
          <View
            key={msg.id}
            className={`mb-4 ${msg.role === "user" ? "items-end" : "items-start"}`}
          >
            <View
              className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-primary rounded-tr-sm"
                  : msg.refusal
                    ? "bg-error/10 rounded-tl-sm"
                    : "bg-surface-elevated rounded-tl-sm"
              }`}
            >
              {msg.role === "ai" && (
                <View className="flex-row items-center gap-2 mb-2">
                  <View className="w-6 h-6 rounded-full bg-ai-glow/30 items-center justify-center">
                    <Text variant="caption" className="text-ai-glow text-xs">
                      AI
                    </Text>
                  </View>
                  <Text variant="caption" className="text-ai-glow">
                    Thrive Lens AI
                  </Text>
                </View>
              )}
              <Text
                variant="body"
                className={msg.role === "user" ? "text-text-inverse" : "text-text-primary"}
              >
                {msg.content}
              </Text>

              {msg.citations && msg.citations.length > 0 && (
                <View className="flex-row flex-wrap gap-1.5 mt-3">
                  {msg.citations.map((citation, index) => (
                    <View
                      key={index}
                      className="bg-surface-highlight px-2 py-1 rounded-full"
                    >
                      <Text variant="caption" className="text-text-secondary">
                        {citation.label}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {msg.controls && msg.controls.length > 0 && (
                <View className="gap-1.5 mt-3">
                  {msg.controls.map((control) => (
                    <View
                      key={control.execution_id}
                      className="bg-surface-highlight rounded-lg px-3 py-2 border border-border"
                    >
                      <Text
                        variant="caption"
                        className={control.status === "completed" ? "text-success" : "text-error"}
                      >
                        {control.status === "completed" ? "✓ Applied" : "✗ Failed"}
                      </Text>
                      <Text variant="bodySmall" className="text-text-primary">
                        {control.message}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {msg.actions && msg.actions.length > 0 && (
                <View className="gap-2 mt-3">
                  {msg.actions.map((action, index) => (
                    <View key={`${action.type}-${index}`}>
                      {renderActionCard(action)}
                    </View>
                  ))}
                </View>
              )}
            </View>
          </View>
        ))}

        {approvalNote && (
          <View className="items-start mb-4">
            <View
              className={`max-w-full rounded-2xl px-4 py-3 border ${
                approvalNote.status === "completed"
                  ? "bg-surface-elevated border-border"
                  : approvalNote.status === "cancelled"
                    ? "bg-error/10 border-error/30"
                    : "bg-error/10 border-error/30"
              }`}
            >
              <Text variant="caption" className="text-text-secondary mb-0.5">
                {approvalNote.status === "completed"
                  ? "Done"
                  : approvalNote.status === "cancelled"
                    ? "Not applied"
                    : "Couldn't complete"}
              </Text>
              <Text variant="bodySmall" className="text-text-primary">
                {approvalNote.message}
              </Text>
            </View>
          </View>
        )}

        {pending && (
          <View className="items-start mb-4">
            <View className="bg-surface-elevated rounded-2xl rounded-tl-sm px-4 py-3">
              <View className="flex-row items-center gap-2">
                <View className="w-6 h-6 rounded-full bg-ai-glow/30 items-center justify-center">
                  <Text variant="caption" className="text-ai-glow text-xs">
                    AI
                  </Text>
                </View>
                <Text variant="caption" className="text-ai-glow">
                  Thrive Lens is thinking...
                </Text>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      <View className="px-6 mb-4">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2">
            {suggestedPrompts.map((prompt, index) => (
              <Pressable
                key={index}
                className="bg-surface-elevated px-4 py-2 rounded-full border border-border"
                onPress={() => setMessage(prompt)}
              >
                <Text variant="bodySmall" className="text-text-secondary">
                  {prompt}
                </Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </View>

      <View className="px-6 pb-6">
        <Text variant="caption" className="text-text-tertiary mb-2">
          I apply scheduling, navigation and fridge changes automatically —
          only logging food asks for your approval.
        </Text>
        <View className="flex-row items-center gap-3 bg-surface-elevated rounded-2xl px-4 py-3 border border-border">
          <TextInput
            className="flex-1 text-text-primary"
            placeholder="Ask Thrive Lens anything..."
            placeholderTextColor="#ABA291"
            value={message}
            onChangeText={(text) => setMessage(text.slice(0, MAX_INPUT_CHARS))}
            multiline
            maxLength={MAX_INPUT_CHARS}
          />
          <Pressable
            className={`w-8 h-8 rounded-full items-center justify-center ${
              message.trim() && !pending ? "bg-primary" : "bg-surface-highlight"
            }`}
            onPress={() => void handleSend()}
          >
            <Text variant="body" className={message.trim() && !pending ? "text-text-inverse" : "text-text-secondary"}>
              ↑
            </Text>
          </Pressable>
        </View>
      </View>
    </SafeAreaView>
    </PremiumScreen>
  );
}

function toAiMessage(result: CoachResult, id: string): ChatMessage {
  return {
    id,
    role: "ai",
    content: result.refusal ?? result.reply,
    refusal: result.refusal,
    citations: result.citations,
  };
}