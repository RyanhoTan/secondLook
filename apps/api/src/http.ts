import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res
      .status(400)
      .json({
        code: "VALIDATION_ERROR",
        message: error.issues[0]?.message ?? "输入有误",
        fieldErrors: error.flatten().fieldErrors,
      });
    return;
  }
  if (error instanceof HttpError) {
    res
      .status(error.status)
      .json({ code: `HTTP_${error.status}`, message: error.message });
    return;
  }
  if (error?.code === "P2002") {
    res
      .status(409)
      .json({ code: "CONFLICT", message: "内容已存在，请勿重复创建" });
    return;
  }
  if (error?.type === "entity.parse.failed") {
    res.status(400).json({ code: "INVALID_JSON", message: "请求格式有误" });
    return;
  }
  if (error?.type === "entity.too.large") {
    res.status(413).json({ code: "TOO_LARGE", message: "提交内容过大" });
    return;
  }
  console.error(error);
  res
    .status(500)
    .json({ code: "INTERNAL_ERROR", message: "暂时无法处理，请稍后重试" });
};
