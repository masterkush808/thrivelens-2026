# Omni Fitness AI

An AI-powered personal fitness and nutrition companion built with React Native and Expo.

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Expo SDK 57, React Native 0.86.3, React 19 |
| Navigation | Expo Router v57 (file-based routing) |
| Styling | NativeWind 4.2.6 (TailwindCSS for RN) |
| Database | Drizzle ORM + expo-sqlite (local SQLite) |
| Cloud | Supabase (optional Postgres sync) |
| Animations | react-native-reanimated |
| Charts | react-native-svg |
| Icons | lucide-react-native |
| ML | MobileNetV2 / TFLite (planned food classifier) |

## Project Structure

```
omni-fitness-ai/
  App.js                  # Root entry (loads global.css)
  app.json                # Expo config (scheme: omnifitnessai)
  src/
    app/                  # Expo Router screens (file-based routing)
      _layout.tsx         # Root Stack layout
      index.tsx           # Redirects to /welcome
      welcome.tsx         # Animated landing page
      signup.tsx          # Registration with social login
      signin.tsx          # Login with social login
      onboarding.tsx      # 5-step user setup wizard
      profile.tsx         # Profile & settings
      active-workout.tsx  # Workout tracker (modal)
      ai-coach.tsx        # AI chat interface (modal)
      exercise-detail.tsx # Exercise video & info
      exercise-library.tsx# Browse exercises
      food-scanner.tsx    # AI food recognition (modal)
      workout-complete.tsx# Post-workout celebration
      (tabs)/             # Bottom tab navigation (6 tabs)
        index.tsx         # Home dashboard
        workout.tsx       # Workout discovery
        tracking.tsx      # Analytics & charts
        nutrition.tsx     # Nutrition tracking
        maps.tsx          # Nearby gyms
        ai-couch.tsx      # AI Coach profile
    components/ui/        # Reusable UI components
      Button.tsx          # 5 variants, 3 sizes
      Card.tsx            # WorkoutCard, MealCard, AIRecommendationCard
      Input.tsx           # TextInput, SearchInput, PasswordInput
      Avatar.tsx          # User avatar
      Progress.tsx        # ProgressRing, ProgressBar, CircularProgress
      Text.tsx            # Typography with variants
      PressableScale.tsx  # Animated pressable
    data/
      exercises.json      # Exercise database (9 body parts)
    theme/                # Design system tokens
      colors.ts           # Brand, semantic, surface, AI colors
      spacing.ts          # 12-step spacing scale
      typography.ts       # 10 text variants
      radius.ts           # Border radius tokens
      shadows.ts          # Shadow levels + AI glow
      motion.ts           # Spring & timing configs
  ml/
    food_classifier/
      train.py            # MobileNetV2 transfer learning (Food-101)
      requirements.txt
  supabase/
    schema.sql            # Postgres schema (10 tables)
```

## Screens & Features

### Authentication (3 screens)
- **Welcome** - Animated landing with gradient, concentric ring hero, feature cards
- **Sign Up** - Full registration form, password strength indicator, Google/Apple login
- **Sign In** - Email/password login, forgot password, social login

### Onboarding
- **Multi-step Setup** - 5 steps: Personal Info, Fitness Level, Goals, Workout Preferences, Nutrition Preferences

### Main App Tabs (6 tabs)
1. **Home** - Dashboard with today's workout, nutrition summary, AI coach card, quick actions, weekly stats
2. **Workout** - Exercise library, category filters, AI workout generation
3. **Tracking** - Analytics with SVG charts (weight, calories, strength progression), time filters
4. **Nutrition** - Circular progress rings (calories/protein/carbs/fat), meal tracker, quick actions
5. **Maps** - Nearby gyms with search, filters, location cards with ratings
6. **AI Coach** - Coach profile with user stats, AI capabilities info

### Feature Screens (7 screens)
- **AI Coach Chat** - Message bubbles, suggested prompts, text input
- **Food Scanner** - Camera/photo/barcode scanning, simulated AI analysis with confidence scores
- **Active Workout** - Exercise video, set/rep tracking, rest timer countdown
- **Exercise Library** - Body part grid, search, filterable list with tags
- **Exercise Detail** - Video player, metadata grid, description, tips
- **Workout Complete** - Stats celebration, progress comparison, AI recommendations
- **Profile** - Avatar with image picker, body stats, settings menu

## Design System

- **Theme**: Dark (`#0A0A0F` background, `#141419` surface)
- **Primary**: `#208AEF` (blue)
- **Accent**: `#FF6B35` (orange)
- **AI**: `#7B61FF` (purple)
- **Typography**: 10 variants from display (40px/800) to caption (12px/500)
- **Components**: Button (5 variants), Card (5 types), Input (3 types), Progress (3 types)
- **Animations**: FadeInDown entrances, spring configs (default/gentle/bouncy/stiff)

## Data Layer

- **Local**: expo-sqlite + Drizzle ORM (100% offline capable)
- **Cloud**: Supabase Postgres (optional, 10 tables: users, exercises, workout_plans, workout_days, workout_exercises, workout_sessions, workout_logs, food_logs, progress_logs, notifications)
- **Exercise DB**: 9 body parts with exercise entries
- **ML Pipeline**: MobileNetV2 transfer learning for food classification (Food-101 dataset, TFLite export)

## Current Status

- All 15 screens implemented with full UI
- Animations and transitions in place
- Simulated AI/chat responses (no backend wired)
- Simulated auth flow (no Supabase integration)
- Food scanner uses hardcoded sample results
- Drizzle schema file referenced but not yet created
- ML training script written but not integrated

## Environment

All services are optional. The app runs fully offline via expo-sqlite without any API keys. See `.env.example` for optional Supabase, Google OAuth, and HuggingFace configurations.
