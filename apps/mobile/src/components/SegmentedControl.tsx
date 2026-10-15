import { useEffect, useState } from "react";
import { Animated, Pressable, Text, View } from "react-native";
import { useApp } from "../lib/context";
import { useReducedMotion } from "../lib/interaction";
export function SegmentedControl({
  options,
  value,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
}) {
  const { colors } = useApp();
  const reduce = useReducedMotion();
  const [width, setWidth] = useState(0);
  const [x] = useState(() => new Animated.Value(0));
  const selected = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );
  const itemWidth = (width - 8) / options.length;
  useEffect(() => {
    const target = selected * Math.max(0, itemWidth);
    if (reduce) x.setValue(target);
    else
      Animated.spring(x, {
        toValue: target,
        stiffness: 500,
        damping: 45,
        mass: 1,
        useNativeDriver: true,
      }).start();
  }, [selected, itemWidth, x, reduce]);
  return (
    <View
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={{
        flexDirection: "row",
        padding: 4,
        borderRadius: 15,
        backgroundColor: colors.soft,
        marginVertical: 18,
      }}
    >
      {width > 8 && (
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 4,
            bottom: 4,
            left: 4,
            width: itemWidth,
            borderRadius: 11,
            backgroundColor: colors.surface,
            transform: [{ translateX: x }],
          }}
        />
      )}
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="button"
          accessibilityState={{ selected: option.value === value }}
          onPress={() => onChange(option.value)}
          style={({ pressed }) => ({
            flex: 1,
            minHeight: 46,
            paddingVertical: 11,
            paddingHorizontal: 3,
            alignItems: "center",
            justifyContent: "center",
            opacity: pressed ? 0.55 : 1,
          })}
        >
          <Text
            style={{
              fontSize: 12,
              color: option.value === value ? colors.ink : colors.muted,
              fontWeight: option.value === value ? "600" : "400",
              textAlign: "center",
            }}
          >
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
