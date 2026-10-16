import { z } from "zod";

export const occurrencePrecisions = {
  DAY: "具体日期",
  MONTH: "月份",
  RANGE: "大致时间范围",
} as const;
export type OccurrencePrecision = keyof typeof occurrencePrecisions;
export type Occurrence = {
  occurredOn: string;
  occurredPrecision: OccurrencePrecision;
  occurredUntil: string;
};
export const occurrenceFields = {
  occurredOn: z.string().trim().min(1, "请填写发生时间").max(10),
  occurredPrecision: z.enum(["DAY", "MONTH", "RANGE"]).default("DAY"),
  occurredUntil: z.string().trim().max(10).default(""),
};
export function validateOccurrence(value: Occurrence, ctx: z.RefinementCtx) {
  const today = new Date().toISOString().slice(0, 10);
  const fail = (path: string, message: string) =>
    ctx.addIssue({ code: "custom", path: [path], message });
  if (value.occurredPrecision === "MONTH") {
    if (
      !/^\d{4}-\d{2}$/.test(value.occurredOn) ||
      !z.iso.date().safeParse(`${value.occurredOn}-01`).success
    )
      fail("occurredOn", "请输入有效月份（YYYY-MM）");
    else if (value.occurredOn > today.slice(0, 7))
      fail("occurredOn", "发生月份不能晚于本月");
  } else {
    if (!z.iso.date().safeParse(value.occurredOn).success)
      fail("occurredOn", "请输入有效日期（YYYY-MM-DD）");
    else if (value.occurredOn > today)
      fail("occurredOn", "发生日期不能晚于今天");
  }
  if (value.occurredPrecision === "RANGE") {
    if (!z.iso.date().safeParse(value.occurredUntil).success)
      fail("occurredUntil", "请填写有效的结束日期");
    else if (value.occurredUntil > today)
      fail("occurredUntil", "结束日期不能晚于今天");
    else if (value.occurredUntil < value.occurredOn)
      fail("occurredUntil", "结束日期不能早于开始日期");
  } else if (value.occurredUntil)
    fail("occurredUntil", "仅大致时间范围需要填写结束日期");
}

// Internal bounds support overlap queries; public output retains the reported precision.
export function occurrenceBounds(value: Occurrence) {
  if (value.occurredPrecision !== "MONTH")
    return {
      occurredOn: value.occurredOn,
      occurredPrecision: value.occurredPrecision,
      occurredUntil: value.occurredUntil,
    };
  const [year, month] = value.occurredOn.split("-").map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const day = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][
    month - 1
  ];
  return {
    occurredOn: `${value.occurredOn}-01`,
    occurredUntil: `${value.occurredOn}-${day}`,
    occurredPrecision: value.occurredPrecision,
  };
}
export function publicOccurrence(value: {
  occurredOn: string;
  occurredPrecision: string;
  occurredUntil: string;
}): Occurrence {
  return {
    occurredOn:
      value.occurredPrecision === "MONTH"
        ? value.occurredOn.slice(0, 7)
        : value.occurredOn,
    occurredPrecision: value.occurredPrecision as OccurrencePrecision,
    occurredUntil:
      value.occurredPrecision === "RANGE" ? value.occurredUntil : "",
  };
}
export function formatOccurrence(value: Occurrence) {
  if (value.occurredPrecision === "MONTH")
    return `${value.occurredOn.slice(0, 4)} 年 ${value.occurredOn.slice(5, 7)} 月（月份）`;
  if (value.occurredPrecision === "RANGE")
    return `${value.occurredOn} 至 ${value.occurredUntil}（大致时间）`;
  return value.occurredOn;
}
