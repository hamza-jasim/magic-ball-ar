# الكرة السحرية - Magic Ball Game

  An AI-powered Akinator-style guessing game built with Expo React Native.

  ## Features
  - Bilingual: Arabic & English
  - AI asks yes/no questions to guess a famous person
  - Custom SVG animated ball face (blinks, reacts emotionally)
  - Cannon blast confetti celebration when the AI guesses correctly
  - Wikipedia photo and bio reveal
  - Built with Expo, React Native, OpenAI GPT-4o-mini

  ## Running the Project

  ```bash
  npm install
  npm run expo:dev   # Start frontend (port 8081)
  npm run server:dev # Start backend (port 5000)
  ```

  ## Building for iOS (TestFlight)
  1. Install EAS CLI: `npm install -g eas-cli`
  2. Login: `eas login`
  3. Build: `eas build --platform ios --profile preview`
  4. Submit to TestFlight: `eas submit --platform ios`

  ## Tech Stack
  - Expo / React Native
  - Express.js backend
  - OpenAI GPT-4o-mini
  - react-native-svg
  - Wikipedia API

  ## Developed by
  Hamza Jasim © 2026
  