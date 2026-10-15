export const categories = { COMPANY: "公司", RESTAURANT: "饭店", ATTRACTION: "景点", OTHER: "其他" } as const;
export type Category = keyof typeof categories;
