import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  Dimensions,
  Image,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Animated as RNAnimated,
  Easing as RNEasing,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withSpring,
  Easing,
} from "react-native-reanimated";

import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Ionicons } from "@expo/vector-icons";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import Colors from "@/constants/colors";
import Svg, { Circle, Path, Ellipse, G } from "react-native-svg";

const { width, height: SCREEN_H } = Dimensions.get("window");

type GameState = "intro" | "asking" | "thinking" | "guessing" | "revealed";
type BallMood  = "neutral" | "happy" | "sad" | "thinking";
type Lang      = "ar" | "en";

interface Message {
  role: "user" | "assistant";
  content: string;
}

// ─── i18n ────────────────────────────────────────────────────────────────────
const STRINGS = {
  ar: {
    title:          "الكرة السحرية",
    introSub:       "فكّر في شخصية شهيرة\nرياضي · فنان · عالم · أي شخص",
    introHint:      "وأنا سأكتشف من يكون...",
    startBtn:       "ابدأ اللعبة",
    qBadgeLabel:    "سؤال",
    thinking:       "الكرة السحرية تفكّر...",
    preparing:      "جاري التحضير...",
    yes:            "نعم",
    no:             "لا",
    maybe:          "ربما",
    dunno:          "لا أعرف",
    myGuessIs:      "تخميني هو...",
    amIRight:       "هل أنا محق؟",
    yesRight:       "نعم، صح!",
    noWrong:        "لا، خاطئ",
    addAnswer:      "أضف الجواب الصحيح بنفسك",
    guessedIt:      "لقد خمّنتها!",
    questionsOnly:  (n: number) => `${n} سؤال فقط`,
    loadingInfo:    "جاري تحميل المعلومات...",
    noBio:          "لا تتوفر معلومات إضافية",
    playAgain:      "العب مجدداً",
    modalTitle:     "من كنت تفكر فيه؟",
    modalSub:       "اكتب اسم الشخصية",
    modalPlaceholder: "مثال: محمد صلاح",
    modalCancel:    "إلغاء",
    modalReveal:    "كشف الجواب",
    wrongContinue:  "لا، تخمينك خاطئ. استمر في الأسئلة.",
    langAr:         "عربي",
    langEn:         "English",
  },
  en: {
    title:          "Magic Ball",
    introSub:       "Think of a famous person\nAthlete · Artist · Scientist · Anyone",
    introHint:      "And I will figure out who it is...",
    startBtn:       "Start Game",
    qBadgeLabel:    "Q",
    thinking:       "The Magic Ball is thinking...",
    preparing:      "Preparing...",
    yes:            "Yes",
    no:             "No",
    maybe:          "Maybe",
    dunno:          "Don't Know",
    myGuessIs:      "My guess is...",
    amIRight:       "Am I right?",
    yesRight:       "Yes, correct!",
    noWrong:        "No, wrong",
    addAnswer:      "Add the correct answer yourself",
    guessedIt:      "I guessed it!",
    questionsOnly:  (n: number) => `${n} questions only`,
    loadingInfo:    "Loading information...",
    noBio:          "No additional information available",
    playAgain:      "Play Again",
    modalTitle:     "Who were you thinking of?",
    modalSub:       "Type the person's name",
    modalPlaceholder: "e.g. Cristiano Ronaldo",
    modalCancel:    "Cancel",
    modalReveal:    "Reveal Answer",
    wrongContinue:  "No, your guess is wrong. Keep asking questions.",
    langAr:         "عربي",
    langEn:         "English",
  },
} as const;

// ─── Mood config ─────────────────────────────────────────────────────────────
const MOOD_CONFIG: Record<BallMood, {
  outer: [string, string, string, string];
  inner: [string, string, string];
  glow: string;
  pulseDur: number;
}> = {
  neutral: {
    outer: ["#F0D060", "#D4AF37", "#8B6914", "#3A2500"],
    inner: ["#7B1BE8", "#4B00A0", "#200050"],
    glow: Colors.gold,
    pulseDur: 1800,
  },
  happy: {
    outer: ["#FFE066", "#FFB800", "#CC8800", "#664400"],
    inner: ["#FF8C00", "#DD6600", "#994400"],
    glow: "#FFD700",
    pulseDur: 900,
  },
  sad: {
    outer: ["#8090D0", "#5060B0", "#203080", "#0A1040"],
    inner: ["#1848CC", "#0C30A0", "#050F50"],
    glow: "#6688FF",
    pulseDur: 2600,
  },
  thinking: {
    outer: ["#D060F0", "#A030C0", "#6B00A0", "#2A0050"],
    inner: ["#9B20E0", "#6800B0", "#350060"],
    glow: "#CC44FF",
    pulseDur: 1400,
  },
};

// ─── Confetti Celebration ────────────────────────────────────────────────────
const CONFETTI_COLORS = [
  "#FF3366", "#FFD700", "#00CCFF", "#FF6B35",
  "#BB44FF", "#00FF88", "#FF69B4", "#FFA500",
  "#FF4444", "#FFDD55", "#44DDFF", "#FF0080",
];
// Each cannon fires PER_SIDE particles. Two cannons = left + right.
const PER_SIDE = 30;
const CANNON_Y = SCREEN_H - 30;  // cannon mouth near bottom

