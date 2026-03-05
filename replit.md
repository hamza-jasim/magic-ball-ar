# الكرة السحرية - Magic Ball

## Overview
An AI-powered guessing game similar to Akinator. The app thinks of famous people (athletes, scientists, artists, etc.) by asking yes/no questions and reveals a photo after guessing correctly.

## Architecture
- **Frontend**: Expo React Native (single screen, no tabs)
- **Backend**: Express + TypeScript server on port 5000
- **AI**: OpenAI via Replit AI Integrations (no user API key needed)
- **Image fetch**: Wikipedia API for person photos

## Key Features
- Animated golden magic ball with glow effects
- AI asks yes/no questions to narrow down the person
- 4 answer buttons: نعم (Yes), لا (No), ربما (Maybe), لا أعرف (Don't Know)
- AI guesses the person after enough questions
- Shows Wikipedia photo of the guessed person
- Full Arabic UI

## File Structure
- `app/index.tsx` - Main game screen with all states (intro, asking, thinking, guessing, revealed)
- `server/routes.ts` - `/api/magic-ball/question` and `/api/person-image` endpoints
- `constants/colors.ts` - Gold/dark purple color theme

## API Routes
- `POST /api/magic-ball/question` - Gets next question or guess from OpenAI
- `GET /api/person-image?name=` - Fetches Wikipedia thumbnail for person

## Game States
1. **intro** - Welcome screen with start button
2. **thinking** - Loading next question from AI
3. **asking** - Shows question + 4 answer buttons
4. **guessing** - AI presents its guess
5. **revealed** - Shows person name + Wikipedia photo

## Design
- Dark midnight/purple background gradient
- Gold color scheme throughout
- Inter font family
- React Native Reanimated animations on the ball
