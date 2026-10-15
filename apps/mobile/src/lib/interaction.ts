import { useEffect, useState } from "react";
import { AccessibilityInfo, Animated } from "react-native";
export function useReducedMotion() {
  const [reduce, setReduce] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduce(value);
    });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduce,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
export function usePressFeedback() {
  const reduce = useReducedMotion();
  const [scale] = useState(() => new Animated.Value(1));
  useEffect(() => {
    if (reduce) {
      scale.stopAnimation();
      scale.setValue(1);
    }
  }, [reduce, scale]);
  function target(value: number) {
    if (reduce) {
      scale.setValue(1);
      return;
    }
    Animated.spring(scale, {
      toValue: value,
      stiffness: 650,
      damping: 52,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }
  return { scale, onPressIn: () => target(0.98), onPressOut: () => target(1) };
}