type CannonParticle = {
  id: number;
  startX: number;    // fixed left position
  color: string;
  size: number;
  isCircle: boolean;
  delay: number;
  peakHeight: number; // how high it goes (negative translateY at peak)
  totalDx: number;    // total horizontal travel
  upDuration: number;
  downDuration: number;
  rotAmount: number;
  yAnim: RNAnimated.Value;
  xAnim: RNAnimated.Value;
  opAnim: RNAnimated.Value;
  rotAnim: RNAnimated.Value;
};

function makeCannonSide(side: "left" | "right"): CannonParticle[] {
  return Array.from({ length: PER_SIDE }, (_, i) => {
    // fanRatio 0 = steepest (straight up, tiny dx), 1 = flattest (wide arc)
    const fanRatio = i / (PER_SIDE - 1);
    // Steep particles go very high; flat ones go far horizontally
    const peakHeight = 460 - fanRatio * 240;        // 460 → 220
    const absDx     = width * (0.08 + fanRatio * 0.82); // 8% → 90% screen width
    const totalDx   = side === "left" ? absDx : -absDx;
    const upDuration   = 380 + peakHeight * 0.55;
    const downDuration = 900 + Math.random() * 700;
    return {
      id: (side === "left" ? 0 : PER_SIDE) + i,
      startX: side === "left" ? 28 : width - 28,
      color: CONFETTI_COLORS[(i * 2 + (side === "left" ? 0 : 1)) % CONFETTI_COLORS.length],
      size: 7 + Math.random() * 7,
      isCircle: Math.random() > 0.42,
      delay: Math.random() * 220,          // tight burst window
      peakHeight,
      totalDx,
      upDuration,
      downDuration,
      rotAmount: (side === "left" ? 1 : -1) * (300 + Math.random() * 420),
      yAnim: new RNAnimated.Value(0),
      xAnim: new RNAnimated.Value(0),
      opAnim: new RNAnimated.Value(1),
      rotAnim: new RNAnimated.Value(0),
    };
  });
}

function Confetti({ active }: { active: boolean }) {
  const particles = useRef<CannonParticle[]>([
    ...makeCannonSide("left"),
    ...makeCannonSide("right"),
  ]).current;

  useEffect(() => {
    if (!active) return;

    const fallToBottom = 70; // translateY when particle just exits screen bottom

    const anims = particles.map(p => {
      p.yAnim.setValue(0);
      p.xAnim.setValue(0);
      p.opAnim.setValue(1);
      p.rotAnim.setValue(0);

      const totalDuration = p.upDuration + p.downDuration;

      return RNAnimated.sequence([
        RNAnimated.delay(p.delay),
        RNAnimated.parallel([
          // Arc: shoot up then fall with gravity
          RNAnimated.sequence([
            RNAnimated.timing(p.yAnim, {
              toValue: -p.peakHeight,
              duration: p.upDuration,
              useNativeDriver: true,
              easing: RNEasing.out(RNEasing.quad),
            }),
            RNAnimated.timing(p.yAnim, {
              toValue: fallToBottom,
              duration: p.downDuration,
              useNativeDriver: true,
              easing: RNEasing.in(RNEasing.quad),
            }),
          ]),
          // Horizontal spread (decelerates after launch)
          RNAnimated.timing(p.xAnim, {
            toValue: p.totalDx,
            duration: totalDuration,
            useNativeDriver: true,
            easing: RNEasing.out(RNEasing.cubic),
          }),
          // Spin throughout
          RNAnimated.timing(p.rotAnim, {
            toValue: 1,
            duration: totalDuration,
            useNativeDriver: true,
          }),
          // Fade in second half of fall
          RNAnimated.sequence([
            RNAnimated.delay(p.upDuration + p.downDuration * 0.55),
            RNAnimated.timing(p.opAnim, {
              toValue: 0,
              duration: p.downDuration * 0.45,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]);
    });

    RNAnimated.parallel(anims).start();
  }, [active]);

  if (!active) return null;

  return (
    <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
      {particles.map(p => {
        const rotate = p.rotAnim.interpolate({
          inputRange: [0, 1],
          outputRange: ["0deg", `${p.rotAmount}deg`],
        });
        return (
          <RNAnimated.View
            key={p.id}
            style={{
              position: "absolute",
              left: p.startX - p.size / 2,
              top: CANNON_Y,
              width: p.size,
              height: p.isCircle ? p.size : p.size * 1.8,
              borderRadius: p.isCircle ? p.size / 2 : 2,
              backgroundColor: p.color,
              opacity: p.opAnim,
              transform: [
                { translateX: p.xAnim },
                { translateY: p.yAnim },
                { rotate },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// ─── SVG Ball Face ───────────────────────────────────────────────────────────
function BallFace({ size, mood }: { size: number; mood: BallMood }) {
  const [eyeOpen, setEyeOpen] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const scheduleBlink = () => {
      const delay = 2800 + Math.random() * 2400;
      timerRef.current = setTimeout(() => {
        setEyeOpen(false);
        timerRef.current = setTimeout(() => {
          setEyeOpen(true);
          scheduleBlink();
        }, 110);
      }, delay);
    };
    scheduleBlink();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, []);

  const eyeRyL = eyeOpen ? 11 : 1.5;
  const eyeRyR = eyeOpen ? 11 : 1.5;

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {mood === "neutral" && (
        <G>
          {/* Eyebrows */}
          <Path d="M26 30 Q36 26 46 30" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Path d="M54 30 Q64 26 74 30" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Left eye */}
          <Ellipse cx="36" cy="43" rx="10" ry={eyeRyL} fill="rgba(255,255,255,0.95)" />
          <Circle cx="36" cy="45" r="6.5" fill="#3A4ACC" />
          <Circle cx="36" cy="45" r="3.2" fill="#07040F" />
          <Circle cx="38.5" cy="42.5" r="1.9" fill="rgba(255,255,255,0.95)" />
          <Circle cx="34.5" cy="46.5" r="0.8" fill="rgba(255,255,255,0.4)" />
          {/* Right eye */}
          <Ellipse cx="64" cy="43" rx="10" ry={eyeRyR} fill="rgba(255,255,255,0.95)" />
          <Circle cx="64" cy="45" r="6.5" fill="#3A4ACC" />
          <Circle cx="64" cy="45" r="3.2" fill="#07040F" />
          <Circle cx="66.5" cy="42.5" r="1.9" fill="rgba(255,255,255,0.95)" />
          <Circle cx="62.5" cy="46.5" r="0.8" fill="rgba(255,255,255,0.4)" />
          {/* Mouth — composed flat curve */}
          <Path d="M37 67 Q50 71 63 67" stroke="rgba(255,255,255,0.9)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
        </G>
      )}

      {mood === "happy" && (
        <G>
          {/* Happy eyebrows (raised) */}
          <Path d="M25 28 Q36 22 46 27" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Path d="M54 27 Q64 22 75 28" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Squinting happy eyes */}
          {eyeOpen ? (
            <G>
              <Path d="M25 43 Q36 33 47 43" fill="rgba(255,255,255,0.95)" />
              <Path d="M53 43 Q64 33 75 43" fill="rgba(255,255,255,0.95)" />
            </G>
          ) : (
            <G>
              <Path d="M25 43 Q36 41 47 43" fill="rgba(255,255,255,0.95)" />
              <Path d="M53 43 Q64 41 75 43" fill="rgba(255,255,255,0.95)" />
            </G>
          )}
          {/* Rosy cheeks */}
          <Circle cx="21" cy="58" r="9" fill="rgba(255,140,80,0.32)" />
          <Circle cx="79" cy="58" r="9" fill="rgba(255,140,80,0.32)" />
          {/* Big smile */}
          <Path d="M26 58 Q50 84 74 58" stroke="rgba(255,255,255,0.95)" strokeWidth="3.5" fill="none" strokeLinecap="round" />
          <Path d="M30 61 Q50 82 70 61" fill="rgba(255,255,255,0.18)" />
          {/* Sparkle lines */}
          <Path d="M15 22 L11 18 M15 24 L9 24 M15 26 L11 30" stroke="rgba(255,240,120,0.85)" strokeWidth="2" strokeLinecap="round" />
          <Path d="M85 22 L89 18 M85 24 L91 24 M85 26 L89 30" stroke="rgba(255,240,120,0.85)" strokeWidth="2" strokeLinecap="round" />
        </G>
      )}

      {mood === "sad" && (
        <G>
          {/* Sad eyebrows (angled toward center) */}
          <Path d="M25 32 Q35 37 45 30" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          <Path d="M55 30 Q65 37 75 32" stroke="rgba(255,255,255,0.85)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Left eye (droopy) */}
          <Ellipse cx="36" cy="44" rx="10" ry={eyeRyL} fill="rgba(255,255,255,0.9)" />
          <Path d="M26 40 Q36 43 46 40" fill="rgba(80,100,200,0.35)" />
          <Circle cx="36" cy="47" r="6.5" fill="#2050CC" />
          <Circle cx="36" cy="47" r="3.2" fill="#03051A" />
          <Circle cx="38" cy="44" r="1.8" fill="rgba(255,255,255,0.9)" />
          {/* Right eye (droopy) */}
          <Ellipse cx="64" cy="44" rx="10" ry={eyeRyR} fill="rgba(255,255,255,0.9)" />
          <Path d="M54 40 Q64 43 74 40" fill="rgba(80,100,200,0.35)" />
          <Circle cx="64" cy="47" r="6.5" fill="#2050CC" />
          <Circle cx="64" cy="47" r="3.2" fill="#03051A" />
          <Circle cx="66" cy="44" r="1.8" fill="rgba(255,255,255,0.9)" />
          {/* Frown */}
          <Path d="M37 70 Q50 61 63 70" stroke="rgba(255,255,255,0.9)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          {/* Tears */}
          <Path d="M33 55 Q30 62 33 67 Q36 72 36 67 Q39 62 36 55 Q34.5 53 33 55" fill="rgba(160,190,255,0.82)" />
          <Path d="M67 58 Q64 64 67 68 Q70 72 70 68 Q73 64 70 58 Q68.5 56 67 58" fill="rgba(160,190,255,0.7)" />
        </G>
      )}

      {mood === "thinking" && (
        <G>
          {/* Left eyebrow raised high */}
          <Path d="M22 26 Q33 19 44 27" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Right eyebrow slightly furrowed */}
          <Path d="M56 30 Q66 28 76 32" stroke="rgba(255,255,255,0.9)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
          {/* Left eye — looking right (iris shifted) */}
          <Ellipse cx="36" cy="43" rx="10" ry={eyeRyL} fill="rgba(255,255,255,0.9)" />
          <Circle cx="39" cy="45" r="6.5" fill="#8822CC" />
          <Circle cx="40" cy="45" r="3.2" fill="#0A0318" />
          <Circle cx="42" cy="42.5" r="1.8" fill="rgba(255,255,255,0.9)" />
          {/* Right eye — squinted */}
          <Ellipse cx="64" cy="44" rx="9" ry={Math.min(eyeRyR, 8)} fill="rgba(255,255,255,0.9)" />
          <Circle cx="66" cy="46" r="5.8" fill="#8822CC" />
          <Circle cx="67" cy="46" r="2.8" fill="#0A0318" />
          <Circle cx="68.5" cy="43.5" r="1.5" fill="rgba(255,255,255,0.9)" />
          {/* Hmm mouth (wavy) */}
          <Path d="M36 66 Q43 61 50 66 Q57 71 64 66" stroke="rgba(255,255,255,0.9)" strokeWidth="2.8" fill="none" strokeLinecap="round" />
          {/* Thought dots */}
          <Circle cx="73" cy="25" r="2.2" fill="rgba(255,255,255,0.65)" />
          <Circle cx="80" cy="18" r="3" fill="rgba(255,255,255,0.75)" />
          <Circle cx="89" cy="10" r="4" fill="rgba(255,255,255,0.85)" />
        </G>
      )}
    </Svg>
  );
}

// ─── Animated Ball ───────────────────────────────────────────────────────────
function AnimatedBall({ size, mood }: { size: number; mood?: BallMood }) {
  const pulse     = useSharedValue(1);
  const glow      = useSharedValue(0.5);
  const faceScale = useSharedValue(1);

  const safeMood: BallMood = mood ?? "neutral";
  const cfg = MOOD_CONFIG[safeMood];

  // Restart pulse animation speed when mood changes
  useEffect(() => {
    pulse.value = withRepeat(
      withSequence(
        withTiming(1.05, { duration: cfg.pulseDur, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.96, { duration: cfg.pulseDur, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    glow.value = withRepeat(
      withSequence(
        withTiming(1,   { duration: cfg.pulseDur + 200, easing: Easing.inOut(Easing.sin) }),
        withTiming(0.2, { duration: cfg.pulseDur + 200, easing: Easing.inOut(Easing.sin) })
      ),
      -1,
      false
    );
    // Bounce face on mood change
    faceScale.value = withSequence(
      withSpring(1.45, { damping: 8, stiffness: 260 }),
      withSpring(1,    { damping: 12, stiffness: 180 })
    );
  }, [safeMood]);

  const ballAnim  = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const glowAnim  = useAnimatedStyle(() => ({ opacity: glow.value }));
  const faceAnim  = useAnimatedStyle(() => ({ transform: [{ scale: faceScale.value }] }));

  const innerSize = size * 0.64;

  return (
    <Animated.View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, ballAnim]}>
      {/* Glow ring — color reflects mood */}
      <Animated.View style={[
        {
          position: "absolute",
          width: size + 32,
          height: size + 32,
          borderRadius: (size + 32) / 2,
          borderWidth: 2,
          borderColor: cfg.glow,
        },
        glowAnim,
      ]} />

      {/* Outer shell */}
      <LinearGradient
        colors={cfg.outer}
        style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center", overflow: "hidden" }}
        start={{ x: 0.2, y: 0.1 }}
        end={{ x: 0.85, y: 0.95 }}
      >
        {/* Inner orb */}
        <LinearGradient
          colors={cfg.inner}
          style={{ width: innerSize, height: innerSize, borderRadius: innerSize / 2, alignItems: "center", justifyContent: "center" }}
          start={{ x: 0.15, y: 0.1 }}
          end={{ x: 0.85, y: 0.9 }}
        >
          {/* Stars */}
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <View key={i} style={{
              position: "absolute",
              top: `${12 + ((i * 17) % 76)}%` as any,
              left: `${8 + ((i * 23) % 84)}%` as any,
              width: i % 3 === 0 ? 3 : 2,
              height: i % 3 === 0 ? 3 : 2,
              borderRadius: 2,
              backgroundColor: "#F0D060",
              opacity: 0.35 + (i % 4) * 0.12,
            }} />
          ))}

          {/* Animated face */}
          <Animated.View style={faceAnim}>
            <BallFace size={innerSize * 0.88} mood={safeMood} />
          </Animated.View>
        </LinearGradient>

        {/* Shine */}
        <View style={{
          position: "absolute", top: "11%", left: "16%",
          width: "26%", height: "20%", borderRadius: 60,
          backgroundColor: "rgba(255,255,255,0.16)",
          transform: [{ rotate: "-30deg" }],
        }} />
      </LinearGradient>
    </Animated.View>
  );
}

// ─── Answer Button ─────────────────────────────────────────────────────────
function AnswerButton({
  label,
  onPress,
  variant,
  disabled,
}: {
  label: string;
  onPress: () => void;
  variant: "yes" | "no" | "maybe" | "dunno";
  disabled?: boolean;
}) {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = () => {
    scale.value = withSequence(
      withTiming(0.91, { duration: 65 }),
      withSpring(1, { damping: 14, stiffness: 260 })
    );
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onPress();
  };

  const gradients: Record<string, [string, string]> = {
    yes:   ["#1B6B2B", "#0F4018"],
    no:    ["#7A2020", "#3A0E0E"],
    maybe: ["#2A2A80", "#131360"],
    dunno: ["#3C3C3C", "#1E1E1E"],
  };
  const [g1, g2] = gradients[variant];

  return (
    <Animated.View style={[styles.answerBtnWrap, animStyle]}>
      <Pressable
        onPress={handlePress}
        disabled={disabled}
        style={[styles.answerBtnPressable, disabled && { opacity: 0.45 }]}
        testID={`answer-${variant}`}
      >
        <LinearGradient colors={[g1, g2]} style={styles.answerBtnInner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.answerBtnText}>{label}</Text>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────
export default function MagicBallScreen() {
  const insets = useSafeAreaInsets();
  const topPad  = Platform.OS === "web" ? 67  : insets.top;
  const botPad  = Platform.OS === "web" ? 34  : insets.bottom;

  const [gameState, setGameState]       = useState<GameState>("intro");
  const [messages, setMessages]         = useState<Message[]>([]);
  const [currentQ, setCurrentQ]         = useState("");
  const [qCount, setQCount]             = useState(0);
  const [guessName, setGuessName]       = useState("");
  const [guessText, setGuessText]       = useState("");
  const [personImage, setPersonImage]   = useState<string | null>(null);
  const [personBio, setPersonBio]       = useState<string | null>(null);
  const [loadingImg, setLoadingImg]     = useState(false);
  const [showReveal, setShowReveal]     = useState(false);
  const [revealInput, setRevealInput]   = useState("");
  const [recentAnswers, setRecentAnswers] = useState<string[]>([]);
  const [lang, setLang]                   = useState<Lang>("ar");

  const t = STRINGS[lang];
  const isRTL = lang === "ar";

  // Derive ball mood from recent answers + game state
  const ballMood: BallMood = (() => {
    if (gameState === "thinking") return "thinking";
    const last     = recentAnswers.slice(-4);
    const yesWord  = t.yes;
    const noWord   = t.no;
    const yesCount = last.filter(a => a === yesWord).length;
    const noCount  = last.filter(a => a === noWord).length;
    if (yesCount >= 2) return "happy";
    if (noCount  >= 2) return "sad";
    return "neutral";
  })();

  const qTranslY  = useSharedValue(0);
  const rvScale   = useSharedValue(0.85);
  const rvOpacity = useSharedValue(0);

  const qStyle  = useAnimatedStyle(() => ({
    transform: [{ translateY: qTranslY.value }],
  }));
  const rvStyle = useAnimatedStyle(() => ({
    transform: [{ scale: rvScale.value }],
    opacity: rvOpacity.value,
  }));

  const animateQuestion = useCallback(() => {
    qTranslY.value = 16;
    qTranslY.value = withSpring(0, { damping: 16, stiffness: 140 });
  }, []);

  const fetchPersonInfo = useCallback(async (name: string, curLang: Lang) => {
    setLoadingImg(true);
    try {
      const base = getApiUrl();
      const url  = new URL(`/api/person-info?name=${encodeURIComponent(name)}&lang=${curLang}`, base);
      const res  = await fetch(url.toString());
      const data = (await res.json()) as { imageUrl: string | null; bio: string | null };
      setPersonImage(data.imageUrl);
      setPersonBio(data.bio);
    } catch { setPersonImage(null); setPersonBio(null); }
    finally  { setLoadingImg(false); }
  }, []);

  const askQuestion = useCallback(async (msgs: Message[], curLang: Lang) => {
    setGameState("thinking");
    try {
      const res  = await apiRequest("POST", "/api/magic-ball/question", { messages: msgs, lang: curLang });
      const data = (await res.json()) as { content: string; isGuess: boolean; guessName: string | null };
      const full = [...msgs, { role: "assistant" as const, content: data.content }];
      setMessages(full);

      if (data.isGuess) {
        setGuessName(data.guessName || "");
        setGuessText(data.content);
        setGameState("guessing");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        if (data.guessName) fetchPersonInfo(data.guessName, curLang);
      } else {
        setCurrentQ(data.content);
        setQCount(c => c + 1);
        setGameState("asking");
        animateQuestion();
      }
    } catch { setGameState("asking"); }
  }, [animateQuestion, fetchPersonInfo]);

  const handleStart = useCallback((curLang: Lang) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setMessages([]); setQCount(0); setPersonImage(null); setPersonBio(null); setCurrentQ("");
    setRecentAnswers([]);
    askQuestion([], curLang);
  }, [askQuestion]);

  const handleAnswer = useCallback((answer: string, curLang: Lang) => {
    setRecentAnswers(prev => [...prev, answer].slice(-6));
    const updated = [...messages, { role: "user" as const, content: answer }];
    setMessages(updated);
    askQuestion(updated, curLang);
  }, [messages, askQuestion]);

  const handleCorrect = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGameState("revealed");
    rvScale.value  = withSpring(1, { damping: 14, stiffness: 110 });
    rvOpacity.value= withTiming(1, { duration: 380 });
  }, []);

  const handleWrong = useCallback((curLang: Lang) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const wrongMsg = STRINGS[curLang].wrongContinue;
    const updated  = [...messages, { role: "user" as const, content: wrongMsg }];
    setMessages(updated);
    askQuestion(updated, curLang);
  }, [messages, askQuestion]);

  const handleReset = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGameState("intro"); setMessages([]); setCurrentQ("");
    setQCount(0); setGuessName(""); setGuessText(""); setPersonImage(null); setPersonBio(null);
    setShowReveal(false); setRevealInput(""); setRecentAnswers([]);
  }, []);

  const handleRevealSubmit = useCallback((curLang: Lang) => {
    const name = revealInput.trim();
    if (!name) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setGuessName(name);
    setShowReveal(false);
    setRevealInput("");
    setGameState("revealed");
    rvScale.value  = withSpring(1, { damping: 14, stiffness: 110 });
    rvOpacity.value= withTiming(1, { duration: 380 });
    fetchPersonInfo(name, curLang);
  }, [revealInput, fetchPersonInfo]);

  const isPlaying = gameState === "asking" || gameState === "thinking";

  // ── REVEAL MODAL ─────────────────────────────────────────────────────────
  const RevealModal = (
    <Modal visible={showReveal} transparent animationType="fade" onRequestClose={() => setShowReveal(false)}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={() => setShowReveal(false)} />
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{t.modalTitle}</Text>
          <Text style={styles.modalSub}>{t.modalSub}</Text>
          <TextInput
            style={styles.modalInput}
            value={revealInput}
            onChangeText={setRevealInput}
            placeholder={t.modalPlaceholder}
            placeholderTextColor="rgba(168,144,96,0.45)"
            autoFocus
            returnKeyType="done"
            onSubmitEditing={() => handleRevealSubmit(lang)}
            textAlign={isRTL ? "right" : "left"}
          />
          <View style={styles.modalBtns}>
            <Pressable style={styles.modalCancelBtn} onPress={() => setShowReveal(false)}>
              <Text style={styles.modalCancelText}>{t.modalCancel}</Text>
            </Pressable>
            <Pressable onPress={() => handleRevealSubmit(lang)} style={{ flex: 1 }}>
              <LinearGradient colors={[Colors.gold, Colors.deepGold]} style={styles.modalConfirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Text style={styles.modalConfirmText}>{t.modalReveal}</Text>
              </LinearGradient>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── INTRO ────────────────────────────────────────────────────────────────
  if (gameState === "intro") {
    return (
      <LinearGradient colors={[Colors.midnight, Colors.darkPurple, "#0D0520", Colors.midnight]} style={styles.root} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
        <View style={[styles.introRoot, { paddingTop: topPad + 20, paddingBottom: botPad + 24 }]}>

          {/* Language switcher */}
          <View style={styles.langSwitch}>
            <Pressable
              onPress={() => setLang("ar")}
              style={[styles.langBtn, lang === "ar" && styles.langBtnActive]}
            >
              <Text style={[styles.langBtnText, lang === "ar" && styles.langBtnTextActive]}>
                {t.langAr}
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setLang("en")}
              style={[styles.langBtn, lang === "en" && styles.langBtnActive]}
            >
              <Text style={[styles.langBtnText, lang === "en" && styles.langBtnTextActive]}>
                {t.langEn}
              </Text>
            </Pressable>
          </View>

          <Text style={styles.title}>{t.title}</Text>
          <Text style={styles.introSub}>{t.introSub}</Text>
          <AnimatedBall size={Math.min(width * 0.64, 240)} mood="neutral" />
          <Text style={styles.introHint}>{t.introHint}</Text>
          <Pressable onPress={() => handleStart(lang)} testID="start-btn">
            <LinearGradient colors={[Colors.gold, Colors.deepGold, "#7A5500"]} style={styles.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="sparkles" size={20} color="#0D0000" />
              <Text style={styles.startBtnText}>{t.startBtn}</Text>
            </LinearGradient>
          </Pressable>

          <Text style={styles.creditText}>Developed and Designed by{"\n"}Hamza Jasim{"\n"}© 2026</Text>
        </View>
      </LinearGradient>
    );
  }

  // ── ASKING / THINKING ────────────────────────────────────────────────────
  if (isPlaying) {
    return (
      <LinearGradient colors={[Colors.midnight, Colors.darkPurple, "#0D0520", Colors.midnight]} style={styles.root} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
        {/* Fixed top bar */}
        <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={handleReset} style={styles.topBarBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </Pressable>
          <Text style={[styles.title, { flex: 1 }]}>{t.title}</Text>
          <View style={styles.qBadge}>
            <Text style={styles.qBadgeLabel}>{t.qBadgeLabel}</Text>
            <Text style={styles.qBadgeText}>{qCount}</Text>
          </View>
        </View>

        {/* Middle: ball + question */}
        <View style={[styles.middleArea, { paddingBottom: 110 }]}>
          <AnimatedBall size={Math.min(width * 0.54, 210)} mood={ballMood} />

          <Animated.View style={[styles.questionCard, qStyle]}>
            {gameState === "thinking" ? (
              <View style={styles.thinkRow}>
                <ActivityIndicator color={Colors.gold} size="small" />
                <Text style={styles.thinkText}>{t.thinking}</Text>
              </View>
            ) : currentQ.trim().length > 0 ? (
              <Text style={[styles.questionText, { writingDirection: isRTL ? "rtl" : "ltr", textAlign: isRTL ? "right" : "left" }]}>
                {currentQ}
              </Text>
            ) : (
              <View style={styles.thinkRow}>
                <ActivityIndicator color={Colors.gold} size="small" />
                <Text style={styles.thinkText}>{t.preparing}</Text>
              </View>
            )}
          </Animated.View>
        </View>

        {/* Fixed bottom: answer buttons */}
        <View style={[styles.buttonsArea, { paddingBottom: botPad + 22 }]}>
          <View style={styles.btnRow}>
            <AnswerButton label={t.yes}   variant="yes"   onPress={() => handleAnswer(t.yes,   lang)} disabled={gameState === "thinking"} />
            <AnswerButton label={t.no}    variant="no"    onPress={() => handleAnswer(t.no,    lang)} disabled={gameState === "thinking"} />
          </View>
          <View style={styles.btnRow}>
            <AnswerButton label={t.maybe} variant="maybe" onPress={() => handleAnswer(t.maybe, lang)} disabled={gameState === "thinking"} />
            <AnswerButton label={t.dunno} variant="dunno" onPress={() => handleAnswer(t.dunno, lang)} disabled={gameState === "thinking"} />
          </View>
        </View>
        {RevealModal}
      </LinearGradient>
    );
  }

  // ── GUESSING ─────────────────────────────────────────────────────────────
  if (gameState === "guessing") {
    return (
      <LinearGradient colors={[Colors.midnight, Colors.darkPurple, "#0D0520", Colors.midnight]} style={styles.root} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
        <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={handleReset} style={styles.topBarBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </Pressable>
          <Text style={styles.title}>{t.title}</Text>
          <View style={{ width: 44 }} />
        </View>

        <View style={styles.middleArea}>
          <AnimatedBall size={Math.min(width * 0.30, 120)} mood="happy" />
          <View style={styles.guessCard}>
            <Ionicons name="sparkles" size={24} color={Colors.gold} />
            <Text style={styles.guessLabel}>{t.myGuessIs}</Text>
            <Text style={styles.guessName}>{guessName}</Text>
          </View>
          <Text style={styles.confirmQ}>{t.amIRight}</Text>
        </View>

        <View style={[styles.buttonsArea, { paddingBottom: botPad + 12 }]}>
          <View style={styles.btnRow}>
            <AnswerButton label={t.yesRight} variant="yes" onPress={handleCorrect} />
            <AnswerButton label={t.noWrong}  variant="no"  onPress={() => handleWrong(lang)} />
          </View>
          <Pressable style={styles.revealHintBtn} onPress={() => { setRevealInput(""); setShowReveal(true); }}>
            <Ionicons name="eye-outline" size={15} color="rgba(168,144,96,0.6)" />
            <Text style={styles.revealHintText}>{t.addAnswer}</Text>
          </Pressable>
        </View>
        {RevealModal}
      </LinearGradient>
    );
  }

  // ── REVEALED ─────────────────────────────────────────────────────────────
  return (
    <LinearGradient colors={[Colors.midnight, Colors.darkPurple, "#0D0520", Colors.midnight]} style={styles.root} start={{ x: 0.3, y: 0 }} end={{ x: 0.7, y: 1 }}>
      <Animated.View style={[{ flex: 1 }, rvStyle]}>

        {/* Top bar */}
        <View style={[styles.topBar, { paddingTop: topPad + 8 }]}>
          <Pressable onPress={handleReset} style={styles.topBarBtn}>
            <Ionicons name="arrow-back" size={22} color={Colors.textSecondary} />
          </Pressable>
          <View style={styles.revealTrophyRow}>
            <Ionicons name="trophy" size={18} color={Colors.gold} />
            <Text style={styles.revealTitle}>{t.guessedIt}</Text>
          </View>
          <View style={{ width: 44 }} />
        </View>

        {/* Content card */}
        <View style={[styles.revealContent, { paddingBottom: botPad + 24 }]}>

          {/* Photo + Name side by side */}
          <View style={styles.revealHeroRow}>
            {/* Photo */}
            <View style={styles.revealPhotoBox}>
              {loadingImg ? (
                <ActivityIndicator color={Colors.gold} size="small" />
              ) : personImage ? (
                <Image source={{ uri: personImage }} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
              ) : (
                <Ionicons name="person-circle-outline" size={60} color="rgba(212,175,55,0.4)" />
              )}
            </View>

            {/* Name + sub info */}
            <View style={styles.revealNameCol}>
              <Text style={styles.revealName}>{guessName}</Text>
              <Text style={styles.revealSub}>{t.questionsOnly(qCount)}</Text>
            </View>
          </View>

          {/* Divider */}
          <View style={styles.revealDivider} />

          {/* Bio */}
          <View style={styles.revealBioBox}>
            {loadingImg ? (
              <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                <ActivityIndicator color={Colors.gold} size="small" />
                <Text style={styles.revealBioLoading}>{t.loadingInfo}</Text>
              </View>
            ) : personBio ? (
              <Text style={[styles.revealBioText, { writingDirection: isRTL ? "rtl" : "ltr", textAlign: isRTL ? "right" : "left" }]}>
                {personBio}
              </Text>
            ) : (
              <Text style={styles.revealBioEmpty}>{t.noBio}</Text>
            )}
          </View>

          <Pressable onPress={handleReset}>
            <LinearGradient colors={[Colors.gold, Colors.deepGold]} style={styles.playAgainBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
              <Ionicons name="refresh" size={18} color="#0D0000" />
              <Text style={styles.playAgainText}>{t.playAgain}</Text>
            </LinearGradient>
          </Pressable>
        </View>

      </Animated.View>

      {/* Confetti celebration overlay */}
      <Confetti active={gameState === "revealed"} />
    </LinearGradient>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: { flex: 1 },

  // INTRO
  introRoot: {
    flex: 1,
    alignItems: "center",
    justifyContent: "space-evenly",
    paddingHorizontal: 28,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 23,
    color: Colors.gold,
    letterSpacing: 2,
    textAlign: "center",
  },
  introSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 16,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 26,
  },
  introHint: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "rgba(168,144,96,0.55)",
    textAlign: "center",
  },
  creditText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "rgba(168,144,96,0.35)",
    textAlign: "center",
    lineHeight: 18,
    marginTop: 20,
  },
  langSwitch: {
    flexDirection: "row",
    backgroundColor: "rgba(26,10,46,0.6)",
    borderRadius: 50,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    padding: 4,
    gap: 4,
  },
  langBtn: {
    paddingHorizontal: 22,
    paddingVertical: 8,
    borderRadius: 50,
  },
  langBtnActive: {
    backgroundColor: Colors.gold,
  },
  langBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "rgba(168,144,96,0.6)",
  },
  langBtnTextActive: {
    color: "#0D0000",
  },
  startBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 44,
    paddingVertical: 17,
    borderRadius: 50,
  },
  startBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: "#0D0000",
  },

  // TOP BAR (shared)
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topBarBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  qBadge: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(212,175,55,0.12)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 56,
  },
  qBadgeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  qBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: Colors.gold,
    lineHeight: 22,
  },

  // MIDDLE (ball + question)
  middleArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 32,
  },
  questionCard: {
    width: "100%",
    backgroundColor: "rgba(26,10,46,0.96)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    paddingVertical: 22,
    paddingHorizontal: 22,
    minHeight: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  thinkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  thinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 15,
    color: Colors.textSecondary,
  },
  questionText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text,
    textAlign: "center",
    lineHeight: 30,
  },

  // BOTTOM BUTTONS (always visible)
  buttonsArea: {
    width: "100%",
    paddingHorizontal: 16,
    gap: 10,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
  },
  answerBtnWrap: {
    flex: 1,
  },
  answerBtnPressable: {
    borderRadius: 16,
    overflow: "hidden",
  },
  answerBtnInner: {
    paddingVertical: 19,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  answerBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: "#ffffff",
    letterSpacing: 0.3,
  },

  // GUESSING
  guessCard: {
    width: "100%",
    backgroundColor: "rgba(26,10,46,0.96)",
    borderRadius: 22,
    borderWidth: 1,
    borderColor: Colors.gold,
    paddingVertical: 22,
    paddingHorizontal: 22,
    alignItems: "center",
    gap: 8,
  },
  guessLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.textSecondary,
    letterSpacing: 1,
  },
  guessName: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: Colors.gold,
    textAlign: "center",
  },
  confirmQ: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    textAlign: "center",
  },

  // REVEALED
  revealContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 16,
  },
  revealTrophyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  revealTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    color: Colors.gold,
    letterSpacing: 0.5,
  },
  revealHeroRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    backgroundColor: "rgba(26,10,46,0.7)",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    padding: 14,
  },
  revealPhotoBox: {
    width: 90,
    height: 110,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(26,10,46,0.9)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    flexShrink: 0,
  },
  revealNameCol: {
    flex: 1,
    gap: 6,
  },
  revealName: {
    fontFamily: "Inter_700Bold",
    fontSize: 24,
    color: Colors.text,
    lineHeight: 30,
  },
  revealSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.textSecondary,
  },
  revealDivider: {
    height: 1,
    backgroundColor: "rgba(212,175,55,0.15)",
  },
  revealBioBox: {
    flex: 1,
    backgroundColor: "rgba(26,10,46,0.5)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.12)",
    padding: 16,
  },
  revealBioText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: Colors.text,
    lineHeight: 24,
  },
  revealBioLoading: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
  },
  revealBioEmpty: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  playAgainBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 50,
    alignSelf: "center",
  },
  playAgainText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    color: "#0D0000",
  },

  // REVEAL HINT BUTTON
  revealHintBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 8,
  },
  revealHintText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "rgba(168,144,96,0.6)",
  },

  // MODAL
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(5,0,15,0.75)",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: Platform.OS === "web" ? 34 : 0,
  },
  modalBox: {
    width: "100%",
    backgroundColor: "#140830",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.25)",
    padding: 28,
    gap: 14,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.gold,
    textAlign: "center",
  },
  modalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
    marginTop: -6,
  },
  modalInput: {
    backgroundColor: "rgba(26,10,46,0.9)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.3)",
    paddingHorizontal: 18,
    paddingVertical: 14,
    fontFamily: "Inter_500Medium",
    fontSize: 18,
    color: Colors.text,
  },
  modalBtns: {
    flexDirection: "row",
    gap: 12,
    marginTop: 4,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(212,175,55,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCancelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.textSecondary,
  },
  modalConfirmBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  modalConfirmText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: "#0D0000",
  },
});
